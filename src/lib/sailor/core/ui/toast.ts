import { toast as sonnerToast } from 'svelte-sonner';

type AnyToastOptions = Parameters<typeof sonnerToast>[1];

function baseToast(message: string, options: AnyToastOptions = {}) {
  return sonnerToast(message, { duration: options.duration ?? 3000, ...options });
}

baseToast.success = (message: string, options: AnyToastOptions = {}) =>
  sonnerToast.success(message, { duration: options.duration ?? 3000, ...options });

baseToast.error = (message: string, options: AnyToastOptions = {}) =>
  sonnerToast.error(message, { duration: options.duration ?? 3000, ...options });

baseToast.dismiss = (id?: number | string) => sonnerToast.dismiss(id);

export const toast = baseToast as typeof sonnerToast & {
  (message: string, options?: AnyToastOptions): number | string;
  success: (message: string, options?: AnyToastOptions) => number | string;
  error: (message: string, options?: AnyToastOptions) => number | string;
  dismiss: (id?: number | string) => void;
};
