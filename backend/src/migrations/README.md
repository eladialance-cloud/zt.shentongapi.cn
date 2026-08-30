# TypeORM 迁移目录

本目录存放正式 TypeORM 迁移类（`MigrationInterface`），由 TypeORM 统一管理（表 `migrations`）。

## 生成新迁移

```bash
cd backend
npm run migration:generate -- src/migrations/YourMigrationName
```

## 执行 / 回滚

```bash
npm run migration:run
npm run migration:revert
```

生产环境启动时（`migrationsRun: true`）会自动执行未应用的迁移。

## 分层说明（重要）

- **legacy 路径**：`backend/migrations/*.sql` + `src/common/utils/db-migration.ts` 启动补表。
  存量生产库依赖该路径做幂等补列，**不要删除**。
- **正式路径**：本目录的 TS 迁移类。新增表/字段的常规变更优先走这里。
- 两条路径幂等共存：SQL 台账表 `schema_migrations`，TypeORM 台账表 `migrations`。