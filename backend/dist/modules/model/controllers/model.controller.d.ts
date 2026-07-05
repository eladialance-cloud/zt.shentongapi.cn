import { ModelService } from '../services/model.service';
export declare class ModelController {
    private readonly modelService;
    constructor(modelService: ModelService);
    health(): {
        status: string;
        module: string;
    };
}
