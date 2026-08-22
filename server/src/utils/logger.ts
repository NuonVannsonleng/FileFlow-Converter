import { env } from '../config/env.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = env.isProduction ? LEVEL_ORDER.info : LEVEL_ORDER.debug;

const COLORS: Record<Level, string> = {
  debug: '\u001b[90m',
  info: '\u001b[36m',
  warn: '\u001b[33m',
  error: '\u001b[31m',
};
const RESET = '\u001b[0m';

function emit(level: Level, message: string, meta?: unknown) {
  if (LEVEL_ORDER[level] < minLevel) return;
  const time = new Date().toISOString();
  if (env.isProduction) {
    console[level === 'debug' ? 'log' : level](
      JSON.stringify({ time, level, message, ...(meta ? { meta } : {}) }),
    );
    return;
  }
  const tag = `${COLORS[level]}${level.toUpperCase().padEnd(5)}${RESET}`;
  console[level === 'debug' ? 'log' : level](
    `${tag} ${time} ${message}`,
    meta === undefined ? '' : meta,
  );
}

export const logger = {
  debug: (m: string, meta?: unknown) => emit('debug', m, meta),
  info: (m: string, meta?: unknown) => emit('info', m, meta),
  warn: (m: string, meta?: unknown) => emit('warn', m, meta),
  error: (m: string, meta?: unknown) => emit('error', m, meta),
};
