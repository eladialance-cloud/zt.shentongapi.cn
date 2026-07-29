import { HttpException } from '@nestjs/common';
import { ErrorCode } from '../constants/error.constant';
export declare class BusinessException extends HttpException {
    readonly code: ErrorCode;
    readonly data: any;
    constructor(code: ErrorCode, message?: string, data?: any);
    static throw(code: ErrorCode, message?: string): never;
}
