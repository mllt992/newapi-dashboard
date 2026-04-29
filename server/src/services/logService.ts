import pool from '../db.js';

/**
 * logs 表查询服务 - 解析 Other JSON 中的细粒度 token 信息
 */

interface LogQueryParams {
  start?: number;
  end?: number;
  model?: string;
  granularity?: 'hour' | 'day';
  limit?: number;
  offset?: number;
}

/**
 * Token 用量查询（解析 Other JSON 获取 cache_tokens）
 */
export async function getTokenUsage(params: LogQueryParams) {
  const { start, end, model, granularity = 'day', limit = 100, offset = 0 } = params;

  let sql = `
    SELECT
      DATE_FORMAT(FROM_UNIXTIME(created_at), '${granularity === 'hour' ? '%Y-%m-%d %H:00' : '%Y-%m-%d'}') AS time_bucket,
      model_name,
      COUNT(*) AS request_count,
      SUM(prompt_tokens) AS total_prompt_tokens,
      SUM(completion_tokens) AS total_completion_tokens,
      SUM(CAST(JSON_EXTRACT(other, '$.cache_tokens') AS UNSIGNED)) AS total_cache_tokens,
      SUM(quota) AS total_quota
    FROM logs
    WHERE type = 2
  `;
  const args: any[] = [];

  if (start) { sql += ' AND created_at >= ?'; args.push(start); }
  if (end) { sql += ' AND created_at <= ?'; args.push(end); }
  if (model) { sql += ' AND model_name = ?'; args.push(model); }

  sql += ` GROUP BY time_bucket, model_name ORDER BY time_bucket DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;

  const [rows] = await pool.query(sql, args);
  return rows;
}

/**
 * 花费明细查询
 */
export async function getCostBreakdown(params: LogQueryParams) {
  const { start, end, model, granularity = 'day' } = params;

  let sql = `
    SELECT
      DATE_FORMAT(FROM_UNIXTIME(created_at), '${granularity === 'hour' ? '%Y-%m-%d %H:00' : '%Y-%m-%d'}') AS time_bucket,
      model_name,
      COUNT(*) AS request_count,
      SUM(quota) AS total_quota
    FROM logs
    WHERE type = 2
  `;
  const args: any[] = [];

  if (start) { sql += ' AND created_at >= ?'; args.push(start); }
  if (end) { sql += ' AND created_at <= ?'; args.push(end); }
  if (model) { sql += ' AND model_name = ?'; args.push(model); }

  sql += ` GROUP BY time_bucket, model_name ORDER BY time_bucket DESC`;

  const [rows] = await pool.query(sql, args);
  return rows;
}

/**
 * Top N 模型排行
 */
export async function getTopModels(params: { start?: number; end?: number; limit?: number }) {
  const { start, end, limit = 10 } = params;

  let sql = `
    SELECT
      model_name,
      COUNT(*) AS request_count,
      SUM(prompt_tokens) AS total_prompt_tokens,
      SUM(completion_tokens) AS total_completion_tokens,
      SUM(quota) AS total_quota
    FROM logs
    WHERE type = 2
  `;
  const args: any[] = [];

  if (start) { sql += ' AND created_at >= ?'; args.push(start); }
  if (end) { sql += ' AND created_at <= ?'; args.push(end); }

  sql += ` GROUP BY model_name ORDER BY total_quota DESC LIMIT ${Number(limit)}`;

  const [rows] = await pool.query(sql, args);
  return rows;
}

/**
 * Top N 用户排行
 */
export async function getTopUsers(params: { start?: number; end?: number; limit?: number }) {
  const { start, end, limit = 10 } = params;

  let sql = `
    SELECT
      username,
      COUNT(*) AS request_count,
      SUM(prompt_tokens) AS total_prompt_tokens,
      SUM(completion_tokens) AS total_completion_tokens,
      SUM(quota) AS total_quota
    FROM logs
    WHERE type = 2
  `;
  const args: any[] = [];

  if (start) { sql += ' AND created_at >= ?'; args.push(start); }
  if (end) { sql += ' AND created_at <= ?'; args.push(end); }

  sql += ` GROUP BY username ORDER BY total_quota DESC LIMIT ${Number(limit)}`;

  const [rows] = await pool.query(sql, args);
  return rows;
}
