export declare class FileEntity {
    id: number;
    userId: number;
    name: string;
    path: string;
    size: number;
    mimeType?: string;
    storageType: 'minio' | 'oss' | 'cos';
    createdAt: Date;
}
