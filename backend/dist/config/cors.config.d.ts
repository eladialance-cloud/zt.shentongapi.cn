import { ConfigService } from '@nestjs/config';
export declare const corsConfig: (config: ConfigService) => {
    origin: string[];
    credentials: boolean;
};
