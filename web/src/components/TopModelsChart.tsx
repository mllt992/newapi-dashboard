import { useEffect, useState } from 'react';
import ReactApexChart from 'react-apexcharts';
import type { TopModelItem } from '../api';

interface TopModelsChartProps {
  data: TopModelItem[];
  loading?: boolean;
}

export default function TopModelsChart({ data, loading }: TopModelsChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || loading || !data.length) {
    return (
      <div
        style={{
          height: 400,
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

  const top5 = data.slice(0, 5);
  const series = [
    {
      name: 'Quota消耗',
      data: top5.map((d) => Number(d.total_quota)),
    },
  ];

  const options: ApexCharts.ApexOptions = {
    chart: {
      type: 'bar',
      background: 'transparent',
      toolbar: { show: false },
      animations: {
        enabled: true,
        speed: 1000,
      },
    },
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 8,
        borderRadiusApplication: 'end',
        barHeight: '60%',
        distributed: true,
      },
    },
    colors: ['#6366f1', '#8b5cf6', '#a855f7', '#c084fc', '#d8b4fe'],
    dataLabels: { enabled: false },
    grid: {
      borderColor: '#e2e8f0',
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: false } },
    },
    xaxis: {
      categories: top5.map((d) => d.model_name.length > 20 ? d.model_name.substring(0, 20) + '...' : d.model_name),
      labels: {
        style: { colors: '#64748b', fontSize: '11px' },
        formatter: (val) => Number(val).toLocaleString(),
      },
      axisBorder: { color: '#e2e8f0' },
    },
    yaxis: {
      labels: {
        style: { colors: '#1e293b', fontSize: '11px' },
      },
    },
    tooltip: {
      style: { fontSize: '12px' },
    },
  };

  return (
    <div
      style={{
        padding: 24,
        borderRadius: 20,
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        height: '100%',
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1e293b' }}>
          Top 5 模型消耗
        </h3>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b' }}>
          Quota消耗排行
        </p>
      </div>
      <ReactApexChart
        type="bar"
        series={series}
        options={options}
        height={320}
      />
    </div>
  );
}
