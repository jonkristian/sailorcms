// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      user?: {
        id: string;
        email: string;
        name: string;
        role: string;
        image?: string | null;
      };
      session?: Record<string, unknown>; // Add session property for better-auth
      security?: import('$sailor/core/rbac/security').Security;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
