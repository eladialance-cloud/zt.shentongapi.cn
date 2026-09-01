#!/usr/bin/env bash
# =============================================================================
# P2 冲突表物理结构检查（channels / teams / team_members）
# 用法：在服务器项目目录（含 .env 与 docker-compose.yml 的目录）执行：
#   bash deploy/inspect-db.sh
# 输出：三张表的 SHOW CREATE TABLE + 行数，贴回给修复会话即可。
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

find_env() {
  local p
  for p in "$SCRIPT_DIR/../.env" "$SCRIPT_DIR/.env" "$PWD/.env" "$PWD/../.env"; do
    if [ -f "$p" ]; then echo "$p"; return 0; fi
  done
  return 1
}

ENV_FILE="$(find_env)" || { echo "未找到 .env（请到项目根目录或 deploy/ 下执行）"; exit 1; }
PASS="$(grep -E '^MYSQL_ROOT_PASSWORD=' "$ENV_FILE" | cut -d'=' -f2)"
DB="$(grep -E '^MYSQL_DATABASE=' "$ENV_FILE" | cut -d'=' -f2)"
DB="${DB:-ai_agent}"
CONTAINER="${MYSQL_CONTAINER:-shentong-mysql}"

echo "== 数据库: $DB / 容器: $CONTAINER =="
docker exec "$CONTAINER" mysql -u root -p"$PASS" "$DB" -e "
SHOW CREATE TABLE channels;
SELECT COUNT(*) AS channels_rows FROM channels;
SHOW CREATE TABLE teams;
SELECT COUNT(*) AS teams_rows FROM teams;
SHOW CREATE TABLE team_members;
SELECT COUNT(*) AS team_members_rows FROM team_members;
"