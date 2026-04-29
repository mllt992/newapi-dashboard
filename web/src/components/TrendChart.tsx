import { useEffect, useState } from 'react';
import ReactApexChart from 'react-apexcharts';
import type { TrendItem } from '../api';

interface TrendChartProps {
  data: TrendItem[];
  loading?: boolean;
  height?: number;
}

export default function TrendChart({ data, loading, height = 300 }: TrendChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || loading || !data.length) {
    return (
      <div
        style={{
          height,
          borderRadius: 16,
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#94a3b8',
        }}
      >
        加载中...
      </div>
    );
  }

  const chartData = data.map((item) => ({
    x: new Date(item.date).getTime(),
    y1: item.total_requests,
    y2: Number(item.total_cost || 0),
  }));

  const series = [
    {
      name: '请求量',
      data: chartData.map((d) => ({ x: d.x, y: d.y1 })),
    },
    {
      name: '预估费用 (¥)',
      data: chartData.map((d) => ({ x: d.x, y: d.y2 })),
    },
  ];

  const options: ApexCharts.ApexOptions = {
    chart: {
      type: 'area',
      background: 'transparent',
      toolbar: { show: false },
      sparkline: { enabled: false },
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 1000,
        animateGradually: { enabled: true, delay: 150 },
      },
    },
    colors: ['#6366f1', '#f59e0b'],
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: { val: 0.35, op: 'rgba' },
        opacityTo: { val: 0.08, op: 'rgba' },
        stops: [0, 90, 100],
      },
    },
    stroke: { curve: 'smooth', width: 3 },
    grid: {
      borderColor: '#e2e8f0',
      strokeDashArray: 4,
    },
    xaxis: {
      type: 'datetime',
      labels: {
        style: { colors: '#64748b', fontSize: 12 },
        datetimeFormatter: { month: 'MMM' },
      },
      axisBorder: { color: '#e2e8f0' },
      axisTicks: { color: '#e2e8f0' },
    },
    yaxis: {
      labels: {
        style: { colors: '#64748b', fontSize: 12 },
        formatter: (val) => val.toLocaleString(),
      },
    },
    tooltip: {
      x: { format: 'yyyy-MM-dd' },
      style: { fontSize: 14 },
    },
    legend: {
      show: true,
      position: 'top',
      horizontalAlign: 'right',
      labels: { colors: '#64748b' },
    },
    dataLabels: { enabled: false },
  };

  return (
    <ReactApexChart
      type="area"
      series={series}
      options={options}
      height={height}
    />
  );
}
