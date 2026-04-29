import { Router } from 'express';
import { getModelAvailabilityHeatmap, getUsagePatternHeatmap, getModelSuccessRate } from '../services/heatmapService.js';
import { withCache } from '../cache.js';

const router = Router();

function parseTimeParams(req: any) {
  return {
    start: req.query.start ? Number(req.query.start) : undefined,
    end: req.query.end ? Number(req.query.end) : undefined,
    models: req.query.models ? (req.query.models as string).split(',') : undefined,
  };
}

router.get('/availability', async (req, res) => {
  try {
    const params = parseTimeParams(req);
    const cacheKey = `heatmap:avail:${JSON.stringify(params)}`;
    const data = await withCache(cacheKey, 300, () => getModelAvailabilityHeatmap(params));
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/usage-pattern', async (req, res) => {
  try {
    const params = parseTimeParams(req);
    const cacheKey = `heatmap:pattern:${JSON.stringify(params)}`;
    const data = await withCache(cacheKey, 300, () => getUsagePatternHeatmap(params));
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/success-rate', async (req, res) => {
  try {
    const params = parseTimeParams(req);
    const cacheKey = `heatmap:success:${JSON.stringify(params)}`;
    const data = await withCache(cacheKey, 300, () => getModelSuccessRate(params));
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
