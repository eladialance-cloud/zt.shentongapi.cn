import { PipeTransform } from '@nestjs/common';
export declare class BigIntParsePipe implements PipeTransform<string, number> {
    transform(value: string): number;
}
