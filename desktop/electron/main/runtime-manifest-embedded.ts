// 内置运行时清单的代码内嵌兜底副本
//
// 目的：当 electron-builder 打包遗漏 runtime/manifest.json（历史上发生过一次）时，
// 运行时下载/校验仍然可用，不再出现“内置运行时清单缺失，请重装应用”导致全部服务
// 无法下载安装。
//
// 注意：升级任何一个运行时版本时，必须同步更新本文件与 desktop/runtime/manifest.json，
// 保持一致（可直接运行 scripts/sync-embedded-manifest 之类脚本，或手动复制）。

import type { RuntimeManifest } from "../shared/types";

export const EMBEDDED_MANIFEST: RuntimeManifest = 
{
    "version": "1.0.1",
    "services": {
      "n8n": {
        "type": "local",
        "version": "1.62.0",
        "displayName": "N8N",
        "port": 5678,
        "entry": {
          "win32": "n8n.exe.cmd",
          "darwin": "n8n",
          "linux": "n8n"
        },
        "downloadUrl": {
          "win32-x64": "https://zt.shentongapi.cn/runtime/n8n/1.62.0/n8n-win-x64.tar.gz",
          "darwin-x64": "",
          "darwin-arm64": "",
          "linux-x64": ""
        },
        "size": {
          "win32-x64": 175978449,
          "darwin-x64": 0,
          "darwin-arm64": 0,
          "linux-x64": 0
        },
        "sha256": {
          "win32-x64": "86e5037279fd9448ea62d9a438bbc2abe982ff52a4ea62df1dc91a26aca08025",
          "darwin-x64": "",
          "darwin-arm64": "",
          "linux-x64": ""
        }
      },
      "openclaw": {
        "type": "local",
        "version": "2026.7.1",
        "displayName": "OpenClaw",
        "port": 8080,
        "entry": {
          "win32": "openclaw.exe.cmd",
          "darwin": "openclaw",
          "linux": "openclaw"
        },
        "downloadUrl": {
          "win32-x64": "https://zt.shentongapi.cn/runtime/openclaw/2026.7.1/openclaw-win-x64.tar.gz",
          "darwin-x64": "https://zt.shentongapi.cn/runtime/openclaw/2026.7.1/openclaw-mac-x64.tar.gz",
          "darwin-arm64": "https://zt.shentongapi.cn/runtime/openclaw/2026.7.1/openclaw-mac-arm64.tar.gz",
          "linux-x64": "https://zt.shentongapi.cn/runtime/openclaw/2026.7.1/openclaw-linux-x64.tar.gz"
        },
        "size": {
          "win32-x64": 98008562,
          "darwin-x64": 0,
          "darwin-arm64": 0,
          "linux-x64": 0
        },
        "sha256": {
          "win32-x64": "185b701ee53a608bbbb70e708c17948cf98116fcb13b44f9cd7354dd0b3ea223",
          "darwin-x64": "",
          "darwin-arm64": "",
          "linux-x64": ""
        }
      },
      "mcp": {
        "type": "local",
        "version": "1.0.0",
        "displayName": "MCP Gateway",
        "port": 3100,
        "entry": {
          "win32": "mcp-gateway.exe.cmd",
          "darwin": "mcp-gateway",
          "linux": "mcp-gateway"
        },
        "downloadUrl": {
          "win32-x64": "https://zt.shentongapi.cn/runtime/mcp/1.0.0/mcp-win-x64.tar.gz",
          "darwin-x64": "https://zt.shentongapi.cn/runtime/mcp/1.0.0/mcp-mac-x64.tar.gz",
          "darwin-arm64": "https://zt.shentongapi.cn/runtime/mcp/1.0.0/mcp-mac-arm64.tar.gz",
          "linux-x64": "https://zt.shentongapi.cn/runtime/mcp/1.0.0/mcp-linux-x64.tar.gz"
        },
        "size": {
          "win32-x64": 33060813,
          "darwin-x64": 0,
          "darwin-arm64": 0,
          "linux-x64": 0
        },
        "sha256": {
          "win32-x64": "36d94571f4abcb9c967bd657654e3c4a04a003bee1785ffefeec4ee8ddf4d848",
          "darwin-x64": "",
          "darwin-arm64": "",
          "linux-x64": ""
        }
      },
      "hermes": {
        "type": "local",
        "version": "0.19.0",
        "displayName": "Hermes Agent",
        "port": 8642,
        "entry": {
          "win32": "hermes.exe.cmd",
          "darwin": "hermes",
          "linux": "hermes"
        },
        "downloadUrl": {
          "win32-x64": "https://zt.shentongapi.cn/runtime/hermes/0.19.0/hermes-win-x64.tar.gz",
          "darwin-x64": "",
          "darwin-arm64": "",
          "linux-x64": ""
        },
        "size": {
          "win32-x64": 130379671,
          "darwin-x64": 0,
          "darwin-arm64": 0,
          "linux-x64": 0
        },
        "sha256": {
          "win32-x64": "937be9e85acf513d47a819e5f61e9276f3151aa63e7f612e5854e6124adc6378",
          "darwin-x64": "",
          "darwin-arm64": "",
          "linux-x64": ""
        }
      }
    }
  }
