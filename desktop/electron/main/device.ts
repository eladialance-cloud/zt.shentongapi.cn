// 设备指纹采集 - 采集本机硬件/系统特征生成 SHA-256 指纹
// 数据合同真源：Task 4 - 设备指纹与绑定机制

import { app } from 'electron'
import { hostname, networkInterfaces, platform, arch, cpus, totalmem } from 'node:os'
import { createHash } from 'node:crypto'
import type { DeviceFingerprint, DeviceInfo } from '../shared/types'

/**
 * 获取第一个非内部网卡的 MAC 地址
 * 遍历所有网络接口，跳过 internal 与无 mac 的接口
 */
function getFirstMacAddress(): string {
  try {
    const interfaces = networkInterfaces()
    for (const name of Object.keys(interfaces)) {
      const list = interfaces[name]
      if (!list) continue
      for (const iface of list) {
        // 跳过内部回环与 IPv6（mac 仅在 IPv4/IPv6 都有，取任一即可）
        if (iface.internal) continue
        if (!iface.mac || iface.mac === '00:00:00:00:00:00') continue
        return iface.mac
      }
    }
  } catch {
    // ignore
  }
  return '00:00:00:00:00:00'
}

/**
 * 获取应用版本（app 未就绪时回退到 package.json 版本）
 */
function getAppVersion(): string {
  try {
    return app.getVersion()
  } catch {
    return '0.0.0'
  }
}

/**
 * 生成设备指纹哈希：SHA-256(`${hostname}|${platform}|${arch}|${macAddress}`)
 * 输出 64 字符 hex 字符串
 */
function fingerprintHash(name: string, plat: string, architecture: string, mac: string): string {
  const raw = `${name}|${plat}|${architecture}|${mac}`
  return createHash('sha256').update(raw).digest('hex')
}

/**
 * 采集设备指纹
 * 返回指纹哈希及关键设备特征（用于后端绑定校验）
 */
export async function getDeviceFingerprint(): Promise<DeviceFingerprint> {
  const name = hostname() || 'unknown-host'
  const plat = platform() || 'unknown'
  const architecture = arch() || 'unknown'
  const mac = getFirstMacAddress()
  const fingerprint = fingerprintHash(name, plat, architecture, mac)

  return {
    fingerprint,
    hostname: name,
    platform: plat,
    arch: architecture,
    macAddress: mac,
    appVersion: getAppVersion(),
  }
}

/**
 * 返回设备名称（hostname + platform）
 */
export function getDeviceName(): string {
  const name = hostname() || 'unknown-host'
  const plat = platform() || 'unknown'
  return `${name}-${plat}`
}

/**
 * 返回完整设备信息（指纹 + 名称 + CPU/内存）
 */
export async function getDeviceInfo(): Promise<DeviceInfo> {
  const fp = await getDeviceFingerprint()
  return {
    ...fp,
    deviceName: getDeviceName(),
    cpus: cpus().length,
    totalMemory: totalmem(),
  }
}
