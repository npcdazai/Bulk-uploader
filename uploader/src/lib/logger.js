import config from '../config/index.js';

/**
 * Tiny structured logger. Every line is prefixed with the vendor + stage so logs
 * are unambiguous when 5 processes write to the same aggregated PM2 stream.
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const THRESHOLD = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

function ts() {
  // ISO without millis noise
  return new Date().toISOString();
}

export function createLogger(stage) {
  const vendor = config.VENDOR_FOLDER_NAME;
  const tag = `[${vendor}][${stage}]`;

  const emit = (level, args) => {
    if (LEVELS[level] < THRESHOLD) return;
    const line = `${ts()} ${level.toUpperCase().padEnd(5)} ${tag}`;
    const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    sink(line, ...args);
  };

  return {
    debug: (...a) => emit('debug', a),
    info: (...a) => emit('info', a),
    warn: (...a) => emit('warn', a),
    error: (...a) => emit('error', a),
  };
}
