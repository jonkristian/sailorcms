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
        preferences?: string | null;
      };
      session?: Record<string, unknown>; // Add session property for better-auth
      security: {
        hasPermission: (action: string, resource: string) => Promise<boolean>;
      };
      /**
       * Resolved content locale for the current request (BCP-47, e.g. `'nb-NO'`).
       * Stamped by `handleSailorHooks` when `resolveContentLocale` is configured
       * and the resolver returned a non-null value. Undefined for admin routes
       * (which use paraglide for UI locale) and for unconfigured projects.
       */
      contentLocale?: string;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
