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

// 生成时间轴
function generateTimeAxis(hourCount: number): {
  labels: string[];
  startTimestamps: number[];
  endTimestamps: number[];
  slotHours: number[]; // 每个槽对应的北京时间小时
} {
  const now = getCurrentBeijingTime();
  const currentTs = Math.floor(now.getTime() / 1000);
  const currentHour = now.getHours();

  const labels: string[] = [];
  const startTimestamps: number[] = [];
  const endTimestamps: number[] = [];
  const slotHours: number[] = [];

  // 每个格子代表多少秒
  const slotSeconds = (24 * 3600) / hourCount;

  for (let i = 0; i < hourCount; i++) {
    // 索引 i 代表：从现在往前 (hourCount - i) * slotSeconds 秒 到 (hourCount - i - 1) * slotSeconds 秒
    const slotsFromNow = hourCount - i;
    const endTs = currentTs - (slotsFromNow - 1) * slotSeconds;
    const startTs = currentTs - slotsFromNow * slotSeconds;

    startTimestamps.push(startTs);
    endTimestamps.push(endTs);

    // 计算这个槽对应的北京时间小时
    const slotDate = new Date(startTs * 1000);
    const slotHour = slotDate.getHours();
    slotHours.push(slotHour);

    // 标签
    if (i === hourCount - 1) {
      labels.push('现在');
    } else {
      labels.push(`${String(slotHour).padStart(2, '0')}`);
    }
  }

  return { labels, startTimestamps, endTimestamps, slotHours };
}

export default function ModelHeatmap({
  data,
  loading,
  timeRange = 24,
  onTimeRangeChange
}: ModelHeatmapProps) {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(900);

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
  const { labels, startTimestamps, endTimestamps, slotHours } = useMemo(
    () => generateTimeAxis(hourCount),
    [hourCount, mounted]
  );

  // 处理数据：将请求映射到时间槽
  const heatmapData = useMemo(() => {
    const now = getCurrentBeijingTime();
    const currentTs = Math.floor(now.getTime() / 1000);
    const slotSeconds = (24 * 3600) / hourCount;

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

      // 根据北京时间小时计算这个数据应该放在哪个槽
      // 槽索引 = hourCount - 1 - ((currentHour - beijingHour + 24) % 24)
      const now = getCurrentBeijingTime();
      const currentHour = now.getHours();
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
      .slice(0, 10);

    return rows;
  }, [data, hourCount]);

  // 计算格子尺寸
  const labelWidth = 130;
  const availableWidth = containerWidth - labelWidth - 40;
  const gapSize = 4;
  const cellWidth = Math.max(24, Math.min(40, (availableWidth - (hourCount - 1) * gapSize) / hourCount));
  const cellHeight = 28;
  const dotSize = 6;
  const dotGap = 2;

  if (!mounted || loading) {
    return (
      <div style={{
        height: 380,
        borderRadius: 16,
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
            绿色=成功 · 红色=失败 · 每个点代表一个请求
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#64748b' }}>
            <span>
              <span style={{ color: '#22c55e' }}>●</span> {totalSuccess.toLocaleString()}
            </span>
            <span>
              <span style={{ color: '#ef4444' }}>●</span> {totalFail.toLocaleString()}
            </span>
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
      </div>

      {/* 热力图主体 */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: labelWidth + hourCount * (cellWidth + gapSize) }}>
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
                  width: cellWidth,
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
                <Tooltip title={`${row.modelName} (${row.totalRequests.toLocaleString()} 请求)`}>
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
                    {row.modelName.length > 16
                      ? row.modelName.substring(0, 16) + '...'
                      : row.modelName}
                  </div>
                </Tooltip>

                {/* 格子 */}
                <div style={{ display: 'flex', gap: gapSize }}>
                  {row.cells.map((cell, i) => {
                    const total = cell.successCount + cell.failCount;
                    const hasData = total > 0;
                    const timeLabel = labels[i];

                    // 计算可以放多少个点
                    const maxDotsPerRow = Math.floor((cellWidth - dotSize) / (dotSize + dotGap));
                    const maxRows = Math.floor((cellHeight - dotSize) / (dotSize + dotGap));
                    const maxDots = maxDotsPerRow * maxRows;

                    // 成功和失败的比例
                    const successRatio = hasData ? cell.successCount / total : 0;
                    const failRatio = hasData ? cell.failCount / total : 0;

                    // 如果点太多，需要缩小点的大小或只显示部分
                    const showExact = total <= maxDots;
                    const successDots = showExact ? cell.successCount : Math.round(successRatio * maxDots);
                    const failDots = showExact ? cell.failCount : maxDots - successDots;

                    const tooltipContent = hasData ? (
                      <div style={{ fontSize: 11 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{row.modelName}</div>
                        <div>时间: {timeLabel}</div>
                        <div>
                          <span style={{ color: '#22c55e' }}>● 成功:</span> {cell.successCount}
                        </div>
                        <div>
                          <span style={{ color: '#ef4444' }}>● 失败:</span> {cell.failCount}
                        </div>
                        {total > maxDots && (
                          <div style={{ color: '#94a3b8', fontSize: 10 }}>
                            (共 {total} 请求)
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        <div>{row.modelName}</div>
                        <div>{timeLabel}</div>
                        <div>无数据</div>
                      </div>
                    );

                    return (
                      <Tooltip key={i} title={tooltipContent} placement="top">
                        <div
                          style={{
                            width: cellWidth,
                            height: cellHeight,
                            borderRadius: 4,
                            background: hasData ? '#f8fafc' : '#f1f5f9',
                            border: '1px solid #e2e8f0',
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignContent: 'flex-start',
                            padding: 2,
                            gap: dotGap,
                            cursor: 'pointer',
                            transition: 'border-color 0.15s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = '#6366f1';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = '#e2e8f0';
                          }}
                        >
                          {hasData && (
                            <>
                              {/* 绿色点 */}
                              {Array.from({ length: Math.min(successDots, 12) }).map((_, j) => (
                                <div
                                  key={`s-${j}`}
                                  style={{
                                    width: dotSize,
                                    height: dotSize,
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                  }}
                                />
                              ))}
                              {/* 红色点 */}
                              {Array.from({ length: Math.min(failDots, 12 - successDots) }).map((_, j) => (
                                <div
                                  key={`f-${j}`}
                                  style={{
                                    width: dotSize,
                                    height: dotSize,
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #f87171, #dc2626)',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                  }}
                                />
                              ))}
                              {/* 如果点太多，显示数字 */}
                              {total > 24 && (
                                <div
                                  style={{
                                    fontSize: 8,
                                    color: '#64748b',
                                    width: '100%',
                                    textAlign: 'center',
                                    marginTop: 2,
                                  }}
                                >
                                  +{total - 24}
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
      </div>

      {/* 图例 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 16,
        paddingTop: 12,
        borderTop: '1px solid #f1f5f9',
      }}>
        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#64748b' }}>
          <span>每个点 = 1个请求</span>
          <span>共 {heatmapData.length} 个模型</span>
        </div>
        <div style={{ fontSize: 11 }}>
          <span style={{ color: '#64748b' }}>成功率: </span>
          <span style={{
            color: Number(successRate) >= 90 ? '#22c55e' : Number(successRate) >= 50 ? '#f59e0b' : '#ef4444',
            fontWeight: 600
          }}>
            {successRate}%
          </span>
        </div>
      </div>
    </div>
  );
}
