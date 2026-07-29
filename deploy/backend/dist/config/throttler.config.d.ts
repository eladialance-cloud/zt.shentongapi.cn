import { ConfigService } from '@nestjs/config';
export declare const throttlerConfig: (config: ConfigService) => {
    ttl: number;
    limit: number;
}[];
