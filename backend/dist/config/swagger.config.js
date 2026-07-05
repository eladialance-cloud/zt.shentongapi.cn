"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.swaggerConfig = void 0;
const swagger_1 = require("@nestjs/swagger");
const swaggerConfig = (config, app) => {
    const documentConfig = new swagger_1.DocumentBuilder()
        .setTitle('深瞳AI智能中台 API')
        .setDescription('深瞳AI智能中台 - 后端 API 文档')
        .setVersion('1.0.0')
        .addBearerAuth()
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, documentConfig);
    return {
        path: config.get('SWAGGER_PATH', 'api/docs'),
        document,
    };
};
exports.swaggerConfig = swaggerConfig;
//# sourceMappingURL=swagger.config.js.map