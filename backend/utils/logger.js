import winston from 'winston';
import config from '../config/index.js';

const { combine, timestamp, printf, colorize, json } = winston.format;

// Custom format for development
const devFormat = printf(({ level, message, timestamp, stack, ...metadata }) => {
  let log = `${timestamp} [${level}]: ${message}`;

  if (Object.keys(metadata).length > 0) {
    log += ` ${JSON.stringify(metadata)}`;
  }

  if (stack) {
    log += `\n${stack}`;
  }

  return log;
});

// Create logs directory if it doesn't exist
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const logsDir = join(__dirname, '..', 'logs');

if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

// Logger configuration
const transports = [
  // Console transport
  new winston.transports.Console({
    format: combine(
      colorize(),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      config.app.env === 'development' ? devFormat : json()
    ),
  }),

  // File transport for all logs
  new winston.transports.File({
    filename: join(logsDir, 'combined.log'),
    format: combine(timestamp(), json()),
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),

  // File transport for error logs
  new winston.transports.File({
    filename: join(logsDir, 'error.log'),
    level: 'error',
    format: combine(timestamp(), json()),
    maxsize: 5242880,
    maxFiles: 5,
  }),
];

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  format: combine(timestamp(), json()),
  defaultMeta: { service: 'freightlink-africa' },
  transports,
  exceptionHandlers: [
    new winston.transports.File({ filename: join(logsDir, 'exceptions.log') }),
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: join(logsDir, 'rejections.log') }),
  ],
});

// Morgan stream for HTTP request logging
const morganStream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

export { logger, morganStream };
export default logger;
