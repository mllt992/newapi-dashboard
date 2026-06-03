import { useEffect, useState } from 'react';
import { Row, Col, DatePicker, Select, Card, Spin } from 'antd';
import ReactApexChart from 'react-apexcharts';
import dayjs, { type Dayjs } from 'dayjs';
import { api, type TokenUsageItem } from '../api';
import { useSortable } from '../utils/useSortable';

const { RangePicker } = DatePicker;

export default function TokenUsage() {
  const [data, setData] = useState<TokenUsageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState<string | undefined>();
  const [users, setUsers] = useState<string[]>([]);
  const [userOptions, setUserOptions] = useState<string[]>([]);
  const [granularity, setGranularity] = useState<string>('day');
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(7, 'day'), dayjs()]);

  const fetchData = () => {
    setLoading(true);
    api.getTokenUsage({
      start: range[0].startOf('day').unix(),
      end: range[1].endOf('day').unix(),
      model,
      users: users.length ? users.join(',') : undefined,
      granularity,
    }).then(setData).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [model, users, granularity, range]);

  // 拉取用户列表作为筛选选项（按所选时间范围内的活跃用户）
  useEffect(() => {
    api.getUserList({
      start: range[0].startOf('day').unix(),
      end: range[1].endOf('day').unix(),
    }).then((list) => setUserOptions(list.map((u) => u.username))).catch(() => {});
  }, [range]);

  // 按时间分组汇总。
  // New API 中 prompt_tokens 已包含命中缓存(cache)与缓存创建(creation)，
  // 故输入侧拆成互不重叠的三块：未命中缓存(miss)+命中缓存(cache)+缓存创建(creation)=prompt。
  const timeGroups = data.reduce((acc: Record<string, { miss: number; cache: number; creation: number; completion: number }>, item) => {
    const time = item.time_bucket;
    if (!acc[time]) acc[time] = { miss: 0, cache: 0, creation: 0, completion: 0 };
    acc[time].miss += Number(item.total_cache_miss_tokens || 0);
    acc[time].cache += Number(item.total_cache_tokens || 0);
    acc[time].creation += Number(item.total_cache_creation_tokens || 0);
    acc[time].completion += Number(item.total_completion_tokens);
    return acc;
  }, {});

  const chartData = Object.entries(timeGroups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, vals]) => ({
      x: time,
      y: [vals.miss, vals.cache, vals.creation, vals.completion],
    }));

  // 未命中缓存 / 缓存命中 / 缓存创建 / 输出
  const SERIES_COLORS = ['#6366f1', '#10b981', '#8b5cf6', '#f59e0b'];
  const SERIES_LABELS = ['未命中缓存', '缓存命中', '缓存创建', '输出Token'];

  const tokenOptions: ApexCharts.ApexOptions = {
    chart: { type: 'bar', stacked: true, background: 'transparent', toolbar: { show: false }, animations: { enabled: true } },
    colors: SERIES_COLORS,
    fill: { opacity: 1 },
    stroke: { width: 0 },
    grid: { borderColor: '#e2e8f0', strokeDashArray: 4 },
    xaxis: { labels: { style: { colors: '#64748b', fontSize: '11px' } }, type: 'category' },
    yaxis: { labels: { style: { colors: '#64748b', fontSize: '11px' }, formatter: (val) => (Number(val) / 1000000).toFixed(1) + 'M' } },
    dataLabels: { enabled: false },
    legend: { show: true, position: 'top', horizontalAlign: 'right', labels: { colors: '#64748b' } },
    plotOptions: { bar: { columnWidth: '60%' } },
    tooltip: {
      y: { formatter: (val) => Number(val).toLocaleString() },
    },
  };

  const sumBy = (k: 'miss' | 'cache' | 'creation' | 'completion') =>
    Object.values(timeGroups).reduce((s, v) => s + v[k], 0);

  const pieData = [
    { x: SERIES_LABELS[0], y: sumBy('miss') },
    { x: SERIES_LABELS[1], y: sumBy('cache') },
    { x: SERIES_LABELS[2], y: sumBy('creation') },
    { x: SERIES_LABELS[3], y: sumBy('completion') },
  ];

  const pieOptions: ApexCharts.ApexOptions = {
    chart: { type: 'donut', background: 'transparent', animations: { enabled: true, speed: 800 } },
    colors: SERIES_COLORS,
    labels: SERIES_LABELS,
    stroke: { show: true, width: 3, colors: ['#fff'] },
    dataLabels: { enabled: false },
    legend: { show: true, position: 'bottom', labels: { colors: '#64748b' } },
    plotOptions: {
      pie: {
        donut: {
          size: '70%',
          labels: {
            show: true,
            name: { show: true, color: '#64748b', fontSize: '13px' },
            value: { show: true, color: '#1e293b', fontSize: '18px', fontWeight: 700, formatter: (val) => (Number(val) / 1000000).toFixed(1) + 'M' },
            total: { show: true, label: '总计', color: '#94a3b8', fontSize: '12px', formatter: () => (pieData.reduce((s, d) => s + d.y, 0) / 1000000).toFixed(1) + 'M' },
          },
        },
      },
    },
  };

  const containerStyle = { padding: 24, borderRadius: 20, background: '#f8fafc', border: '1px solid #e2e8f0' };

  // 缓存命中率 = 命中缓存 / 输入总量(未命中+命中+创建)
  const totalCache = sumBy('cache');
  const totalInput = sumBy('miss') + totalCache + sumBy('creation');
  const cacheHitRate = totalInput > 0 ? ((totalCache / totalInput) * 100).toFixed(1) : '0.0';

  return (
    <Spin spinning={loading}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <RangePicker value={range} onChange={(v) => v && setRange(v as [Dayjs, Dayjs])} style={{ width: 280 }} />
        <Select value={granularity} onChange={setGranularity} style={{ width: 120 }} options={[{ label: '按天', value: 'day' }, { label: '按小时', value: 'hour' }]} />
        <Select
          allowClear placeholder="全部模型" value={model} onChange={setModel} style={{ width: 200 }} showSearch filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
          options={[...new Set(data.map((d) => d.model_name))].map((m) => ({ label: m, value: m }))}
        />
        <Select
          mode="multiple" allowClear placeholder="全部用户" value={users} onChange={setUsers}
          style={{ minWidth: 220, maxWidth: 420 }} maxTagCount="responsive" showSearch
          filterOption={(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
          options={[...new Set([...userOptions, ...users])].map((u) => ({ label: u, value: u }))}
        />
      </div>

      <Row gutter={[20, 20]}>
        <Col xs={24} xl={16}>
          <div style={containerStyle}>
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1e293b' }}>Token 用量分析</h3>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b' }}>未命中/命中/缓存创建/输出 分布 · 缓存命中率 {cacheHitRate}%</p>
            </div>
            <ReactApexChart
              type="bar"
              series={SERIES_LABELS.map((name, i) => ({ name, data: chartData.map(d => ({ x: d.x, y: d.y[i] })) }))}
              options={tokenOptions}
              height={350}
            />
          </div>
        </Col>
        <Col xs={24} xl={8}>
          <div style={{ ...containerStyle, height: '100%', minHeight: 420 }}>
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1e293b' }}>Token 占比</h3>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b' }}>总体分布 · 缓存命中率 {cacheHitRate}%</p>
            </div>
            <ReactApexChart type="donut" series={pieData.map((d) => d.y)} options={pieOptions} height={320} />
          </div>
        </Col>
      </Row>

      <Card title={<span style={{ color: '#1e293b', fontSize: 16, fontWeight: 600 }}>详细数据</span>} style={{ ...containerStyle, marginTop: 20 }}>
        <DetailTable data={data} />
      </Card>
    </Spin>
  );
}

