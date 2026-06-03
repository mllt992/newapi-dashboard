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
 * 速率窗口对齐到整点桶并按真实经过时长折算，避免「除以整小时」导致的低估。
 */
export async function getRealtimeMetrics() {
  const now = Math.floor(Date.now() / 1000);
  const curHourStart = Math.floor(now / 3600) * 3600;
  const oneHourAgo = now - 3600;
  const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);

  // 速率窗口对齐到整点桶：quota_data 按整点预聚合，原先用 created_at >= now-3600
  // 命中 1~2 个整点桶却固定除以 3600 秒——整点刚过时当前桶只有几分钟数据，
  // RPM/TPM 被严重低估（如 HH:05 低估约 12 倍）并随分钟跳变。
  // 改为「上一个完整小时 + 当前未完成小时」窗口，并除以真实经过时长。
  const primaryStart = curHourStart - 3600;        // 覆盖 [上一整点, now]
  const primarySpan = now - primaryStart;          // = 3600 + 本小时已过秒数 ∈ [3600, 7200)
  const wideStart = curHourStart - 3 * 3600;       // 稀疏流量回退窗口（前 3 完整小时 + 当前）
  const wideSpan = now - wideStart;

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

  // 主速率窗口：上一个完整小时 + 当前未完成小时
  const [primaryRows] = await pool.execute(
    `SELECT
      SUM(count) AS total_requests,
      SUM(token_used) AS total_tokens
     FROM quota_data
     WHERE created_at >= ?`,
    [primaryStart]
  );
  const primaryData = primaryRows as any[];
  const requestsPrimary = Number(primaryData[0]?.total_requests || 0);
  const tokensPrimary = Number(primaryData[0]?.total_tokens || 0);

  // 回退窗口：主窗口无流量时改用更宽窗口，避免间歇性流量下显示 0
  const [wideRows] = await pool.execute(
    `SELECT
      SUM(count) AS total_requests,
      SUM(token_used) AS total_tokens
     FROM quota_data
     WHERE created_at >= ?`,
    [wideStart]
  );
  const wideData = wideRows as any[];
  const requestsWide = Number(wideData[0]?.total_requests || 0);
  const tokensWide = Number(wideData[0]?.total_tokens || 0);

  // 按窗口真实经过时长折算速率，杜绝「除以整小时」造成的系统性低估；
  // 主窗口无流量时回退到更宽窗口（同样按真实时长折算）。
  const rps = requestsPrimary > 0 ? requestsPrimary / primarySpan : requestsWide / wideSpan;
  const tps = tokensPrimary > 0 ? tokensPrimary / primarySpan : tokensWide / wideSpan;
  const rpm = Math.round(rps * 60);
  const tpm = Math.round(tps * 60);

  // 兼容字段（前端未使用）：按当前速率折算 5 分钟量
  const requests5min = Math.round(rps * 300);
  const tokens5min = Math.round(tps * 300);

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
    requests_1h: requestsPrimary,
    tokens_1h: tokensPrimary,
    server_time: now,
  };
}
