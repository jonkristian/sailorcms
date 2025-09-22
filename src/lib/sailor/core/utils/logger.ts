/**
 * Centralized logging utility with structured logging
 */

import { randomUUID } from 'crypto';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  userId?: string;
  requestId?: string;
  route?: string;
  action?: string;
  resource?: string;
  [key: string]: any;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private static instance: Logger;
  private isDevelopment = process.env.NODE_ENV === 'development';
  private debugMode = false;
  private minLevel: LogLevel = 'info';

  private constructor() {
    // Initialize debug mode from environment
    this.debugMode = process.env.DEBUG_MODE === 'true';
    const envLevel = (process.env.LOG_LEVEL as LogLevel | undefined)?.toLowerCase() as
      | LogLevel
      | undefined;
    this.minLevel = envLevel
      ? envLevel
      : this.isDevelopment
        ? 'info'
        : this.debugMode
          ? 'info'
          : 'warn';
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  // Context is now passed explicitly to log methods

  /**
   * Update debug mode setting
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  private shouldLog(level: LogLevel): boolean {
    const rank = (lvl: LogLevel) =>
      lvl === 'debug' ? 10 : lvl === 'info' ? 20 : lvl === 'warn' ? 30 : 40;
    return (
      rank(level) >= rank(this.minLevel) &&
      (level !== 'debug' || this.isDevelopment || this.debugMode)
    );
  }

  private formatLog(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error
  ): LogEntry {
    const logEntry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: context || {}
    };

    if (error) {
      logEntry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }

    return logEntry;
  }

  private output(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog(level)) return;

    const logEntry = this.formatLog(level, message, context, error);

    // In development, use console with colors
    if (this.isDevelopment) {
      const colors = {
        debug: '\x1b[36m', // Cyan
        info: '\x1b[32m', // Green
        warn: '\x1b[33m', // Yellow
        error: '\x1b[31m' // Red
      };
      const reset = '\x1b[0m';

      console[level === 'debug' ? 'log' : level](
        `${colors[level]}[${level.toUpperCase()}]${reset} ${message}`,
        context ? { context: logEntry.context } : '',
        error ? { error: logEntry.error } : ''
      );
    } else {
      // In production, output structured JSON
      console[level === 'debug' ? 'log' : level](JSON.stringify(logEntry));
    }
  }

  debug(message: string, context?: LogContext): void {
    this.output('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.output('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.output('warn', message, context);
  }

  error(message: string, context?: LogContext, error?: Error): void {
    this.output('error', message, context, error);
  }

  /**
   * Log with automatic error extraction
   */
  errorWithError(message: string, error: Error, context?: LogContext): void {
    this.error(message, context, error);
  }

  /**
   * Log database operations
   */
  db(operation: string, table: string, context?: LogContext): void {
    this.debug(`DB ${operation}: ${table}`, { ...context, operation, table });
  }

  /**
   * Log API operations
   */
  api(method: string, endpoint: string, status?: number, context?: LogContext): void {
    const level = status && status >= 400 ? 'warn' : 'info';
    this[level](`API ${method} ${endpoint}${status ? ` ${status}` : ''}`, {
      ...context,
      method,
      endpoint,
      status
    });
  }

  /**
   * Log authentication events
   */
  auth(event: string, context?: LogContext): void {
    this.info(`Auth: ${event}`, { ...context, event });
  }

  /**
   * Log permission checks
   */
  permission(
    userId: string,
    permission: string,
    resource: string,
    allowed: boolean,
    context?: LogContext
  ): void {
    this.debug(`Permission: ${userId} ${allowed ? 'CAN' : 'CANNOT'} ${permission} ${resource}`, {
      ...context,
      userId,
      permission,
      resource,
      allowed
    });
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

// Export convenience functions
export const log = {
  debug: (message: string, context?: LogContext) => logger.debug(message, context),
  info: (message: string, context?: LogContext) => logger.info(message, context),
  warn: (message: string, context?: LogContext) => logger.warn(message, context),
  error: (message: string, context?: LogContext, error?: Error) =>
    logger.error(message, context, error),
  errorWithError: (message: string, error: Error, context?: LogContext) =>
    logger.errorWithError(message, error, context),
  db: (operation: string, table: string, context?: LogContext) =>
    logger.db(operation, table, context),
  api: (method: string, endpoint: string, status?: number, context?: LogContext) =>
    logger.api(method, endpoint, status, context),
  auth: (event: string, context?: LogContext) => logger.auth(event, context),
  permission: (
    userId: string,
    permission: string,
    resource: string,
    allowed: boolean,
    context?: LogContext
  ) => logger.permission(userId, permission, resource, allowed, context),
  setDebugMode: (enabled: boolean) => logger.setDebugMode(enabled)
};

// Request logging utilities (moved from request-context.ts)
export interface RequestContext {
  requestId: string;
  userId?: string;
  route?: string;
  method?: string;
  userAgent?: string;
  ip?: string;
}

/**
 * Generate a request context from SvelteKit event
 */
export function createRequestContext(event: any): RequestContext {
  const requestId = randomUUID();
  const route = event.url?.pathname;
  const method = event.request?.method;
  const userAgent = event.request?.headers?.get('user-agent');

  // Safely get client IP address with fallback for development
  let ip: string | undefined;
  try {
    ip = event.getClientAddress?.();
  } catch (error) {
    // In development mode, getClientAddress might fail
    // Fall back to x-forwarded-for header or localhost
    ip = event.request?.headers?.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';
  }

  return {
    requestId,
    userId: event.locals?.user?.id,
    route,
    method,
    userAgent,
    ip
  };
}

/**
 * Simple request logging without AsyncLocalStorage
 */
export function logRequest(event: any, message: string, additionalContext?: LogContext): void {
  const context = createRequestContext(event);
  log.debug(message, { ...context, ...additionalContext });
}

/**
 * Log request completion with timing and context
 */
export function logRequestCompletion(event: any, startTime: number, statusCode?: number): void {
  const duration = Date.now() - startTime;
  const context = createRequestContext(event);
  log.debug('Request completed', {
    ...context,
    duration: `${duration}ms`,
    statusCode
  });
}

/**
 * Simple logging handler for hooks - no AsyncLocalStorage complexity
 */
export async function handleSailorLogging(
  event: any,
  run: () => Promise<Response>
): Promise<Response> {
  const startTime = Date.now();

  // Log request start in debug mode only
  if (process.env.NODE_ENV === 'development' || process.env.DEBUG_MODE === 'true') {
    logRequest(event, 'Request started');
  }

  try {
    const response = await run();

    // Log completion only in development or debug mode
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG_MODE === 'true') {
      logRequestCompletion(event, startTime, response.status);
    }

    return response;
  } catch (error) {
    // Log errors with request context
    const context = createRequestContext(event);
    log.error('Request failed', context, error as Error);
    throw error;
  }
}
