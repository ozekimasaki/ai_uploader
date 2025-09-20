import { createMiddleware } from 'hono/factory'
import type { ErrorHandler } from 'hono'

interface ErrorResponse {
  error: string
  code?: string
  details?: any
}

export const errorHandler: ErrorHandler = (error, c) => {
  console.error('Unhandled error:', error)

  const errorResponse: ErrorResponse = {
    error: '内部サーバーエラーが発生しました',
  }

  // Handle different types of errors
  if (error instanceof ValidationError) {
    c.status(400)
    errorResponse.error = error.message
    errorResponse.code = 'VALIDATION_ERROR'
    errorResponse.details = error.details
  } else if (error instanceof AuthError) {
    c.status(error.statusCode)
    errorResponse.error = error.message
    errorResponse.code = 'AUTH_ERROR'
  } else if (error instanceof RateLimitError) {
    c.status(429)
    errorResponse.error = error.message
    errorResponse.code = 'RATE_LIMIT_EXCEEDED'
  } else if (error instanceof NotFoundError) {
    c.status(404)
    errorResponse.error = error.message
    errorResponse.code = 'NOT_FOUND'
  } else if (error instanceof ForbiddenError) {
    c.status(403)
    errorResponse.error = error.message
    errorResponse.code = 'FORBIDDEN'
  } else {
    c.status(500)
    errorResponse.error = '内部サーバーエラーが発生しました'
    errorResponse.code = 'INTERNAL_ERROR'

    // In development, include error details
    if (c.env.ENVIRONMENT === 'development') {
      errorResponse.details = {
        message: error.message,
        stack: error.stack,
      }
    }
  }

  return c.json(errorResponse)
}

// Custom error classes
export class ValidationError extends Error {
  constructor(message: string, public details?: any) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class AuthError extends Error {
  constructor(message: string, public statusCode: number = 401) {
    super(message)
    this.name = 'AuthError'
  }
}

export class RateLimitError extends Error {
  constructor(message: string = 'レート制限を超えました') {
    super(message)
    this.name = 'RateLimitError'
  }
}

export class NotFoundError extends Error {
  constructor(message: string = 'リソースが見つかりません') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class ForbiddenError extends Error {
  constructor(message: string = 'アクセス権限がありません') {
    super(message)
    this.name = 'ForbiddenError'
  }
}
