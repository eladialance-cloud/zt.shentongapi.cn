import { Repository } from 'typeorm';
import { SensitiveWordEntity } from './entities/sensitive-word.entity';
import { AiAuditConfigEntity } from './entities/ai-audit-config.entity';
import { AuditQueueEntity } from './entities/audit-queue.entity';
import { RejectAuditDto } from './dto/reject-audit.dto';
import { CreateSensitiveWordDto } from './dto/create-sensitive-word.dto';
import { BatchCreateSensitiveWordDto } from './dto/batch-create-sensitive-word.dto';
import { SensitiveWordQueryDto } from './dto/sensitive-word-query.dto';
import { AuditQueueQueryDto } from './dto/audit-queue-query.dto';
import { UpdateAuditConfigDto } from './dto/update-audit-config.dto';
import { AuditTestDto } from './dto/audit-test.dto';
export declare class AdminAuditService {
    private readonly queueRepo;
    private readonly wordRepo;
    private readonly configRepo;
    constructor(queueRepo: Repository<AuditQueueEntity>, wordRepo: Repository<SensitiveWordEntity>, configRepo: Repository<AiAuditConfigEntity>);
    listQueue(query: AuditQueueQueryDto): Promise<{
        list: {
            id: number;
            type: "agent" | "plugin" | "workflow" | "conversation";
            contentSummary: string;
            content: string | undefined;
            userId: number;
            username: string | undefined;
            triggerReason: "sensitive_word" | "ai_audit";
            hitWords: string[] | undefined;
            riskLevel: "low" | "medium" | "high";
            status: "approved" | "rejected" | "pending" | "false_positive";
            createdAt: Date;
            processedBy: string | undefined;
            processedAt: Date | undefined;
            processRemark: string | undefined;
        }[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    approve(id: number, adminUser: {
        id: number;
        username: string;
    }): Promise<void>;
    reject(id: number, dto: RejectAuditDto, adminUser: {
        id: number;
        username: string;
    }): Promise<void>;
    markFalsePositive(id: number, adminUser: {
        id: number;
        username: string;
    }): Promise<void>;
    listSensitiveWords(query: SensitiveWordQueryDto): Promise<{
        list: {
            id: number;
            word: string;
            category: "other" | "politics" | "porn" | "violence" | "ad";
            level: "replace" | "review" | "block";
            replacement: string | undefined;
            createdAt: Date;
            updatedAt: Date;
        }[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    createSensitiveWord(dto: CreateSensitiveWordDto): Promise<{
        id: number;
        word: string;
        category: "other" | "politics" | "porn" | "violence" | "ad";
        level: "replace" | "review" | "block";
        replacement: string | undefined;
        createdAt: Date;
        updatedAt: Date;
    }>;
    batchCreateSensitiveWords(dto: BatchCreateSensitiveWordDto): Promise<{
        created: number;
    }>;
    deleteSensitiveWord(id: number): Promise<void>;
    getAuditConfig(): Promise<{
        enabled: boolean;
        modelId: string;
        sensitiveThreshold: number;
        violenceThreshold: number;
        pornThreshold: number;
        autoProcess: boolean;
    } | {
        updatedAt: Date;
        enabled: boolean;
        modelId: string;
        sensitiveThreshold: number;
        violenceThreshold: number;
        pornThreshold: number;
        autoProcess: boolean;
    }>;
    updateAuditConfig(dto: UpdateAuditConfigDto): Promise<void>;
    testAudit(dto: AuditTestDto): Promise<{
        flagged: boolean;
        riskScore: number;
        categories: {
            sensitive: number;
            violence: number;
            porn: number;
        };
        hitWords: string[];
        suggestion: "review" | "block" | "allow";
    }>;
    private toQueueItem;
    private toSensitiveWord;
}
