/**
 * 上传安全守卫（P0-7）
 * 1) 扩展名/MIME 黑名单：拒绝可被同源渲染/执行的活动内容（html/svg/js/xml/可执行文件等）
 * 2) 图片伪装嗅探：对声称是图片的上传做文件头检查，阻止 HTML/SVG 伪装成图片（存储型 XSS）
 */
import { BadRequestException } from '@nestjs/common';
import { extname } from 'path';

/** 危险扩展名：可作为活动内容同源渲染/执行的格式（含可执行文件） */
const DANGEROUS_UPLOAD_EXTENSIONS = new Set([
  '.html', '.htm', '.shtml', '.xhtml', '.svg', '.svgz', '.js', '.mjs', '.cjs',
  '.xml', '.xsl', '.xsd', '.xslt', '.jsonp', '.php', '.phtml', '.php3', '.php4',
  '.php5', '.pht', '.asp', '.aspx', '.jsp', '.jspx', '.exe', '.bat', '.cmd',
  '.com', '.scr', '.pif', '.msi', '.msp', '.dll', '.sys', '.vbs', '.vbe',
  '.wsf', '.wsh', '.sh', '.bash', '.ps1', '.psm1', '.reg', '.jar', '.war',
]);

/** 危险 MIME：客户端声明为活动内容一律拒绝 */
const DANGEROUS_UPLOAD_MIMES = new Set([
  'image/svg+xml',
  'text/html',
  'application/xhtml+xml',
  'application/xml',
  'text/xml',
  'application/javascript',
  'text/javascript',
  'application/x-httpd-php',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-sh',
  'application/x-bat',
]);

/** 校验单个上传文件：危险扩展名/MIME 直接抛错 */
export function assertSafeUploadFile(file: Express.Multer.File): void {
  const ext = extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  if (DANGEROUS_UPLOAD_EXTENSIONS.has(ext)) {
    throw new BadRequestException('不支持上传该文件类型: ' + ext);
  }
  if (DANGEROUS_UPLOAD_MIMES.has(mime)) {
    throw new BadRequestException('不支持上传该文件类型: ' + mime);
  }
}

/** multer fileFilter：仅允许视频（危险类型先拒绝） */
export function createVideoUploadFilter(): (
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => void {
  const allowed = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']);
  return (_req, file, cb) => {
    try {
      assertSafeUploadFile(file);
      if (!allowed.has((file.mimetype || '').toLowerCase())) {
        return cb(new BadRequestException('仅支持 mp4/webm/mov/avi/mkv 视频'), false);
      }
      cb(null, true);
    } catch (err) {
      cb(err as Error, false);
    }
  };
}

/** multer fileFilter：仅允许图片（危险类型先拒绝，且 image/svg+xml 已在黑名单） */
export function createImageUploadFilter(): (
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => void {
  const allowed = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp']);
  return (_req, file, cb) => {
    try {
      assertSafeUploadFile(file);
      if (!allowed.has((file.mimetype || '').toLowerCase())) {
        return cb(new BadRequestException('仅支持 jpg/png/gif/webp/bmp 图片'), false);
      }
      cb(null, true);
    } catch (err) {
      cb(err as Error, false);
    }
  };
}

/** multer fileFilter：危险类型直接拒绝；其它类型交由业务层 allowlist 决定 */
export function createUploadFileFilter(): (
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => void {
  return (_req, file, cb) => {
    try {
      assertSafeUploadFile(file);
      cb(null, true);
    } catch (err) {
      cb(err as Error, false);
    }
  };
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.avif', '.jfif']);

export function isImageExtension(originalname: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(originalname || '').toLowerCase());
}

/** 活动内容文件头嗅探：识别伪装成图片的 HTML/SVG/XML/脚本 */
export function isActiveContent(buf: Buffer): boolean {
  const head = buf.subarray(0, 1024).toString('latin1').toLowerCase().trimStart();
  return (
    head.startsWith('<!doctype html') ||
    head.startsWith('<html') ||
    head.startsWith('<svg') ||
    head.startsWith('<script') ||
    head.startsWith('<?xml') ||
    head.startsWith('<%')
  );
}
