import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
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
  successRate: number;
}

// 获取当前北京时间小时 (0-23)
function getCurrentBeijingHour(): number {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + 8 * 3600000).getHours();
}

// 生成时间轴标签
function generateTimeLabels(hourCount: number): { labels: string[]; slotHours: number[] } {
  const currentHour = getCurrentBeijingHour();
  const labels: string[] = [];
  const slotHours: number[] = [];

  for (let i = hourCount - 1; i >= 0; i--) {
    const hour = (currentHour - i + 24) % 24;
    slotHours.push(hour);
    if (i === hourCount - 1) {
      labels.push('现在');
    } else {
      labels.push(`${String(hour).padStart(2, '0')}`);
    }
  }

  return { labels, slotHours };
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
  const { labels, slotHours } = useMemo(() => generateTimeLabels(hourCount), [hourCount, mounted]);

  // 处理数据
  const heatmapData = useMemo(() => {
    // 按模型分组
    const modelMap: Record<string, Map<number, ProcessedCell>> = {};
    const modelTotals: Record<string, { requests: number; success: number }> = {};

    data.forEach(item => {
      const model = item.model_name;
      const beijingHour = Number(item.hour_of_day);
      const requestCount = Number(item.request_count || 0);
      const successCount = Number(item.success_count || 0);

      if (!modelMap[model]) {
        modelMap[model] = new Map();
        modelTotals[model] = { requests: 0, success: 0 };
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

      modelTotals[model].requests += requestCount;
      modelTotals[model].success += successCount;
    });

    // 转换为数组并排序（按总请求数降序）
    const rows: HeatmapRow[] = Object.keys(modelMap)
      .map(model => {
        const cells = slotHours.map(hour => {
          return modelMap[model].get(hour) || {
            requestCount: 0,
            successCount: 0,
            successRate: 0,
            failRate: 0,
          };
        });
        const totals = modelTotals[model];
        return {
          modelName: model,
          cells,
          totalRequests: totals.requests,
          successRate: totals.requests > 0 ? totals.success / totals.requests : 0,
        };
      })
      .filter(row => row.totalRequests > 0)
      .sort((a, b) => b.totalRequests - a.totalRequests)
      .slice(0, 12);

    return rows;
  }, [data, slotHours]);

  // 计算格子尺寸
  const labelWidth = 140;
  const availableWidth = containerWidth - labelWidth - 40;
  const gapSize = 3;
  const cellSize = Math.min(
    28,
    Math.max(16, (availableWidth - (hourCount - 1) * gapSize) / hourCount)
  );
  const totalWidth = labelWidth + hourCount * cellSize + (hourCount - 1) * gapSize + 20;

  // 渲染格子内容
  const renderCell = useCallback((cell: ProcessedCell, isHovered: boolean) => {
    const hasData = cell.requestCount > 0;
    if (!hasData) {
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: 'rgba(148, 163, 184, 0.08)',
            borderRadius: 4,
          }}
        />
      );
    }

    const successWidth = cell.successRate * 100;
    const failWidth = cell.failRate * 100;

    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          borderRadius: 4,
          overflow: 'hidden',
          transform: isHovered ? 'scale(1.15)' : 'scale(1)',
          transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
          boxShadow: isHovered ? '0 8px 24px rgba(0, 0, 0, 0.25)' : 'none',
        }}
      >
        <div
          style={{
            width: `${successWidth}%`,
            height: '100%',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          }}
        />
        <div
          style={{
            width: `${failWidth}%`,
            height: '100%',
            background: 'linear-gradient(135deg, #f87171 0%, #dc2626 100%)',
          }}
        />
      </div>
    );
  }, []);

  if (!mounted || loading) {
    return (
      <div style={{
        height: 400,
        borderRadius: 20,
        background: 'rgba(255, 255, 255, 0.6)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.8)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#64748b',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 32,
            height: 32,
            border: '3px solid #e2e8f0',
            borderTopColor: '#6366f1',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 12px',
          }} />
          加载中...
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        borderRadius: 20,
        background: 'rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.9)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.06)',
        padding: 24,
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .heatmap-row {
          animation: fadeIn 0.4s ease-out forwards;
          opacity: 0;
        }
        .heatmap-row:nth-child(1) { animation-delay: 0ms; }
        .heatmap-row:nth-child(2) { animation-delay: 50ms; }
        .heatmap-row:nth-child(3) { animation-delay: 100ms; }
        .heatmap-row:nth-child(4) { animation-delay: 150ms; }
        .heatmap-row:nth-child(5) { animation-delay: 200ms; }
        .heatmap-row:nth-child(6) { animation-delay: 250ms; }
        .heatmap-row:nth-child(7) { animation-delay: 300ms; }
        .heatmap-row:nth-child(8) { animation-delay: 350ms; }
        .heatmap-row:nth-child(9) { animation-delay: 400ms; }
        .heatmap-row:nth-child(10) { animation-delay: 450ms; }
        .heatmap-row:nth-child(11) { animation-delay: 500ms; }
        .heatmap-row:nth-child(12) { animation-delay: 550ms; }
      `}</style>

      {/* 头部 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
      }}>
        <div>
          <h3 style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            background: 'linear-gradient(135deg, #1e293b 0%, #475569 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            模型可用性
          </h3>
          <p style={{
            margin: '6px 0 0',
            fontSize: 13,
            color: '#64748b',
          }}>
            实时监控 · 北京时间 · 绿色成功 / 红色失败
          </p>
        </div>

        <Segmented
          value={timeRange}
          onChange={(v) => onTimeRangeChange?.(v as 24 | 168)}
          options={[
            { label: '24小时', value: 24 },
            { label: '7天', value: 168 },
          ]}
          style={{ background: 'rgba(241, 245, 249, 0.8)' }}
        />
      </div>

      {/* 统计概览 */}
      <div style={{
        display: 'flex',
        gap: 16,
        marginBottom: 20,
        padding: '12px 16px',
        background: 'rgba(99, 102, 241, 0.05)',
        borderRadius: 12,
        border: '1px solid rgba(99, 102, 241, 0.1)',
      }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#6366f1' }}>
            {heatmapData.length}
          </div>
          <div style={{ fontSize: 11, color: '#64748b' }}>监控模型</div>
        </div>
        <div style={{
          width: 1,
          background: 'rgba(99, 102, 241, 0.2)',
          margin: '4px 0',
        }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981' }}>
            {heatmapData.reduce((s, r) => s + r.cells.reduce((ss, c) => ss + c.successCount, 0), 0).toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: '#64748b' }}>成功请求</div>
        </div>
        <div style={{
          width: 1,
          background: 'rgba(99, 102, 241, 0.2)',
          margin: '4px 0',
        }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b' }}>
            {(
              heatmapData.reduce((s, r) => s + r.totalRequests, 0) > 0
                ? (
                  heatmapData.reduce((s, r) => s + r.cells.reduce((ss, c) => ss + c.successCount, 0), 0) /
                  heatmapData.reduce((s, r) => s + r.totalRequests, 0) * 100
                )
                : 0
            ).toFixed(1)}%
          </div>
          <div style={{ fontSize: 11, color: '#64748b' }}>总成功率</div>
        </div>
      </div>

      {/* 热力图主体 */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: totalWidth }}>
          {/* X 轴标签 */}
          <div style={{
            display: 'flex',
            marginLeft: labelWidth,
            marginBottom: 8,
            gap: gapSize,
          }}>
            {labels.map((label, i) => (
              <div
                key={i}
                style={{
                  width: cellSize,
                  textAlign: 'center',
                  fontSize: 10,
                  fontFamily: 'SF Mono, Monaco, monospace',
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
            {heatmapData.map((row, rowIndex) => (
              <div
                key={row.modelName}
                className="heatmap-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: gapSize,
                }}
              >
                {/* 模型名称 */}
                <Tooltip title={
                  <div>
                    <div style={{ fontWeight: 600 }}>{row.modelName}</div>
                    <div style={{ fontSize: 11, opacity: 0.8 }}>
                      请求: {row.totalRequests.toLocaleString()}
                    </div>
                  </div>
                }
                placement="left"
                >
                  <div
                    style={{
                      width: labelWidth - 8,
                      fontSize: 12,
                      fontWeight: 500,
                      color: '#475569',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      paddingRight: 12,
                      cursor: 'default',
                    }}
                  >
                    {row.modelName.length > 18
                      ? row.modelName.substring(0, 18) + '...'
                      : row.modelName}
                  </div>
                </Tooltip>

                {/* 格子 */}
                <div style={{ display: 'flex', gap: gapSize }}>
                  {row.cells.map((cell, cellIndex) => {
                    const [isHovered, setIsHovered] = useState(false);
                    const hasData = cell.requestCount > 0;

                    return (
                      <Tooltip
                        key={cellIndex}
                        visible={isHovered}
                        title={
                          hasData ? (
                            <div style={{ padding: '4px 0' }}>
                              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                                {row.modelName}
                              </div>
                              <div style={{ fontSize: 11, marginBottom: 4 }}>
                                时间: {labels[cellIndex]}
                              </div>
                              <div style={{
                                fontSize: 11,
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 16,
                              }}>
                                <span>请求:</span>
                                <span style={{ fontWeight: 600 }}>{cell.requestCount}</span>
                              </div>
                              <div style={{
                                fontSize: 11,
                                color: '#10b981',
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 16,
                              }}>
                                <span>成功:</span>
                                <span style={{ fontWeight: 600 }}>{cell.successCount}</span>
                              </div>
                              <div style={{
                                fontSize: 11,
                                color: '#f87171',
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 16,
                              }}>
                                <span>失败:</span>
                                <span style={{ fontWeight: 600 }}>{cell.requestCount - cell.successCount}</span>
                              </div>
                              <div style={{
                                marginTop: 6,
                                padding: '4px 8px',
                                background: cell.successRate >= 0.9 ? 'rgba(16, 185, 129, 0.2)'
                                  : cell.successRate >= 0.5 ? 'rgba(245, 158, 11, 0.2)'
                                  : 'rgba(239, 68, 68, 0.2)',
                                borderRadius: 4,
                                textAlign: 'center',
                                fontWeight: 600,
                                color: cell.successRate >= 0.9 ? '#10b981'
                                  : cell.successRate >= 0.5 ? '#f59e0b'
                                  : '#ef4444',
                              }}>
                                {(cell.successRate * 100).toFixed(1)}% 成功
                              </div>
                            </div>
                          ) : (
                            <div style={{ padding: '4px 0', color: '#94a3b8' }}>
                              <div style={{ fontWeight: 600, marginBottom: 4 }}>{row.modelName}</div>
                              <div style={{ fontSize: 11 }}>{labels[cellIndex]}</div>
                              <div style={{ fontSize: 11, marginTop: 4 }}>无数据</div>
                            </div>
                          )
                        }
                        placement="top"
                      >
                        <div
                          style={{
                            width: cellSize,
                            height: cellSize,
                            cursor: 'pointer',
                          }}
                          onMouseEnter={() => setIsHovered(true)}
                          onMouseLeave={() => setIsHovered(false)}
                        >
                          {renderCell(cell, isHovered)}
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
        gap: 24,
        marginTop: 20,
        paddingTop: 16,
        borderTop: '1px solid rgba(148, 163, 184, 0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 20,
            height: 12,
            borderRadius: 3,
            background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
          }} />
          <span style={{ fontSize: 12, color: '#64748b' }}>成功</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 20,
            height: 12,
            borderRadius: 3,
            background: 'linear-gradient(90deg, #f87171 0%, #dc2626 100%)',
          }} />
          <span style={{ fontSize: 12, color: '#64748b' }}>失败</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 20,
            height: 12,
            borderRadius: 3,
            background: 'rgba(148, 163, 184, 0.15)',
            border: '1px dashed rgba(148, 163, 184, 0.3)',
          }} />
          <span style={{ fontSize: 12, color: '#64748b' }}>无数据</span>
        </div>
      </div>
    </div>
  );
}
