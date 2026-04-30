import pool from '../db.js';

/**
 * 热力图查询服务
 */

interface HeatmapParams {
  start?: number;
  end?: number;
  models?: string[];
}

/**
 * 模型可用性热力图 - 模型 × 小时 → 请求量/成功率/平均耗时
 */
export async function getModelAvailabilityHeatmap(params: HeatmapParams) {
  const { start, end, models } = params;

  // hour_bucket = FLOOR(unix_ts / 3600) 为 UTC 整点桶，时区无关；
  // 前端用 (currentBucket - cellBucket) 直接定位 slot，可正确跨日。
  // type=2 成功消费, type=5 错误请求（500/400 等），两者合计为"请求总数"。
  let sql = `
    SELECT
      model_name,
      FLOOR(created_at / 3600) AS hour_bucket,
      COUNT(*) AS request_count,
      SUM(CASE WHEN type = 2 THEN 1 ELSE 0 END) AS success_count,
      AVG(use_time) AS avg_use_time
    FROM logs
    WHERE type IN (2, 5)
  `;
  const args: any[] = [];

  if (start) { sql += ' AND created_at >= ?'; args.push(start); }
  if (end) { sql += ' AND created_at <= ?'; args.push(end); }
  if (models?.length) {
    sql += ` AND model_name IN (${models.map(() => '?').join(',')})`;
    args.push(...models);
  }

  sql += ' GROUP BY model_name, hour_bucket ORDER BY model_name, hour_bucket';

  const [rows] = await pool.execute(sql, args);
  return rows;
}

/**
 * 使用模式热力图 - 日期 × 小时 → 请求量
 */
export async function getUsagePatternHeatmap(params: HeatmapParams) {
  const { start, end } = params;

  let sql = `
    SELECT
      DATE(FROM_UNIXTIME(created_at)) AS date,
      HOUR(FROM_UNIXTIME(created_at)) AS hour_of_day,
      COUNT(*) AS request_count,
      SUM(prompt_tokens) AS total_tokens
    FROM logs
    WHERE type = 2
  `;
  const args: any[] = [];

  if (start) { sql += ' AND created_at >= ?'; args.push(start); }
  if (end) { sql += ' AND created_at <= ?'; args.push(end); }

  sql += ' GROUP BY date, hour_of_day ORDER BY date, hour_of_day';

  const [rows] = await pool.execute(sql, args);
  return rows;
}

/**
 * 模型成功率列表
 */
export async function getModelSuccessRate(params: HeatmapParams) {
  const { start, end } = params;

  // type=2 成功, type=5 错误；两者合计为请求总数
  let sql = `
    SELECT
      model_name,
      COUNT(*) AS total_requests,
      SUM(CASE WHEN type = 2 THEN 1 ELSE 0 END) AS success_requests,
      ROUND(SUM(CASE WHEN type = 2 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS success_rate,
      AVG(use_time) AS avg_use_time
    FROM logs
    WHERE type IN (2, 5)
  `;
  const args: any[] = [];

  if (start) { sql += ' AND created_at >= ?'; args.push(start); }
  if (end) { sql += ' AND created_at <= ?'; args.push(end); }

  sql += ' GROUP BY model_name ORDER BY total_requests DESC';

  const [rows] = await pool.execute(sql, args);
  return rows;
}
