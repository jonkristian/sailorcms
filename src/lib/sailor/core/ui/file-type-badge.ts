import { m } from '$sailor/i18n';

/**
 * Resolve a file's mime type into a translated badge label + tailwind
 * color classes. Categorizes by the top-level mime part (`image/*` →
 * image, `application/*` → document, etc.). Unknown / missing types
 * fall back to a muted "other" badge.
 */
export function getFileTypeBadge(mimeType: string | undefined | null): {
  label: string;
  classes: string;
} {
  const category = (mimeType?.split('/')[0] || 'other').toLowerCase();
  switch (category) {
    case 'image':
      return {
        label: m.file_type_image(),
        classes: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
      };
    case 'video':
      return {
        label: m.file_type_video(),
        classes: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
      };
    case 'audio':
      return {
        label: m.file_type_audio(),
        classes: 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300'
      };
    case 'application':
    case 'text':
      return {
        label: m.file_type_document(),
        classes: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'
      };
    default:
      return {
        label: m.file_type_other(),
        classes: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
      };
  }
}
