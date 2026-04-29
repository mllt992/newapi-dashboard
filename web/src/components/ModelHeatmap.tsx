import { useEffect, useState } from 'react';
import ReactApexChart from 'react-apexcharts';
import type { HeatmapCell } from '../api';

interface ModelHeatmapProps {
  data: HeatmapCell[];
  loading?: boolean;
}

// 计算成功率并映射到颜色值 (0-100 映射到 红-黄-绿)
function getHeatmapValue(cell: HeatmapCell | undefined): number {
  if (!cell || cell.request_count === 0) return 0;
  const rate = Number(cell.success_count) / Number(cell.request_count);
  return Math.round(rate * 100); // 0-100, 0=全红(失败), 100=全绿(成功)
}

export default function ModelHeatmap({ data, loading }: ModelHeatmapProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || loading || !data.length) {
    return (
      <div style={{
        height: 300,
        borderRadius: 16,
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94a3b8',
      }}>
        加载中...
      </div>
    );
  }

  // 按模型分组
  const modelGroups = data.reduce((acc: Record<string, HeatmapCell[]>, item) => {
    if (!acc[item.model_name]) acc[item.model_name] = [];
    acc[item.model_name].push(item);
    return acc;
  }, {});

  const series = Object.entries(modelGroups).slice(0, 15).map(([model, cells]) => {
    const hours: number[] = new Array(24).fill(-1); // -1 表示无数据
    cells.forEach(c => {
      hours[c.hour_of_day] = getHeatmapValue(c);
    });
    return { name: model.length > 18 ? model.substring(0, 18) + '...' : model, data: hours };
  });

  const options: ApexCharts.ApexOptions = {
    chart: {
      type: 'heatmap',
      background: 'transparent',
      toolbar: { show: false },
      animations: { enabled: true },
    },
    // 红->黄->绿 渐变: 0=红(失败多), 50=黄, 100=绿(成功多)
    colors: ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981'],
    dataLabels: { enabled: false },
    stroke: { width: 3, colors: ['#fff'] },
    plotOptions: {
      heatmap: {
        radius: 4,
        colorScale: {
          inverse: false,
          ranges: [
            { from: -1, to: -1, name: '无数据', color: '#f1f5f9' },
            { from: 0, to: 20, name: '失败多', color: '#ef4444' },
            { from: 21, to: 40, name: '较差', color: '#f97316' },
            { from: 41, to: 60, name: '一般', color: '#f59e0b' },
            { from: 61, to: 80, name: '较好', color: '#84cc16' },
            { from: 81, to: 100, name: '成功多', color: '#10b981' },
          ],
        },
      },
    },
    xaxis: {
      categories: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`),
      labels: { style: { colors: '#64748b', fontSize: 10 } },
      axisBorder: { color: '#e2e8f0' },
      tickAmount: 6,
    },
    yaxis: { labels: { style: { colors: '#64748b', fontSize: 10 } } },
    tooltip: {
      theme: 'light',
      custom: ({ seriesIndex, dataPointIndex, w }) => {
        const model = w.config.series[seriesIndex].name;
        const hour = w.config.xaxis.categories[dataPointIndex];
        const rate = w.config.series[seriesIndex].data[dataPointIndex];
        const cell = data.find(c => c.model_name === model && c.hour_of_day === dataPointIndex);
        if (rate === -1 || !cell) return `<div style="padding:12px;background:#fff;border-radius:8px"><b>${model}</b><br/>${hour}<br/><span style="color:#94a3b8">无请求数据</span></div>`;
        const reqCount = cell.request_count;
        const successCount = cell.success_count;
        const color = rate >= 80 ? '#10b981' : rate >= 50 ? '#f59e0b' : '#ef4444';
        return `<div style="padding:12px;background:#fff;border-radius:8px;min-width:180px">
          <div style="font-weight:600;color:#1e293b;margin-bottom:8px;font-size:13px">${model}</div>
          <div style="color:#64748b;font-size:12">时间: <b>${hour}</b></div>
          <div style="color:#64748b;font-size:12">总请求: <b>${reqCount}</b></div>
          <div style="color:#64748b;font-size:12">成功: <b style="color:#10b981">${successCount}</b></div>
          <div style="color:#64748b;font-size:12">失败: <b style="color:#ef4444">${reqCount - successCount}</b></div>
          <div style="margin-top:8px;padding:6px 10px;border-radius:6px;background:${color}15;text-align:center">
            <span style="color:${color};font-size:16px;font-weight:700">${rate}%</span>
            <span style="color:${color};font-size:11px;margin-left:4px">成功率</span>
          </div>
        </div>`;
      },
    },
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1e293b' }}>模型可用性</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>颜色表示成功率 · 绿色成功多 · 红色失败多</p>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 12, alignItems: 'center' }}>
          <span style={{ color: '#ef4444' }}>● 失败多</span>
          <span style={{ color: '#f59e0b' }}>● 一般</span>
          <span style={{ color: '#10b981' }}>● 成功多</span>
          <span style={{ color: '#cbd5e1' }}>● 无数据</span>
        </div>
      </div>
      <ReactApexChart
        type="heatmap"
        series={series}
        options={options}
        height={Math.min(520, Math.max(320, series.length * 32 + 60))}
      />
    </div>
  );
}
