import pool from '../db.js';
import config from '../config.js';

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
  return (rows as any[]).map(r => {
    const tokens = Number(r.total_prompt_tokens || 0) + Number(r.total_completion_tokens || 0);
    return { ...r, total_cost: tokens * config.COST_RATE };
  });
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

/**
 * 累计 Token 明细（输入/输出/缓存）— 全时段聚合，建议外层加缓存
 */
export async function getAllTimeTokenBreakdown() {
  const [rows] = await pool.query(
    `SELECT
      SUM(prompt_tokens) AS total_prompt_tokens,
      SUM(completion_tokens) AS total_completion_tokens,
      SUM(CAST(JSON_EXTRACT(other, '$.cache_tokens') AS UNSIGNED)) AS total_cache_tokens,
      COUNT(*) AS total_requests
    FROM logs
    WHERE type = 2`
  );
  const row = (rows as any[])[0] || {};
  const prompt = Number(row.total_prompt_tokens || 0);
  const completion = Number(row.total_completion_tokens || 0);
  const cache = Number(row.total_cache_tokens || 0);
  return {
    total_prompt_tokens: prompt,
    total_completion_tokens: completion,
    total_cache_tokens: cache,
    total_tokens: prompt + completion,
    total_requests: Number(row.total_requests || 0),
  };
}
