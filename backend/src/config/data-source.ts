import 'dotenv/config';
import { DataSource } from 'typeorm';
import { join } from 'path';

/**
 * TypeORM CLI 数据源（迁移生成/执行用）
 *
 * 使用：
 *   npm run migration:generate -- src/migrations/<名称>   # 根据实体差异生成迁移
 *   npm run migration:run      # 执行未应用的迁移（生产启动时亦会自动执行）
 *   npm run migration:revert   # 回滚最近一次迁移
 *
 * 说明：应用运行时的连接配置见 src/config/database.ts（Nest ConfigService）。
 * 迁移体系分层：
 *   1. legacy 路径：backend/migrations/*.sql + db-migration.ts 启动补表（存量库幂等，生产已在用）；
 *   2. 正式路径：src/migrations/*.ts（TypeORM MigrationInterface 类），新增表结构变更优先走此路径。
 */
export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'ai_agent',
  charset: 'utf8mb4',
  timezone: '+08:00',
  entities: [join(__dirname, '..', 'modules', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, '..', 'migrations', '*.{ts,js}')],
  synchronize: false,
  extra: {
    connectionLimit: 5,
  },
});