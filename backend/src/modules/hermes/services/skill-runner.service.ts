import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import * as vm from 'node:vm';
import { HermesSkillEntity, SkillExecConfig } from '../entities/hermes-skill.entity';
import { N8nService } from '../../n8n/services/n8n.service';

const execFile = promisify(execFileCb);

/**
 * 技能包执行引擎
 * 支持 4 种执行模式：shell / api / script / workflow_ref
 */
@Injectable()
export class SkillRunnerService {
  private readonly logger = Logger.bind(SkillRunnerService.name);

  constructor(private readonly n8nService: N8nService) {}

  /**
   * 执行技能包
   */
  async run(
    skill: HermesSkillEntity,
    input: Record<string, unknown>,
    userId: number,
  ): Promise<unknown> {
    const config = skill.execConfig;
    if (!config) {
      throw new BadRequestException(
        `技能包 "${skill.name}" 未配置执行逻辑`,
      );
    }

    // 校验输入参数
    this.validateInput(config, input);

    const timeoutMs = config.timeoutMs ?? 60_000;

    this.logger.log(
      `执行技能包: ${skill.name} (type=${config.type}, timeout=${timeoutMs}ms)`,
    );

    switch (config.type) {
      case 'shell':
        return this.runShell(config, input, timeoutMs);

      case 'api':
        return this.runApi(config, input, timeoutMs);

      case 'script':
        return this.runScript(config, input, timeoutMs);

      case 'workflow_ref':
        return this.runWorkflow(config, input, userId, timeoutMs);

      default:
        throw new BadRequestException(
          `不支持的执行类型: ${(config as SkillExecConfig).type}`,
        );
    }
  }

  // ============ shell 执行 ============

