import { PipeTransform, BadRequestException } from '@nestjs/common';

/**
 * BigInt 安全解析管道
 *
 * 将字符串参数转为 number（与 ParseIntPipe 相同功能），但添加安全范围检查。
 * 如果值超过 Number.MAX_SAFE_INTEGER (2^53 - 1) 则抛出 BadRequestException。
 * 当前阶段保持 ID 为 number 类型但添加保护，避免大 ID 丢精度。
 */
export class BigIntParsePipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const num = Number(value);
    if (!Number.isFinite(num) || !Number.isInteger(num)) {
      throw new BadRequestException(`参数 "${value}" 不是有效的整数`);
    }
    if (num > Number.MAX_SAFE_INTEGER || num < Number.MIN_SAFE_INTEGER) {
      throw new BadRequestException(
        `参数 "${value}" 超出安全整数范围 (MAX_SAFE_INTEGER = ${Number.MAX_SAFE_INTEGER})`,
      );
    }
    return num;
  }
}
