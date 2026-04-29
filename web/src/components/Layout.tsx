import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import { DashboardOutlined, BarChartOutlined, DatabaseOutlined } from '@ant-design/icons';

const { Header, Content } = Layout;

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/tokens', icon: <BarChartOutlined />, label: 'Token 分析' },
  { key: '/heatmap', icon: <DatabaseOutlined />, label: '模型使用分析' },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Layout style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Header
        style={{
          padding: '0 32px',
          background: '#fff',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 64,
          lineHeight: '64px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)',
            }}
          >
            <BarChartOutlined style={{ color: '#fff', fontSize: 18 }} />
          </div>
          <span style={{ fontSize: 20, fontWeight: 700, background: 'linear-gradient(135deg, #6366f1, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            New API
          </span>
          <span style={{ color: '#94a3b8', fontSize: 14 }}>模型监控</span>
        </div>
        <Menu
          mode="horizontal"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{
            background: 'transparent',
            border: 'none',
            minWidth: 400,
          }}
        />
        <div style={{ color: '#94a3b8', fontSize: 12 }}>
          {new Date().toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </Header>
      <Content
        style={{
          margin: 24,
          padding: 24,
          background: '#fff',
          borderRadius: 20,
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06)',
          minHeight: 280,
        }}
      >
        <Outlet />
      </Content>
    </Layout>
  );
}