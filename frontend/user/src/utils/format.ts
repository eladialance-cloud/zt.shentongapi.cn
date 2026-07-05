// 格式化工具函数
import dayjs from 'dayjs';

/** 格式化日期时间 */
export function formatDateTime(
  date: string | Date | undefined,
  format = 'YYYY-MM-DD HH:mm:ss'
): string {
  if (!date) {
    return '-';
  }
  return dayjs(date).format(format);
}

/** 格式化日期 */
export function formatDate(date: string | Date | undefined): string {
  return formatDateTime(date, 'YYYY-MM-DD');
}

/** 相对时间 (如：3 分钟前) */
export function formatRelativeTime(date: string | Date | undefined): string {
  if (!date) {
    return '-';
  }
  const now = dayjs();
  const target = dayjs(date);
  const diffSeconds = now.diff(target, 'second');
  const diffMinutes = now.diff(target, 'minute');
  const diffHours = now.diff(target, 'hour');
  const diffDays = now.diff(target, 'day');

  if (diffSeconds < 60) {
    return '刚刚';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`;
  }
  if (diffHours < 24) {
    return `${diffHours} 小时前`;
  }
  if (diffDays < 7) {
    return `${diffDays} 天前`;
  }
  return formatDate(date);
}

/** 格式化数字 (千分位) */
export function formatNumber(num: number): string {
  return num.toLocaleString('zh-CN');
}

/** 格式化文件大小 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}
