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

// 北京时区偏移（小时）
const BEIJING_TZ_OFFSET = 8;

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

  // 7D 模式：21 格 × 8h；24H 模式：24 格 × 1h
  const hoursPerSlot = timeRange === 168 ? 8 : 1;
  const slotCount = timeRange / hoursPerSlot;

  // 当前时刻所在的 UTC 整点桶（与后端 FLOOR(created_at/3600) 同源）
  const currentBucket = Math.floor(Date.now() / 1000 / 3600);

  // 生成时间轴标签（按北京时区显示）
  const labels = useMemo(() => {
    const result: string[] = [];
    for (let i = 0; i < slotCount; i++) {
      const slotsAgo = slotCount - 1 - i;
      if (slotsAgo === 0) {
        result.push('现在');
      } else {
        // 该 slot 起始桶对应的北京时
        const bucketStart = currentBucket - slotsAgo * hoursPerSlot;
        const beijingHour = (bucketStart + BEIJING_TZ_OFFSET) % 24;
        const normalizedHour = (beijingHour + 24) % 24;
        result.push(String(normalizedHour).padStart(2, '0'));
      }
    }
    return result;
  }, [slotCount, hoursPerSlot, currentBucket]);

  // 处理数据：按 hour_bucket 直接映射 slot
  const heatmapData = useMemo(() => {
    const modelMap: Record<string, Map<number, ProcessedCell>> = {};
    const modelTotals: Record<string, number> = {};

    data.forEach(item => {
      const model = item.model_name;
      const bucket = Number(item.hour_bucket);
      const requestCount = Number(item.request_count || 0);
      const successCount = Number(item.success_count || 0);
      const failCount = requestCount - successCount;

      if (!modelMap[model]) {
        modelMap[model] = new Map();
        modelTotals[model] = 0;
      }

      // 与"现在"桶相差多少个 slot（按 hoursPerSlot 聚合）
      const bucketsAgo = currentBucket - bucket;
      if (bucketsAgo < 0) return; // 跳过未来数据
      const slotsAgo = Math.floor(bucketsAgo / hoursPerSlot);
      const slotIndex = slotCount - 1 - slotsAgo;

      if (slotIndex >= 0 && slotIndex < slotCount) {
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
        for (let i = 0; i < slotCount; i++) {
          const cell = modelMap[model].get(i);
          cells.push(cell || { successCount: 0, failCount: 0 });
        }
        return { modelName: model, cells, totalRequests: modelTotals[model] };
      })
      .filter(row => row.totalRequests > 0)
      .sort((a, b) => b.totalRequests - a.totalRequests)
      .slice(0, 10);

    return rows;
  }, [data, slotCount, hoursPerSlot, currentBucket]);

  // 全局最大请求量，用于点数 sqrt 缩放（避免单格过亮其他格不可见）
  const globalMaxTotal = useMemo(() => {
    let max = 0;
    for (const row of heatmapData) {
      for (const cell of row.cells) {
        const t = cell.successCount + cell.failCount;
        if (t > max) max = t;
      }
    }
    return max;
  }, [heatmapData]);

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
          gridTemplateColumns: `minmax(80px, auto) repeat(${slotCount}, 1fr)`,
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

            {/* 格子：点阵显示——绿点=成功，红点=失败，点数反映请求量 */}
            {row.cells.map((cell, i) => {
              const total = cell.successCount + cell.failCount;
              const hasData = total > 0;

              // 点数：sqrt 缩放到 [1, MAX_DOTS]
              const MAX_DOTS = 16;
              let totalDots = 0;
              let greenDots = 0;
              let redDots = 0;
              if (hasData && globalMaxTotal > 0) {
                totalDots = Math.max(
                  1,
                  Math.round(Math.sqrt(total / globalMaxTotal) * MAX_DOTS)
                );
                greenDots = Math.round(totalDots * cell.successCount / total);
                redDots = totalDots - greenDots;
                // 有失败但被四舍五入吞掉时，保留至少 1 个红点
                if (cell.failCount > 0 && redDots === 0) {
                  redDots = 1;
                  greenDots = Math.max(0, totalDots - 1);
                }
                if (cell.successCount > 0 && greenDots === 0) {
                  greenDots = 1;
                  redDots = Math.max(0, totalDots - 1);
                }
              }

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
                      minHeight: 28,
                      borderRadius: 3,
                      cursor: 'pointer',
                      background: hasData ? '#f8fafc' : 'transparent',
                      border: hasData ? 'none' : '1px dashed #e2e8f0',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignContent: 'center',
                      justifyContent: 'center',
                      gap: 1,
                      padding: 2,
                      boxSizing: 'border-box',
                    }}
                  >
                    {hasData && Array.from({ length: greenDots }).map((_, k) => (
                      <span
                        key={`g${k}`}
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: '50%',
                          background: '#22c55e',
                          flex: '0 0 auto',
                        }}
                      />
                    ))}
                    {hasData && Array.from({ length: redDots }).map((_, k) => (
                      <span
                        key={`r${k}`}
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: '50%',
                          background: '#ef4444',
                          flex: '0 0 auto',
                        }}
                      />
                    ))}
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
        <span><span style={{ color: '#22c55e' }}>●</span> 成功</span>
        <span><span style={{ color: '#ef4444' }}>●</span> 失败</span>
        <span style={{ color: '#94a3b8' }}>点数 ∝ 请求量</span>
        <span style={{ border: '1px dashed #e2e8f0', padding: '0 4px', borderRadius: 2 }}>无数据</span>
      </div>
    </div>
  );
}
