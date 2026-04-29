import mysql from 'mysql2/promise';
import config from './config.js';

interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function parseConfig(): DbConfig {
  const { SQL_DSN } = config;
  // 格式: user:password@tcp(host:port)/database
  const match = SQL_DSN.match(/^(.+):(.+)@tcp\((.+):(\d+)\)\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid SQL_DSN format: ${SQL_DSN}`);
  }
  return {
    host: match[3],
    port: Number(match[4]),
    user: match[1],
    password: match[2],
    database: match[5],
  };
}

const dbConfig = parseConfig();

const pool = mysql.createPool({
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '+00:00',
});

pool.getConnection()
  .then(conn => {
    console.log('[MySQL] Connected to', dbConfig.host);
    conn.release();
  })
  .catch(err => {
    console.error('[MySQL] Connection failed:', err.message);
  });

export default pool;
