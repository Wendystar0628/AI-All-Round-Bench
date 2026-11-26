// 从环境变量读函数的配置（变量与默认值见 README「环境变量」）。
import { DEFAULT_LIMITS } from './handler.js';

export const DEFAULT_VOTABLE_URL = 'https://octathlon.wendystars.com/aesthetics/data/votable.json';
export const DEFAULT_CORS_ORIGINS = 'https://octathlon.wendystars.com';

function int(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} 应是数字，现在是 ${raw}`);
  return Math.trunc(n);
}

export function readConfig(env = process.env) {
  let votable = env.VOTABLE_URL || DEFAULT_VOTABLE_URL;
  if (env.VOTABLE_OVERRIDE) {
    const fixed = JSON.parse(env.VOTABLE_OVERRIDE);   // 测试用：直接给一份名单，不去读网址
    votable = () => fixed;
  }
  return {
    topic: env.VOTES_TOPIC || 'aesthetics',
    secret: env.VOTES_SECRET || '',
    votable,
    votableCacheSeconds: int(env, 'VOTABLE_CACHE_SECONDS', 180),
    limits: {
      ipPerMinute: int(env, 'RATE_IP_PER_MINUTE', DEFAULT_LIMITS.ipPerMinute),
      voterPerMinute: int(env, 'RATE_VOTER_PER_MINUTE', DEFAULT_LIMITS.voterPerMinute),
      newIdsPerIp: int(env, 'NEW_IDS_PER_IP', DEFAULT_LIMITS.newIdsPerIp),
      newIdWindowSeconds: int(env, 'NEW_ID_WINDOW_SECONDS', DEFAULT_LIMITS.newIdWindowSeconds),
    },
    pow: int(env, 'POW_DIFFICULTY', 0),
    closed: env.VOTES_CLOSED === '1' || env.VOTES_CLOSED === 'true',
    ipHeader: (env.CLIENT_IP_HEADER || '').toLowerCase(),
    cors: (env.CORS_ORIGINS ?? DEFAULT_CORS_ORIGINS).split(',').map(s => s.trim()).filter(Boolean),
    ots: {
      endpoint: env.OTS_ENDPOINT || 'https://octathlon-votes.cn-hangzhou.ots.aliyuncs.com',
      instance: env.OTS_INSTANCE || 'octathlon-votes',
    },
    port: int(env, 'FC_SERVER_PORT', int(env, 'PORT', 9000)),
  };
}
