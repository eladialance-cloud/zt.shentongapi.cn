import { ConfigService } from '@nestjs/config';
export declare const redisConfig: (config: ConfigService) => {
    type: "single";
    url: string;
};
