import { Response } from 'express';

interface SuccessOptions<T> {
  data?: T;
  statusCode?: number;
  message?: string;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    totalPages?: number;
  };
}

/**
 * Sends a standardized success response envelope.
 */
export function sendSuccess<T>(res: Response, options: SuccessOptions<T>): Response {
  const { data, statusCode = 200, message, meta } = options;
  return res.status(statusCode).json({
    success: true,
    ...(data !== undefined ? { data } : {}),
    ...(message ? { message } : {}),
    ...(meta ? { meta } : {}),
  });
}

/**
 * Sends a 201 Created response.
 */
export function sendCreated<T>(res: Response, data: T, message?: string): Response {
  return sendSuccess(res, { data, statusCode: 201, message });
}

/**
 * Builds pagination metadata from total count.
 */
export function buildPaginationMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / (pageSize || 1)),
  };
}

/**
 * Builds a Prisma skip/take from page/pageSize.
 */
export function buildPaginationArgs(page: number, pageSize: number) {
  return {
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

/**
 * Sanitizes sort field against a whitelist to prevent injection.
 */
export function safeSortField<T extends string>(
  field: string | undefined,
  allowedFields: T[],
  defaultField: T
): T {
  if (!field) return defaultField;
  return allowedFields.includes(field as T) ? (field as T) : defaultField;
}
