import { Repository } from 'typeorm';
import { FileEntity } from '../entities/file.entity';
export declare class FileService {
    private readonly fileRepo;
    constructor(fileRepo: Repository<FileEntity>);
    health(): {
        status: string;
        module: string;
    };
    upload(userId: number, file: Express.Multer.File): Promise<FileEntity>;
    list(userId: number, page?: number, pageSize?: number): Promise<{
        list: FileEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    remove(id: number, userId: number): Promise<void>;
}
