"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BusinessException = void 0;
const common_1 = require("@nestjs/common");
const error_constant_1 = require("../constants/error.constant");
class BusinessException extends common_1.HttpException {
    code;
    data;
    constructor(code, message, data = null) {
        super({
            code,
            message: message || error_constant_1.ErrorMessage[code] || '业务异常',
            data,
            timestamp: Date.now(),
        }, common_1.HttpStatus.OK);
        this.code = code;
        this.data = data;
    }
    static throw(code, message) {
        throw new BusinessException(code, message);
    }
}
exports.BusinessException = BusinessException;
//# sourceMappingURL=business.exception.js.map