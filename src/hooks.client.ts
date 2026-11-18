import type { HandleClientError } from '@sveltejs/kit/hooks';

export const handleError: HandleClientError = async ({ kind, error, event }) => {
  // App errors (error(...)) and framework errors (404s) carry a safe message already.
  if (kind !== 'unknown') return;

  const errorId = crypto.randomUUID();

  console.error('Client error:', {
    errorId,
    error: (error as Error)?.message,
    url: event.url?.href,
    timestamp: new Date().toISOString()
  });

  return {
    message: 'Something went wrong. Please try again.',
    errorId
  };
};
