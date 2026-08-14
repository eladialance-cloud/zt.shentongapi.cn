/** 余额告警判定：配置了阈值且余额低于阈值时告警（等于阈值不告警） */
export function shouldAlertBalance(
  balance: number,
  threshold: number | null | undefined,
): boolean {
  if (threshold == null) return false;
  return balance < threshold;
}