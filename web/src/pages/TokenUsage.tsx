import { useEffect, useState } from 'react';
import { Row, Col, DatePicker, Select, Card, Spin } from 'antd';
import ReactApexChart from 'react-apexcharts';
import dayjs, { type Dayjs } from 'dayjs';
import { api, type TokenUsageItem } from '../api';

const { RangePicker } = DatePicker;

export default function TokenUsage() {
  const [data, setData] = useState<TokenUsageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState<string | undefined>();
  const [granularity, setGranularity] = useState<string>('day');
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(7, 'day'), dayjs()]);

  const fetchData = () => {
    setLoading(true);
    api.getTokenUsage({
      start: range[0].startOf('day').unix(),
      end: range[1].endOf('day').unix(),
      model,
      granularity,
    }).then(setData).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [model, granularity, range]);

  // 按时间分组汇总
  const timeGroups = data.reduce((acc: Record<string, { prompt: number; completion: number; cache: number }>, item) => {
    const time = item.time_bucket;
    if (!acc[time]) acc[time] = { prompt: 0, completion: 0, cache: 0 };
    acc[time].prompt += Number(item.total_prompt_tokens);
    acc[time].completion += Number(item.total_completion_tokens);
    acc[time].cache += Number(item.total_cache_tokens || 0);
    return acc;
  }, {});

  const chartData = Object.entries(timeGroups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, vals]) => ({
      x: time,
      y: [vals.prompt, vals.completion, vals.cache],
    }));

  const tokenOptions: ApexCharts.ApexOptions = {
    chart: { type: 'bar', stacked: true, background: 'transparent', toolbar: { show: false }, animations: { enabled: true } },
    colors: ['#6366f1', '#f59e0b', '#10b981'],
    fill: { opacity: [1, 1, 1] },
    stroke: { width: 0 },
    grid: { borderColor: '#e2e8f0', strokeDashArray: 4 },
    xaxis: { labels: { style: { colors: '#64748b', fontSize: 11 } }, type: 'category' },
    yaxis: { labels: { style: { colors: '#64748b', fontSize: 11 }, formatter: (val) => (val / 1000000).toFixed(1) + 'M' } },
    dataLabels: { enabled: false },
    legend: { show: true, position: 'top', horizontalAlign: 'right', labels: { colors: '#64748b' } },
    plotOptions: { bar: { columnWidth: '60%' } },
    tooltip: {
      y: { formatter: (val) => val.toLocaleString() },
    },
  };

  const pieData = [
    { x: '输入Token', y: Object.values(timeGroups).reduce((s, v) => s + v.prompt, 0) },
    { x: '输出Token', y: Object.values(timeGroups).reduce((s, v) => s + v.completion, 0) },
    { x: '缓存Token', y: Object.values(timeGroups).reduce((s, v) => s + v.cache, 0) },
  ];

  const pieOptions: ApexCharts.ApexOptions = {
    chart: { type: 'donut', background: 'transparent', animations: { enabled: true, speed: 800 } },
    colors: ['#6366f1', '#f59e0b', '#10b981'],
    labels: ['输入Token', '输出Token', '缓存Token'],
    stroke: { show: true, width: 3, colors: ['#fff'] },
    dataLabels: { enabled: false },
    legend: { show: true, position: 'bottom', labels: { colors: '#64748b' } },
    plotOptions: {
      pie: {
        donut: {
          size: '70%',
          labels: {
            show: true,
            name: { show: true, color: '#64748b', fontSize: 13 },
            value: { show: true, color: '#1e293b', fontSize: 18, fontWeight: 700, formatter: (val) => (Number(val) / 1000000).toFixed(1) + 'M' },
            total: { show: true, label: '总计', color: '#94a3b8', fontSize: 12, formatter: () => (pieData.reduce((s, d) => s + d.y, 0) / 1000000).toFixed(1) + 'M' },
          },
        },
      },
    },
  };

  const containerStyle = { padding: 24, borderRadius: 20, background: '#f8fafc', border: '1px solid #e2e8f0' };

  // 计算缓存命中率
  const totalPrompt = pieData[0].y;
  const totalCache = pieData[2].y;
  const cacheHitRate = totalPrompt > 0 ? ((totalCache / totalPrompt) * 100).toFixed(1) : '0.0';

  return (
    <Spin spinning={loading}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <RangePicker value={range} onChange={(v) => v && setRange(v as [Dayjs, Dayjs])} style={{ width: 280 }} />
        <Select value={granularity} onChange={setGranularity} style={{ width: 120 }} options={[{ label: '按天', value: 'day' }, { label: '按小时', value: 'hour' }]} />
        <Select
          allowClear placeholder="全部模型" value={model} onChange={setModel} style={{ width: 200 }} showSearch filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
          options={[...new Set(data.map((d) => d.model_name))].map((m) => ({ label: m, value: m }))}
        />
      </div>

      <Row gutter={[20, 20]}>
        <Col xs={24} xl={16}>
          <div style={containerStyle}>
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1e293b' }}>Token 用量分析</h3>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b' }}>输入/输出/缓存Token分布 · 缓存命中率 {cacheHitRate}%</p>
            </div>
            <ReactApexChart
              type="bar"
              series={[
                { name: '输入Token', data: chartData.map(d => ({ x: d.x, y: d.y[0] })) },
                { name: '输出Token', data: chartData.map(d => ({ x: d.x, y: d.y[1] })) },
                { name: '缓存Token', data: chartData.map(d => ({ x: d.x, y: d.y[2] })) },
              ]}
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
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                {['时间', '模型', '请求数', '输入Token', '输出Token', '缓存Token', '缓存命中率', 'Quota'].map((h) => (
                  <th key={h} style={{ padding: '16px 12px', textAlign: 'left', color: '#64748b', fontSize: 12, fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 30).map((item, i) => {
                const prompt = Number(item.total_prompt_tokens);
                const cache = Number(item.total_cache_tokens || 0);
                const hitRate = prompt > 0 ? ((cache / prompt) * 100).toFixed(1) : '0.0';
                const bgColor = Number(hitRate) >= 30 ? '#10b98115' : Number(hitRate) >= 10 ? '#f59e0b15' : '#ef444415';
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 12px', color: '#475569', fontSize: 13 }}>{item.time_bucket}</td>
                    <td style={{ padding: '14px 12px', color: '#6366f1', fontSize: 13 }}>{item.model_name}</td>
                    <td style={{ padding: '14px 12px', color: '#475569', fontSize: 13 }}>{item.request_count}</td>
                    <td style={{ padding: '14px 12px', color: '#475569', fontSize: 13 }}>{prompt.toLocaleString()}</td>
                    <td style={{ padding: '14px 12px', color: '#475569', fontSize: 13 }}>{Number(item.total_completion_tokens).toLocaleString()}</td>
                    <td style={{ padding: '14px 12px', color: '#10b981', fontSize: 13 }}>{cache.toLocaleString()}</td>
                    <td style={{ padding: '14px 12px', textAlign: 'right' }}>
                      <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: bgColor, color: Number(hitRate) >= 30 ? '#10b981' : Number(hitRate) >= 10 ? '#f59e0b' : '#ef4444' }}>
                        {hitRate}%
                      </span>
                    </td>
                    <td style={{ padding: '14px 12px', color: '#f59e0b', fontSize: 13 }}>{Number(item.total_quota).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </Spin>
  );
}