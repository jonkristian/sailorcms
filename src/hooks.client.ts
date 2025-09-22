import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = async ({ error, event, status, message }) => {
  const errorId = crypto.randomUUID();

  // Log error with basic context
  console.error('Client error:', {
    errorId,
    error: (error as Error)?.message || message,
    status,
    url: event.url?.href,
    timestamp: new Date().toISOString()
  });

  return {
    message: 'Something went wrong. Please try again.',
    errorId
  };
};
