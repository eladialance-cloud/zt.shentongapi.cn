/// <reference types="vite/client" />
/**
 * Office 素材预加载器（基于 PixiJS Assets + public 目录静态资源）
 *
 * 设计要点：
 *   1. PNG 素材统一放到 public/assets/office/iso/，dev / build / Electron production
 *      均由 Web 服务器或本地 file:// 协议按相对根目录路径 /assets/office/iso/... 加载。
 *   2. `resolveOfficeAssetUrl` 根据当前 window.location 自动适配：
 *        - 普通 Web (http/https): 返回 /assets/office/iso/...
 *        - Electron production (file://.../renderer/index.html): 基于 HTML 目录拼接
 *          file://.../renderer/assets/office/iso/...
 *   3. `preloadOfficeAssets` 调用 `Assets.load(url)` 将静态/角色素材加载到 PixiJS
 *      纹理缓存，后续可通过 `Texture.from(url)` / `Assets.get(url)` 直接取用。
 *
 * 修复：不再使用 Vite 静态 import / import.meta.glob，避免 Electron 构建后
 * import.meta.url 变化导致路径解析失败的问题。
 */

import { Assets, Texture } from 'pixi.js'

import { ASSET_PATHS, charSpriteUrl, type CharAction, type CharDir } from './asset-config'

/** 素材公共基础路径（相对站点根目录） */
const OFFICE_ASSET_BASE = '/assets/office/iso'

/**
 * 根据运行环境解析素材 URL。
 *
 * - dev / 普通 Web build: 直接返回以 /assets/office/iso 开头的绝对路径，
 *   由 Vite dev server 或部署站点的静态资源服务解析。
 * - Electron production: window.location 为 file:///.../renderer/index.html，
 *   需要以当前 HTML 所在目录为 base 拼接出 file://.../renderer/assets/office/iso/... 。
 */
function resolveOfficeAssetUrl(relPath: string): string {
  if (typeof window === 'undefined') {
    return `${OFFICE_ASSET_BASE}/${relPath}`
  }

  const href = window.location.href
  // Electron production 中使用 file:// 协议加载本地 HTML
  if (href.startsWith('file:')) {
    // 去掉末尾的 index.html，得到 renderer/ 目录，再拼接相对路径
    const baseDir = href.replace(/\/[^/]*$/, '/')
    return new URL(relPath, baseDir).href
  }

  // 普通浏览器环境：以站点根目录为 base
  return `${OFFICE_ASSET_BASE}/${relPath}`
}

/**
 * 静态素材「相对路径 → URL」映射表。
 * key 与 ASSET_PATHS 中的相对路径常量一一对应。
 */
const staticAssetUrlMap: Record<string, string> = {
  [ASSET_PATHS.background]: resolveOfficeAssetUrl(ASSET_PATHS.background),
  [ASSET_PATHS.deskWithMonitor]: resolveOfficeAssetUrl(ASSET_PATHS.deskWithMonitor),
  [ASSET_PATHS.chair]: resolveOfficeAssetUrl(ASSET_PATHS.chair),
  [ASSET_PATHS.meetingTable]: resolveOfficeAssetUrl(ASSET_PATHS.meetingTable),
  [ASSET_PATHS.largeScreen]: resolveOfficeAssetUrl(ASSET_PATHS.largeScreen),
  [ASSET_PATHS.plant]: resolveOfficeAssetUrl(ASSET_PATHS.plant),
  [ASSET_PATHS.receptionDesk]: resolveOfficeAssetUrl(ASSET_PATHS.receptionDesk),
  [ASSET_PATHS.bookshelf]: resolveOfficeAssetUrl(ASSET_PATHS.bookshelf),
  [ASSET_PATHS.loungeSofa]: resolveOfficeAssetUrl(ASSET_PATHS.loungeSofa),
  [ASSET_PATHS.screenDivider]: resolveOfficeAssetUrl(ASSET_PATHS.screenDivider),
  [ASSET_PATHS.tileCarpet]: resolveOfficeAssetUrl(ASSET_PATHS.tileCarpet),
  [ASSET_PATHS.tileWoodFloor]: resolveOfficeAssetUrl(ASSET_PATHS.tileWoodFloor),
  [ASSET_PATHS.wallGlassPartition]: resolveOfficeAssetUrl(ASSET_PATHS.wallGlassPartition),
  [ASSET_PATHS.wallExterior]: resolveOfficeAssetUrl(ASSET_PATHS.wallExterior),
}

