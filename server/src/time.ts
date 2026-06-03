import config from './config.js';

/**
 * 时区对齐工具
 *
 * created_at（quota_data / logs）均为 UTC 对齐的秒级时间戳，与时区无关。
 * 但展示口径（“今日”、“按天趋势”、“按小时分布”）需要落到某个本地时区，
 * 不能依赖 Node 容器时区（Dockerfile 默认 UTC）或 MySQL 会话时区
 * （二者都未显式设置，正是此前热力图时区错位的根因）。
 *
 * 这里统一用 config.TZ_OFFSET（小时，默认 +08:00 北京时间）做纯算术偏移，
 * 与热力图 FLOOR(created_at/3600) 的“时区无关”思路一致。
 */

export const TZ_OFFSET_HOURS = config.TZ_OFFSET ?? 8;
export const TZ_OFFSET_SEC = Math.round(TZ_OFFSET_HOURS * 3600);

/** 目标时区下“今日 00:00”对应的 UTC 秒级时间戳 */
export function localDayStart(nowSec: number = Math.floor(Date.now() / 1000)): number {
  return Math.floor((nowSec + TZ_OFFSET_SEC) / 86400) * 86400 - TZ_OFFSET_SEC;
}

/** SQL 片段：将 created_at 归到目标时区的“自纪元天数”，时区无关、可正确跨日分组 */
export function dayIndexExpr(col: string = 'created_at'): string {
  return `FLOOR((${col} + ${TZ_OFFSET_SEC}) / 86400)`;
}

/** SQL 片段：目标时区下的小时（0-23） */
export function hourOfDayExpr(col: string = 'created_at'): string {
  return `FLOOR(MOD(${col} + ${TZ_OFFSET_SEC}, 86400) / 3600)`;
}

/** 把 dayIndexExpr 的结果还原为目标时区日期标签 'YYYY-MM-DD' */
export function dayIndexToLabel(dayIndex: number): string {
  // dayIndex * 86400 即该天在目标时区的 00:00 所对应的“偏移后”秒数，
  // 按 UTC 读取即可得到目标时区的日历日期。
  const d = new Date(Number(dayIndex) * 86400 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
