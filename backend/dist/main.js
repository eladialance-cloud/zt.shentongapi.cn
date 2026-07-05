"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const config_1 = require("@nestjs/config");
const common_1 = require("@nestjs/common");
const helmet_1 = __importDefault(require("helmet"));
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
const all_exceptions_filter_1 = require("./common/filters/all-exceptions.filter");
const transform_interceptor_1 = require("./common/interceptors/transform.interceptor");
const logging_interceptor_1 = require("./common/interceptors/logging.interceptor");
const validation_pipe_1 = require("./common/pipes/validation.pipe");
const swagger_config_1 = require("./config/swagger.config");
const cors_config_1 = require("./config/cors.config");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const configService = app.get(config_1.ConfigService);
    const logger = new common_1.Logger('Bootstrap');
    app.setGlobalPrefix('api');
    app.enableCors((0, cors_config_1.corsConfig)(configService));
    app.use((0, helmet_1.default)());
    app.useGlobalPipes(new validation_pipe_1.AppValidationPipe());
    app.useGlobalFilters(new all_exceptions_filter_1.AllExceptionsFilter());
    app.useGlobalInterceptors(new transform_interceptor_1.TransformInterceptor(), new logging_interceptor_1.LoggingInterceptor());
    const { path: swaggerPath, document } = (0, swagger_config_1.swaggerConfig)(configService, app);
    swagger_1.SwaggerModule.setup(swaggerPath, app, document);
    const port = process.env.PORT || configService.get('PORT', 3001);
    await app.listen(port);
    logger.log(`Application is running on: http://localhost:${port}/api`);
    logger.log(`Swagger documentation at: http://localhost:${port}/${swaggerPath}`);
}
bootstrap();
//# sourceMappingURL=main.js.map