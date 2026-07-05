import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, ErrorMessage } from '../constants/error.constant';

export class BusinessException extends HttpException {
  readonly code: ErrorCode;
  readonly data: any;

  constructor(code: ErrorCode, message?: string, data: any = null) {
    super(
      {
        code,
        message: message || ErrorMessage[code] || '业务异常',
        data,
        timestamp: Date.now(),
      },
      HttpStatus.OK, // 业务异常统一返回 200，通过 code 区分
    );
    this.code = code;
    this.data = data;
  }

  static throw(code: ErrorCode, message?: string): never {
    throw new BusinessException(code, message);
  }
}
