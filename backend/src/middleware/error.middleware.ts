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

  // Map Prisma unique constraint violations to a 409 Conflict instead of a
  // generic 500 (project code, invoice number, email, etc.).
  if (
    err &&
    typeof err === 'object' &&
    (err as any).code === 'P2002'
  ) {
    const target: any = (err as any).meta?.target;
    const field = Array.isArray(target)
      ? target.join(', ')
      : typeof target === 'string'
        ? target
        : 'unique field';
    res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT',
        message: `A record with the same ${field} already exists`,
      },
    });
    return;
  }

  // Map malformed id / uuid query values (e.g. a non-uuid in an :id param)
  // to a 400 instead of leaking a 500.
  if (
    err &&
    typeof err === 'object' &&
    (err as any).code === 'P2023'
  ) {
    res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'The requested resource identifier is invalid',
      },
    });
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
