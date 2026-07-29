import { FileService } from '../services/file.service';
import { ICurrentUser } from '../../../common/decorators/current-user.decorator';
export declare class FileController {
    private readonly fileService;
    constructor(fileService: FileService);
    health(): {
        status: string;
        module: string;
    };
    upload(user: ICurrentUser, file: Express.Multer.File): Promise<import("../entities/file.entity").FileEntity>;
    list(user: ICurrentUser, page?: number, pageSize?: number): Promise<{
        list: import("../entities/file.entity").FileEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    remove(id: number, user: ICurrentUser): Promise<null>;
}
