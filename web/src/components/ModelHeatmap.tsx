import { useEffect, useState, useMemo, useRef } from 'react';
import { Segmented, Tooltip } from 'antd';
import type { HeatmapCell } from '../api';

interface ModelHeatmapProps {
  data: HeatmapCell[];
  loading?: boolean;
  timeRange?: 24 | 168;
  onTimeRangeChange?: (range: 24 | 168) => void;
}

interface ProcessedCell {
  requestCount: number;
  successCount: number;
  successRate: number;
  failRate: number;
}

interface HeatmapRow {
  modelName: string;
  cells: ProcessedCell[];
  totalRequests: number;
}

// 获取当前北京时间
function getCurrentBeijingTime(): { hour: number; minute: number } {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const beijing = new Date(utc + 8 * 3600000);
  return {
    hour: beijing.getHours(),
    minute: beijing.getMinutes(),
  };
}

// 获取当前北京时间戳（秒）
function getCurrentBeijingTimestamp(): number {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const beijing = new Date(utc + 8 * 3600000);
  return Math.floor(beijing.getTime() / 1000);
}

// 生成时间轴标签和对应的时间戳
function generateTimeAxis(hourCount: number): {
  labels: string[];
  beijingHours: number[];
  hoursAgo: number[];
} {
  const { hour: currentHour, minute } = getCurrentBeijingTime();
  const labels: string[] = [];
  const beijingHours: number[] = [];
  const hoursAgo: number[] = [];

  // 从最旧的时间点到最近的时间点
  // 索引 0 = 最旧的（hourCount 小时前）
  // 索引 hourCount-1 = 最近的（现在）
  for (let i = 0; i < hourCount; i++) {
    // 这个位置代表"多少小时前"
    const ago = hourCount - 1 - i;
    hoursAgo.push(ago);

    // 从"多少小时前"反推对应的小时
    const hour = (currentHour - ago + 24) % 24;
    beijingHours.push(hour);

    // 标签
    if (ago === 0) {
      labels.push('现在');
    } else {
      labels.push(`${String(hour).padStart(2, '0')}`);
    }
  }

  return { labels, beijingHours, hoursAgo };
}

