import { useEffect, useState } from 'react';
import { Row, Col } from 'antd';
import type { TrendItem } from '../api';

interface QuickStatsProps {
  trend: TrendItem[];
  loading?: boolean;
}

function MiniCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div
      style={{
        padding: 20,
        borderRadius: 16,
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        position: 'relative',
        overflow: 'hidden',
        height: 100,
      }}
    >
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{sub}</div>
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 3,
          background: color,
          opacity: 0.6,
        }}
      />
    </div>
  );
}

export default function QuickStats({ trend, loading }: QuickStatsProps) {
  const [stats, setStats] = useState({ avgReq: 0, peakDay: '', peakReq: 0, totalCost: 0 });

  useEffect(() => {
    if (!trend.length) return;

    const avgReq = Math.round(trend.reduce((s, d) => s + Number(d.total_requests), 0) / trend.length);
    const totalCost = trend.reduce((s, d) => s + Number(d.total_quota), 0);

    let peakDay = '';
    let peakReq = 0;
    trend.forEach((d) => {
      const req = Number(d.total_requests);
      if (req > peakReq) {
        peakReq = req;
        peakDay = new Date(d.date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
      }
    });

    setStats({ avgReq, peakDay, peakReq, totalCost });
  }, [trend]);

  const cards = [
    { label: '日均请求', value: stats.avgReq.toLocaleString(), sub: '近7天平均', color: '#6366f1' },
    { label: '峰值日', value: stats.peakDay, sub: `请求量 ${stats.peakReq.toLocaleString()}`, color: '#f59e0b' },
    { label: '总消耗', value: (stats.totalCost / 1000000).toFixed(2) + 'M', sub: 'Quota总量', color: '#10b981' },
    { label: '使用天数', value: `${trend.length}`, sub: '近7天', color: '#ec4899' },
  ];

  return (
    <Row gutter={[16, 16]}>
      {cards.map((card) => (
        <Col key={card.label} xs={12} sm={6}>
          <MiniCard {...card} />
        </Col>
      ))}
    </Row>
  );
}
