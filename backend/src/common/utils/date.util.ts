import dayjs from 'dayjs';

/**
 * 日期工具
 * 数据合同真源：spec.md - 配置管理
 */
export const formatDate = (
  date: Date | string,
  format = 'YYYY-MM-DD HH:mm:ss',
): string => {
  return dayjs(date).format(format);
};

export const timestamp = (): number => Date.now();

export const addSeconds = (date: Date, seconds: number): Date => {
  return dayjs(date).add(seconds, 'second').toDate();
};
