import * as crypto from 'crypto';

/**
 * 微信系加解密与 XML 工具（公众号 / 企业微信回调共用）
 *
 * - 公众号签名：SHA1(sort(token, timestamp, nonce))
 * - 企业微信签名：SHA1(sort(token, timestamp, nonce, encrypt))
 * - 企业微信消息加密：AES-256-CBC（EncodingAESKey → 43 字符 base64，IV=前16字节）
 */

/** 字典排序后拼接 */
function sortedConcat(parts: string[]): string {
  return parts
    .slice()
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .join('');
}

/** 计算 SHA1 十六进制 */
export function sha1Hex(input: string): string {
  return crypto.createHash('sha1').update(input, 'utf8').digest('hex');
}

/** 公众号/企业微信通用签名校验 */
export function verifyWechatSignature(
  token: string,
  timestamp: string,
  nonce: string,
  signature: string,
  extra?: string,
): boolean {
  if (!token || !signature) return false;
  const parts = [token, timestamp, nonce];
  if (extra) parts.push(extra);
  return sha1Hex(sortedConcat(parts)) === signature;
}

/** EncodingAESKey（43 字符）→ 32 字节 AES 密钥 */
export function aesKeyFromEncoding(encodingAesKey: string): Buffer {
  return Buffer.from(`${encodingAesKey}=`, 'base64');
}

/** PKCS#7 去填充 */
function unpad(buf: Buffer): Buffer {
  const pad = buf[buf.length - 1];
  if (!pad || pad < 1 || pad > 32 || pad > buf.length) return buf;
  return buf.subarray(0, buf.length - pad);
}

/** PKCS#7 填充 */
function pad(buf: Buffer, blockSize = 32): Buffer {
  const len = blockSize - (buf.length % blockSize);
  return Buffer.concat([buf, Buffer.alloc(len, len)]);
}

/** 解密企业微信回调密文 → { message, receiveId } */
export function decryptWecomMessage(
  encryptBase64: string,
  encodingAesKey: string,
): { message: string; receiveId: string } {
  const aesKey = aesKeyFromEncoding(encodingAesKey);
  const iv = aesKey.subarray(0, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptBase64, 'base64')),
    decipher.final(),
  ]);
  const raw = unpad(decrypted);
  // 结构：random(16) + 4字节网络序长度 + 消息 + receiveId
  const msgLen = raw.readUInt32BE(16);
  const message = raw.subarray(20, 20 + msgLen).toString('utf8');
  const receiveId = raw.subarray(20 + msgLen).toString('utf8');
  return { message, receiveId };
}

/** 加密企业微信回复消息 */
export function encryptWecomMessage(
  message: string,
  encodingAesKey: string,
  receiveId: string,
): string {
  const aesKey = aesKeyFromEncoding(encodingAesKey);
  const random = crypto.randomBytes(16);
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(Buffer.byteLength(message, 'utf8'));
  const msgBuf = Buffer.from(message, 'utf8');
  const idBuf = Buffer.from(receiveId, 'utf8');
  const plain = Buffer.concat([random, lenBuf, msgBuf, idBuf]);
  const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, aesKey.subarray(0, 16));
  const encrypted = Buffer.concat([cipher.update(pad(plain)), cipher.final()]);
  return encrypted.toString('base64');
}

/** 最小化 XML 解析（微信消息格式：<Tag><![CDATA[..]]></Tag> 或纯文本） */
export function parseXmlObject(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const tagRe = /<(\w+)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml)) !== null) {
    out[m[1]] = m[2] !== undefined ? m[2] : (m[3] ?? '').trim();
  }
  return out;
}

/** 序列化 XML 回复 */
export function serializeXml(obj: Record<string, string | number>): string {
  const parts = Object.entries(obj).map(
    ([k, v]) => `<${k}><![CDATA[${v}]]></${k}>`,
  );
  return `<xml>${parts.join('')}</xml>`;
}