"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BigIntParsePipe = void 0;
const common_1 = require("@nestjs/common");
class BigIntParsePipe {
    transform(value) {
        const num = Number(value);
        if (!Number.isFinite(num) || !Number.isInteger(num)) {
            throw new common_1.BadRequestException(`参数 "${value}" 不是有效的整数`);
        }
        if (num > Number.MAX_SAFE_INTEGER || num < Number.MIN_SAFE_INTEGER) {
            throw new common_1.BadRequestException(`参数 "${value}" 超出安全整数范围 (MAX_SAFE_INTEGER = ${Number.MAX_SAFE_INTEGER})`);
        }
        return num;
    }
}
exports.BigIntParsePipe = BigIntParsePipe;
//# sourceMappingURL=bigint-parse.pipe.js.map