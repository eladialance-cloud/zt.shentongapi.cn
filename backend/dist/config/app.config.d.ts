import { ConfigService } from '@nestjs/config';
export declare const appConfig: (config: ConfigService) => {
    port: number;
    env: string;
};
