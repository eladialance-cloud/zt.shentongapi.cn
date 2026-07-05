"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppValidationPipe = void 0;
const common_1 = require("@nestjs/common");
class AppValidationPipe extends common_1.ValidationPipe {
    constructor() {
        super({
            whitelist: true,
            transform: true,
            forbidNonWhitelisted: true,
            transformOptions: {
                enableImplicitConversion: true,
            },
        });
    }
}
exports.AppValidationPipe = AppValidationPipe;
//# sourceMappingURL=validation.pipe.js.map