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
 * Token 用量查询（解析 Other JSON 获取 cache_tokens / cache_creation_tokens）
 *
 * 注意 New API 语义：prompt_tokens 为输入总量，已包含命中缓存(cache_tokens)
 * 与缓存创建(cache_creation_tokens)。因此“未命中缓存”需另行相减得到，
 * 不能把 cache_tokens 当成独立于 prompt_tokens 的类别，否则会重复计数。
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
      SUM(CAST(JSON_EXTRACT(other, '$.cache_creation_tokens') AS UNSIGNED)) AS total_cache_creation_tokens,
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
    const prompt = Number(r.total_prompt_tokens || 0);
    const cache = Number(r.total_cache_tokens || 0);
    const cacheCreation = Number(r.total_cache_creation_tokens || 0);
    const tokens = prompt + Number(r.total_completion_tokens || 0);
    // 未命中缓存输入 = 输入总量 - 命中缓存 - 缓存创建（clamp 防止个别上游口径异常导致负数）
    const miss = Math.max(prompt - cache - cacheCreation, 0);
    return {
      ...r,
      total_cache_creation_tokens: cacheCreation,
      total_cache_miss_tokens: miss,
      total_cost: tokens * config.COST_RATE,
    };
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
 *
 * prompt_tokens 已包含命中缓存与缓存创建，故 total_tokens 仅为 prompt+completion；
 * 命中缓存(cache)、缓存创建(creation)、未命中缓存(miss) 共同构成 prompt 的不重叠拆分。
 */
export async function getAllTimeTokenBreakdown() {
  const [rows] = await pool.query(
    `SELECT
      SUM(prompt_tokens) AS total_prompt_tokens,
      SUM(completion_tokens) AS total_completion_tokens,
      SUM(CAST(JSON_EXTRACT(other, '$.cache_tokens') AS UNSIGNED)) AS total_cache_tokens,
      SUM(CAST(JSON_EXTRACT(other, '$.cache_creation_tokens') AS UNSIGNED)) AS total_cache_creation_tokens,
      COUNT(*) AS total_requests
    FROM logs
    WHERE type = 2`
  );
  const row = (rows as any[])[0] || {};
  const prompt = Number(row.total_prompt_tokens || 0);
  const completion = Number(row.total_completion_tokens || 0);
  const cache = Number(row.total_cache_tokens || 0);
  const cacheCreation = Number(row.total_cache_creation_tokens || 0);
  return {
    total_prompt_tokens: prompt,
    total_completion_tokens: completion,
    total_cache_tokens: cache,
    total_cache_creation_tokens: cacheCreation,
    total_cache_miss_tokens: Math.max(prompt - cache - cacheCreation, 0),
    total_tokens: prompt + completion,
    total_requests: Number(row.total_requests || 0),
  };
}
