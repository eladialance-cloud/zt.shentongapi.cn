import {
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ValueTransformer,
} from 'typeorm';

// bigint transformer: 写入时转字符串，读取时转 number。
// 注意: 大 ID 场景(超过 Number.MAX_SAFE_INTEGER = 2^53 - 1)会丢精度,
// 届时需将 id 类型声明改为 string 并调整 from 返回 String(value)。
export const bigintTransformer: ValueTransformer = {
  to: (value: string | number | null): string | null => {
    if (value === null || value === undefined) return null;
    return String(value);
  },
  from: (value: string | null): number | null => {
    if (value === null || value === undefined) return null;
    return Number(value);
  },
};

// PrimaryGeneratedColumnNumericOptions 类型不含 transformer 字段,
// 但 TypeORM 运行时会透传该属性(Object.assign),故以变量形式传入绕过多余属性检查。
const idColumnOptions = {
  type: 'bigint' as const,
  name: 'id',
  transformer: bigintTransformer,
};

export abstract class BaseEntity {
  @PrimaryGeneratedColumn(idColumnOptions)
  id: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
