import axios from 'axios';

const http = axios.create({ baseURL: '/api' });

export interface OverviewSummary {
  active_models: number;
  total_tokens: number;
  total_quota: number;
  total_requests: number;
  total_tokens_all?: number;
  total_quota_all?: number;
  total_requests_all?: number;
}

export interface RealtimeMetrics {
  rpm: number;
  tpm: number;
  concurrent: number;
  today_requests: number;
  today_tokens: number;
  today_cost: number;
  requests_5min: number;
  tokens_5min: number;
  requests_1h: number;
  tokens_1h: number;
  server_time?: number;
}

export interface TrendItem {
  date: string;
  total_tokens: number;
  total_quota: number;
  total_requests: number;
  total_cost?: number;
}

export interface TokenUsageItem {
  time_bucket: string;
  model_name: string;
  request_count: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_cache_tokens: number;
  total_cache_creation_tokens: number;
  total_cache_miss_tokens: number;
  total_quota: number;
  total_cost: number;
}

export interface TopModelItem {
  model_name: string;
  request_count: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_quota: number;
}

export interface UserListItem {
  username: string;
  request_count: number;
}

export interface HeatmapCell {
  model_name: string;
  hour_bucket: number;
  request_count: number;
  success_count: number | string;
  avg_use_time: number | string;
}

export interface UsagePatternCell {
  date: string;
  hour_of_day: number;
  request_count: number;
  total_tokens: number;
}

export interface ModelSuccessRate {
  model_name: string;
  total_requests: number;
  success_requests: number | string;
  success_rate: number | string;
  avg_use_time: number | string;
}

export interface TokenBreakdown {
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_cache_tokens: number;
  total_cache_creation_tokens: number;
  total_cache_miss_tokens: number;
  total_tokens: number;
  total_requests: number;
}

export const api = {
  // 概览
  getSummary: () => http.get<{ data: OverviewSummary }>('/overview/summary').then(r => r.data.data),
  getTrend: (days = 7) => http.get<{ data: TrendItem[] }>('/overview/trend', { params: { days } }).then(r => r.data.data),
  getRealtimeMetrics: () => http.get<{ data: RealtimeMetrics }>('/overview/metrics').then(r => r.data.data),
  getTokenBreakdown: () => http.get<{ data: TokenBreakdown }>('/overview/token-breakdown').then(r => r.data.data),

  // Token 用量
  getTokenUsage: (params: { start?: number; end?: number; model?: string; users?: string; granularity?: string }) =>
    http.get<{ data: TokenUsageItem[] }>('/tokens/usage', { params }).then(r => r.data.data),
  getCostBreakdown: (params: { start?: number; end?: number; model?: string; users?: string; granularity?: string }) =>
    http.get<{ data: TokenUsageItem[] }>('/tokens/cost', { params }).then(r => r.data.data),
  getTopModels: (params?: { start?: number; end?: number; limit?: number }) =>
    http.get<{ data: TopModelItem[] }>('/tokens/top-models', { params }).then(r => r.data.data),
  getTopUsers: (params?: { start?: number; end?: number; limit?: number }) =>
    http.get<{ data: TopModelItem[] }>('/tokens/top-users', { params }).then(r => r.data.data),
  getUserList: (params?: { start?: number; end?: number; limit?: number }) =>
    http.get<{ data: UserListItem[] }>('/tokens/users', { params }).then(r => r.data.data),

  // 热力图
  getAvailabilityHeatmap: (params: { start?: number; end?: number; models?: string }) =>
    http.get<{ data: HeatmapCell[] }>('/heatmap/availability', { params }).then(r => r.data.data),
  getUsagePatternHeatmap: (params: { start?: number; end?: number }) =>
    http.get<{ data: UsagePatternCell[] }>('/heatmap/usage-pattern', { params }).then(r => r.data.data),
  getModelSuccessRate: (params: { start?: number; end?: number }) =>
    http.get<{ data: ModelSuccessRate[] }>('/heatmap/success-rate', { params }).then(r => r.data.data),
};
