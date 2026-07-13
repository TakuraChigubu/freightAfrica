import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import config from './config/index.js';
import logger, { morganStream } from './utils/logger.js';
import errorHandler from './middleware/errorHandler.js';
import { sanitizeInput } from './middleware/validate.js';
import { generalLimiter } from './middleware/security.js';

// Import routes
import authRoutes from './routes/auth.js';
import loadRoutes from './routes/load.js';
import unlockRoutes from './routes/unlock.js';
import pricingRoutes from './routes/pricing.js';
import dashboardRoutes from './routes/dashboard.js';
import adminRoutes from './routes/admin.js';
import marketplaceRoutes from './routes/marketplace.js';
// import userRoutes from './routes/users.js';
// import paymentRoutes from './routes/payments.js';
// import webhookRoutes from './routes/webhooks.js';

const app = express();

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, cron jobs)
    if (!origin) return callback(null, true);

    if (config.security.corsOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked origin', { origin });
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Client-Version'],
  exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 600, // 10 minutes
};
app.use(cors(corsOptions));

// Parse JSON and URL-encoded bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Sanitize user input
app.use(sanitizeInput);

// Request ID middleware
app.use((req, res, next) => {
  req.requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

// Request logging
import morgan from 'morgan';
app.use(morgan('combined', { stream: morganStream }));

// Apply general rate limiting to all API routes
app.use('/api', generalLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

// Readiness check endpoint
app.get('/ready', async (req, res) => {
  const checks = {
    database: false,
    redis: false,
  };

  try {
    const { testConnection } = await import('./database/pool.js');
    checks.database = await testConnection();
  } catch (error) {
    logger.error('Readiness check database failed', { error: error.message });
  }

  try {
    const redis = await import('./utils/redis.js');
    checks.redis = (await redis.default.ping?.()) === 'PONG';
  } catch (error) {
    logger.error('Readiness check redis failed', { error: error.message });
  }

  const allHealthy = checks.database && checks.redis;

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ready' : 'not_ready',
    checks,
    timestamp: new Date().toISOString(),
  });
});

// API routes (versioned)
const apiRouter = express.Router();

// Mount routes
apiRouter.use('/auth', authRoutes);
apiRouter.use('/loads', loadRoutes);
apiRouter.use('/unlock', unlockRoutes);
apiRouter.use('/pricing', pricingRoutes);
apiRouter.use('/dashboard', dashboardRoutes);
apiRouter.use('/admin', adminRoutes);
apiRouter.use('/marketplace', marketplaceRoutes);
// apiRouter.use('/users', userRoutes);
// apiRouter.use('/payments', paymentRoutes);
// apiRouter.use('/webhooks', webhookRoutes);

// API info endpoint
apiRouter.get('/', (req, res) => {
  res.status(200).json({
    name: config.app.name,
    version: config.app.apiVersion,
    documentation: `${req.protocol}://${req.get('host')}/docs`,
  });
});

// Mount API router
app.use(`/api/${config.app.apiVersion}`, apiRouter);

// 404 handler for API routes
app.use('/api', (req, res, next) => {
  const error = new Error('API endpoint not found');
  error.statusCode = 404;
  error.code = 'NOT_FOUND';
  next(error);
});

// Global error handler
app.use(errorHandler);

// Export app for testing
export default app;
