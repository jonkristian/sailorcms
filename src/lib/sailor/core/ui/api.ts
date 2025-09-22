/**
 * Standard API utilities for consistent response patterns and validation
 */

import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

// Standard API response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ApiError {
  error: string;
  details?: any;
}

/**
 * Standard success response
 */
export function apiSuccess<T>(data: T, message?: string) {
  return json({
    success: true,
    data,
    ...(message && { message })
  } as ApiResponse<T>);
}

/**
 * Standard error response
 */
export function apiError(message: string, status: number = 400, details?: any) {
  return json(
    {
      success: false,
      error: message,
      ...(details && { details })
    } as ApiResponse,
    { status }
  );
}

/**
 * Handle async operations with standard error response
 */
export async function handleApiRequest<T>(
  operation: () => Promise<T>,
  errorMessage: string = 'Operation failed'
): Promise<Response> {
  try {
    const result = await operation();
    return apiSuccess(result);
  } catch (err) {
    console.error(`API Error: ${errorMessage}`, err);
    const message = err instanceof Error ? err.message : errorMessage;
    return apiError(message, 500);
  }
}

/**
 * Validate required parameters
 */
export function validateParams(
  params: Record<string, string | undefined>,
  required: string[]
): string | null {
  for (const param of required) {
    if (!params[param]) {
      return `Parameter '${param}' is required`;
    }
  }
  return null;
}

/**
 * Validate request body has required fields
 */
export function validateBody(body: any, required: string[]): string | null {
  if (!body || typeof body !== 'object') {
    return 'Request body is required';
  }

  for (const field of required) {
    if (body[field] === undefined || body[field] === null) {
      return `Field '${field}' is required`;
    }
  }
  return null;
}

/**
 * Validate UUID format
 */
export function isValidUuid(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate and extract parameters from request
 */
export function validateRequestParams(
  event: RequestEvent,
  requiredParams: string[] = [],
  validateIds: string[] = []
) {
  // Validate required parameters
  const paramError = validateParams(event.params, requiredParams);
  if (paramError) {
    throw svelteError(400, paramError);
  }

  // Validate UUID format for specified ID parameters
  for (const idParam of validateIds) {
    const id = event.params[idParam as keyof typeof event.params];
    if (id && !isValidUuid(id)) {
      throw svelteError(400, `Invalid ${idParam} format`);
    }
  }

  return event.params;
}

/**
 * Validate and parse JSON request body
 */
export async function validateRequestBody(request: Request, requiredFields: string[] = []) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw svelteError(400, 'Invalid JSON in request body');
  }

  const bodyError = validateBody(body, requiredFields);
  if (bodyError) {
    throw svelteError(400, bodyError);
  }

  return body;
}

/**
 * Validate query parameters
 */
export function validateQueryParams(
  url: URL,
  requiredParams: string[] = []
): Record<string, string> {
  const params: Record<string, string> = {};

  for (const param of requiredParams) {
    const value = url.searchParams.get(param);
    if (!value) {
      throw svelteError(400, `Query parameter '${param}' is required`);
    }
    params[param] = value;
  }

  return params;
}

/**
 * Standard CRUD response helpers
 */
export const CrudResponses = {
  created: <T>(data: T) => apiSuccess(data, 'Resource created successfully'),
  updated: <T>(data: T) => apiSuccess(data, 'Resource updated successfully'),
  deleted: () => apiSuccess(null, 'Resource deleted successfully'),
  notFound: (resource: string = 'Resource') => apiError(`${resource} not found`, 404),
  list: <T>(items: T[], total?: number) =>
    apiSuccess({
      items,
      ...(total !== undefined && { total })
    })
};
