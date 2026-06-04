import pool from '../db.js';
import config from '../config.js';

/**
 * logs 表查询服务 - 解析 Other JSON 中的细粒度 token 信息
 */

/**
 * 缓存口径随上游厂商不同（实测见 memory: newapi-token-cache-semantics）：
 *  · OpenAI 系（gpt / glm / minimax-m3 …）：`cache_tokens` 是 `prompt_tokens` 的**子集**（已含），
 *    未命中缓存 = prompt - cache；不存在 cache_creation。
 *  · Anthropic / Claude 系（claude-* / MiniMax-M2.7 等 usage_semantic=anthropic）：
 *    `cache_tokens`(读) 与 `cache_creation_tokens`(写) 是**独立附加桶**，未计入 prompt；
 *    prompt_tokens 仅为未命中输入，故 未命中 = prompt，输入总量 = prompt + cache + creation。
 * 因此不能用单一全局公式：必须**逐行**按厂商判定，否则 Claude 主导的数据会使
 * prompt - cache - creation 下溢被 clamp 成 0（即“未命中=0”这个 bug 的根因）。
 * 判定为 Anthropic 加法口径（满足任一）：
 *   usage_semantic=anthropic / claude=true / 含 cache_creation_tokens / cache_tokens > prompt_tokens
 */
const SQL_CACHE = `CAST(JSON_EXTRACT(other, '$.cache_tokens') AS UNSIGNED)`;
const SQL_IS_ADDITIVE = `(
  JSON_UNQUOTE(JSON_EXTRACT(other, '$.usage_semantic')) = 'anthropic'
  OR JSON_UNQUOTE(JSON_EXTRACT(other, '$.claude')) = 'true'
  OR JSON_CONTAINS_PATH(other, 'one', '$.cache_creation_tokens')
  OR ${SQL_CACHE} > prompt_tokens
)`;
/** 未命中缓存输入：加法口径取 prompt 本身；包含口径取 prompt - 命中缓存（clamp ≥ 0） */
const SQL_CACHE_MISS = `CASE WHEN ${SQL_IS_ADDITIVE} THEN prompt_tokens ELSE GREATEST(prompt_tokens - COALESCE(${SQL_CACHE}, 0), 0) END`;

interface LogQueryParams {
  start?: number;
  end?: number;
  model?: string;
  users?: string[];
  granularity?: 'hour' | 'day';
  limit?: number;
  offset?: number;
}

/**
 * Token 用量查询（解析 Other JSON 获取 cache_tokens / cache_creation_tokens）
 *
 * 注意：缓存口径随上游厂商不同（见 SQL_CACHE_MISS 注释）。未命中缓存由 SQL 逐行
 * 按厂商算好，OpenAI 系 = prompt - cache、Anthropic 系 = prompt，不在 JS 里做全局减法。
 */
