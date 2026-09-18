export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(message: string, code = 'BAD_REQUEST') {
    return new AppError(code, message, 400);
  }

  static unauthorized(message = 'Unauthorized', code = 'UNAUTHORIZED') {
    return new AppError(code, message, 401);
  }

  static forbidden(message = 'Forbidden', code = 'FORBIDDEN') {
    return new AppError(code, message, 403);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new AppError(code, message, 404);
  }

  static conflict(message: string, code = 'CONFLICT') {
    return new AppError(code, message, 409);
  }
}
