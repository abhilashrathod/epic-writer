type Level = 'debug' | 'info' | 'warn' | 'error';

function write(level: Level, msg: string, data?: Record<string, unknown>): void {
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), ...data }) + '\n';
  (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(line);
}

/** JSON-lines logger shared by every package. */
export const logger = {
  debug: (msg: string, data?: Record<string, unknown>) => write('debug', msg, data),
  info: (msg: string, data?: Record<string, unknown>) => write('info', msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => write('warn', msg, data),
  error: (msg: string, data?: Record<string, unknown>) => write('error', msg, data),
};
