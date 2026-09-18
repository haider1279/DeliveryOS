import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { config } from '../config';

/**
 * Centralized error handler.
 * Maps AppError and other errors to a consistent JSON envelope.
 * Never leaks stack traces or raw database errors to the client.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    };
    if ((err as any).details && config.isDev) {
      (body.error as any).details = (err as any).details;
    }
    res.status(err.statusCode).json(body);
    return;
  }

  // Log unexpected errors server-side (structured)
  console.error('[ERROR]', {
    path: req.path,
    method: req.method,
    error: err instanceof Error ? err.message : err,
    stack: err instanceof Error ? err.stack : undefined,
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    },
  });
}
