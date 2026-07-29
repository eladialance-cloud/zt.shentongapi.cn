#!/bin/bash
set -e

# SSL 健康检查脚本
# 检查证书有效期、HTTP→HTTPS 跳转、HTTPS 可达性、HSTS 头

# 颜色码定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查的域名
DOMAIN="zt.shentongapi.cn"

# 退出码变量
EXIT_CODE=0

echo ""
echo "===== 检查域名: $DOMAIN ====="

# a. 证书有效期检查
CERT_END=$(echo | openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [[ -z "$CERT_END" ]]; then
    echo -e "${RED}[FAIL]${NC} $DOMAIN: 无法获取证书信息"
    EXIT_CODE=1
else
    CERT_END_TS=$(date -d "$CERT_END" +%s 2>/dev/null || date -jf "%b %d %H:%M:%S %Y %Z" "$CERT_END" +%s 2>/dev/null)
    NOW_TS=$(date +%s)
    DAYS_LEFT=$(( (CERT_END_TS - NOW_TS) / 86400 ))
    if [[ $DAYS_LEFT -lt 14 ]]; then
        echo -e "${RED}[WARN]${NC} $DOMAIN: 证书剩余 ${DAYS_LEFT} 天，请立即续签！"
        EXIT_CODE=1
    elif [[ $DAYS_LEFT -lt 30 ]]; then
        echo -e "${YELLOW}[INFO]${NC} $DOMAIN: 证书剩余 ${DAYS_LEFT} 天，建议尽快续签"
    else
        echo -e "${GREEN}[OK]${NC} $DOMAIN: 证书剩余 ${DAYS_LEFT} 天"
    fi
fi

# b. HTTP→HTTPS 跳转检查
HTTP_CODE=$(curl -sI -o /dev/null -w "%{http_code}" "http://$DOMAIN/" 2>/dev/null)
if [[ "$HTTP_CODE" == "301" ]]; then
    echo -e "  ${GREEN}[OK]${NC} HTTP→HTTPS 跳转正常 (301)"
else
    echo -e "  ${RED}[FAIL]${NC} HTTP→HTTPS 跳转异常 (HTTP $HTTP_CODE)"
    EXIT_CODE=1
fi

# c. HTTPS 可达性检查
HTTPS_CODE=$(curl -sI -o /dev/null -w "%{http_code}" "https://$DOMAIN/" 2>/dev/null)
if [[ "$HTTPS_CODE" == "200" || "$HTTPS_CODE" == "301" ]]; then
    echo -e "  ${GREEN}[OK]${NC} HTTPS 可达 (HTTP $HTTPS_CODE)"
else
    echo -e "  ${RED}[FAIL]${NC} HTTPS 不可达 (HTTP $HTTPS_CODE)"
    EXIT_CODE=1
fi

# d. HSTS 头检查
HSTS=$(curl -sI "https://$DOMAIN/" 2>/dev/null | grep -i "Strict-Transport-Security" | tr -d '\r')
if [[ -n "$HSTS" ]]; then
    echo -e "  ${GREEN}[OK]${NC} HSTS 头已设置"
else
    echo -e "  ${YELLOW}[WARN]${NC} HSTS 头未设置"
fi

# 末尾输出总结并退出
echo ""
if [[ $EXIT_CODE -eq 0 ]]; then
    echo -e "${GREEN}所有检查通过${NC}"
else
    echo -e "${RED}存在检查失败项，请查看上方日志${NC}"
fi
exit $EXIT_CODE
