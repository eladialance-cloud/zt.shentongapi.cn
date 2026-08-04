#!/bin/bash
# 深瞳AI v0.6.0 数据库增量迁移（skill-store 三表）
# 用法：bash update_db_0.6.0.sh
set -e
DB_PASSWORD=${DB_PASSWORD:?请设置 DB_PASSWORD 环境变量}
DB_NAME=${DB_DATABASE:-ai_agent}

echo "==> 执行 backend/migrations/012_create_skill_store_tables.sql"
docker exec -i shentong-mysql mysql -u shentong -p"$DB_PASSWORD" "$DB_NAME" --default-character-set=utf8mb4 \
  < backend/migrations/012_create_skill_store_tables.sql

echo "==> 校验"
docker exec -i shentong-mysql mysql -u shentong -p"$DB_PASSWORD" "$DB_NAME" -e \
  "SHOW TABLES LIKE 'skill_packages'; SHOW TABLES LIKE 'skill_sources'; SHOW TABLES LIKE 'skill_install_logs';"
