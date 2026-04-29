import { WebSocketServer, WebSocket } from 'ws';
import { getRealtimeMetrics } from './services/quotaService.js';
import config from './config.js';

let wss: WebSocketServer | null = null;
let broadcastTimer: NodeJS.Timeout | null = null;
let currentInterval = config.REFRESH_INTERVAL || 30000;

export function initWebSocket(server: any) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    console.log('[WS] Client connected');

    // 发送当前配置
    ws.send(JSON.stringify({ type: 'config', data: { interval: currentInterval } }));

    // 立即发送一次数据
    sendMetrics(ws);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'setInterval' && typeof msg.interval === 'number' && msg.interval > 0) {
          currentInterval = msg.interval;
          restartBroadcast();
          ws.send(JSON.stringify({ type: 'config', data: { interval: currentInterval } }));
          console.log('[WS] Interval changed to:', currentInterval);
        }
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    });

    ws.on('close', () => {
      console.log('[WS] Client disconnected');
    });

    ws.on('error', (err) => {
      console.error('[WS] Error:', err.message);
    });
  });

  startBroadcast();

  console.log('[WS] WebSocket server initialized');
}

function restartBroadcast() {
  if (broadcastTimer) {
    clearInterval(broadcastTimer);
  }
  startBroadcast();
}

function startBroadcast() {
  broadcastTimer = setInterval(async () => {
    try {
      const metrics = await getRealtimeMetrics();
      const data = JSON.stringify({ type: 'metrics', data: metrics });
      broadcast(data);
    } catch (err) {
      console.error('[WS] Broadcast error:', err);
    }
  }, currentInterval);
}

function sendMetrics(ws: WebSocket) {
  getRealtimeMetrics()
    .then((metrics) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'metrics', data: metrics }));
      }
    })
    .catch((err) => {
      console.error('[WS] Send metrics error:', err);
    });
}

function broadcast(message: string) {
  if (!wss) return;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export function stopWebSocket() {
  if (broadcastTimer) {
    clearInterval(broadcastTimer);
    broadcastTimer = null;
  }
  if (wss) {
    wss.close();
    wss = null;
  }
}