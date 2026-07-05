import { basename, extname } from 'path';

/**
 * 文件工具
 * 数据合同真源：spec.md - 配置管理
 */
export const getFileExtension = (filename: string): string => {
  return extname(filename).toLowerCase();
};

export const getFileName = (filepath: string): string => {
  return basename(filepath);
};

export const generateFileName = (originalName: string): string => {
  const ext = getFileExtension(originalName);
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 10);
  return `${timestamp}-${random}${ext}`;
};
