"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorMessage = exports.ErrorCode = void 0;
var ErrorCode;
(function (ErrorCode) {
    ErrorCode[ErrorCode["SUCCESS"] = 0] = "SUCCESS";
    ErrorCode[ErrorCode["USER_NOT_FOUND"] = 1001] = "USER_NOT_FOUND";
    ErrorCode[ErrorCode["INVALID_CREDENTIALS"] = 1002] = "INVALID_CREDENTIALS";
    ErrorCode[ErrorCode["TOKEN_EXPIRED"] = 1003] = "TOKEN_EXPIRED";
    ErrorCode[ErrorCode["TOKEN_INVALID"] = 1004] = "TOKEN_INVALID";
    ErrorCode[ErrorCode["VALIDATION_FAILED"] = 1005] = "VALIDATION_FAILED";
    ErrorCode[ErrorCode["UNAUTHORIZED"] = 1006] = "UNAUTHORIZED";
    ErrorCode[ErrorCode["FORBIDDEN"] = 1007] = "FORBIDDEN";
    ErrorCode[ErrorCode["NOT_FOUND"] = 1008] = "NOT_FOUND";
    ErrorCode[ErrorCode["USER_EXISTS"] = 1009] = "USER_EXISTS";
    ErrorCode[ErrorCode["PASSWORD_INCORRECT"] = 1010] = "PASSWORD_INCORRECT";
    ErrorCode[ErrorCode["DEVICE_LIMIT_EXCEEDED"] = 1011] = "DEVICE_LIMIT_EXCEEDED";
    ErrorCode[ErrorCode["INVALID_OR_EXPIRED_TOKEN"] = 1012] = "INVALID_OR_EXPIRED_TOKEN";
    ErrorCode[ErrorCode["INVITE_CODE_INVALID"] = 1013] = "INVITE_CODE_INVALID";
    ErrorCode[ErrorCode["INVITE_CODE_EXPIRED"] = 1014] = "INVITE_CODE_EXPIRED";
    ErrorCode[ErrorCode["INVITE_CODE_USED"] = 1015] = "INVITE_CODE_USED";
    ErrorCode[ErrorCode["INTERNAL_ERROR"] = 1099] = "INTERNAL_ERROR";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
exports.ErrorMessage = {
    [ErrorCode.SUCCESS]: 'success',
    [ErrorCode.USER_NOT_FOUND]: '用户不存在',
    [ErrorCode.INVALID_CREDENTIALS]: '账号或密码错误',
    [ErrorCode.TOKEN_EXPIRED]: 'Token已过期',
    [ErrorCode.TOKEN_INVALID]: 'Token无效',
    [ErrorCode.VALIDATION_FAILED]: '参数校验失败',
    [ErrorCode.UNAUTHORIZED]: '未授权',
    [ErrorCode.FORBIDDEN]: '禁止访问',
    [ErrorCode.NOT_FOUND]: '资源不存在',
    [ErrorCode.USER_EXISTS]: '用户已存在',
    [ErrorCode.PASSWORD_INCORRECT]: '原密码不正确',
    [ErrorCode.DEVICE_LIMIT_EXCEEDED]: '设备绑定数量超限',
    [ErrorCode.INVALID_OR_EXPIRED_TOKEN]: '令牌无效或已过期',
    [ErrorCode.INVITE_CODE_INVALID]: '邀请码无效',
    [ErrorCode.INVITE_CODE_EXPIRED]: '邀请码已过期',
    [ErrorCode.INVITE_CODE_USED]: '邀请码已被使用',
    [ErrorCode.INTERNAL_ERROR]: '服务器内部错误',
};
//# sourceMappingURL=error.constant.js.map