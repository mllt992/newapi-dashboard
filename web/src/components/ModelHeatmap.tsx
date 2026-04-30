import { useEffect, useState } from 'react';
import { Segmented } from 'antd';
import type { HeatmapCell } from '../api';

interface ModelHeatmapProps {
  data: HeatmapCell[];
  loading?: boolean;
  timeRange?: 24 | 168;
  onTimeRangeChange?: (range: 24 | 168) => void;
}

// 获取当前北京时间小时 (0-23)
function getCurrentBeijingHour(): number {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + 8 * 3600000).getHours();
}

// 计算 UTC 小时对应的北京时间小时
function utcToBeijingHour(utcHour: number): number {
  return (utcHour + 8) % 24;
}

// 生成 x 轴标签 (北京时间)
function generateHourLabels(count: number): string[] {
  const currentHour = getCurrentBeijingHour();
  const labels: string[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const hour = (currentHour - i + 24) % 24;
    if (i === 0) {
      labels.push('现在');
    } else {
      labels.push(`${String(hour).padStart(2, '0')}:00`);
    }
  }

  return labels;
}

interface CellData {
  modelName: string;
  beijingHour: number;
  requestCount: number;
  successCount: number;
  successRate: number;
}

export default function ModelHeatmap({ data, loading, timeRange = 24, onTimeRangeChange }: ModelHeatmapProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  // 按模型分组并计算统计数据
  const modelGroups = data.reduce((acc: Record<string, CellData[]>, item) => {
    const utcHour = Number(item.hour_of_day);
    const beijingHour = utcToBeijingHour(utcHour);
    const requestCount = Number(item.request_count || 0);
    const successCount = Number(item.success_count || 0);
    const successRate = requestCount > 0 ? successCount / requestCount : 0;

    if (!acc[item.model_name]) acc[item.model_name] = [];
    acc[item.model_name].push({
      modelName: item.model_name,
      beijingHour,
      requestCount,
      successCount,
      successRate,
    });
    return acc;
  }, {});

  // 计算每个模型的总请求数，用于排序
  const modelRequestCounts: Record<string, number> = {};
  Object.entries(modelGroups).forEach(([model, cells]) => {
    modelRequestCounts[model] = cells.reduce((sum, c) => sum + c.requestCount, 0);
  });

  // 按使用频率（总请求数）降序排序
  const sortedModelNames = Object.keys(modelGroups)
    .sort((a, b) => (modelRequestCounts[b] || 0) - (modelRequestCounts[a] || 0))
    .slice(0, 15);

  // 生成时间轴数据
  const hourCount = timeRange;
  const labels = generateHourLabels(hourCount);

  // 构建热力图矩阵
  const matrix: Map<string, Map<number, CellData>> = new Map();
  sortedModelNames.forEach(model => {
    const modelMap = new Map<number, CellData>();
    for (let i = 0; i < hourCount; i++) {
      // 计算每个位置对应的北京时间
      const currentBeijingHour = getCurrentBeijingHour();
      const beijingHour = (currentBeijingHour - (hourCount - 1 - i) + 24) % 24;
      modelMap.set(beijingHour, {
        modelName: model,
        beijingHour,
        requestCount: 0,
        successCount: 0,
        successRate: 0,
      });
    }
    matrix.set(model, modelMap);
  });

  // 填充数据
  sortedModelNames.forEach(model => {
    const cells = modelGroups[model];
    const modelMap = matrix.get(model)!;

    cells.forEach(cell => {
      const currentBeijingHour = getCurrentBeijingHour();
      const hoursAgo = (currentBeijingHour - cell.beijingHour + 24) % 24;

      if (hoursAgo < hourCount) {
        const index = (hourCount - 1 - hoursAgo + 24) % 24;
        const existing = modelMap.get(cell.beijingHour);
        if (existing && hoursAgo <= 23) {
          // 更新现有数据
          existing.requestCount += cell.requestCount;
          existing.successCount += cell.successCount;
          existing.successRate = existing.requestCount > 0 ? existing.successCount / existing.requestCount : 0;
        }
      }
    });
  });

  // 转换矩阵为数组格式便于渲染
  const heatmapData = sortedModelNames.map(model => {
    const modelMap = matrix.get(model)!;
    const hours: CellData[] = [];

    for (let i = 0; i < hourCount; i++) {
      const currentBeijingHour = getCurrentBeijingHour();
      const beijingHour = (currentBeijingHour - (hourCount - 1 - i) + 24) % 24;
      hours.push(modelMap.get(beijingHour)!);
    }

    return { model, hours, totalRequests: modelRequestCounts[model] || 0 };
  });

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
        {heatmapData.map(({ model, hours, totalRequests }) => (
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
              {hours.map((cell, i) => {
                const rate = cell.successRate;
                const hasData = cell.requestCount > 0;

                // 成功和失败的宽度百分比
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
                        {/* 成功部分 - 绿色 */}
                        <div
                          style={{
                            width: `${successWidth}%`,
                            height: '100%',
                            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                            transition: 'width 0.3s',
                          }}
                        />
                        {/* 失败部分 - 红色 */}
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
        <span>显示 {sortedModelNames.length} 个模型</span>
        <span>总请求: {Object.values(modelRequestCounts).reduce((a, b) => a + b, 0).toLocaleString()}</span>
      </div>
    </div>
  );
}
