import { FileService } from '../services/file.service';
export declare class FileController {
    private readonly fileService;
    constructor(fileService: FileService);
    health(): {
        status: string;
        module: string;
    };
}
