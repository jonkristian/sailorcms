// Client-safe database exports - types only
// Server-only database connection and schema are in index.server.ts

// Re-export types for CLI compatibility
export * from '../../generated/types';

// Note: For client-side components, import directly from generated/types
// This prevents schema from being included in client bundles
