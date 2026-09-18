import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../errors/AppError';

type ValidateTarget = 'body' | 'query' | 'params';

/**
 * Middleware factory: validates the specified request target against a Zod schema.
 * Parses and replaces req[target] with the validated (coerced) value.
 */
export function validate(schema: ZodSchema, target: ValidateTarget = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req[target]);
      if (!result.success) {
        const details = result.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        const error = new AppError(
          'VALIDATION_ERROR',
          'Validation failed: ' + details.map((d) => `${d.field}: ${d.message}`).join('; '),
          422,
        );
        (error as any).details = details;
        next(error);
        return;
      }
      // Replace with parsed/coerced data
      (req as any)[target] = result.data;
      next();
    } catch (err) {
      next(err);
    }
  };
}