export default function ModelHeatmap({
  data,
  loading,
  timeRange = 24,
  onTimeRangeChange
}: ModelHeatmapProps) {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    setMounted(true);
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const hourCount = timeRange;
  const { labels, beijingHours, hoursAgo } = useMemo(
    () => generateTimeAxis(hourCount),
    [hourCount, mounted]
  );
  const currentBeijingHour = getCurrentBeijingTime().hour;

  // 处理数据
  const heatmapData = useMemo(() => {
    // 按模型分组
    const modelMap: Record<string, Map<number, ProcessedCell>> = {};
    const modelTotals: Record<string, number> = {};

    data.forEach(item => {
      const model = item.model_name;
      const beijingHour = Number(item.hour_of_day);
      const requestCount = Number(item.request_count || 0);
      const successCount = Number(item.success_count || 0);

      if (!modelMap[model]) {
        modelMap[model] = new Map();
        modelTotals[model] = 0;
      }

      const existing = modelMap[model].get(beijingHour);
      if (existing) {
        existing.requestCount += requestCount;
        existing.successCount += successCount;
        existing.successRate = existing.requestCount > 0
          ? existing.successCount / existing.requestCount : 0;
        existing.failRate = 1 - existing.successRate;
      } else {
        modelMap[model].set(beijingHour, {
          requestCount,
          successCount,
          successRate: requestCount > 0 ? successCount / requestCount : 0,
          failRate: requestCount > 0 ? (requestCount - successCount) / requestCount : 0,
        });
      }

      modelTotals[model] += requestCount;
    });

    // 转换为数组并排序
    const rows: HeatmapRow[] = Object.keys(modelMap)
      .map(model => {
        // 为每个时间槽填充数据
        const cells = beijingHours.map((hour, i) => {
          const cell = modelMap[model].get(hour);
          return cell || { requestCount: 0, successCount: 0, successRate: 0, failRate: 0 };
        });

        return {
          modelName: model,
          cells,
          totalRequests: modelTotals[model],
        };
      })
      .filter(row => row.totalRequests > 0)
      .sort((a, b) => b.totalRequests - a.totalRequests)
      .slice(0, 10);

    return rows;
  }, [data, beijingHours]);

  // 计算格子尺寸
  const labelWidth = 140;
  const availableWidth = containerWidth - labelWidth - 40;
  const gapSize = 3;
  const cellSize = Math.min(
    32,
    Math.max(18, (availableWidth - (hourCount - 1) * gapSize) / hourCount)
  );
  const totalWidth = labelWidth + hourCount * cellSize + (hourCount - 1) * gapSize + 20;

  if (!mounted || loading) {
    return (
      <div style={{
        height: 380,
        borderRadius: 16,
        background: 'rgba(248, 250, 252, 0.9)',
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

  // 计算统计
  const totalSuccess = heatmapData.reduce(
    (s, r) => s + r.cells.reduce((ss, c) => ss + c.successCount, 0), 0
  );
  const totalRequests = heatmapData.reduce(
    (s, r) => s + r.cells.reduce((ss, c) => ss + c.requestCount, 0), 0
  );
  const avgSuccessRate = totalRequests > 0 ? (totalSuccess / totalRequests * 100).toFixed(1) : '0.0';

  return (
    <div
      ref={containerRef}
      style={{
        borderRadius: 16,
        background: '#fff',
        border: '1px solid #e2e8f0',
        padding: 20,
      }}
    >
      {/* 头部 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1e293b' }}>
            模型可用性
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
            北京时间 · 绿色成功 / 红色失败 · 共 {totalRequests.toLocaleString()} 请求
          </p>
        </div>

        <Segmented
          value={timeRange}
          onChange={(v) => onTimeRangeChange?.(v as 24 | 168)}
          options={[
            { label: '24小时', value: 24 },
            { label: '7天', value: 168 },
          ]}
          size="small"
        />
      </div>

      {/* 热力图主体 */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: totalWidth }}>
          {/* X 轴标签 */}
          <div style={{
            display: 'flex',
            marginLeft: labelWidth,
            marginBottom: 6,
            gap: gapSize,
          }}>
            {labels.map((label, i) => (
              <div
                key={i}
                style={{
                  width: cellSize,
                  textAlign: 'center',
                  fontSize: 9,
                  fontFamily: 'monospace',
                  color: label === '现在' ? '#6366f1' : '#94a3b8',
                  fontWeight: label === '现在' ? 600 : 400,
                }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* 行 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: gapSize }}>
            {heatmapData.map((row) => (
              <div
                key={row.modelName}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: gapSize,
                }}
              >
                {/* 模型名称 */}
                <Tooltip
                  title={row.modelName}
                  placement="left"
                >
                  <div
                    style={{
                      width: labelWidth - 8,
                      fontSize: 11,
                      color: '#475569',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      paddingRight: 8,
                    }}
                  >
                    {row.modelName.length > 18
                      ? row.modelName.substring(0, 18) + '...'
                      : row.modelName}
                  </div>
                </Tooltip>

                {/* 格子 */}
                <div style={{ display: 'flex', gap: gapSize }}>
                  {row.cells.map((cell, i) => {
                    const hasData = cell.requestCount > 0;
                    const successWidth = cell.successRate * 100;
                    const failWidth = cell.failRate * 100;
                    const timeLabel = labels[i];

                    return (
                      <Tooltip
                        key={i}
                        title={
                          hasData ? (
                            <div style={{ fontSize: 11 }}>
                              <div style={{ fontWeight: 600, marginBottom: 4 }}>{row.modelName}</div>
                              <div>时间: {timeLabel}</div>
                              <div>请求: {cell.requestCount}</div>
                              <div style={{ color: '#10b981' }}>成功: {cell.successCount}</div>
                              <div style={{ color: '#f87171' }}>失败: {cell.requestCount - cell.successCount}</div>
                              <div style={{
                                marginTop: 4,
                                fontWeight: 600,
                                color: cell.successRate >= 0.9 ? '#10b981' : cell.successRate >= 0.5 ? '#f59e0b' : '#ef4444'
                              }}>
                                成功率: {(cell.successRate * 100).toFixed(1)}%
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                              <div>{row.modelName}</div>
                              <div>{timeLabel}</div>
                              <div>无数据</div>
                            </div>
                          )
                        }
                        placement="top"
                      >
                        <div
                          style={{
                            width: cellSize,
                            height: cellSize,
                            borderRadius: 4,
                            overflow: 'hidden',
                            background: hasData ? undefined : '#f1f5f9',
                            cursor: 'pointer',
                            transition: 'transform 0.15s, box-shadow 0.15s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'scale(1.15)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >
                          {hasData && (
                            <div style={{ width: '100%', height: '100%', display: 'flex' }}>
                              <div
                                style={{
                                  width: `${successWidth}%`,
                                  height: '100%',
                                  background: 'linear-gradient(180deg, #22c55e 0%, #16a34a 100%)',
                                }}
                              />
                              <div
                                style={{
                                  width: `${failWidth}%`,
                                  height: '100%',
                                  background: 'linear-gradient(180deg, #f87171 0%, #dc2626 100%)',
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 图例 */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 20,
        marginTop: 16,
        paddingTop: 12,
        borderTop: '1px solid #f1f5f9',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 16,
            height: 16,
            borderRadius: 3,
            background: 'linear-gradient(180deg, #22c55e 0%, #16a34a 100%)',
          }} />
          <span style={{ fontSize: 11, color: '#64748b' }}>成功</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 16,
            height: 16,
            borderRadius: 3,
            background: 'linear-gradient(180deg, #f87171 0%, #dc2626 100%)',
          }} />
          <span style={{ fontSize: 11, color: '#64748b' }}>失败</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 16,
            height: 16,
            borderRadius: 3,
            background: '#f1f5f9',
          }} />
          <span style={{ fontSize: 11, color: '#64748b' }}>无数据</span>
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>
          成功率 {avgSuccessRate}%
        </div>
      </div>
    </div>
  );
}
