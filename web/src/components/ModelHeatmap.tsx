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
  return Math.round(rate * 100);
}

// 获取中国时区的当前小时
function getCurrentChinaHour(): number {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + 8 * 3600000).getHours();
}

// 获取 UTC 时区的当前小时
function getCurrentUtcHour(): number {
  return new Date().getUTCHours(); // 使用 UTC 小时，与数据库 HOUR() 函数返回的 UTC 值一致
}

// 生成最近 24 小时的 x 轴标签
function generate24HourLabels(): string[] {
  const currentHour = getCurrentChinaHour();
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

  // 按模型分组并排序（按模型名称字母顺序）
  const modelGroups = data.reduce((acc: Record<string, HeatmapCell[]>, item) => {
    if (!acc[item.model_name]) acc[item.model_name] = [];
    acc[item.model_name].push(item);
    return acc;
  }, {});

  // 提取模型名称并按字母顺序排序
  const sortedModelNames = Object.keys(modelGroups).sort((a, b) => a.localeCompare(b));

  // 当前中国小时
  const currentChinaHour = getCurrentChinaHour();
  // 当前 UTC 小时
  const currentUtcHour = getCurrentUtcHour();

  const series = sortedModelNames.slice(0, 15).map((model) => {
    const hours: number[] = new Array(24).fill(-1);
    const cells = modelGroups[model];

    cells.forEach(c => {
      // 数据库返回的是 UTC 小时
      const utcHour = Number(c.hour_of_day);

      // 计算 UTC 小时的"小时差"：当前 UTC 小时与数据 UTC 小时的差
      // 例如：当前 UTC 3:00，数据 UTC 4:00 → 差异 -1，即数据是"1小时前"
      // 公式：(current - data + 24) % 24 得到"数据是几小时前"
      const hoursAgo = (currentUtcHour - utcHour + 24) % 24;

      // 将"几小时前"转换为数组索引
      // 索引 0 = 23小时前, 23 = 现在
      // hoursAgo = 0 → 索引 23 (现在)
      // hoursAgo = 1 → 索引 22 (1小时前)
      // hoursAgo = 23 → 索引 0 (23小时前)
      const index = 23 - hoursAgo;

      hours[index] = getHeatmapValue(c);
    });

    return { name: model.length > 18 ? model.substring(0, 18) + '...' : model, data: hours };
  });

  const labels = generate24HourLabels();

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
      categories: labels,
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

        // 根据索引计算对应的 UTC 小时
        const hoursAgo = 23 - dataPointIndex;
        const utcHour = (currentUtcHour - hoursAgo + 24) % 24;
        const chinaHour = (utcHour + 8) % 24;

        // 在原始数据中查找
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
          <div style="color:#64748b;font-size:12px">时间: <b>${hourLabel}</b></div>
          <div style="color:#64748b;font-size:12px">UTC: <b>${String(utcHour).padStart(2, '0')}:00</b> / 中国: <b>${String(chinaHour).padStart(2, '0')}:00</b></div>
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
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>最近24小时 · 颜色表示成功率</p>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 12, alignItems: 'center' }}>
          <span style={{ color: '#22c55e' }}>● 成功多</span>
          <span style={{ color: '#84cc16' }}>● 较好</span>
          <span style={{ color: '#f59e0b' }}>● 一般</span>
          <span style={{ color: '#ef4444' }}>● 失败多</span>
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