export async function getTokenUsage(params: LogQueryParams) {
  const { start, end, model, users, granularity = 'day', limit = 100, offset = 0 } = params;

  let sql = `
    SELECT
      DATE_FORMAT(FROM_UNIXTIME(created_at), '${granularity === 'hour' ? '%Y-%m-%d %H:00' : '%Y-%m-%d'}') AS time_bucket,
      model_name,
      COUNT(*) AS request_count,
      SUM(prompt_tokens) AS total_prompt_tokens,
      SUM(completion_tokens) AS total_completion_tokens,
      SUM(CAST(JSON_EXTRACT(other, '$.cache_tokens') AS UNSIGNED)) AS total_cache_tokens,
      SUM(CAST(JSON_EXTRACT(other, '$.cache_creation_tokens') AS UNSIGNED)) AS total_cache_creation_tokens,
      SUM(${SQL_CACHE_MISS}) AS total_cache_miss_tokens,
      SUM(quota) AS total_quota
    FROM logs
    WHERE type = 2
  `;
  const args: any[] = [];

  if (start) { sql += ' AND created_at >= ?'; args.push(start); }
  if (end) { sql += ' AND created_at <= ?'; args.push(end); }
  if (model) { sql += ' AND model_name = ?'; args.push(model); }
  if (users && users.length) { sql += ` AND username IN (${users.map(() => '?').join(',')})`; args.push(...users); }

  sql += ` GROUP BY time_bucket, model_name ORDER BY time_bucket DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;

  const [rows] = await pool.query(sql, args);
  return (rows as any[]).map(r => {
    const prompt = Number(r.total_prompt_tokens || 0);
    const cacheCreation = Number(r.total_cache_creation_tokens || 0);
    // 未命中缓存由 SQL 逐行按厂商口径算出（见 SQL_CACHE_MISS）
    const miss = Number(r.total_cache_miss_tokens || 0);
    // 费用维持 flat 口径：prompt + completion 单价（cache 折扣不参与，见 memory: cost-stays-flat-rate）
    const tokens = prompt + Number(r.total_completion_tokens || 0);
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
  const { start, end, model, users, granularity = 'day' } = params;

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
  if (users && users.length) { sql += ` AND username IN (${users.map(() => '?').join(',')})`; args.push(...users); }

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
 * 用户名列表（用于筛选下拉框）— 去重后按消费额排序，最活跃的用户在前
 */
export async function getUserList(params: { start?: number; end?: number; limit?: number }) {
  const { start, end, limit = 500 } = params;

  let sql = `
    SELECT
      username,
      COUNT(*) AS request_count
    FROM logs
    WHERE type = 2 AND username IS NOT NULL AND username <> ''
  `;
  const args: any[] = [];

  if (start) { sql += ' AND created_at >= ?'; args.push(start); }
  if (end) { sql += ' AND created_at <= ?'; args.push(end); }

  sql += ` GROUP BY username ORDER BY SUM(quota) DESC LIMIT ${Number(limit)}`;

  const [rows] = await pool.query(sql, args);
  return rows;
}

/**
 * 累计 Token 明细（未命中/命中/创建/输出）— 全时段聚合，建议外层加缓存
 *
 * 四个互不重叠的桶：未命中缓存(miss) + 命中缓存(cache) + 缓存创建(creation) = 输入总量；
 * 再加输出(completion) = 总 token。miss 由 SQL 逐行按厂商口径算出（见 SQL_CACHE_MISS）——
 * Anthropic 系 miss=prompt、OpenAI 系 miss=prompt-cache，故不能用全局 prompt-cache-creation。
 */
export async function getAllTimeTokenBreakdown() {
  const [rows] = await pool.query(
    `SELECT
      SUM(prompt_tokens) AS total_prompt_tokens,
      SUM(completion_tokens) AS total_completion_tokens,
      SUM(CAST(JSON_EXTRACT(other, '$.cache_tokens') AS UNSIGNED)) AS total_cache_tokens,
      SUM(CAST(JSON_EXTRACT(other, '$.cache_creation_tokens') AS UNSIGNED)) AS total_cache_creation_tokens,
      SUM(${SQL_CACHE_MISS}) AS total_cache_miss_tokens,
      COUNT(*) AS total_requests
    FROM logs
    WHERE type = 2`
  );
  const row = (rows as any[])[0] || {};
  const prompt = Number(row.total_prompt_tokens || 0);
  const completion = Number(row.total_completion_tokens || 0);
  const cache = Number(row.total_cache_tokens || 0);
  const cacheCreation = Number(row.total_cache_creation_tokens || 0);
  const miss = Number(row.total_cache_miss_tokens || 0);
  const input = miss + cache + cacheCreation;
  return {
    total_prompt_tokens: prompt,
    total_completion_tokens: completion,
    total_cache_tokens: cache,
    total_cache_creation_tokens: cacheCreation,
    total_cache_miss_tokens: miss,
    total_input_tokens: input,
    total_tokens: input + completion,
    total_requests: Number(row.total_requests || 0),
  };
}
