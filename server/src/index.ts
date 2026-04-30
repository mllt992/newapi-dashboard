import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import config from './config.js';
import overviewRoutes from './routes/overview.js';
import tokenRoutes from './routes/tokens.js';
import heatmapRoutes from './routes/heatmap.js';
import { initWebSocket } from './websocket.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// 允许被任何网站 iframe 嵌入的响应头
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', "frame-ancestors *");
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  next();
});

app.use(cors());
app.use(express.json());

app.use('/api/overview', overviewRoutes);
app.use('/api/tokens', tokenRoutes);
app.use('/api/heatmap', heatmapRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 生产环境托管前端静态文件（dist 在构建阶段拷贝至 server/public）
const staticDir = path.resolve(__dirname, '../public');
app.use(express.static(staticDir));
app.get(/^\/(?!api|ws).*/, (_req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

const server = http.createServer(app);
initWebSocket(server);

server.listen(config.PORT, () => {
  console.log(`[Server] Running on http://localhost:${config.PORT}`);
});