/**
 * 角色精灵图「相对路径 → URL」查找表。
 *
 * 遍历 ASSET_PATHS.characters.templates 中所有模板目录，以及每个动作、方向、帧，
 * 生成完整 URL 并缓存，避免运行时再拼接。
 */
const charSpriteUrlMap: Record<string, string> = {}

const CHAR_ACTIONS: CharAction[] = ['idle', 'walking', 'working', 'meeting']
const CHAR_DIRS: CharDir[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']

for (const templateDir of ASSET_PATHS.characters.templates) {
  for (const action of CHAR_ACTIONS) {
    const frameCount = action === 'walking' ? 4 : 3
    for (const dir of CHAR_DIRS) {
      for (let frame = 1; frame <= frameCount; frame += 1) {
        const relPath = charSpriteUrl(templateDir, action, dir, frame)
        charSpriteUrlMap[relPath] = resolveOfficeAssetUrl(relPath)
      }
    }
  }
}

// 验证：确保至少有一个条目被正确映射
if (Object.keys(charSpriteUrlMap).length === 0) {
  console.error('[Office asset-loader] charSpriteUrlMap 为空！')
}

/**
 * 通过 ASSET_PATHS 的相对路径返回素材 URL。
 *
 * @param relPath ASSET_PATHS 中定义的相对路径（如 'office/iso/furniture/office-background.png'）
 * @returns 解析后的资源 URL
 * @throws 当 relPath 未在映射表中注册时抛错
 */
export function getAssetUrl(relPath: string): string {
  const url = staticAssetUrlMap[relPath]
  if (!url) {
    throw new Error(`[Office asset-loader] 未知素材路径: ${relPath}`)
  }
  return url
}

/**
 * 返回角色精灵图的完整 URL。
 *
 * @param templateDir 模板目录相对路径（如 'office/iso/characters/ai-employee-01'）
 * @param action 动作类型
 * @param dir 8 方向缩写
 * @param frame 帧序号（1-based，会被 padStart(2,'0') 处理）
 * @returns 解析后的角色精灵图 URL
 * @throws 当对应精灵图未找到时抛错
 */
export function getCharSpriteUrl(
  templateDir: string,
  action: CharAction,
  dir: CharDir,
  frame: number,
): string {
  const relPath = charSpriteUrl(templateDir, action, dir, frame)
  const url = charSpriteUrlMap[relPath]
  if (!url) {
    throw new Error(`[Office asset-loader] 角色精灵图未找到: ${relPath}`)
  }
  return url
}

/**
 * 预加载所有静态 PNG + 角色精灵图到 PixiJS Assets 纹理缓存。
 *
 * 逐个调用 `Assets.load(url)` 填充缓存（PixiJS 内部对同一 URL 会去重），
 * 加载完成后可通过 `Texture.from(url)` / `Assets.get(url)` 直接取用。
 *
 * @param onProgress 进度回调 (loaded, total)
 */
export async function preloadOfficeAssets(
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  const staticUrls = Object.values(staticAssetUrlMap)
  const charSpriteUrls = Object.values(charSpriteUrlMap)
  const allUrls = [...staticUrls, ...charSpriteUrls]
  const total = allUrls.length
  let loaded = 0

  // K8 fix: 单资源加载失败不中断整个预加载链
  for (const url of allUrls) {
    try {
      await Assets.load<Texture>(url)
    } catch (err) {
      console.warn(`[Office asset-loader] 单个素材加载失败，跳过: ${url}`, err)
    }
    loaded += 1
    onProgress?.(loaded, total)
  }
}
