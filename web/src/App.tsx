import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/Layout';
import Dashboard from './pages/Dashboard';
import TokenUsage from './pages/TokenUsage';
import Heatmap from './pages/Heatmap';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="tokens" element={<TokenUsage />} />
        <Route path="heatmap" element={<Heatmap />} />
      </Route>
    </Routes>
  );
}
