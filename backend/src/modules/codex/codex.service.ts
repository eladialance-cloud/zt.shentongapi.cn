import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CodexService {
  private readonly logger = new Logger(CodexService.name);

  /**
   * 执行代码（骨架方法，后续接入实际沙箱）
   * @param language 编程语言：python/javascript/typescript/shell
   * @param code 代码内容
   * @param timeout 超时秒数
   * @returns 执行结果
   */
  async executeCode(
    language: string,
    code: string,
    timeout?: number,
  ): Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number | null; durationMs: number }> {
    this.logger.log(`[CodeX] 执行代码请求: language=${language}, codeLength=${code.length}`);
    // TODO: 后续接入 Docker 容器沙箱或 child_process 隔离执行
    return {
      success: false,
      stdout: '',
      stderr: 'CodeX 沙箱尚未接入实际执行能力',
      exitCode: null,
      durationMs: 0,
    };
  }

  /**
   * 修复代码错误（骨架方法）
   */
  async fixCode(code: string, errorMessage: string): Promise<{ fixedCode: string; explanation: string }> {
    this.logger.log(`[CodeX] 代码修复请求, error: ${errorMessage.slice(0, 100)}`);
    // TODO: 后续接入 AI 辅助修复
    return {
      fixedCode: code,
      explanation: 'CodeX 代码修复能力尚未接入',
    };
  }

  /**
   * 获取沙箱状态
   */
  getStatus(): { status: string; version: string; supportedLanguages: string[] } {
    return {
      status: 'skeleton',
      version: '0.1.0',
      supportedLanguages: ['python', 'javascript', 'typescript', 'shell'],
    };
  }

  /**
   * 获取 MCP 工具定义（供 MCP 服务注册使用）
   */
  getMcpToolDefinitions() {
    return [
      {
        toolName: 'execute_code',
        displayName: '执行代码',
        description: '在 CodeX 沙箱中执行代码，返回 stdout/stderr/exitCode',
        inputSchema: {
          type: 'object',
          properties: {
            language: { type: 'string', enum: ['python', 'javascript', 'typescript', 'shell'] },
            code: { type: 'string', description: '要执行的代码' },
            timeout: { type: 'number', description: '超时秒数', default: 30 },
          },
          required: ['language', 'code'],
        },
      },
      {
        toolName: 'fix_code',
        displayName: '修复代码',
        description: '根据错误信息自动修复代码',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: '原始代码' },
            errorMessage: { type: 'string', description: '错误信息' },
          },
          required: ['code', 'errorMessage'],
        },
      },
    ];
  }
}
