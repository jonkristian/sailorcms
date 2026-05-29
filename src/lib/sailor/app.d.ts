// Ambient type augmentation for App.Locals fields stamped by sailor's hooks.
//
// Consumer wiring (one-time, in your project's `src/app.d.ts`):
//
//   /// <reference types="sailorcms/app" />
//   export {};
//
// After that, `event.locals.user` / `.security` / `.contentLocale` are typed
// in every load function, +server.ts handler, etc. — no manual augmentation.
//
// If you have your own additions to `App.Locals` (e.g. analytics context),
// keep them in your own `app.d.ts` alongside the reference — the
// augmentations merge automatically.

declare global {
  namespace App {
    interface Locals {
      /**
       * Authenticated admin user (better-auth session). Populated by
       * `handleSailorHooks` from the request cookie. Undefined when the
       * request is unauthenticated.
       */
      user?: {
        id: string;
        email: string;
        name: string;
        role: string;
        image?: string | null;
        preferences?: string | null;
      };
      /**
       * Raw better-auth session object. Present alongside `user` when the
       * request is authenticated.
       */
      session?: Record<string, unknown>;
      /**
       * RBAC checker. `hasPermission('update', 'content')` returns true if
       * the current `locals.user` has that permission via better-auth's
       * access control. Always defined — returns false when no user.
       */
      security: {
        hasPermission: (action: string, resource: string) => Promise<boolean>;
      };
      /**
       * Resolved content locale for the current request (BCP-47, e.g.
       * `'nb-NO'`). Stamped by `handleSailorHooks` when the
       * `resolveContentLocale` option is configured AND the resolver returned
       * a non-falsy value. Undefined for admin routes (which use paraglide
       * for UI locale) and for projects without i18n configured.
       */
      contentLocale?: string;
    }
  }
}

export {};
