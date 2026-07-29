import { AdminAuditService } from './admin-audit.service';
import { AuditQueueQueryDto } from './dto/audit-queue-query.dto';
import { RejectAuditDto } from './dto/reject-audit.dto';
import { UpdateAuditConfigDto } from './dto/update-audit-config.dto';
import { AuditTestDto } from './dto/audit-test.dto';
export declare class AdminAuditController {
    private readonly service;
    constructor(service: AdminAuditService);
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
    approve(id: number, req: any): Promise<null>;
    reject(id: number, dto: RejectAuditDto, req: any): Promise<null>;
    markFalsePositive(id: number, req: any): Promise<null>;
    getConfig(): Promise<{
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
    updateConfig(dto: UpdateAuditConfigDto): Promise<null>;
    test(dto: AuditTestDto): Promise<{
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
}
