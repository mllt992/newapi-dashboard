import { Router } from 'express';
import { getTokenUsage, getCostBreakdown, getTopModels, getTopUsers, getUserList } from '../services/logService.js';
import { withCache } from '../cache.js';

const router = Router();

function parseTimeParams(req: any) {
  const usersRaw = req.query.users as string | undefined;
  return {
    start: req.query.start ? Number(req.query.start) : undefined,
    end: req.query.end ? Number(req.query.end) : undefined,
    model: req.query.model as string | undefined,
    users: usersRaw ? usersRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    granularity: (req.query.granularity as 'hour' | 'day') || 'day',
    limit: req.query.limit ? Number(req.query.limit) : 100,
    offset: req.query.offset ? Number(req.query.offset) : 0,
  };
}

router.get('/usage', async (req, res) => {
  try {
    const params = parseTimeParams(req);
    const cacheKey = `tokens:usage:${JSON.stringify(params)}`;
    const data = await withCache(cacheKey, 120, () => getTokenUsage(params));
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/cost', async (req, res) => {
  try {
    const params = parseTimeParams(req);
    const cacheKey = `tokens:cost:${JSON.stringify(params)}`;
    const data = await withCache(cacheKey, 120, () => getCostBreakdown(params));
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/top-models', async (req, res) => {
  try {
    const params = {
      start: req.query.start ? Number(req.query.start) : undefined,
      end: req.query.end ? Number(req.query.end) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 10,
    };
    const cacheKey = `tokens:top-models:${JSON.stringify(params)}`;
    const data = await withCache(cacheKey, 120, () => getTopModels(params));
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/users', async (req, res) => {
  try {
    const params = {
      start: req.query.start ? Number(req.query.start) : undefined,
      end: req.query.end ? Number(req.query.end) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 500,
    };
    const cacheKey = `tokens:users:${JSON.stringify(params)}`;
    const data = await withCache(cacheKey, 120, () => getUserList(params));
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/top-users', async (req, res) => {
  try {
    const params = {
      start: req.query.start ? Number(req.query.start) : undefined,
      end: req.query.end ? Number(req.query.end) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 10,
    };
    const cacheKey = `tokens:top-users:${JSON.stringify(params)}`;
    const data = await withCache(cacheKey, 120, () => getTopUsers(params));
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
