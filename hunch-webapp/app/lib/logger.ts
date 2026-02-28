import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  }),
});

/**
 * Create a child logger with a specific module context.
 * Usage: const log = createLogger('notifications');
 */
export function createLogger(module: string) {
  return logger.child({ module });
}
