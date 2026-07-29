"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var AllExceptionsFilter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllExceptionsFilter = void 0;
const common_1 = require("@nestjs/common");
const business_exception_1 = require("../exceptions/business.exception");
const error_constant_1 = require("../constants/error.constant");
const ERROR_CODE_TO_HTTP_STATUS = {
    [error_constant_1.ErrorCode.UNAUTHORIZED]: common_1.HttpStatus.UNAUTHORIZED,
    [error_constant_1.ErrorCode.TOKEN_EXPIRED]: common_1.HttpStatus.UNAUTHORIZED,
    [error_constant_1.ErrorCode.TOKEN_INVALID]: common_1.HttpStatus.UNAUTHORIZED,
    [error_constant_1.ErrorCode.INVALID_OR_EXPIRED_TOKEN]: common_1.HttpStatus.UNAUTHORIZED,
    [error_constant_1.ErrorCode.FORBIDDEN]: common_1.HttpStatus.FORBIDDEN,
    [error_constant_1.ErrorCode.NOT_FOUND]: common_1.HttpStatus.NOT_FOUND,
    [error_constant_1.ErrorCode.VALIDATION_FAILED]: common_1.HttpStatus.BAD_REQUEST,
};
let AllExceptionsFilter = AllExceptionsFilter_1 = class AllExceptionsFilter {
    logger = new common_1.Logger(AllExceptionsFilter_1.name);
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        let payload;
        let httpStatus;
        if (exception instanceof business_exception_1.BusinessException) {
            httpStatus =
                ERROR_CODE_TO_HTTP_STATUS[exception.code] ?? common_1.HttpStatus.BAD_REQUEST;
            const res = exception.getResponse();
            payload = {
                code: res.code,
                data: res.data,
                message: res.message,
                timestamp: Date.now(),
            };
        }
        else if (exception instanceof common_1.HttpException) {
            httpStatus = exception.getStatus();
            const res = exception.getResponse();
            let message;
            let code = httpStatus;
            if (typeof res === 'string') {
                message = res;
            }
            else if (typeof res === 'object' && res !== null) {
                const r = res;
                if (Array.isArray(r.message)) {
                    message = `参数校验失败: ${r.message.join('; ')}`;
                    code = common_1.HttpStatus.BAD_REQUEST;
                }
                else {
                    message = r.message || exception.message;
                }
            }
            else {
                message = exception.message;
            }
            payload = {
                code,
                data: null,
                message,
                timestamp: Date.now(),
            };
        }
        else if (this.isValidationError(exception)) {
            httpStatus = common_1.HttpStatus.BAD_REQUEST;
            const details = exception
                .map((e) => Object.values(e.constraints || {}).join('; '))
                .join('; ');
            payload = {
                code: common_1.HttpStatus.BAD_REQUEST,
                data: null,
                message: `参数校验失败: ${details}`,
                timestamp: Date.now(),
            };
        }
        else {
            httpStatus = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
            payload = {
                code: error_constant_1.ErrorCode.INTERNAL_ERROR,
                data: null,
                message: '服务器内部错误',
                timestamp: Date.now(),
            };
            this.logger.error(`Unhandled exception: ${request.method} ${request.url}`, exception instanceof Error ? exception.stack : String(exception));
        }
        response.status(httpStatus).json(payload);
    }
    isValidationError(exception) {
        return (Array.isArray(exception) &&
            exception.length > 0 &&
            exception.every((item) => item !== null &&
                typeof item === 'object' &&
                'constraints' in item));
    }
};
exports.AllExceptionsFilter = AllExceptionsFilter;
exports.AllExceptionsFilter = AllExceptionsFilter = AllExceptionsFilter_1 = __decorate([
    (0, common_1.Catch)()
], AllExceptionsFilter);
//# sourceMappingURL=all-exceptions.filter.js.map