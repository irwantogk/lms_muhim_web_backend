export interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details: unknown[];
  };
}

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  details: unknown[];

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = [];
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, "NOT_FOUND", message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Autentikasi diperlukan") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class TokenReuseError extends AppError {
  constructor(message = "Refresh token telah digunakan") {
    super(401, "TOKEN_REUSE_DETECTED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Anda tidak memiliki akses ke sumber daya ini") {
    super(403, "FORBIDDEN", message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details: unknown[] = []) {
    super(400, "VALIDATION_ERROR", message);
    this.details = details;
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, "CONFLICT", message);
  }
}

export function toErrorBody(err: AppError): ErrorBody {
  return {
    success: false,
    error: {
      code: err.code,
      message: err.message,
      details: err.details,
    },
  };
}
