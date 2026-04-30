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

  useEffect(() => {
    setMounted(true);
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

    const rows: HeatmapRow[] = Object.keys(modelMap)
      .map(model => {
        const cells: ProcessedCell[] = [];
        for (let i = 0; i < hourCount; i++) {
          const cell = modelMap[model].get(i);
          cells.push(cell || { successCount: 0, failCount: 0 });
        }
        return { modelName: model, cells, totalRequests: modelTotals[model] };
      })
      .filter(row => row.totalRequests > 0)
      .sort((a, b) => b.totalRequests - a.totalRequests)
      .slice(0, 10);

    return rows;
  }, [data, hourCount]);

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

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        borderRadius: 12,
        background: '#fff',
        border: '1px solid #e2e8f0',
        padding: '12px 16px',
        boxSizing: 'border-box',
      }}
    >
      {/* 头部 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>
          模型可用性
        </span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            <span style={{ color: '#22c55e' }}>●{totalSuccess.toLocaleString()}</span>
            {' '}
            <span style={{ color: '#ef4444' }}>●{totalFail.toLocaleString()}</span>
            {' '}
            <span style={{ fontWeight: 600 }}>{successRate}%</span>
          </span>
          <Segmented
            value={timeRange}
            onChange={(v) => onTimeRangeChange?.(v as 24 | 168)}
            options={[{ label: '24H', value: 24 }, { label: '7D', value: 168 }]}
            size="small"
          />
        </div>
      </div>

      {/* 热力图 - 使用 CSS Grid 真正占满宽度 */}
      <div
        ref={containerRef}
        style={{
          display: 'grid',
          gridTemplateColumns: `minmax(80px, auto) repeat(${hourCount}, 1fr)`,
          gap: 2,
          width: '100%',
        }}
      >
        {/* X 轴标签行 */}
        <div /> {/* 模型名列占位 */}
        {labels.map((label, i) => (
          <div
            key={i}
            style={{
              textAlign: 'center',
              fontSize: 8,
              fontFamily: 'monospace',
              color: label === '现在' ? '#6366f1' : '#94a3b8',
              fontWeight: label === '现在' ? 600 : 400,
              padding: '2px 0',
            }}
          >
            {label}
          </div>
        ))}

        {/* 数据行 */}
        {heatmapData.map((row) => (
          <>
            {/* 模型名称 */}
            <Tooltip title={`${row.modelName} (${row.totalRequests.toLocaleString()})`}>
              <div
                style={{
                  fontSize: 10,
                  color: '#475569',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  paddingRight: 8,
                }}
              >
                {row.modelName.length > 12
                  ? row.modelName.substring(0, 12) + '...'
                  : row.modelName}
              </div>
            </Tooltip>

            {/* 格子 */}
            {row.cells.map((cell, i) => {
              const total = cell.successCount + cell.failCount;
              const hasData = total > 0;
              const successWidth = hasData ? (cell.successCount / total * 100) : 0;

              return (
                <Tooltip
                  key={i}
                  title={
                    hasData ? (
                      <div style={{ fontSize: 10 }}>
                        <div>{row.modelName} {labels[i]}</div>
                        <div style={{ color: '#22c55e' }}>成功: {cell.successCount}</div>
                        <div style={{ color: '#ef4444' }}>失败: {cell.failCount}</div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>
                        {row.modelName} {labels[i]} 无数据
                      </div>
                    )
                  }
                >
                  <div
                    style={{
                      height: '100%',
                      minHeight: 24,
                      borderRadius: 3,
                      overflow: 'hidden',
                      display: 'flex',
                      cursor: 'pointer',
                      background: hasData ? '#f1f5f9' : 'transparent',
                    }}
                  >
                    {hasData ? (
                      <>
                        <div
                          style={{
                            width: `${successWidth}%`,
                            height: '100%',
                            background: 'linear-gradient(180deg, #22c55e 0%, #16a34a 100%)',
                          }}
                        />
                        <div
                          style={{
                            width: `${100 - successWidth}%`,
                            height: '100%',
                            background: 'linear-gradient(180deg, #f87171 0%, #dc2626 100%)',
                          }}
                        />
                      </>
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          border: '1px dashed #e2e8f0',
                          borderRadius: 3,
                        }}
                      />
                    )}
                  </div>
                </Tooltip>
              );
            })}
          </>
        ))}
      </div>

      {/* 图例 */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 16,
        marginTop: 10,
        paddingTop: 8,
        borderTop: '1px solid #f1f5f9',
        fontSize: 10,
        color: '#64748b',
      }}>
        <span><span style={{ color: '#22c55e' }}>■</span> 成功</span>
        <span><span style={{ color: '#ef4444' }}>■</span> 失败</span>
        <span style={{ border: '1px dashed #e2e8f0', padding: '0 4px', borderRadius: 2 }}>无数据</span>
      </div>
    </div>
  );
}
