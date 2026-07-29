"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const config_1 = require("@nestjs/config");
const common_1 = require("@nestjs/common");
const helmet_1 = __importDefault(require("helmet"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
const all_exceptions_filter_1 = require("./common/filters/all-exceptions.filter");
const transform_interceptor_1 = require("./common/interceptors/transform.interceptor");
const logging_interceptor_1 = require("./common/interceptors/logging.interceptor");
const validation_pipe_1 = require("./common/pipes/validation.pipe");
const swagger_config_1 = require("./config/swagger.config");
const cors_config_1 = require("./config/cors.config");
const env_validator_1 = require("./common/utils/env-validator");
const db_migration_1 = require("./common/utils/db-migration");
const typeorm_1 = require("typeorm");
async function bootstrap() {
    (0, env_validator_1.validateJwtSecrets)();
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { rawBody: true });
    const configService = app.get(config_1.ConfigService);
    const logger = new common_1.Logger('Bootstrap');
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    app.setGlobalPrefix('api');
    app.enableCors((0, cors_config_1.corsConfig)(configService));
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:', 'https:'],
                fontSrc: ["'self'", 'data:', 'https:'],
                connectSrc: ["'self'", 'https:', 'wss:'],
                mediaSrc: ["'self'"],
                frameSrc: ["'self'"],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
            },
        },
        strictTransportSecurity: false,
    }));
    app.use((0, cookie_parser_1.default)());
    app.useGlobalPipes(new validation_pipe_1.AppValidationPipe());
    app.useGlobalFilters(new all_exceptions_filter_1.AllExceptionsFilter());
    app.useGlobalInterceptors(new transform_interceptor_1.TransformInterceptor(), new logging_interceptor_1.LoggingInterceptor());
    try {
        const dataSource = app.get(typeorm_1.DataSource);
        await (0, db_migration_1.runStartupMigrations)(dataSource);
    }
    catch (err) {
        const msg = `DB migration failed: ${err.message}`;
        if (process.env.NODE_ENV === 'production') {
            logger.error(msg);
            process.exit(1);
        }
        else {
            logger.warn(msg);
        }
    }
    const swaggerSetup = (0, swagger_config_1.swaggerConfig)(configService, app);
    if (swaggerSetup && process.env.NODE_ENV !== 'production') {
        swagger_1.SwaggerModule.setup(swaggerSetup.path, app, swaggerSetup.document);
    }
    const port = process.env.PORT || configService.get('PORT', 3001);
    app.enableShutdownHooks();
    await app.listen(port);
    logger.log(`Application is running on: http://localhost:${port}/api`);
    if (swaggerSetup && process.env.NODE_ENV !== 'production') {
        logger.log(`Swagger documentation at: http://localhost:${port}/${swaggerSetup.path}`);
    }
}
bootstrap();
//# sourceMappingURL=main.js.map