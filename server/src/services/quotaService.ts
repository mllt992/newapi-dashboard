import pool from '../db.js';
import config from '../config.js';

/**
 * quota_data 表聚合查询 - 已按小时预聚合，查询更快
 */

/**
 * 今日概览统计
 */
export async function getTodaySummary() {
  const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);

  const [rows] = await pool.execute(
    `SELECT
      COUNT(DISTINCT model_name) AS active_models,
      SUM(token_used) AS total_tokens,
      SUM(quota) AS total_quota,
      SUM(count) AS total_requests
    FROM quota_data
    WHERE created_at >= ?`,
    [todayStart]
  );
  const data = (rows as any[])[0];
  return {
    ...data,
    total_cost: Number(data.total_tokens || 0) * config.COST_RATE,
  };
}

/**
 * 最近 N 天趋势
 */
export async function getTrend(days: number = 7) {
  const startTime = Math.floor(Date.now() / 1000) - days * 86400;

  const [rows] = await pool.execute(
    `SELECT
      DATE(FROM_UNIXTIME(created_at)) AS date,
      SUM(token_used) AS total_tokens,
      SUM(quota) AS total_quota,
      SUM(count) AS total_requests
    FROM quota_data
    WHERE created_at >= ?
    GROUP BY date
    ORDER BY date ASC`,
    [startTime]
  );
  return (rows as any[]).map(row => ({
    ...row,
    total_cost: Number(row.total_tokens || 0) * config.COST_RATE,
  }));
}

/**
 * 模型概览统计
 */
export async function getModelSummary(start?: number, end?: number) {
  let sql = `
    SELECT
      model_name,
      SUM(token_used) AS total_tokens,
      SUM(quota) AS total_quota,
      SUM(count) AS total_requests
    FROM quota_data
    WHERE 1=1
  `;
  const args: any[] = [];

  if (start) { sql += ' AND created_at >= ?'; args.push(start); }
  if (end) { sql += ' AND created_at <= ?'; args.push(end); }

  sql += ' GROUP BY model_name ORDER BY total_requests DESC';

  const [rows] = await pool.execute(sql, args);
  return (rows as any[]).map(row => ({
    ...row,
    total_cost: Number(row.total_tokens || 0) * config.COST_RATE,
  }));
}

/**
 * 获取实时指标 (RPM, TPM, 并发数等)
 */
export async function getRealtimeMetrics() {
  const now = Math.floor(Date.now() / 1000);
  const fiveMinutesAgo = now - 300;
  const oneHourAgo = now - 3600;
  const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);

  // 并发数：当前小时内有请求的不同时间点数量（近似并发）
  const [concurrentRows] = await pool.execute(
    `SELECT COUNT(DISTINCT FROM_UNIXTIME(created_at, '%Y-%m-%d %H:%i')) AS concurrent_count
     FROM quota_data
     WHERE created_at >= ? AND created_at <= ?`,
    [fiveMinutesAgo, now]
  );
  const concurrentCount = Number(((concurrentRows as any[])[0]?.concurrent_count) || 0);

  // 今日累计
  const [todayRows] = await pool.execute(
    `SELECT
      SUM(count) AS total_requests,
      SUM(token_used) AS total_tokens
     FROM quota_data
     WHERE created_at >= ?`,
    [todayStart]
  );
  const todayData = todayRows as any[];
  const todayRequests = Number(todayData[0]?.total_requests || 0);
  const todayTokens = Number(todayData[0]?.total_tokens || 0);

  // 最近5分钟
  const [fiveMinRows] = await pool.execute(
    `SELECT
      SUM(count) AS total_requests,
      SUM(token_used) AS total_tokens
     FROM quota_data
     WHERE created_at >= ?`,
    [fiveMinutesAgo]
  );
  const fiveMinData = fiveMinRows as any[];
  const requests5min = Number(fiveMinData[0]?.total_requests || 0);
  const tokens5min = Number(fiveMinData[0]?.total_tokens || 0);

  // 最近1小时
  const [oneHourRows] = await pool.execute(
    `SELECT
      SUM(count) AS total_requests,
      SUM(token_used) AS total_tokens
     FROM quota_data
     WHERE created_at >= ?`,
    [oneHourAgo]
  );
  const oneHourData = oneHourRows as any[];
  const requests1h = Number(oneHourData[0]?.total_requests || 0);
  const tokens1h = Number(oneHourData[0]?.total_tokens || 0);

  // 计算速率
  const rpm = Math.round(requests5min / 5);
  const tpm = Math.round(tokens5min / 5);

  // 今日预估费用
  const todayCost = todayTokens * config.COST_RATE;

  return {
    rpm,
    tpm,
    concurrent: concurrentCount,
    today_requests: todayRequests,
    today_tokens: todayTokens,
    today_cost: todayCost,
    requests_5min: requests5min,
    tokens_5min: tokens5min,
    requests_1h: requests1h,
    tokens_1h: tokens1h,
  };
}
