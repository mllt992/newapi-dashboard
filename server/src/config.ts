import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Config {
  SQL_DSN: string;
  REDIS_CONN_STRING: string;
  PORT: number;
  COST_RATE: number;
}

const configPath = resolve(__dirname, '../../env.config.json');
const raw = readFileSync(configPath, 'utf-8');
const config: Config = JSON.parse(raw);

export default {
  ...config,
  PORT: config.PORT || 3002,
  COST_RATE: config.COST_RATE || 0.0001,
};
