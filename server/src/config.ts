import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Config {
  SQL_DSN: string;
  REDIS_CONN_STRING: string;
  PORT: number;
  COST_RATE: number;
  REFRESH_INTERVAL?: number;
  /** 展示用时区偏移（小时），默认 +8（北京时间）。用于“今日/趋势/小时分布”的本地日界对齐。 */
  TZ_OFFSET?: number;
}

// 优先从环境变量读取，否则从配置文件读取
function getConfig(): Config {
  // Docker 环境变量优先
  if (process.env.SQL_DSN || process.env.REDIS_CONN_STRING) {
    return {
      SQL_DSN: process.env.SQL_DSN || '',
      REDIS_CONN_STRING: process.env.REDIS_CONN_STRING || '',
      PORT: parseInt(process.env.PORT || '3002', 10),
      COST_RATE: parseFloat(process.env.COST_RATE || '0.0001'),
      REFRESH_INTERVAL: process.env.REFRESH_INTERVAL ? parseInt(process.env.REFRESH_INTERVAL, 10) : undefined,
      TZ_OFFSET: process.env.TZ_OFFSET ? parseFloat(process.env.TZ_OFFSET) : undefined,
    };
  }

  // 回退到配置文件
  const configPath = resolve(__dirname, '../../env.config.json');
  if (!existsSync(configPath)) {
    throw new Error(`配置文件不存在: ${configPath}`);
  }
  const raw = readFileSync(configPath, 'utf-8');
  return JSON.parse(raw);
}

const config = getConfig();

export default {
  ...config,
  PORT: config.PORT || 3002,
  COST_RATE: config.COST_RATE || 0.0001,
};
