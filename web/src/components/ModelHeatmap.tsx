import { useEffect, useState, useMemo } from 'react';
import { Segmented } from 'antd';
import type { HeatmapCell } from '../api';

interface ModelHeatmapProps {
  data: HeatmapCell[];
  loading?: boolean;
  timeRange?: 24 | 168;
  onTimeRangeChange?: (range: 24 | 168) => void;
}

// 计算 UTC 小时对应的北京时间小时
function utcToBeijingHour(utcHour: number): number {
  return (utcHour + 8) % 24;
}

// 获取当前北京时间小时 (0-23)
function getCurrentBeijingHour(): number {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + 8 * 3600000).getHours();
}

interface CellData {
  requestCount: number;
  successCount: number;
  successRate: number;
}

export default function ModelHeatmap({ data, loading, timeRange = 24, onTimeRangeChange }: ModelHeatmapProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 统一获取当前北京时间，只计算一次
  const currentBeijingHour = useMemo(() => getCurrentBeijingHour(), [mounted, loading]);
  const hourCount = timeRange;

  // 预计算所有时间槽的北京时间
  const timeSlots = useMemo(() => {
    const slots: number[] = [];
    for (let i = hourCount - 1; i >= 0; i--) {
      // 索引 i 对应的小时：索引 0 = 最旧的小时，索引 hourCount-1 = 最近的小时
      const slotHour = (currentBeijingHour - i + 24) % 24;
      slots.push(slotHour);
    }
    return slots;
  }, [currentBeijingHour, hourCount]);

  // 预计算 x 轴标签
  const labels = useMemo(() => {
    return timeSlots.map((hour, i) => {
      if (i === hourCount - 1) return '现在';
      return `${String(hour).padStart(2, '0')}:00`;
    });
  }, [timeSlots, hourCount]);

  // 按模型分组并统计
  const { modelGroups, modelRequestCounts } = useMemo(() => {
    const groups: Record<string, Map<number, CellData>> = {};
    const counts: Record<string, number> = {};

    data.forEach(item => {
      const model = item.model_name;
      const utcHour = Number(item.hour_of_day);
      const beijingHour = utcToBeijingHour(utcHour);
      const requestCount = Number(item.request_count || 0);
      const successCount = Number(item.success_count || 0);

      if (!groups[model]) {
        groups[model] = new Map();
      }

      // 累加到对应的小时槽
      const existing = groups[model].get(beijingHour);
      if (existing) {
        existing.requestCount += requestCount;
        existing.successCount += successCount;
        existing.successRate = existing.requestCount > 0 ? existing.successCount / existing.requestCount : 0;
      } else {
        groups[model].set(beijingHour, {
          requestCount,
          successCount,
          successRate: requestCount > 0 ? successCount / requestCount : 0,
        });
      }

      counts[model] = (counts[model] || 0) + requestCount;
    });

    return { modelGroups: groups, modelRequestCounts: counts };
  }, [data]);

  // 按请求数降序排序
  const sortedModels = useMemo(() => {
    return Object.keys(modelGroups)
      .sort((a, b) => (modelRequestCounts[b] || 0) - (modelRequestCounts[a] || 0))
      .slice(0, 15);
  }, [modelGroups, modelRequestCounts]);

  // 构建热力图数据
  const heatmapData = useMemo(() => {
    return sortedModels.map(model => {
      const modelMap = modelGroups[model];

      const cells: CellData[] = timeSlots.map(slotHour => {
        const cell = modelMap.get(slotHour);
        if (cell) {
          return cell;
        }
        return { requestCount: 0, successCount: 0, successRate: 0 };
      });

      return {
        model,
        cells,
        totalRequests: modelRequestCounts[model] || 0,
      };
    });
  }, [sortedModels, modelGroups, timeSlots, modelRequestCounts]);

  if (!mounted || loading) {
    return (
      <div style={{
        height: 300,
        borderRadius: 16,
        background: '#f8fafc',
        border: '#e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94a3b8',
      }}>
        加载中...
      </div>
    );
  }

  const cellSize = 32;
  const cellGap = 4;
  const labelWidth = 120;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1e293b' }}>模型可用性</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
            北京时间 · 绿色=成功 · 红色=失败
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Segmented
            value={timeRange}
            onChange={(v) => onTimeRangeChange?.(v as 24 | 168)}
            options={[
              { label: '24小时', value: 24 },
              { label: '7天', value: 168 },
            ]}
            size="small"
          />
          <div style={{ display: 'flex', gap: 12, fontSize: 11, marginLeft: 8 }}>
            <span style={{ color: '#22c55e' }}>■ 成功</span>
            <span style={{ color: '#ef4444' }}>■ 失败</span>
            <span style={{ color: '#e2e8f0' }}>■ 无数据</span>
          </div>
        </div>
      </div>

      {/* X 轴标签 */}
      <div style={{ display: 'flex', marginLeft: labelWidth, marginBottom: 8, gap: cellGap }}>
        {labels.map((label, i) => (
          <div
            key={i}
            style={{
              width: cellSize,
              textAlign: 'center',
              fontSize: 10,
              color: '#64748b',
              fontFamily: 'monospace',
            }}
          >
            {label}
          </div>
        ))}
      </div>

      {/* 热力图主体 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: cellGap }}>
        {heatmapData.map(({ model, cells, totalRequests }) => (
          <div key={model} style={{ display: 'flex', alignItems: 'center' }}>
            {/* 模型名称 */}
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
              title={`${model} (${totalRequests} 请求)`}
            >
              {model.length > 16 ? model.substring(0, 16) + '...' : model}
            </div>

            {/* 格子 */}
            <div style={{ display: 'flex', gap: cellGap }}>
              {cells.map((cell, i) => {
                const rate = cell.successRate;
                const hasData = cell.requestCount > 0;
                const successWidth = rate * 100;
                const failWidth = (1 - rate) * 100;

                return (
                  <div
                    key={i}
                    title={hasData
                      ? `${model}\n${labels[i]}\n请求: ${cell.requestCount}\n成功: ${cell.successCount}\n成功率: ${(rate * 100).toFixed(1)}%`
                      : `${model}\n${labels[i]}\n无数据`}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      borderRadius: 6,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      display: 'flex',
                      background: hasData ? undefined : '#f1f5f9',
                      border: '1px solid #e2e8f0',
                      transition: 'transform 0.15s, box-shadow 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.1)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                      e.currentTarget.style.zIndex = '10';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.zIndex = '0';
                    }}
                  >
                    {hasData ? (
                      <>
                        <div
                          style={{
                            width: `${successWidth}%`,
                            height: '100%',
                            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                            transition: 'width 0.3s',
                          }}
                        />
                        <div
                          style={{
                            width: `${failWidth}%`,
                            height: '100%',
                            background: 'linear-gradient(135deg, #f87171 0%, #ef4444 100%)',
                            transition: 'width 0.3s',
                          }}
                        />
                      </>
                    ) : (
                      <div style={{ width: '100%', height: '100%', background: '#f1f5f9' }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 统计信息 */}
      <div style={{ marginTop: 16, display: 'flex', gap: 16, fontSize: 11, color: '#64748b' }}>
        <span>显示 {sortedModels.length} 个模型</span>
        <span>总请求: {Object.values(modelRequestCounts).reduce((a, b) => a + b, 0).toLocaleString()}</span>
      </div>
    </div>
  );
}
