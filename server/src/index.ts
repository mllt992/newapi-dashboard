import http from 'http';
import express from 'express';
import cors from 'cors';
import config from './config.js';
import overviewRoutes from './routes/overview.js';
import tokenRoutes from './routes/tokens.js';
import heatmapRoutes from './routes/heatmap.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/overview', overviewRoutes);
app.use('/api/tokens', tokenRoutes);
app.use('/api/heatmap', heatmapRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

const server = http.createServer(app);

server.listen(config.PORT, () => {
  console.log(`[Server] Running on http://localhost:${config.PORT}`);
});
