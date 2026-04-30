import { useEffect, useRef, useState } from 'react';
import type { RealtimeMetrics } from '../api';

const REFRESH_KEY = 'dashboard_refresh_interval';

function loadRefreshInterval(): number {
  const saved = localStorage.getItem(REFRESH_KEY);
  return saved ? parseInt(saved, 10) : 30000;
}

interface UseWebSocketReturn {
  metrics: RealtimeMetrics | null;
  connected: boolean;
  setInterval: (interval: number) => void;
  currentInterval: number;
  lastUpdate: number;
}

export function useWebSocket(): UseWebSocketReturn {
  const [metrics, setMetrics] = useState<RealtimeMetrics | null>(null);
  const [connected, setConnected] = useState(false);
  const [currentInterval, setCurrentInterval] = useState(loadRefreshInterval);
  const [lastUpdate, setLastUpdate] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    setConnected(false);

    ws.onopen = () => {
      console.log('[WS] Connected');
      setConnected(true);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      // 连接成功后设置刷新间隔
      ws.send(JSON.stringify({ type: 'setInterval', interval: currentInterval }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'metrics') {
          setMetrics(msg.data);
          setLastUpdate(Date.now());
        }
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected, reconnecting...');
      setConnected(false);
      wsRef.current = null;
      reconnectTimerRef.current = setTimeout(connect, 5000);
    };

    ws.onerror = (err) => {
      console.error('[WS] Error:', err);
      ws.close();
    };
  };

  useEffect(() => {
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, []);

  const sendSetInterval = (interval: number) => {
    setCurrentInterval(interval);
    localStorage.setItem(REFRESH_KEY, String(interval));
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'setInterval', interval }));
    }
  };

  return { metrics, connected, setInterval: sendSetInterval, currentInterval, lastUpdate };
}