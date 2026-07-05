import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';

/**
 * TypeORM 数据库配置
 * 数据合同真源：开发文档-数据库设计.md 1.1 / 7.3
 */
export const databaseConfig = (
  config: ConfigService
): TypeOrmModuleOptions => ({
  type: 'mysql',
  host: config.get<string>('DB_HOST', 'localhost'),
  port: config.get<number>('DB_PORT', 3306),
  username: config.get<string>('DB_USER', 'root'),
  password: config.get<string>('DB_PASSWORD', ''),
  database: config.get<string>('DB_DATABASE', 'ai_agent'),
  entities: [join(__dirname, '..', 'modules', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, '..', 'migrations', '*.{ts,js}')],
  migrationsRun: true,
  synchronize: false, // 生产环境必须为 false，通过 migration 管理表结构
  logging: config.get<string>('NODE_ENV') !== 'production',
  charset: 'utf8mb4',
  timezone: '+08:00',
  extra: {
    connectionLimit: 10, // 连接池大小
  },
});
