import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAPIObject } from '@nestjs/swagger';
export interface SwaggerSetupOptions {
    path: string;
    document: OpenAPIObject;
}
export declare const swaggerConfig: (config: ConfigService, app: INestApplication) => SwaggerSetupOptions;
