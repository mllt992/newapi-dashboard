import { useEffect, useState, type ReactNode } from 'react';
import { CountUp } from './CountUp';

interface StatsCardProps {
  title: string;
  value: number;
  prefix?: ReactNode;
  suffix?: string;
  precision?: number;
  loading?: boolean;
  trend?: number;
  subValue?: string;
  color?: 'blue' | 'purple' | 'green' | 'orange' | 'pink';
}

const colorMap = {
  blue: { bg: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)', shadow: '0 8px 32px rgba(59, 130, 246, 0.25)', light: '#eff6ff' },
  purple: { bg: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)', shadow: '0 8px 32px rgba(139, 92, 246, 0.25)', light: '#f5f3ff' },
  green: { bg: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)', shadow: '0 8px 32px rgba(16, 185, 129, 0.25)', light: '#ecfdf5' },
  orange: { bg: 'linear-gradient(135deg, #f59e0b 0%, #fb923c 100%)', shadow: '0 8px 32px rgba(245, 158, 11, 0.25)', light: '#fffbeb' },
  pink: { bg: 'linear-gradient(135deg, #ec4899 0%, #f472b6 100%)', shadow: '0 8px 32px rgba(236, 72, 153, 0.25)', light: '#fdf2f8' },
};

export default function StatsCard({ title, value, prefix, suffix, precision, loading, trend, subValue, color = 'blue' }: StatsCardProps) {
  const [animated, setAnimated] = useState(false);
  const colors = colorMap[color];

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div style={{
        height: 140,
        borderRadius: 20,
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
      }} />
    );
  }

  return (
    <div
      style={{
        padding: 24,
        borderRadius: 20,
        background: colors.light,
        border: '1px solid #e2e8f0',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        height: 140,
        display: 'flex',
        flexDirection: 'column',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = colors.shadow;
        e.currentTarget.style.border = '1px solid transparent';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.border = '1px solid #e2e8f0';
      }}
    >
      {/* 背景装饰 */}
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: 120,
        height: 120,
        background: colors.bg,
        opacity: 0.08,
        borderRadius: '0 20px 0 120px',
        filter: 'blur(40px)',
      }} />

      {/* 顶部标签 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <span style={{
          fontSize: 13,
          color: '#64748b',
          fontWeight: 500,
          letterSpacing: 0.5,
        }}>
          {title}
        </span>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: colors.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: colors.shadow,
        }}>
          {prefix}
        </div>
      </div>

      {/* 数值 */}
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 4,
      }}>
        <CountUp
          value={value}
          duration={1500}
          decimals={precision ?? 0}
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: '#1e293b',
            fontFamily: "'SF Pro Display', -apple-system, sans-serif",
          }}
        />
        {suffix && (
          <span style={{ fontSize: 14, color: '#94a3b8' }}>{suffix}</span>
        )}
      </div>

      {/* 趋势指示 */}
      {trend !== undefined && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 12,
        }}>
          <span style={{
            fontSize: 12,
            color: trend >= 0 ? '#10b981' : '#ef4444',
            fontWeight: 600,
          }}>
            {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
          </span>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>较上期</span>
        </div>
      )}

      {/* 副文本 */}
      {subValue && (
        <div style={{
          marginTop: 8,
          fontSize: 12,
          color: '#94a3b8',
        }}>
          {subValue}
        </div>
      )}
    </div>
  );
}
