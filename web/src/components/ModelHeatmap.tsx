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
  successCount: number;
  failCount: number;
}

interface HeatmapRow {
  modelName: string;
  cells: ProcessedCell[];
  totalRequests: number;
}

// 获取当前北京时间
function getCurrentBeijingTime(): Date {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + 8 * 3600000);
}

export default function ModelHeatmap({
  data,
  loading,
  timeRange = 24,
  onTimeRangeChange
}: ModelHeatmapProps) {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

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
  const now = getCurrentBeijingTime();
  const currentHour = now.getHours();

  // 生成时间轴标签
  const labels = useMemo(() => {
    const result: string[] = [];
    for (let i = 0; i < hourCount; i++) {
      const hoursAgo = hourCount - 1 - i;
      if (hoursAgo === 0) {
        result.push('现在');
      } else {
        const hour = (currentHour - hoursAgo + 24) % 24;
        result.push(`${String(hour).padStart(2, '0')}`);
      }
    }
    return result;
  }, [hourCount, currentHour]);

  // 处理数据
  const heatmapData = useMemo(() => {
    const now = getCurrentBeijingTime();
    const currentHour = now.getHours();

    // 按模型分组
    const modelMap: Record<string, Map<number, ProcessedCell>> = {};
    const modelTotals: Record<string, number> = {};

    data.forEach(item => {
      const model = item.model_name;
      const beijingHour = Number(item.hour_of_day);
      const requestCount = Number(item.request_count || 0);
      const successCount = Number(item.success_count || 0);
      const failCount = requestCount - successCount;

      if (!modelMap[model]) {
        modelMap[model] = new Map();
        modelTotals[model] = 0;
      }

      // 根据北京时间小时计算槽索引
      const hoursAgo = (currentHour - beijingHour + 24) % 24;
      const slotIndex = hourCount - 1 - hoursAgo;

      if (slotIndex >= 0 && slotIndex < hourCount) {
        const existing = modelMap[model].get(slotIndex);
        if (existing) {
          existing.successCount += successCount;
          existing.failCount += failCount;
        } else {
          modelMap[model].set(slotIndex, { successCount, failCount });
        }
        modelTotals[model] += requestCount;
      }
    });

    // 转换为数组并排序
    const rows: HeatmapRow[] = Object.keys(modelMap)
      .map(model => {
        const cells: ProcessedCell[] = [];
        for (let i = 0; i < hourCount; i++) {
          const cell = modelMap[model].get(i);
          cells.push(cell || { successCount: 0, failCount: 0 });
        }
        return {
          modelName: model,
          cells,
          totalRequests: modelTotals[model],
        };
      })
      .filter(row => row.totalRequests > 0)
      .sort((a, b) => b.totalRequests - a.totalRequests)
      .slice(0, 8);

    return rows;
  }, [data, hourCount]);

  // 计算自适应尺寸
  const labelWidth = 100;
  const gapSize = 2;
  const availableWidth = containerWidth - labelWidth - 24;
  const cellSize = Math.max(8, Math.min(20, (availableWidth - (hourCount - 1) * gapSize) / hourCount));
  const totalWidth = labelWidth + hourCount * cellSize + (hourCount - 1) * gapSize + 12;

  // 点的大小
  const dotSize = Math.max(4, cellSize * 0.3);
  const dotGap = 1;

  if (!mounted || loading) {
    return (
      <div style={{
        height: 300,
        borderRadius: 12,
        background: '#fff',
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

  // 统计
  const totalSuccess = heatmapData.reduce(
    (s, r) => s + r.cells.reduce((ss, c) => ss + c.successCount, 0), 0
  );
  const totalFail = heatmapData.reduce(
    (s, r) => s + r.cells.reduce((ss, c) => ss + c.failCount, 0), 0
  );
  const totalRequests = totalSuccess + totalFail;
  const successRate = totalRequests > 0 ? (totalSuccess / totalRequests * 100).toFixed(1) : '0.0';

  // 计算每个格子能显示多少个点
  const dotsPerRow = Math.max(1, Math.floor((cellSize - 4) / (dotSize + dotGap)));
  const maxRows = Math.max(1, Math.floor((cellSize - 4) / (dotSize + dotGap)));
  const maxDots = dotsPerRow * maxRows;

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        borderRadius: 12,
        background: '#fff',
        border: '1px solid #e2e8f0',
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      {/* 头部 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1e293b' }}>
            模型可用性
          </h3>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
            <span style={{ color: '#22c55e' }}>● {totalSuccess.toLocaleString()}</span>
            <span style={{ color: '#ef4444' }}>● {totalFail.toLocaleString()}</span>
            <span style={{ color: '#64748b' }}>{successRate}%</span>
          </div>
          <Segmented
            value={timeRange}
            onChange={(v) => onTimeRangeChange?.(v as 24 | 168)}
            options={[
              { label: '24H', value: 24 },
              { label: '7D', value: 168 },
            ]}
            size="small"
          />
        </div>
      </div>

      {/* 热力图主体 */}
      <div style={{ width: '100%', overflow: 'hidden' }}>
        {/* X 轴标签 */}
        <div style={{
          display: 'flex',
          marginLeft: labelWidth,
          marginBottom: 4,
          gap: gapSize,
        }}>
          {labels.map((label, i) => (
            <div
              key={i}
              style={{
                width: cellSize,
                textAlign: 'center',
                fontSize: 8,
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
              <Tooltip title={`${row.modelName} (${row.totalRequests.toLocaleString()})`}>
                <div
                  style={{
                    width: labelWidth - 4,
                    fontSize: 10,
                    color: '#475569',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    paddingRight: 4,
                  }}
                >
                  {row.modelName.length > 14
                    ? row.modelName.substring(0, 14) + '...'
                    : row.modelName}
                </div>
              </Tooltip>

              {/* 格子 */}
              <div style={{ display: 'flex', gap: gapSize }}>
                {row.cells.map((cell, i) => {
                  const total = cell.successCount + cell.failCount;
                  const hasData = total > 0;

                  return (
                    <Tooltip
                      key={i}
                      title={
                        hasData ? (
                          <div style={{ fontSize: 10 }}>
                            <div style={{ fontWeight: 600 }}>{row.modelName}</div>
                            <div>{labels[i]}</div>
                            <div style={{ color: '#22c55e' }}>成功: {cell.successCount}</div>
                            <div style={{ color: '#ef4444' }}>失败: {cell.failCount}</div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>
                            <div>{row.modelName}</div>
                            <div>{labels[i]}</div>
                            <div>无数据</div>
                          </div>
                        )
                      }
                    >
                      <div
                        style={{
                          width: cellSize,
                          height: cellSize,
                          borderRadius: 3,
                          background: hasData ? '#f8fafc' : '#f1f5f9',
                          border: '1px solid #e2e8f0',
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignContent: 'center',
                          justifyContent: 'center',
                          padding: 2,
                          gap: dotGap,
                          cursor: 'pointer',
                        }}
                      >
                        {hasData && (
                          <>
                            {Array.from({ length: Math.min(cell.successCount, maxDots) }).map((_, j) => (
                              <div
                                key={`s-${j}`}
                                style={{
                                  width: dotSize,
                                  height: dotSize,
                                  borderRadius: '50%',
                                  background: '#22c55e',
                                }}
                              />
                            ))}
                            {Array.from({ length: Math.min(cell.failCount, maxDots - Math.min(cell.successCount, maxDots)) }).map((_, j) => (
                              <div
                                key={`f-${j}`}
                                style={{
                                  width: dotSize,
                                  height: dotSize,
                                  borderRadius: '50%',
                                  background: '#ef4444',
                                }}
                              />
                            ))}
                            {total > maxDots && (
                              <div style={{
                                fontSize: 6,
                                color: '#94a3b8',
                                width: '100%',
                                textAlign: 'center',
                              }}>
                                +{total - maxDots}
                              </div>
                            )}
                          </>
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

      {/* 图例 */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 16,
        marginTop: 12,
        paddingTop: 8,
        borderTop: '1px solid #f1f5f9',
        fontSize: 10,
        color: '#64748b',
      }}>
        <span><span style={{ color: '#22c55e' }}>●</span> 成功</span>
        <span><span style={{ color: '#ef4444' }}>●</span> 失败</span>
        <span>● 1个请求</span>
      </div>
    </div>
  );
}
