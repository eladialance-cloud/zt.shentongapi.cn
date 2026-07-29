import * as crypto from 'crypto';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { N8nInstanceEntity } from '../entities/n8n-instance.entity';
import { N8nWorkflowEntity } from '../entities/n8n-workflow.entity';
import { N8nWebhookLogEntity } from '../entities/n8n-webhook-log.entity';
import { RedisService } from '../../../common/services/redis.service';
import { EncryptionService } from '../../../common/services/encryption.service';
import { CreditsService } from '../../credits/services/credits.service';
import { SyncGateway } from '../../sync/sync.gateway';
import {
  CreateN8nInstanceDto,
  UpdateN8nInstanceDto,
} from '../dto/n8n-instance.dto';

/** N8N 宸ヤ綔娴佸垪琛ㄧ紦瀛?TTL锛堢锛?*/
const WORKFLOW_CACHE_TTL = 120;

/** N8N 宸ヤ綔娴佸垪琛ㄧ紦瀛?key */
const WORKFLOW_CACHE_KEY = (instanceId: number) =>
  `n8n:workflows:${instanceId}`;

/** N8N 宸ヤ綔娴佹墽琛岄粯璁ら浼扮Н鍒嗭紙姣忔鎵ц锛?*/
const N8N_WORKFLOW_ESTIMATED_COST = 5;

/** N8N API 宸ヤ綔娴佸搷搴旂粨鏋?*/
interface N8nWorkflowItem {
  id: string;
  name: string;
  active: boolean;
  nodes?: unknown[];
  connections?: Record<string, unknown>;
  tags?: unknown[];
}

/** N8N API 宸ヤ綔娴佸垪琛ㄥ搷搴旂粨鏋?*/
interface N8nWorkflowListResponse {
  data?: N8nWorkflowItem[];
  count?: number;
  nextCursor?: string;
}

/** N8N API 鎵ц鍝嶅簲缁撴瀯 */
interface N8nExecutionResponse {
  executionId?: string;
  id?: string;
}

@Injectable()
export class N8nService {
  private readonly logger = new Logger(N8nService.name);

  constructor(
    @InjectRepository(N8nInstanceEntity)
    private instanceRepo: Repository<N8nInstanceEntity>,
    @InjectRepository(N8nWorkflowEntity)
    private workflowRepo: Repository<N8nWorkflowEntity>,
    @InjectRepository(N8nWebhookLogEntity)
    private webhookLogRepo: Repository<N8nWebhookLogEntity>,
    private redisService: RedisService,
    private encryptionService: EncryptionService,
    private creditsService: CreditsService,
    private syncGateway: SyncGateway,
  ) {}

  // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  //  鍋ュ悍妫€鏌?  // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  health() {
    return {
      status: 'ok',
      module: 'n8n',
    };
  }

  // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  //  瀹炰緥绠＄悊
  // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  /** 鏌ヨ鐢ㄦ埛鐨勬墍鏈?N8N 瀹炰緥 */
  async listInstances(userId: number): Promise<N8nInstanceEntity[]> {
    return this.instanceRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /** 鏌ヨ鍗曚釜瀹炰緥锛堝惈褰掑睘鏍￠獙锛?*/
  async getInstance(
    userId: number,
    instanceId: number,
  ): Promise<N8nInstanceEntity> {
    const instance = await this.instanceRepo.findOne({
      where: { id: instanceId, userId },
    });
    if (!instance) {
      throw new HttpException(
        'N8N 瀹炰緥涓嶅瓨鍦ㄦ垨鏃犳潈璁块棶',
        HttpStatus.NOT_FOUND,
      );
    }
    return instance;
  }

  /** 鍒涘缓瀹炰緥閰嶇疆 */
  async createInstance(
    userId: number,
    data: CreateN8nInstanceDto,
  ): Promise<N8nInstanceEntity> {
    const encryptedKey = data.apiKey
      ? this.encryptionService.encryptAes(data.apiKey)
      : '';
    const instance = this.instanceRepo.create({
      userId,
      name: data.name,
      description: data.description,
      baseUrl: data.baseUrl,
      apiKey: encryptedKey,
      status: 'pending',
      webhookUrl: data.webhookUrl,
      config: data.config,
    });
    return this.instanceRepo.save(instance);
  }

  /** 鏇存柊瀹炰緥閰嶇疆 */
  async updateInstance(
    userId: number,
    instanceId: number,
    data: UpdateN8nInstanceDto,
  ): Promise<N8nInstanceEntity> {
    const instance = await this.getInstance(userId, instanceId);

    if (data.name !== undefined) instance.name = data.name;
    if (data.description !== undefined) instance.description = data.description;
    if (data.baseUrl !== undefined) instance.baseUrl = data.baseUrl;
    if (data.apiKey !== undefined) instance.apiKey = this.encryptionService.encryptAes(data.apiKey);
    if (data.status !== undefined) instance.status = data.status as any;
    if (data.webhookUrl !== undefined) instance.webhookUrl = data.webhookUrl;
    if (data.config !== undefined) instance.config = data.config;

    // 閰嶇疆鍙樻洿鍚庢竻闄ゅ伐浣滄祦缂撳瓨
    await this.redisService.del(WORKFLOW_CACHE_KEY(instanceId));

    return this.instanceRepo.save(instance);
  }

  /** 鍒犻櫎瀹炰緥閰嶇疆 */
  async deleteInstance(userId: number, instanceId: number): Promise<void> {
    const instance = await this.getInstance(userId, instanceId);

    // 鍒犻櫎鍏宠仈鐨勫伐浣滄祦缂撳瓨鍜岃褰?    await this.redisService.del(WORKFLOW_CACHE_KEY(instanceId));
    await this.workflowRepo.delete({ instanceId, userId });
    await this.instanceRepo.remove(instance);
  }

  // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  //  N8N API 璋冪敤
  // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  /** 鏋勯€?N8N API 璇锋眰澶?*/
  private buildHeaders(apiKey: string): Record<string, string> {
    return {
      'X-N8N-API-KEY': apiKey,
      'Content-Type': 'application/json',
    };
  }

  /** 瑙勮寖鍖?baseUrl锛堝幓闄ゆ湯灏炬枩鏉狅級 */
  private normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/+$/, '');
  }

  /** 缁熶竴 N8N API 璋冪敤灏佽 */
  private async callN8nApi<T>(
    instance: N8nInstanceEntity,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.normalizeBaseUrl(instance.baseUrl)}/api/v1${path}`;
    this.logger.log(`N8N API ${method} ${url}`);

    // 瑙ｅ瘑 API Key
    const apiKey = this.encryptionService.decryptAes(instance.apiKey);

    try {
      const response = await fetch(url, {
        method,
        headers: this.buildHeaders(apiKey),
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        this.logger.error(
          `N8N API error: ${response.status} ${response.statusText} - ${errorText}`,
        );
        throw new HttpException(
          `N8N API 璋冪敤澶辫触: ${response.status} ${response.statusText}`,
          response.status >= 400 && response.status < 500
            ? HttpStatus.BAD_REQUEST
            : HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      const text = await response.text();
      // 鏌愪簺绔偣杩斿洖绌?body锛堝 activate/deactivate锛?      if (!text || text.trim().length === 0) {
        return undefined as T;
      }
      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`N8N API request failed: ${String(error)}`);
      throw new HttpException(
        `N8N API 璇锋眰澶辫触: ${String(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** 娴嬭瘯 N8N API 杩為€氭€?*/
  async testConnection(
    userId: number,
    instanceId: number,
  ): Promise<{ success: boolean; message: string; workflows?: number }> {
    const instance = await this.getInstance(userId, instanceId);

    try {
      const result = await this.callN8nApi<N8nWorkflowListResponse>(
        instance,
        'GET',
        '/workflows',
      );

      // 杩炴帴鎴愬姛锛屾洿鏂板疄渚嬬姸鎬?      instance.status = 'running';
      instance.lastStartedAt = new Date();
      await this.instanceRepo.save(instance);

      const workflowCount = result?.count ?? result?.data?.length ?? 0;

      // WebSocket 鎺ㄩ€?n8n:status-changed
      this.syncGateway.pushToUser(userId, 'n8n:status-changed', {
        instanceId,
        status: 'running',
        workflows: workflowCount,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        message: `杩炴帴鎴愬姛锛屽叡 ${workflowCount} 涓伐浣滄祦`,
        workflows: workflowCount,
      };
    } catch (error) {
      instance.status = 'error';
      await this.instanceRepo.save(instance);

      // WebSocket 鎺ㄩ€?n8n:status-changed锛堣繛鎺ュけ璐ワ級
      this.syncGateway.pushToUser(userId, 'n8n:status-changed', {
        instanceId,
        status: 'error',
        error: (error as Error).message?.slice(0, 512),
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }

  // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  //  宸ヤ綔娴佺鐞?  // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  /** 鑾峰彇宸ヤ綔娴佸垪琛紙浠?N8N API 鍚屾鍒版湰鍦帮級 */
  async listWorkflows(
    userId: number,
    instanceId: number,
  ): Promise<N8nWorkflowEntity[]> {
    const instance = await this.getInstance(userId, instanceId);

    // 鍏堟煡缂撳瓨
    const cacheKey = WORKFLOW_CACHE_KEY(instanceId);
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as N8nWorkflowEntity[];
      } catch {
        // 缂撳瓨鍙嶅簭鍒楀寲澶辫触锛屽拷鐣ョ户缁蛋 API
        this.logger.warn(
          `Failed to parse cached workflows for instance ${instanceId}`,
        );
      }
    }

    // 璋冪敤 N8N API
    const result = await this.callN8nApi<N8nWorkflowListResponse>(
      instance,
      'GET',
      '/workflows',
    );

    const workflowList: N8nWorkflowItem[] = result?.data ?? [];

    // 鍚屾鍒版湰鍦版暟鎹簱
    const entities: N8nWorkflowEntity[] = [];
    for (const wf of workflowList) {
      let local = await this.workflowRepo.findOne({
        where: { instanceId, userId, workflowId: wf.id },
      });

      if (!local) {
        local = this.workflowRepo.create({
          instanceId,
          userId,
          workflowId: wf.id,
          name: wf.name,
          active: wf.active,
          nodes: wf.nodes as unknown as Record<string, unknown>,
          connections: wf.connections,
          tags: wf.tags,
          lastExecutionStatus: 'unknown',
        });
      } else {
        local.name = wf.name;
        local.active = wf.active;
        local.nodes = wf.nodes as unknown as Record<string, unknown>;
        local.connections = wf.connections;
        local.tags = wf.tags;
      }

      entities.push(await this.workflowRepo.save(local));
    }

    // 鍐欏叆缂撳瓨
    await this.redisService.set(
      cacheKey,
      JSON.stringify(entities),
      WORKFLOW_CACHE_TTL,
    );

    return entities;
  }

  /** 鑾峰彇宸ヤ綔娴佽鎯?*/
  async getWorkflowDetail(
    userId: number,
    instanceId: number,
    workflowId: string,
  ): Promise<Record<string, unknown>> {
    const instance = await this.getInstance(userId, instanceId);
    return this.callN8nApi<Record<string, unknown>>(
      instance,
      'GET',
      `/workflows/${workflowId}`,
    );
  }

  /**
   * 瑙﹀彂宸ヤ綔娴?   * 瀹屾暣娴佺▼锛氶鍐荤粨绉垎 鈫?璋冪敤 N8N API 鎵ц 鈫?鎴愬姛缁撶畻 / 澶辫触閫€杩?   */
  async triggerWorkflow(
    userId: number,
    instanceId: number,
    workflowId: string,
    inputData?: Record<string, unknown>,
  ): Promise<{ executionId: string; message: string; creditsCost: number }> {
    const instance = await this.getInstance(userId, instanceId);

    // 1. 棰勫喕缁撶Н鍒?    const estimatedCost = N8N_WORKFLOW_ESTIMATED_COST;
    let frozenTxnId: number | null = null;

    try {
      const freezeTxn = await this.creditsService.freezeCredits(
        userId,
        estimatedCost,
        'workflow_call',
        `n8n_workflow_${instanceId}_${workflowId}`,
      );
      frozenTxnId = freezeTxn.id;
    } catch (err) {
      this.logger.warn(
        `N8N 宸ヤ綔娴佹墽琛岀Н鍒嗛鍐荤粨澶辫触: userId=${userId}, error=${(err as Error).message}`,
      );
      throw new HttpException(
        '绉垎浣欓涓嶈冻锛屾棤娉曟墽琛屽伐浣滄祦',
        HttpStatus.FORBIDDEN,
      );
    }

    try {
      // 2. 璋冪敤 N8N API 鎵ц宸ヤ綔娴?      const body = inputData ? { inputData } : {};

      const result = await this.callN8nApi<N8nExecutionResponse>(
        instance,
        'POST',
        `/workflows/${workflowId}/execute`,
        body,
      );

      const executionId = result?.executionId ?? result?.id ?? '';
      if (!executionId) {
        this.logger.warn(
          `N8N execute response missing executionId: ${JSON.stringify(result)}`,
        );
      }

      // 3. 鎴愬姛 鈫?缁撶畻绉垎锛堟寜棰勪及璐圭敤缁撶畻锛?      try {
        await this.creditsService.settleCredits(
          userId,
          frozenTxnId,
          estimatedCost,
        );
      } catch (settleErr) {
        this.logger.error(
          `N8N 宸ヤ綔娴佹墽琛屽悗绉垎缁撶畻澶辫触: userId=${userId}, frozenTxnId=${frozenTxnId}, error=${(settleErr as Error).message}`,
          (settleErr as Error).stack,
        );
      }

      // 4. 鏇存柊鏈湴宸ヤ綔娴佽褰曠殑鎵ц鏃堕棿
      await this.workflowRepo.update(
        { instanceId, userId, workflowId },
        {
          lastExecutedAt: new Date(),
          lastExecutionStatus: 'running',
        },
      );

      // 娓呴櫎宸ヤ綔娴佸垪琛ㄧ紦瀛橈紙鍥犱负鎵ц鐘舵€佸凡鍙樻洿锛?      await this.redisService.del(WORKFLOW_CACHE_KEY(instanceId));

      return {
        executionId: String(executionId),
        message: '宸ヤ綔娴佸凡瑙﹀彂',
        creditsCost: estimatedCost,
      };
    } catch (error) {
      // 5. 澶辫触 鈫?閫€杩樺喕缁撶Н鍒?      if (frozenTxnId) {
        try {
          await this.creditsService.refundCredits(userId, frozenTxnId);
        } catch (refundErr) {
          this.logger.error(
            `N8N 宸ヤ綔娴佹墽琛屽け璐ュ悗閫€杩樼Н鍒嗗け璐? userId=${userId}, frozenTxnId=${frozenTxnId}, error=${(refundErr as Error).message}`,
            (refundErr as Error).stack,
          );
        }
      }
      throw error;
    }
  }

  /** 鏌ヨ鎵ц鐘舵€?*/
  async getExecutionStatus(
    userId: number,
    instanceId: number,
    executionId: string,
  ): Promise<Record<string, unknown>> {
    const instance = await this.getInstance(userId, instanceId);
    return this.callN8nApi<Record<string, unknown>>(
      instance,
      'GET',
      `/executions/${executionId}`,
    );
  }

  /** 婵€娲诲伐浣滄祦 */
  async activateWorkflow(
    userId: number,
    instanceId: number,
    workflowId: string,
  ): Promise<{ success: boolean; message: string }> {
    const instance = await this.getInstance(userId, instanceId);

    await this.callN8nApi(
      instance,
      'POST',
      `/workflows/${workflowId}/activate`,
    );

    // 鏇存柊鏈湴璁板綍
    await this.workflowRepo.update(
      { instanceId, userId, workflowId },
      { active: true },
    );

    // 娓呴櫎缂撳瓨
    await this.redisService.del(WORKFLOW_CACHE_KEY(instanceId));

    return {
      success: true,
      message: '宸ヤ綔娴佸凡婵€娲?,
    };
  }

  /** 鍋滅敤宸ヤ綔娴?*/
  async deactivateWorkflow(
    userId: number,
    instanceId: number,
    workflowId: string,
  ): Promise<{ success: boolean; message: string }> {
    const instance = await this.getInstance(userId, instanceId);

    await this.callN8nApi(
      instance,
      'POST',
      `/workflows/${workflowId}/deactivate`,
    );

    // 鏇存柊鏈湴璁板綍
    await this.workflowRepo.update(
      { instanceId, userId, workflowId },
      { active: false },
    );

    // 娓呴櫎缂撳瓨
    await this.redisService.del(WORKFLOW_CACHE_KEY(instanceId));

    return {
      success: true,
      message: '宸ヤ綔娴佸凡鍋滅敤',
    };
  }

  // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  //  Webhook 鍥炶皟澶勭悊
  // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  /**
   * 澶勭悊 N8N 宸ヤ綔娴佹墽琛屽洖璋?   * 1. 楠岃瘉 webhook 绛惧悕锛圚MAC-SHA256锛?   * 2. 鏇存柊宸ヤ綔娴佹墽琛岀姸鎬?   * 3. 鍐欏叆 webhook 鏃ュ織
   */
  async handleWebhook(
    instanceId: number,
    workflowId: string,
    body: unknown,
    signature?: string,
  ): Promise<{ received: boolean; status: string }> {
    this.logger.log(
      `鏀跺埌 N8N Webhook 鍥炶皟: instanceId=${instanceId}, workflowId=${workflowId}`,
    );

    // 鏌ユ壘瀹炰緥锛坵ebhook 涓嶅甫 JWT锛屾寜 instanceId 鏌ワ級
    const instance = await this.instanceRepo.findOne({
      where: { id: instanceId },
    });
    if (!instance) {
      this.logger.warn(`Webhook 鍥炶皟: 瀹炰緥 ${instanceId} 涓嶅瓨鍦╜);

      // 璁板綍澶辫触鐨?webhook 鏃ュ織
      await this.webhookLogRepo.save({
        instanceId,
        workflowId,
        signatureProvided: !!signature,
        signatureValid: false,
        payload: body as Record<string, unknown>,
        responseData: { error: 'instance_not_found' },
        status: 'instance_not_found',
      });

      return { received: false, status: 'instance_not_found' };
    }

    // 绛惧悕楠岃瘉
    let signatureValid = false;
    if (signature) {
      try {
        const apiKey = this.encryptionService.decryptAes(instance.apiKey);
        const bodyStr = JSON.stringify(body);
        const expectedSig = crypto
          .createHmac('sha256', apiKey)
          .update(bodyStr)
          .digest('hex');

        if (signature === expectedSig) {
          signatureValid = true;
        } else {
          this.logger.warn(
            `Webhook 绛惧悕楠岃瘉澶辫触: instanceId=${instanceId}, workflowId=${workflowId}`,
          );
        }
      } catch (err) {
        this.logger.error(
          `Webhook 绛惧悕楠岃瘉寮傚父: instanceId=${instanceId}, error=${(err as Error).message}`,
        );
      }
    } else {
      this.logger.warn(
        `Webhook 鏈彁渚涚鍚? instanceId=${instanceId}, workflowId=${workflowId}`,
      );
    }

    // 绛惧悕涓嶉€氳繃 鈫?鎷掔粷璇锋眰
    if (signature && !signatureValid) {
      await this.webhookLogRepo.save({
        instanceId,
        workflowId,
        signatureProvided: true,
        signatureValid: false,
        payload: body as Record<string, unknown>,
        responseData: { error: 'invalid_signature' },
        status: 'signature_failed',
      });

      throw new UnauthorizedException('Invalid webhook signature');
    }

    // 绛惧悕楠岃瘉閫氳繃锛堟垨鏈彁渚涚鍚?鈥?鍏煎鏃х増锛夛紝缁х画澶勭悊
    const responseData: { received: boolean; status: string } = {
      received: true,
      status: 'processed',
    };

    // 鏇存柊宸ヤ綔娴佹墽琛岀姸鎬?    const workflow = await this.workflowRepo.findOne({
      where: { instanceId, workflowId },
    });
    if (workflow) {
      const bodyObj = body as Record<string, unknown>;
      const success = bodyObj?.success !== false;
      await this.workflowRepo.update(workflow.id, {
        lastExecutionStatus: success ? 'success' : 'error',
        lastExecutedAt: new Date(),
      });

      // 娓呴櫎缂撳瓨
      await this.redisService.del(WORKFLOW_CACHE_KEY(instanceId));
    }

    // 鍐欏叆 webhook 鏃ュ織
    await this.webhookLogRepo.save({
      instanceId,
      workflowId,
      signatureProvided: !!signature,
      signatureValid,
      payload: body as Record<string, unknown>,
      responseData,
      status: 'processed',
    });

    this.logger.log(
      `N8N Webhook 澶勭悊瀹屾垚: instanceId=${instanceId}, workflowId=${workflowId}, signatureValid=${signatureValid}`,
    );

    // WebSocket 鎺ㄩ€?n8n:workflow-completed
    if (instance.userId) {
      this.syncGateway.pushToUser(instance.userId, 'n8n:workflow-completed', {
        instanceId,
        workflowId,
        status: responseData.status,
        timestamp: new Date().toISOString(),
      });
    }

    return responseData;
  }
}
