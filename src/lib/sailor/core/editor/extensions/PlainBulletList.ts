import { BulletList } from '@tiptap/extension-list/bullet-list';

/**
 * A bullet list that can drop its markers.
 *
 * Some content is a list semantically — a set of specifications, a run of
 * short lines — but should not render with bullets. Faking it with paragraphs
 * loses the list markup the frontend and screen readers rely on, so the marker
 * is made a property of the list instead.
 *
 * Stored as a class on the `<ul>` rather than a data attribute so the value
 * survives a round trip through plain HTML: sanitisers keep `class`, and the
 * consumer's own stylesheet can target it without knowing anything about
 * TipTap. `parseHTML` reads it back, so editing existing content keeps the
 * setting.
 */
export const PlainBulletList = BulletList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      plain: {
        default: false,
        parseHTML: (element: HTMLElement) => element.classList.contains('list-none'),
        renderHTML: (attributes: Record<string, any>) =>
          attributes.plain ? { class: 'list-none' } : {}
      }
    };
  }
});
