/**
 * 零依赖 ZIP 解压工具
 *
 * 解析 ZIP 中央目录（End of Central Directory + Central Directory + Local File Headers），
 * 支持 store(0) 与 deflate(8) 两种压缩方式、UTF-8 文件名、zip64 大小字段。
 * 内置路径穿越防护：所有条目必须落在目标目录内。
 *
 * 不依赖任何第三方包，避免后端新增依赖。
 */
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;
const ZIP64_EOCD_LOC_SIG = 0x07064b50;
const ZIP64_EOCD_SIG = 0x06064b50;
const ZIP64_EXTRA_ID = 0x0001;

/** 最大解压包大小（512MB，防御异常文件） */
const MAX_ZIP_SIZE = 512 * 1024 * 1024;
/** 最大条目数（防御畸形包） */
const MAX_ENTRIES = 100_000;

/** 将 zip 文件解压到 destDir（同步） */
export function extractZipFile(zipPath: string, destDir: string): void {
  const buf = fs.readFileSync(zipPath);
  if (buf.length > MAX_ZIP_SIZE) {
    throw new Error('压缩包过大（超过 512MB）');
  }
  if (buf.length < 22) {
    throw new Error('无效的压缩包（文件过小）');
  }

  const eocdOffset = findEocd(buf);
  if (eocdOffset < 0) {
    throw new Error('无效的压缩包（未找到结束标记）');
  }

  let totalEntries = buf.readUInt16LE(eocdOffset + 10);
  let centralDirOffset = buf.readUInt32LE(eocdOffset + 16);
  const centralDirSize = buf.readUInt32LE(eocdOffset + 12);

  // zip64：EOCD 字段为 0xFFFF/0xFFFFFFFF 时从 zip64 EOCD 记录读取真实值
  const zip64LocatorOffset = eocdOffset - 20;
  if (
    zip64LocatorOffset >= 0 &&
    buf.readUInt32LE(zip64LocatorOffset) === ZIP64_EOCD_LOC_SIG
  ) {
    const zip64EocdOffset = Number(buf.readBigUInt64LE(zip64LocatorOffset + 8));
    if (
      zip64EocdOffset >= 0 &&
      zip64EocdOffset + 56 <= buf.length &&
      buf.readUInt32LE(zip64EocdOffset) === ZIP64_EOCD_SIG
    ) {
      const zip64Total = Number(buf.readBigUInt64LE(zip64EocdOffset + 32));
      const zip64DirOffset = Number(buf.readBigUInt64LE(zip64EocdOffset + 48));
      if (totalEntries === 0xffff) totalEntries = zip64Total;
      if (centralDirOffset === 0xffffffff) centralDirOffset = zip64DirOffset;
    }
  }

  if (totalEntries > MAX_ENTRIES) {
    throw new Error('压缩包条目过多');
  }

  const destRoot = path.resolve(destDir);
  fs.mkdirSync(destRoot, { recursive: true });

  const centralDirEnd = centralDirOffset + centralDirSize;
  let offset = centralDirOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (offset + 46 > buf.length || offset > centralDirEnd) {
      throw new Error('中央目录越界');
    }
    if (buf.readUInt32LE(offset) !== CEN_SIG) {
      throw new Error('中央目录条目签名无效');
    }
    const method = buf.readUInt16LE(offset + 10);
    let compressedSize = buf.readUInt32LE(offset + 20);
    let uncompressedSize = buf.readUInt32LE(offset + 24);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    let localHeaderOffset = buf.readUInt32LE(offset + 42);

    const nameStart = offset + 46;
    const entryName = buf.toString('utf8', nameStart, nameStart + nameLen);
    const extra = buf.subarray(nameStart + nameLen, nameStart + nameLen + extraLen);

    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      const zip64 = readZip64Extra(extra);
      if (uncompressedSize === 0xffffffff) uncompressedSize = zip64.uncompressedSize;
      if (compressedSize === 0xffffffff) compressedSize = zip64.compressedSize;
      if (localHeaderOffset === 0xffffffff) localHeaderOffset = zip64.localHeaderOffset;
    }

    // 目录条目跳过，普通文件解压
    if (entryName.length > 0 && !entryName.endsWith('/')) {
      const target = safeJoin(destRoot, entryName);
      const data = readEntryData(buf, localHeaderOffset, compressedSize, method);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data);
    }

    offset = nameStart + nameLen + extraLen + commentLen;
  }
}

/** 从文件尾部向前查找 EOCD 签名（PK\x05\x06） */
function findEocd(buf: Buffer): number {
  const maxCommentLen = 65535;
  const minOffset = Math.max(0, buf.length - 22 - maxCommentLen);
  for (let i = buf.length - 22; i >= minOffset; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

/** 读取 zip64 扩展字段中的真实大小/偏移 */
function readZip64Extra(extra: Buffer): {
  uncompressedSize: number;
  compressedSize: number;
  localHeaderOffset: number;
} {
  const result = { uncompressedSize: 0, compressedSize: 0, localHeaderOffset: 0 };
  let offset = 0;
  while (offset + 4 <= extra.length) {
    const id = extra.readUInt16LE(offset);
    const size = extra.readUInt16LE(offset + 2);
    if (id === ZIP64_EXTRA_ID) {
      const data = extra.subarray(offset + 4, offset + 4 + size);
      let p = 0;
      const values: number[] = [];
      while (p + 8 <= data.length) {
        values.push(Number(data.readBigUInt64LE(p)));
        p += 8;
      }
      result.uncompressedSize = values[0] ?? 0;
      result.compressedSize = values[1] ?? 0;
      result.localHeaderOffset = values[2] ?? 0;
      break;
    }
    offset += 4 + size;
  }
  return result;
}

/** 依据本地文件头定位并解压单个条目 */
function readEntryData(
  buf: Buffer,
  localHeaderOffset: number,
  compressedSize: number,
  method: number,
): Buffer {
  if (localHeaderOffset + 30 > buf.length) {
    throw new Error('本地文件头越界');
  }
  if (buf.readUInt32LE(localHeaderOffset) !== LOC_SIG) {
    throw new Error('本地文件头签名无效');
  }
  const nameLen = buf.readUInt16LE(localHeaderOffset + 26);
  const extraLen = buf.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + nameLen + extraLen;
  if (dataStart + compressedSize > buf.length) {
    throw new Error('文件数据越界');
  }
  const compressed = buf.subarray(dataStart, dataStart + compressedSize);
  if (method === 0) {
    return compressed; // store
  }
  if (method === 8) {
    return zlib.inflateRawSync(compressed); // deflate
  }
  throw new Error('不支持的压缩方式: ' + method);
}

/** 路径穿越防护：目标必须位于 destRoot 之内 */
function safeJoin(destRoot: string, entryName: string): string {
  const normalized = entryName.replace(/\\/g, '/');
  const target = path.resolve(destRoot, normalized);
  if (target !== destRoot && !target.startsWith(destRoot + path.sep)) {
    throw new Error('非法的压缩包路径: ' + entryName);
  }
  return target;
}
