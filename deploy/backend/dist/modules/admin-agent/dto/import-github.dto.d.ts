export declare class ImportGithubDto {
    repoUrl: string;
    targetStatus?: 'published' | 'pending_review' | 'draft';
    defaultModelId?: string;
    defaultCreatorId?: number;
    dryRun?: boolean;
    overwriteExisting?: boolean;
}
