import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { errorHandler } from './middleware/error.middleware';
import { AppError } from './errors/AppError';

// Import Route Handlers
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/user.routes';
import orgRoutes from './modules/organizations/org.routes';
import projectRoutes from './modules/projects/project.routes';
import requirementRoutes from './modules/requirements/requirement.routes';
import taskRoutes from './modules/tasks/task.routes';
import qaRoutes from './modules/qa/qa.routes';
import releaseRoutes from './modules/releases/release.routes';
import invoiceRoutes from './modules/invoices/invoice.routes';
import notificationRoutes from './modules/notifications/notification.routes';
import storageRoutes from './modules/storage/storage.routes';
import auditRoutes from './modules/audit/audit.routes';
import reportRoutes from './modules/reports/report.routes';

export function createApp(): Express {
  const app = express();

  // Trust reverse proxy (e.g. Render, Vercel) for client IP detection in rate limiting
  app.set('trust proxy', 1);

  // Security Headers
  app.use(helmet());

  // CORS Configuration
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-client-info'],
    })
  );

  // Performance & Parsing
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Logging
  if (config.nodeEnv !== 'test') {
    app.use(morgan('dev'));
  }

  // Global Rate Limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 1000 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again later' },
    },
  });
  app.use('/api', limiter);

  // Stricter rate limit for credential-based endpoints (login + invite accept).
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20, // 20 login attempts per IP per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
      success: false,
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many login attempts, please try again later' },
    },
  });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/accept-invite', authLimiter);

  // Healthcheck Endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'deliveryos-backend',
      // Never disclose the runtime environment to public callers.
      ...(config.nodeEnv === 'development'
        ? { environment: config.nodeEnv }
        : {}),
      timestamp: new Date().toISOString(),
    });
  });

  // Mount API Modules
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/organizations', orgRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/requirements', requirementRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/qa', qaRoutes);
  app.use('/api/releases', releaseRoutes);
  app.use('/api/invoices', invoiceRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/storage', storageRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/reports', reportRoutes);

  // Helper to dynamically locate frontend/dist in mono-repo or nested runtimes
  function getFrontendDistPath(): string | null {
    const candidates = [
      path.resolve(process.cwd(), 'frontend/dist'),
      path.resolve(process.cwd(), '../frontend/dist'),
      path.resolve(__dirname, '../../frontend/dist'),
      path.resolve(__dirname, '../../../frontend/dist'),
      path.resolve(__dirname, '../frontend/dist'),
    ];
    for (const dir of candidates) {
      if (fs.existsSync(dir) && fs.existsSync(path.join(dir, 'index.html'))) {
        return dir;
      }
    }
    return null;
  }

  // Serve frontend static files
  const staticCandidates = [
    path.resolve(process.cwd(), 'frontend/dist'),
    path.resolve(process.cwd(), '../frontend/dist'),
    path.resolve(__dirname, '../../frontend/dist'),
    path.resolve(__dirname, '../../../frontend/dist'),
  ];
  for (const staticDir of staticCandidates) {
    if (fs.existsSync(staticDir)) {
      app.use(express.static(staticDir));
    }
  }

  // SPA fallback for all non-API GET requests (e.g. /dashboard, /projects, /settings)
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
      return next();
    }
    const distPath = getFrontendDistPath();
    if (distPath) {
      const indexPath = path.join(distPath, 'index.html');
      return res.sendFile(indexPath);
    }
    next();
  });

  // 404 Handler
  app.use((req: Request, _res: Response, next) => {
    next(AppError.notFound(`Cannot find ${req.method} ${req.originalUrl}`));
  });

  // Centralized Error Handling Middleware
  app.use(errorHandler);

  return app;
}

export const app = createApp();
