import { Router } from 'express';
import { getTodaySummary, getTrend, getRealtimeMetrics } from '../services/quotaService.js';
import { withCache } from '../cache.js';

const router = Router();

router.get('/summary', async (_req, res) => {
  try {
    const data = await withCache('overview:summary', 60, () => getTodaySummary());
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/trend', async (req, res) => {
  try {
    const days = Number(req.query.days) || 7;
    const data = await withCache(`overview:trend:${days}`, 120, () => getTrend(days));
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/metrics', async (_req, res) => {
  try {
    const data = await getRealtimeMetrics();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
