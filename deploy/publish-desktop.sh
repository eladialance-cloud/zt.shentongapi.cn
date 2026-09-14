#!/usr/bin/env bash
# publish-desktop.sh - server-side swap of the Windows installer under /opt/shentong/updates.
#
# Usage (see deploy/DESKTOP-RELEASE-SOP.md sections 5 and 10):
#   scp ShenTongAI-Setup-<ver>-x64.exe latest.yml ubuntu@<server>:/tmp/
#   ssh ubuntu@<server> "bash /tmp/publish-desktop.sh <ver>"
#
# Every step below is required; skipping one breaks the download page or auto-update:
#   1. back up the current latest.yml
#   2. delete the previous ShenTongAI-* packages
#   3. move /tmp/<exe> and /tmp/latest.yml into the nginx-served directory
#   4. rebuild the Setup-prefixed zip (the website/download page depends on that exact name)
#   5. chown to www-data
#   6. print the directory listing and the checks to run next
#
# Notes:
#   - VER must match the latest.yml version; the script refuses a mismatch.
#   - This does NOT touch the database. Run /tmp/publish-<ver>.sql separately (SOP section 6):
#     the website version page reads client_versions, not the filesystem.
set -euo pipefail

VER="${1:-}"
DIR=/opt/shentong/updates
EXE="ShenTongAI-Setup-${VER}-x64.exe"
ZIP="ShenTongAI-Setup-${VER}-x64.exe.zip"

if [[ ! "$VER" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "usage: bash publish-desktop.sh <version>    e.g. bash publish-desktop.sh 2.1.6" >&2
  exit 2
fi

for f in "/tmp/${EXE}" /tmp/latest.yml; do
  if [[ ! -f "$f" ]]; then
    echo "missing $f - scp the artifact (exe + latest.yml) to /tmp/ first" >&2
    exit 2
  fi
done

YML_VER="$(grep -m1 "^version:" /tmp/latest.yml | awk '{print $2}' | tr -d "\r")"
if [[ "$YML_VER" != "$VER" ]]; then
  echo "latest.yml says version [$YML_VER] but you asked to publish [$VER]" >&2
  exit 2
fi

echo "== 1) back up latest.yml =="
cd "$DIR"
sudo cp latest.yml "latest.yml.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true

echo "== 2) remove previous packages =="
sudo rm -f ShenTongAI-Setup-*.exe ShenTongAI-Setup-*.exe.zip ShenTongAI-*.exe.zip

echo "== 3) move the new package in =="
sudo mv "/tmp/${EXE}" /tmp/latest.yml "$DIR/"

echo "== 4) rebuild the Setup-prefixed zip =="
sudo zip -j "$ZIP" "$EXE"

echo "== 5) ownership =="
sudo chown -R www-data:www-data "$DIR/"

echo "== 6) directory now =="
ls -lh "$DIR" | grep -v "latest.yml.bak" | tail -6

echo ""
echo "next:"
echo "  curl -s https://zt.shentongapi.cn/desktop/latest.yml | head -3        # expect version: ${VER}"
echo "  curl -sI https://zt.shentongapi.cn/desktop/${ZIP} | head -3          # expect HTTP 200"
echo "  sudo docker exec -i shentong-mysql mysql --default-character-set=utf8mb4 -uroot shentong < /tmp/publish-${VER}.sql"