  private async runShell(
    config: SkillExecConfig,
    input: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<unknown> {
    if (!config.command) {
      throw new BadRequestException('shell 类型技能包缺少 command 配置');
    }

    const cmd = this.interpolate(config.command, input);
    const cwd = config.workingDir || process.cwd();
    const env = { ...process.env, ...config.env };

    this.logger.debug(`runShell: ${cmd}`);

    try {
      // 安全加固（P0-命令注入）：使用 execFile 避免经 shell 执行
      const [command, ...args] = cmd.trim().split(/\s+/);
      const { stdout, stderr } = await execFile(command, args, {
        cwd,
        env,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });
      return {
        exitCode: 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };
    } catch (err: any) {
      if (err.killed && err.signal === 'SIGTERM') {
        throw new BadRequestException('技能执行超时');
      }
      return {
        exitCode: err.code ?? 1,
        stdout: (err.stdout ?? '').trim(),
        stderr: (err.stderr ?? err.message ?? '').trim(),
      };
    }
  }

  // ============ API 调用 ============

  private async runApi(
    config: SkillExecConfig,
    input: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<unknown> {
    if (!config.url) {
      throw new BadRequestException('api 类型技能包缺少 url 配置');
    }

    // SSRF 防护：禁止内网地址和危险协议（安全加固 P1-3）
    this.validateUrl(config.url);
    const method = config.method || 'POST';
    const headers = config.headers || { 'Content-Type': 'application/json' };

    let body: string | undefined;
    if (method !== 'GET' && config.bodyTemplate) {
      body = this.interpolate(config.bodyTemplate, input);
    } else if (method !== 'GET') {
      body = JSON.stringify(input);
    }

    this.logger.debug(`runApi: ${method} ${config.url}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(config.url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      const text = await resp.text();

      let data: unknown = text;
      try {
        data = JSON.parse(text);
      } catch {
        // 非 JSON 响应，保持文本
      }

      if (!resp.ok) {
        return {
          statusCode: resp.status,
          ok: false,
          data,
        };
      }

      return {
        statusCode: resp.status,
        ok: true,
        data,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new BadRequestException('API 调用超时');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // ============ 脚本执行 ============

  private async runScript(
    config: SkillExecConfig,
    input: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<unknown> {
    if (!config.code) {
      throw new BadRequestException('script 类型技能包缺少 code 配置');
    }

    if (config.language !== 'javascript') {
      throw new BadRequestException(
        `不支持的脚本语言: ${config.language}（当前仅支持 javascript）`,
      );
    }

    this.logger.debug(`runScript: ${config.code.slice(0, 100)}...`);

    // 使用 Node.js vm 模块创建沙箱上下文，隔离用户代码
    const sandbox = {
      input,
      result: null as unknown,
      console: {
        log: (...args: unknown[]) => {
          this.logger.debug(`[sandbox] ${args.map(String).join(' ')}`);
        },
        error: (...args: unknown[]) => {
          this.logger.error(`[sandbox] ${args.map(String).join(' ')}`);
        },
        warn: (...args: unknown[]) => {
          this.logger.warn(`[sandbox] ${args.map(String).join(' ')}`);
        },
      },
      JSON,
      Math,
      Date,
      String,
      Number,
      Boolean,
      Array,
      Object,
      Promise,
      Set,
      Map,
      Symbol,
    };

    const context = vm.createContext(sandbox);
    const wrappedCode = `
      result = (function(input) {
        "use strict";
        ${config.code}
      })(input);
    `;

    try {
      vm.runInContext(wrappedCode, context, {
        timeout: Math.min(timeoutMs, 5000), // 最多5秒
        displayErrors: true,
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('Script execution timed out')) {
        throw new BadRequestException('脚本执行超时');
      }
      throw new BadRequestException(
        `脚本执行错误: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return sandbox.result;
  }

  // ============ 工作流引用 ============

  private async runWorkflow(
    config: SkillExecConfig,
    input: Record<string, unknown>,
    userId: number,
    timeoutMs: number,
  ): Promise<unknown> {
    if (!config.workflowId) {
      throw new BadRequestException('workflow_ref 类型技能包缺少 workflowId 配置');
    }

    const n8nInstanceId = config.n8nInstanceId;
    if (!n8nInstanceId) {
      throw new BadRequestException('workflow_ref 类型技能包缺少 n8nInstanceId 配置');
    }

    this.logger.debug(
      `runWorkflow: instance=${n8nInstanceId}, workflow=${config.workflowId}`,
    );

    return this.n8nService.triggerWorkflow(
      userId,
      n8nInstanceId,
      config.workflowId,
      input,
    );
  }

  // ============ 工具方法 ============

  /**
   * 模板变量替换：{{input.xxx}} → input.xxx 的值
   */
  private interpolate(template: string, input: Record<string, unknown>): string {
    return template.replace(
      /\{\{input\.(\w+)\}\}/g,
      (_, key: string) => {
        const value = input[key];
        if (value === undefined || value === null) return '';
        // 转义 shell 特殊字符，防止命令注入
        return String(value).replace(/[;&|`$(){}!#<>\\"']/g, '\\$&');
      },
    );
  }

  /**
   * 从对象中按点路径取值
   */
  /** SSRF 防护：校验 URL 协议和地址（安全加固 P1-3） */
  private validateUrl(url: string): void {
    try {
      const parsed = new URL(url);
      // 仅允许 http/https 协议
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new BadRequestException(`不允许的协议: ${parsed.protocol}`);
      }
      // 禁止内网地址
      const blockedPrefixes = [
        '127.', '10.', '172.16.', '172.17.', '172.18.', '172.19.',
        '172.20.', '172.21.', '172.22.', '172.23.', '172.24.',
        '172.25.', '172.26.', '172.27.', '172.28.', '172.29.',
        '172.30.', '172.31.', '192.168.', '169.254.', '0.', '::1', '[::1]'
      ];
      for (const prefix of blockedPrefixes) {
        if (parsed.hostname.startsWith(prefix)) {
          throw new BadRequestException('不允许访问内网地址');
        }
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('无效的URL格式');
    }
  }

  private getByPath(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object') {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  /**
   * 校验输入参数（简单版，后续可接入 JSON Schema）
   */
  private validateInput(
    config: SkillExecConfig,
    input: Record<string, unknown>,
  ): void {
    if (!config.inputSchema) return;

    const schema = config.inputSchema as Record<string, { type: string; required?: boolean }>;
    if (!schema || typeof schema !== 'object') return;

    for (const [key, rule] of Object.entries(schema)) {
      if (rule?.required && !(key in input)) {
        throw new BadRequestException(`缺少必填参数: ${key}`);
      }
    }
  }
}