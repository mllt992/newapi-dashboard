import { useEffect, useState } from 'react';
import { Segmented } from 'antd';
import ReactApexChart from 'react-apexcharts';
import type { HeatmapCell } from '../api';

interface ModelHeatmapProps {
  data: HeatmapCell[];
  loading?: boolean;
  timeRange?: 24 | 168;
  onTimeRangeChange?: (range: 24 | 168) => void;
}

// 计算成功率并映射到颜色值
function getHeatmapValue(cell: HeatmapCell | undefined): number {
  if (!cell || cell.request_count === 0) return 0;
  const rate = Number(cell.success_count) / Number(cell.request_count);
  return Math.round(rate * 100);
}

// 获取当前北京时间小时 (0-23)
function getCurrentBeijingHour(): number {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + 8 * 3600000).getHours();
}

// 生成 x 轴标签 (北京时间)
function generateHourLabels(): string[] {
  const currentHour = getCurrentBeijingHour();
  const labels: string[] = [];

  for (let i = 23; i >= 0; i--) {
    const hour = (currentHour - i + 24) % 24;
    if (i === 0) {
      labels.push('现在');
    } else {
      labels.push(`${String(hour).padStart(2, '0')}:00`);
    }
  }

  return labels;
}

// 计算 UTC 小时对应的北京时间小时
function utcToBeijingHour(utcHour: number): number {
  return (utcHour + 8) % 24;
}

export default function ModelHeatmap({ data, loading, timeRange = 24, onTimeRangeChange }: ModelHeatmapProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || loading) {
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

  // 计算每个模型的总请求数，用于排序
  const modelRequestCounts: Record<string, number> = {};
  Object.entries(modelGroups).forEach(([model, cells]) => {
    modelRequestCounts[model] = cells.reduce((sum, c) => sum + Number(c.request_count || 0), 0);
  });

  // 按使用频率（总请求数）降序排序
  const sortedModelNames = Object.keys(modelGroups)
    .sort((a, b) => (modelRequestCounts[b] || 0) - (modelRequestCounts[a] || 0));

  const labels = generateHourLabels();

  const series = sortedModelNames.slice(0, 15).map((model) => {
    // 创建时间轴数组，索引0=23小时前，索引23=现在
    const hours: number[] = new Array(timeRange).fill(-1);
    const cells = modelGroups[model];

    cells.forEach(c => {
      const utcHour = Number(c.hour_of_day);
      const beijingHour = utcToBeijingHour(utcHour);

      // 获取当前北京时间
      const currentBeijingHour = getCurrentBeijingHour();

      // 计算数据对应的小时在当前时间轴中的索引位置
      // 公式：(currentBeijingHour - beijingHour + 24) % timeRange 得到"数据是几小时前"
      const hoursAgo = (currentBeijingHour - beijingHour + 24) % 24;

      // 只处理24小时范围内的数据
      if (hoursAgo < timeRange) {
        // 索引 = timeRange - 1 - hoursAgo，范围是 0 到 timeRange-1
        const index = timeRange - 1 - hoursAgo;
        hours[index] = getHeatmapValue(c);
      }
    });

    return { name: model.length > 18 ? model.substring(0, 18) + '...' : model, data: hours };
  });

  // 只取前24个标签显示（当选择7天时）
  const displayLabels = timeRange === 168 ? labels.slice(-24) : labels;

  const options: ApexCharts.ApexOptions = {
    chart: {
      type: 'heatmap',
      background: 'transparent',
      toolbar: { show: false },
      animations: { enabled: true },
    },
    colors: ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981'],
    dataLabels: { enabled: false },
    stroke: { width: 3, colors: ['#fff'] },
    plotOptions: {
      heatmap: {
        radius: 4,
        colorScale: {
          inverse: false,
          min: -1,
          max: 100,
          ranges: [
            { from: -1, to: -1, name: '无数据', color: '#f1f5f9' },
            { from: 0, to: 0, name: '无成功', color: '#ef4444' },
            { from: 1, to: 20, name: '失败多', color: '#f97316' },
            { from: 21, to: 40, name: '较差', color: '#f59e0b' },
            { from: 41, to: 60, name: '一般', color: '#eab308' },
            { from: 61, to: 80, name: '较好', color: '#84cc16' },
            { from: 81, to: 100, name: '成功多', color: '#22c55e' },
          ],
        },
      },
    },
    xaxis: {
      categories: displayLabels,
      labels: { style: { colors: '#64748b', fontSize: '10px' } },
      axisBorder: { color: '#e2e8f0' },
    },
    yaxis: { labels: { style: { colors: '#64748b', fontSize: '10px' } } },
    tooltip: {
      theme: 'light',
      custom: ({ seriesIndex, dataPointIndex, w }) => {
        const model = String(w.config.series[seriesIndex].name);
        const hourLabel = String(w.config.xaxis.categories[dataPointIndex]);
        const rate = Number(w.config.series[seriesIndex].data[dataPointIndex]);

        if (rate === -1) {
          return `<div style="padding:12px;background:#fff;border-radius:8px">
            <b>${model}</b><br/>${hourLabel}<br/><span style="color:#94a3b8">无请求数据</span>
          </div>`;
        }

        // 计算对应的北京时间
        const currentBeijingHour = getCurrentBeijingHour();
        const hoursAgo = (timeRange - 1) - dataPointIndex;
        const dataBeijingHour = (currentBeijingHour - hoursAgo + 24) % 24;

        // 在原始数据中查找
        const utcHour = (dataBeijingHour - 8 + 24) % 24;
        const cell = data.find(c => c.model_name === model && Number(c.hour_of_day) === utcHour);

        if (!cell) {
          return `<div style="padding:12px;background:#fff;border-radius:8px">
            <b>${model}</b><br/>${hourLabel}<br/><span style="color:#94a3b8">无请求数据</span>
          </div>`;
        }

        const reqCount = Number(cell.request_count);
        const successCount = Number(cell.success_count);
        const color = rate >= 80 ? '#10b981' : rate >= 50 ? '#f59e0b' : '#ef4444';

        return `<div style="padding:12px;background:#fff;border-radius:8px;min-width:180px">
          <div style="font-weight:600;color:#1e293b;margin-bottom:8px;font-size:13px">${model}</div>
          <div style="color:#64748b;font-size:12px">北京时间: <b>${hourLabel}</b></div>
          <div style="color:#64748b;font-size:12px">总请求: <b>${reqCount}</b></div>
          <div style="color:#64748b;font-size:12px">成功: <b style="color:#10b981">${successCount}</b></div>
          <div style="color:#64748b;font-size:12px">失败: <b style="color:#ef4444">${reqCount - successCount}</b></div>
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
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
            北京时间 · 颜色表示成功率
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Segmented
            value={timeRange}
            onChange={(v) => onTimeRangeChange?.(v as 24 | 168)}
            options={[
              { label: '24小时', value: 24 },
              { label: '7天', value: 168 },
            ]}
            size="small"
          />
          <div style={{ display: 'flex', gap: 8, fontSize: 11, marginLeft: 8 }}>
            <span style={{ color: '#22c55e' }}>● 成功多</span>
            <span style={{ color: '#84cc16' }}>● 较好</span>
            <span style={{ color: '#f59e0b' }}>● 一般</span>
            <span style={{ color: '#ef4444' }}>● 失败多</span>
            <span style={{ color: '#cbd5e1' }}>● 无数据</span>
          </div>
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
