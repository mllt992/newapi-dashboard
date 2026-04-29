import { useEffect, useState } from 'react';
import { Row, Col, Spin, Progress } from 'antd';
import { api, type ModelSuccessRate, type TopModelItem } from '../api';
import dayjs from 'dayjs';

export default function ModelUsage() {
  const [successRates, setSuccessRates] = useState<ModelSuccessRate[]>([]);
  const [topModels, setTopModels] = useState<TopModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [range] = useState(() => {
    const saved = localStorage.getItem('dashboard_range');
    return parseInt(saved || '7', 10);
  });

  useEffect(() => {
    const start = dayjs().subtract(range, 'day').startOf('day').unix();
    const end = dayjs().endOf('day').unix();
    Promise.all([
      api.getModelSuccessRate({ start, end }),
      api.getTopModels({ start, end, limit: 20 }),
    ]).then(([rates, models]) => {
      setSuccessRates(rates);
      setTopModels(models);
    }).finally(() => setLoading(false));
  }, [range]);

  const containerStyle = { padding: 24, borderRadius: 20, background: '#f8fafc', border: '1px solid #e2e8f0' };

  // 计算统计数据
  const totalRequests = successRates.reduce((s, d) => s + Number(d.total_requests || 0), 0);
  const avgSuccessRate = successRates.length > 0
    ? successRates.reduce((s, d) => s + Number(d.success_rate), 0) / successRates.length
    : 0;
  const avgLatency = successRates.length > 0
    ? successRates.filter(d => Number(d.avg_use_time) > 0)
        .reduce((s, d, _, arr) => s + Number(d.avg_use_time) / arr.length, 0)
    : 0;

  return (
    <Spin spinning={loading}>
      {/* 综合概览 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          <div style={{ ...containerStyle, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>总请求量</div>
            <div style={{ fontSize: 36, fontWeight: 700, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {totalRequests.toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>{range} 天累计</div>
          </div>
        </Col>
        <Col xs={24} sm={8}>
          <div style={{ ...containerStyle, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>平均成功率</div>
            <div style={{ fontSize: 36, fontWeight: 700, color: avgSuccessRate >= 90 ? '#10b981' : avgSuccessRate >= 50 ? '#f59e0b' : '#ef4444' }}>
              {avgSuccessRate.toFixed(1)}%
            </div>
            <Progress
              percent={avgSuccessRate}
              showInfo={false}
              strokeColor={avgSuccessRate >= 90 ? '#10b981' : avgSuccessRate >= 50 ? '#f59e0b' : '#ef4444'}
              trailColor="#e2e8f0"
              style={{ marginTop: 12 }}
            />
          </div>
        </Col>
        <Col xs={24} sm={8}>
          <div style={{ ...containerStyle, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>平均响应耗时</div>
            <div style={{ fontSize: 36, fontWeight: 700, color: '#8b5cf6' }}>
              {avgLatency.toFixed(2)}s
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>平均延迟</div>
          </div>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* 模型排行榜 - 带进度条 */}
        <Col xs={24} lg={12}>
          <div style={containerStyle}>
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1e293b' }}>请求量排行 TOP 10</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {topModels.slice(0, 10).map((item, i) => {
                const maxReq = topModels[0]?.request_count || 1;
                const percent = (Number(item.request_count) / maxReq) * 100;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: i < 3 ? ['#f59e0b', '#94a3b8', '#cd7f32'][i] : '#e2e8f0', color: i < 3 ? '#fff' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, color: '#1e293b', fontWeight: 500, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.model_name}
                        </span>
                        <span style={{ fontSize: 13, color: '#6366f1', fontWeight: 600 }}>
                          {Number(item.request_count).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${percent}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', borderRadius: 3, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Col>

        {/* 成功率排行 - 带颜色标识 */}
        <Col xs={24} lg={12}>
          <div style={containerStyle}>
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1e293b' }}>成功率排行 TOP 10</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {successRates
                .filter(item => Number(item.total_requests) > 0)
                .sort((a, b) => Number(b.success_rate) - Number(a.success_rate))
                .slice(0, 10)
                .map((item, i) => {
                  const rate = Number(item.success_rate);
                  const color = rate >= 90 ? '#10b981' : rate >= 50 ? '#f59e0b' : '#ef4444';
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 6, background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, color: '#1e293b', fontWeight: 500, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.model_name || '(空)'}
                          </span>
                          <span style={{ fontSize: 13, color, fontWeight: 600 }}>
                            {rate.toFixed(1)}%
                          </span>
                        </div>
                        <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${rate}%`, background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </Col>
      </Row>

      {/* 快速响应排行 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <div style={containerStyle}>
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1e293b' }}>响应速度排行 TOP 10</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>按平均耗时排序，越低越好</p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {successRates
                .filter(item => Number(item.avg_use_time) > 0)
                .sort((a, b) => Number(a.avg_use_time) - Number(b.avg_use_time))
                .slice(0, 10)
                .map((item, i) => {
                  const time = Number(item.avg_use_time);
                  const color = time < 5 ? '#10b981' : time < 10 ? '#f59e0b' : '#ef4444';
                  return (
                    <div
                      key={i}
                      style={{
                        padding: '12px 16px',
                        background: `${color}10`,
                        border: `1px solid ${color}30`,
                        borderRadius: 12,
                        minWidth: 200,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ width: 20, height: 20, borderRadius: 4, background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>
                          {i + 1}
                        </span>
                        <span style={{ fontSize: 13, color: '#1e293b', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>
                          {item.model_name || '(空)'}
                        </span>
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 700, color }}>{time.toFixed(2)}s</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                        {Number(item.total_requests).toLocaleString()} 请求
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </Col>
      </Row>

      {/* 详细数据表格 */}
      <div style={{ ...containerStyle, marginTop: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1e293b' }}>模型详细数据</h3>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '14px 12px', textAlign: 'left', color: '#64748b', fontSize: 12 }}>模型</th>
                <th style={{ padding: '14px 12px', textAlign: 'right', color: '#64748b', fontSize: 12 }}>总请求</th>
                <th style={{ padding: '14px 12px', textAlign: 'right', color: '#64748b', fontSize: 12 }}>成功</th>
                <th style={{ padding: '14px 12px', textAlign: 'right', color: '#64748b', fontSize: 12 }}>成功率</th>
                <th style={{ padding: '14px 12px', textAlign: 'right', color: '#64748b', fontSize: 12 }}>平均耗时</th>
              </tr>
            </thead>
            <tbody>
              {successRates.slice(0, 15).map((item, i) => {
                const rate = Number(item.success_rate);
                const bgColor = rate >= 90 ? '#10b981' : rate >= 50 ? '#f59e0b' : '#ef4444';
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px', color: '#6366f1', fontSize: 13, fontWeight: 500 }}>{item.model_name || '(空)'}</td>
                    <td style={{ padding: '12px', color: '#475569', fontSize: 13, textAlign: 'right' }}>{Number(item.total_requests).toLocaleString()}</td>
                    <td style={{ padding: '12px', color: '#475569', fontSize: 13, textAlign: 'right' }}>{Number(item.success_requests).toLocaleString()}</td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <span style={{ padding: '3px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: `${bgColor}15`, color: bgColor }}>
                        {rate.toFixed(1)}%
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: '#64748b', fontSize: 13, textAlign: 'right' }}>{Number(item.avg_use_time).toFixed(2)}s</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Spin>
  );
}