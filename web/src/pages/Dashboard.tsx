import { useEffect, useState } from 'react';
import { Row, Col, Spin, Segmented } from 'antd';
import { RocketOutlined, ThunderboltOutlined, TeamOutlined, FireOutlined } from '@ant-design/icons';
import StatsCard from '../components/StatsCard';
import TrendChart from '../components/TrendChart';
import TopModelsChart from '../components/TopModelsChart';
import ModelHeatmap from '../components/ModelHeatmap';
import { useWebSocket } from '../hooks/useWebSocket';
import { api, type OverviewSummary, type TrendItem, type TopModelItem, type HeatmapCell, type TokenBreakdown } from '../api';
import dayjs from 'dayjs';

const RANGE_KEY = 'dashboard_range';
const RANGE_OPTIONS = [
  { label: '7天', value: 7 },
  { label: '14天', value: 14 },
  { label: '30天', value: 30 },
];
const REFRESH_OPTIONS = [
  { label: '10秒', value: 10000 },
  { label: '30秒', value: 30000 },
  { label: '1分钟', value: 60000 },
];

function loadRange(): number {
  const saved = localStorage.getItem(RANGE_KEY);
  return saved ? parseInt(saved, 10) : 7;
}

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 16,
      padding: '12px 8px',
      textAlign: 'center',
      height: 100,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: '#94a3b8' }}>{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState<OverviewSummary | null>(null);
  const { metrics, connected, setInterval: setWsInterval, currentInterval, lastUpdate } = useWebSocket();
  const [trend, setTrend] = useState<TrendItem[]>([]);
  const [topModels, setTopModels] = useState<TopModelItem[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [heatmapRange, setHeatmapRange] = useState<24 | 168>(24);
  const [tokenBreakdown, setTokenBreakdown] = useState<TokenBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState(loadRange);
  const [successRate, setSuccessRate] = useState({ success: 0, failed: 0, rate: 0 });

  const fetchMainData = () => {
    const end = dayjs().endOf('day').unix();
    const start = dayjs().subtract(rangeDays, 'day').startOf('day').unix();
    // 热力图根据选择的时间范围查询
    const heatmapEnd = dayjs().unix();
    const heatmapHours = heatmapRange;
    const heatmapStart = dayjs().subtract(heatmapHours, 'hour').unix();
    Promise.all([
      api.getSummary(),
      api.getTrend(rangeDays),
      api.getTopModels({ limit: 10 }),
      api.getAvailabilityHeatmap({ start: heatmapStart, end: heatmapEnd }),
      api.getTokenBreakdown(),
    ])
      .then(([s, t, top, h, tb]) => {
        setSummary(s);
        setTrend(t);
        setTopModels(top);
        setHeatmap(h);
        setTokenBreakdown(tb);
        const totalSuccess = h.reduce((sum, cell) => sum + Number(cell.success_count || 0), 0);
        const totalFailed = h.reduce((sum, cell) => sum + (Number(cell.request_count) - Number(cell.success_count || 0)), 0);
        const total = totalSuccess + totalFailed;
        setSuccessRate({
          success: totalSuccess,
          failed: totalFailed,
          rate: total > 0 ? (totalSuccess / total) * 100 : 0,
        });
      })
      .finally(() => setLoading(false));
  };

  // 切换时间范围 → 强制刷新（带 loading）
  useEffect(() => {
    setLoading(true);
    fetchMainData();
  }, [rangeDays]);

  // 切换热力图时间范围 → 静默刷新
  useEffect(() => {
    fetchMainData();
  }, [heatmapRange]);

  // 跟随 WebSocket 推送节奏静默刷新（含模型可用性热力图）
  useEffect(() => {
    if (lastUpdate === 0) return;
    fetchMainData();
  }, [lastUpdate]);

  const handleRangeChange = (val: number) => {
    setRangeDays(val);
    localStorage.setItem(RANGE_KEY, String(val));
  };

  const calcTrend = (current: number, previous: number) => {
    if (!previous) return 0;
    return ((current - previous) / previous) * 100;
  };

  const prevDay = trend.length >= 2 ? trend[trend.length - 2] : null;
  const totalCost = trend.length > 0
    ? trend.reduce((s, d) => s + Number(d.total_cost || 0), 0)
    : 0;
  const rangeTokens = trend.reduce((s, d) => s + Number(d.total_tokens || 0), 0);

  const formatBig = (n: number) => {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
  };

  const successColor = successRate.rate >= 90 ? '#10b981' : successRate.rate >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <Spin spinning={loading}>
      {/* 顶部控制栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1e293b' }}>数据概览</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>
            {new Date().toLocaleDateString('zh-CN')}
            <span style={{ marginLeft: 8, color: connected ? '#10b981' : '#ef4444' }}>
              {connected ? '● 实时连接' : '○ 离线'}
            </span>
            {lastUpdate > 0 && (
              <span style={{ marginLeft: 8, color: '#94a3b8' }}>
                更新于 {dayjs(lastUpdate).format('HH:mm:ss')}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>刷新:</span>
            <Segmented
              value={currentInterval}
              onChange={(v) => setWsInterval(v as number)}
              options={REFRESH_OPTIONS}
              size="small"
            />
          </div>
          <Segmented value={rangeDays} onChange={(v) => handleRangeChange(v as number)} options={RANGE_OPTIONS} />
        </div>
      </div>

      {/* 第一行：核心指标卡片 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <StatsCard
            title="今日请求"
            value={summary?.total_requests ?? 0}
            prefix={<RocketOutlined style={{ color: '#fff', fontSize: 14 }} />}
            color="blue"
            trend={prevDay ? calcTrend(Number(summary?.total_requests), Number(prevDay.total_requests)) : undefined}
            subValue={summary?.total_requests_all !== undefined ? `累计 ${formatBig(Number(summary.total_requests_all))}` : undefined}
          />
        </Col>
        <Col xs={12} sm={6}>
          <StatsCard
            title={`Token 总量 (${rangeDays}天)`}
            value={rangeTokens}
            prefix={<ThunderboltOutlined style={{ color: '#fff', fontSize: 14 }} />}
            color="purple"
            trend={prevDay ? calcTrend(Number(summary?.total_tokens), Number(prevDay.total_tokens)) : undefined}
            subValue={summary?.total_tokens_all !== undefined ? `累计 ${formatBig(Number(summary.total_tokens_all))}` : undefined}
          />
        </Col>
        <Col xs={12} sm={6}>
          <StatsCard
            title="活跃模型"
            value={summary?.active_models ?? 0}
            prefix={<TeamOutlined style={{ color: '#fff', fontSize: 14 }} />}
            color="green"
          />
        </Col>
        <Col xs={12} sm={6}>
          <StatsCard
            title="预估费用"
            value={Number(totalCost.toFixed(2))}
            prefix={<FireOutlined style={{ color: '#fff', fontSize: 14 }} />}
            color="orange"
            suffix="元"
          />
        </Col>
      </Row>

      {/* 第二行：实时指标 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={8} sm={3}>
          <StatBox label="RPM" value={String(metrics?.rpm ?? 0)} sub="请求/分" color="#6366f1" />
        </Col>
        <Col xs={8} sm={3}>
          <StatBox label="TPM" value={metrics?.tpm ? (metrics.tpm / 1000).toFixed(1) + 'k' : '0'} sub="Token/分" color="#8b5cf6" />
        </Col>
        <Col xs={8} sm={3}>
          <StatBox label="并发" value={String(metrics?.concurrent ?? 0)} sub="5分钟内" color="#ec4899" />
        </Col>
        <Col xs={12} sm={3}>
          <StatBox label="累计请求" value={metrics?.today_requests?.toLocaleString() ?? '0'} color="#3b82f6" />
        </Col>
        <Col xs={24} sm={6}>
          <div style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 16,
            padding: '10px 12px',
            height: 100,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 11, color: '#64748b' }}>累计 Token 总量</span>
              {/* 全时段累计取自 quota_data（永久聚合），与「Token 总量(N天)」下的累计同源；
                  logs 表会被清理，不能用作全时段口径 */}
              <span style={{ fontSize: 18, fontWeight: 700, color: '#0ea5e9' }}>
                {summary?.total_tokens_all !== undefined ? formatBig(Number(summary.total_tokens_all)) : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: '#94a3b8', lineHeight: 1.4 }}>
              <span>未命中 <span style={{ color: '#6366f1' }}>{tokenBreakdown ? formatBig(tokenBreakdown.total_cache_miss_tokens) : '—'}</span></span>
              <span>命中 <span style={{ color: '#10b981' }}>{tokenBreakdown ? formatBig(tokenBreakdown.total_cache_tokens) : '—'}</span></span>
              <span>输出 <span style={{ color: '#f59e0b' }}>{tokenBreakdown ? formatBig(tokenBreakdown.total_completion_tokens) : '—'}</span></span>
            </div>
            {/* 明细来自 logs（含缓存拆分），仅覆盖已留存日志，非全时段，故与上方总量不构成精确子集 */}
            <div style={{ marginTop: 4, fontSize: 9, color: '#cbd5e1', lineHeight: 1.2 }}>
              明细为已留存日志统计，非全时段
            </div>
          </div>
        </Col>
        <Col xs={24} sm={6}>
          <div style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 16,
            padding: '12px',
            textAlign: 'center',
            height: 100,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: successColor }}>{successRate.rate.toFixed(1)}%</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>成功率</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              <span style={{ color: '#10b981' }}>{successRate.success.toLocaleString()}</span>
              {' / '}
              <span style={{ color: '#ef4444' }}>{successRate.failed.toLocaleString()}</span>
            </div>
          </div>
        </Col>
      </Row>

      {/* 模型可用性热力图 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <ModelHeatmap data={heatmap} loading={loading} timeRange={heatmapRange} onTimeRangeChange={setHeatmapRange} />
        </Col>
      </Row>

      {/* 趋势图 + Top模型 */}
      <Row gutter={[12, 12]}>
        <Col xs={24} xl={16}>
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 16,
            padding: 20,
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#1e293b' }}>
              {rangeDays}天趋势
            </h3>
            <TrendChart data={trend} loading={loading} height={260} />
          </div>
        </Col>
        <Col xs={24} xl={8}>
          <TopModelsChart data={topModels} loading={loading} />
        </Col>
      </Row>
    </Spin>
  );
}