type DetailKey = 'time_bucket' | 'model_name' | 'request_count' | 'total_cache_miss_tokens' | 'total_cache_tokens' | 'total_cache_creation_tokens' | 'total_completion_tokens' | 'cache_hit_rate' | 'total_cost';

function DetailTable({ data }: { data: TokenUsageItem[] }) {
  const { sorted, state } = useSortable<TokenUsageItem, DetailKey>(
    data,
    (item, key) => {
      if (key === 'cache_hit_rate') {
        const p = Number(item.total_prompt_tokens);
        const c = Number(item.total_cache_tokens || 0);
        return p > 0 ? (c / p) * 100 : 0;
      }
      return item[key as keyof TokenUsageItem] as any;
    },
  );

  const headers: { key: DetailKey; label: string; align?: 'left' | 'right' }[] = [
    { key: 'time_bucket', label: '时间' },
    { key: 'model_name', label: '模型' },
    { key: 'request_count', label: '请求数' },
    { key: 'total_cache_miss_tokens', label: '未命中缓存' },
    { key: 'total_cache_tokens', label: '缓存命中' },
    { key: 'total_cache_creation_tokens', label: '缓存创建' },
    { key: 'total_completion_tokens', label: '输出Token' },
    { key: 'cache_hit_rate', label: '缓存命中率', align: 'right' },
    { key: 'total_cost', label: '金额(元)' },
  ];

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            {headers.map((h) => (
              <th
                key={h.key}
                onClick={() => state.toggle(h.key)}
                style={{
                  padding: '16px 12px',
                  textAlign: h.align ?? 'left',
                  color: state.sortKey === h.key ? '#6366f1' : '#64748b',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {h.label}
                <span style={{ fontSize: 10, color: state.sortKey === h.key ? '#6366f1' : '#cbd5e1' }}>
                  {state.indicator(h.key)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 30).map((item, i) => {
            const prompt = Number(item.total_prompt_tokens);
            const cache = Number(item.total_cache_tokens || 0);
            const creation = Number(item.total_cache_creation_tokens || 0);
            const miss = Number(item.total_cache_miss_tokens ?? Math.max(prompt - cache - creation, 0));
            // 命中率 = 命中缓存 / 输入总量(prompt)
            const hitRate = prompt > 0 ? ((cache / prompt) * 100).toFixed(1) : '0.0';
            const bgColor = Number(hitRate) >= 30 ? '#10b98115' : Number(hitRate) >= 10 ? '#f59e0b15' : '#ef444415';
            return (
              <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '14px 12px', color: '#475569', fontSize: 13 }}>{item.time_bucket}</td>
                <td style={{ padding: '14px 12px', color: '#6366f1', fontSize: 13 }}>{item.model_name}</td>
                <td style={{ padding: '14px 12px', color: '#475569', fontSize: 13 }}>{item.request_count}</td>
                <td style={{ padding: '14px 12px', color: '#6366f1', fontSize: 13 }}>{miss.toLocaleString()}</td>
                <td style={{ padding: '14px 12px', color: '#10b981', fontSize: 13 }}>{cache.toLocaleString()}</td>
                <td style={{ padding: '14px 12px', color: '#8b5cf6', fontSize: 13 }}>{creation.toLocaleString()}</td>
                <td style={{ padding: '14px 12px', color: '#475569', fontSize: 13 }}>{Number(item.total_completion_tokens).toLocaleString()}</td>
                <td style={{ padding: '14px 12px', textAlign: 'right' }}>
                  <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: bgColor, color: Number(hitRate) >= 30 ? '#10b981' : Number(hitRate) >= 10 ? '#f59e0b' : '#ef4444' }}>
                    {hitRate}%
                  </span>
                </td>
                <td style={{ padding: '14px 12px', color: '#f59e0b', fontSize: 13 }}>¥ {Number(item.total_cost || 0).toFixed(4)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}