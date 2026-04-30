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

  // 全时段累计 token / 请求 / 配额
  const [allRows] = await pool.execute(
    `SELECT
      SUM(token_used) AS total_tokens_all,
      SUM(quota) AS total_quota_all,
      SUM(count) AS total_requests_all
    FROM quota_data`
  );
  const allData = (allRows as any[])[0] || {};

  return {
    ...data,
    total_cost: Number(data.total_tokens || 0) * config.COST_RATE,
    total_tokens_all: Number(allData.total_tokens_all || 0),
    total_quota_all: Number(allData.total_quota_all || 0),
    total_requests_all: Number(allData.total_requests_all || 0),
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
 * 注意：quota_data 已按小时预聚合，created_at 为整点时间戳。
 * 5 分钟窗口几乎总是命中 0 行，故速率改为基于最近 1 小时数据反推。
 */
export async function getRealtimeMetrics() {
  const now = Math.floor(Date.now() / 1000);
  const oneHourAgo = now - 3600;
  const threeHoursAgo = now - 3 * 3600;
  const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);

  // 并发：最近 1 小时内活跃模型数（按小时聚合，分钟粒度无意义）
  const [concurrentRows] = await pool.execute(
    `SELECT COUNT(DISTINCT model_name) AS concurrent_count
     FROM quota_data
     WHERE created_at >= ?`,
    [oneHourAgo]
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

  // 最近 1 小时
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

  // 最近 3 小时（用于在整点边界附近平滑速率）
  const [threeHourRows] = await pool.execute(
    `SELECT
      SUM(count) AS total_requests,
      SUM(token_used) AS total_tokens
     FROM quota_data
     WHERE created_at >= ?`,
    [threeHoursAgo]
  );
  const threeHourData = threeHourRows as any[];
  const requests3h = Number(threeHourData[0]?.total_requests || 0);
  const tokens3h = Number(threeHourData[0]?.total_tokens || 0);

  // 速率：优先用 1 小时窗口，0 则回退到 3 小时均值
  const rpsBase = requests1h > 0 ? requests1h / 3600 : requests3h / (3 * 3600);
  const tpsBase = tokens1h > 0 ? tokens1h / 3600 : tokens3h / (3 * 3600);
  const rpm = Math.round(rpsBase * 60);
  const tpm = Math.round(tpsBase * 60);

  // 兼容字段：requests_5min / tokens_5min 用 1 小时折算
  const requests5min = Math.round(requests1h / 12);
  const tokens5min = Math.round(tokens1h / 12);

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
    server_time: now,
  };
}
