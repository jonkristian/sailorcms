<script lang="ts">
  import './WysiwygField.css';
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { Editor } from '@tiptap/core';
  import type { Editor as TiptapEditor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import { Extension } from '@tiptap/core';
  import Link from '@tiptap/extension-link';
  import TextAlign from '@tiptap/extension-text-align';
  import Underline from '@tiptap/extension-underline';
  import { CustomImageExtension } from 'sailorcms/core/editor/extensions/CustomImageExtension';
  import { PlainBulletList } from 'sailorcms/core/editor/extensions/PlainBulletList';
  import { getFiles } from 'sailorcms/remote/files.remote.js';
  import * as Tooltip from 'sailorcms/components/ui/tooltip/index.js';
  import TooltipButton from 'sailorcms/components/sailor/TooltipButton.svelte';
  import { Separator } from 'sailorcms/components/ui/separator/index.js';
  import LinkDialog from 'sailorcms/components/sailor/dialogs/LinkDialog.svelte';
  import {
    Bold,
    Italic,
    Underline as UnderlineIcon,
    Strikethrough,
    List,
    ListOrdered,
    Menu as PlainListIcon,
    AlignLeft,
    AlignCenter,
    AlignRight,
    Link as LinkIcon,
    Link2,
    Heading1,
    Heading2,
    Heading3,
    Heading4,
    Heading5,
    Heading6,
    Code,
    Quote,
    Eye,
    ImageIcon
  } from '@lucide/svelte';
  import { cn } from 'sailorcms/utils/shadcn.js';
  import { formatHTML, cleanFormattedHTML, tiptapJsonToHtml } from 'sailorcms/core/content/content';
  import FilePicker from 'sailorcms/components/sailor/files/file-picker.svelte';
  import { m } from '$sailor/i18n';

  type EditorMode = 'minimal' | 'compact' | 'full';

  const {
    value,
    mode = 'full',
    enterKey = 'paragraph',
    placeholder,
    required,
    height,
    maxHeight,
    onChange
  }: {
    value: string | object;
    mode?: EditorMode;
    /**
     * What Enter does. `'paragraph'` (default) starts a new paragraph and
     * Shift+Enter inserts a line break; `'break'` swaps them, for fields whose
     * content is a single block of lines — an address, say — where a paragraph
     * per line is wrong.
     */
    enterKey?: 'paragraph' | 'break';
    placeholder?: string;
    required?: boolean;
    height?: string;
    maxHeight?: string;
    onChange: (value: string | object) => void;
  } = $props();

  const defaultMinHeight = $derived(
    mode === 'minimal' ? '60px' : mode === 'compact' ? '120px' : '400px'
  );
  const computedMinHeight = $derived(height || defaultMinHeight);
  const computedMaxHeight = $derived(maxHeight || 'none');

  let editorState = $state<{ editor: TiptapEditor | null }>({ editor: null });
  const editor = $derived(editorState.editor);

  /**
   * Toolbar state, rebuilt on every transaction.
   *
   * `editorState.editor` holds the same Editor instance for the life of the
   * field, so a `$derived` that returns it never propagates: Svelte compares
   * the result, sees an unchanged object and stops there. Every
   * `editor.isActive(...)` in the markup therefore froze at whatever was true
   * on mount.
   *
   * Bumping a counter and returning fresh closures gives the template
   * something whose identity does change, so active states follow the caret.
   */
  let transactionCount = $state(0);

  const isActive = $derived.by(() => {
    void transactionCount;
    const e = editorState.editor;
    return (name: any, attrs?: any) => (e ? e.isActive(name, attrs) : false);
  });

  const activeAttributes = $derived.by(() => {
    void transactionCount;
    const e = editorState.editor;
    return (name: string) => (e ? e.getAttributes(name) : {});
  });
  let element = $state() as HTMLElement;
  let showSource = $state(false);
  let sourceContent = $state('');
  let showLinkDialog = $state(false);
  let currentLinkData = $state(null) as { url: string; text: string; target: string } | null;
  let showImagePicker = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Sanitize stored HTML: wrap bare text nodes in <p>, drop empty <p>s
  function sanitizeContent(content: string): string {
    if (!content || !content.trim()) return '';
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
    const container = doc.body.firstChild as HTMLElement;
    if (!container) return `<p>${content}</p>`;

    const result: string[] = [];
    container.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();
        if (text) result.push(`<p>${text}</p>`);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (el.tagName === 'P' && !el.textContent?.trim()) return;
        result.push(el.outerHTML);
      }
    });
    return result.join('') || `<p>${content}</p>`;
  }

  function getInitialContent() {
    if (typeof value === 'object') return tiptapJsonToHtml(value);
    if (typeof value === 'string' && value.trim()) return sanitizeContent(value);
    return value;
  }

  /**
   * Swaps Enter and Shift+Enter.
   *
   * Precedence comes from `priority`, not from position in the array: TipTap
   * builds its plugins from `[...extensions].reverse()`, so ordering alone
   * would have let HardBreak's own `Shift-Enter` win and make a new paragraph
   * unreachable.
   */
  const SwapEnter = Extension.create({
    name: 'sailorSwapEnter',
    priority: 1000,
    addKeyboardShortcuts() {
      return {
        Enter: () => this.editor.commands.setHardBreak(),
        'Shift-Enter': () => this.editor.commands.splitBlock()
      };
    }
  });

  function getExtensions() {
    const base = buildExtensions();
    return enterKey === 'break' ? [SwapEnter, ...base] : base;
  }

  function buildExtensions() {
    if (mode === 'minimal') {
      return [
        StarterKit.configure({
          heading: false,
          bulletList: false,
          orderedList: false,
          blockquote: false,
          codeBlock: false,
          code: false,
          horizontalRule: false,
          link: false,
          underline: false
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: { class: 'text-blue-600 underline hover:text-blue-800' }
        }),
        Underline
      ];
    }

    if (mode === 'compact') {
      return [
        StarterKit.configure({
          codeBlock: false,
          horizontalRule: false,
          link: false,
          underline: false,
          // Replaced below, so a list can drop its markers.
          bulletList: false
        }),
        PlainBulletList,
        Link.configure({
          openOnClick: false,
          HTMLAttributes: { class: 'text-blue-600 underline hover:text-blue-800' }
        }),
        Underline
      ];
    }

    // Full
    return [
      StarterKit.configure({ link: false, underline: false, bulletList: false }),
      PlainBulletList,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-blue-600 underline hover:text-blue-800' }
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      CustomImageExtension
    ];
  }

  onMount(() => {
    if (!browser) return;

    editorState = {
      editor: new Editor({
        element,
        extensions: getExtensions(),
        content: getInitialContent(),
        editorProps: {
          attributes: {
            class: 'focus:outline-none p-4 prose prose-sm max-w-none'
          }
        },
        onUpdate: ({ editor: e }) => {
          if (showSource) return;
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(
            () => {
              const htmlContent = e
                .getHTML()
                .replace(/<p>\s*<\/p>/g, '')
                .replace(/<p>\n<\/p>/g, '')
                .trim();
              onChange(htmlContent);
            },
            mode === 'minimal' ? 300 : 500
          );
        },
        onTransaction: () => {
          transactionCount++;
        }
      })
    };
  });

  onDestroy(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    editor?.destroy();
  });

  // Toolbar actions
  function toggleBold() {
    editor?.chain().focus().toggleBold().run();
  }

  function toggleItalic() {
    editor?.chain().focus().toggleItalic().run();
  }

  function toggleUnderline() {
    editor?.chain().focus().toggleUnderline().run();
  }

  function toggleStrike() {
    editor?.chain().focus().toggleStrike().run();
  }

  function toggleBulletList() {
    editor?.chain().focus().toggleBulletList().run();
  }

  /**
   * Toggle a marker-less list, matching how the bullet and numbered buttons
   * behave: off when you are already in one, on otherwise.
   *
   * Creating the list and dropping its markers are two separate `run()` calls,
   * not one chain. Chaining would leave `updateAttributes` looking for a
   * `bulletList` in the same transaction that creates it; two transactions
   * mean the second is applied to a document that certainly has one.
   */
  function togglePlainList() {
    if (!editor) return;

    if (!editor.isActive('bulletList')) {
      editor.chain().focus().toggleBulletList().run();
      editor.chain().focus().updateAttributes('bulletList', { plain: true }).run();
      return;
    }

    if (editor.getAttributes('bulletList')?.plain === true) {
      editor.chain().focus().toggleBulletList().run();
      return;
    }

    editor.chain().focus().updateAttributes('bulletList', { plain: true }).run();
  }

  function toggleOrderedList() {
    editor?.chain().focus().toggleOrderedList().run();
  }

  function setTextAlign(align: 'left' | 'center' | 'right' | 'justify') {
    editor?.chain().focus().setTextAlign(align).run();
  }

  function addLink() {
    // Check if we're editing an existing link
    const linkData = editor?.getAttributes('link');
    const selectedText =
      editor?.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to) || '';

    // If we have link data, we're editing an existing link
    if (linkData?.href) {
      currentLinkData = {
        url: linkData.href,
        text: selectedText,
        target: linkData.target || '_self'
      };
    } else {
      // Creating a new link
      currentLinkData = {
        url: '',
        text: selectedText,
        target: '_self'
      };
    }
    showLinkDialog = true;
  }

  function removeLink() {
    editor?.chain().focus().unsetLink().run();
  }

  function handleLinkSubmit(url: string, text: string, target: string) {
    if (url.trim()) {
      // Check if we're editing an existing link
      const linkData = editor?.getAttributes('link');

      if (linkData?.href) {
        // Editing existing link - replace the current link
        const linkContent = text.trim() || url.trim();
        const targetAttr = target !== '_self' ? ` target="${target}"` : '';
        const relAttr = target === '_blank' ? ' rel="noopener noreferrer"' : '';
        editor
          ?.chain()
          .focus()
          .insertContent(`<a href="${url.trim()}"${targetAttr}${relAttr}>${linkContent}</a>`)
          .run();
      } else {
        // Creating new link
        const linkContent = text.trim() || url.trim();
        const targetAttr = target !== '_self' ? ` target="${target}"` : '';
        const relAttr = target === '_blank' ? ' rel="noopener noreferrer"' : '';
        editor
          ?.chain()
          .focus()
          .insertContent(`<a href="${url.trim()}"${targetAttr}${relAttr}>${linkContent}</a>`)
          .run();
      }
    }
    showLinkDialog = false;
    currentLinkData = null;
  }

  function handleLinkCancel() {
    showLinkDialog = false;
  }

  function setHeading(level: 1 | 2 | 3 | 4 | 5 | 6) {
    editor?.chain().focus().toggleHeading({ level }).run();
  }

  function setParagraph() {
    editor?.chain().focus().setParagraph().run();
  }

  function toggleSourceView() {
    if (showSource) {
      // Switching from source to rich text
      showSource = false;
      if (editor) {
        try {
          // Clean the formatted HTML first
          const cleanedHTML = cleanFormattedHTML(sourceContent);

          // Use TipTap's setContent command which handles HTML parsing internally
          // This is more reliable than manual JSON parsing
          editor.commands.setContent(cleanedHTML, { emitUpdate: true });

          // Focus the editor to ensure it's properly initialized
          editor.commands.focus();

          // TipTap's onUpdate will handle the onChange callback automatically
          // but we add a small delay to ensure the content is fully processed
          setTimeout(() => {
            if (editor && !showSource) {
              editor.view.updateState(editor.view.state);
            }
          }, 10);
        } catch (error) {
          console.warn('Error setting content from source view:', error);
          // Fallback: try with raw content
          editor.commands.setContent(sourceContent || '', { emitUpdate: true });
        }
      }
    } else {
      // Switching from rich text to source
      showSource = true;
      // Use TipTap's getHTML() which gives us the current editor content as HTML
      const rawHTML = editor?.getHTML() || '';
      sourceContent = formatHTML(rawHTML);
    }
  }

  function updateSourceContent() {
    if (showSource) {
      // When in source view, clean up the formatted HTML and save as HTML string
      try {
        const cleanedHTML = cleanFormattedHTML(sourceContent);
        onChange(cleanedHTML);
      } catch (error) {
        console.warn('Error updating source content:', error);
        // If cleaning fails, save the raw content
        onChange(sourceContent);
      }
    }
  }

  function toggleBlockquote() {
    editor?.chain().focus().toggleBlockquote().run();
  }

  function toggleCode() {
    editor?.chain().focus().toggleCode().run();
  }

  function openImagePicker() {
    showImagePicker = true;
  }

  async function handleImageSelect(selectedValue: string | string[]) {
    if (typeof selectedValue === 'string' && selectedValue) {
      try {
        const result = await getFiles({ ids: [selectedValue], limit: 1 });

        if (result.success && (result as any).files && (result as any).files.length > 0) {
          const file = (result as any).files[0];
          editor
            ?.chain()
            .focus()
            .setCustomImage({ src: file.url, alt: file.name || '', alignment: 'none' })
            .run();
        }
      } catch (error) {
        console.error('Error loading image:', error);
      }
    }
    showImagePicker = false;
  }
</script>

<Tooltip.Provider delayDuration={200}>
  <div class="space-y-2">
    <!-- Unified editor container with border around both toolbar and content -->
    <div class="bg-input-bg border-input rounded-lg border">
      <!-- Static toolbar for basic formatting -->
      <div class="border-input flex flex-wrap items-center justify-between gap-0.5 border-b p-1.5">
        <div class="flex items-center gap-0.5">
          <TooltipButton
            type="button"
            variant="ghost"
            size="sm"
            class={cn('h-7 w-7 p-0', isActive('bold') && 'bg-accent')}
            onclick={toggleBold}
            tooltip={m.wysiwyg_tooltip_bold()}
          >
            <Bold class="h-3.5 w-3.5" />
          </TooltipButton>
          <TooltipButton
            type="button"
            variant="ghost"
            size="sm"
            class={cn('h-7 w-7 p-0', isActive('italic') && 'bg-accent')}
            onclick={toggleItalic}
            tooltip={m.wysiwyg_tooltip_italic()}
          >
            <Italic class="h-3.5 w-3.5" />
          </TooltipButton>
          <TooltipButton
            type="button"
            variant="ghost"
            size="sm"
            class={cn('h-7 w-7 p-0', isActive('underline') && 'bg-accent')}
            onclick={toggleUnderline}
            tooltip={m.wysiwyg_tooltip_underline()}
          >
            <UnderlineIcon class="h-3.5 w-3.5" />
          </TooltipButton>
          <TooltipButton
            type="button"
            variant="ghost"
            size="sm"
            class={cn('h-7 w-7 p-0', isActive('strike') && 'bg-accent')}
            onclick={toggleStrike}
            tooltip={m.wysiwyg_tooltip_strikethrough()}
          >
            <Strikethrough class="h-3.5 w-3.5" />
          </TooltipButton>

          {#if mode !== 'minimal'}
            <Separator orientation="vertical" class="h-5" />

            {#if mode === 'full'}
              <TooltipButton
                type="button"
                variant="ghost"
                size="sm"
                class={cn('h-7 w-7 p-0', isActive('heading', { level: 1 }) && 'bg-accent')}
                onclick={() => setHeading(1)}
                tooltip={m.wysiwyg_tooltip_h1()}
              >
                <Heading1 class="h-3.5 w-3.5" />
              </TooltipButton>
            {/if}
            <TooltipButton
              type="button"
              variant="ghost"
              size="sm"
              class={cn('h-7 w-7 p-0', isActive('heading', { level: 2 }) && 'bg-accent')}
              onclick={() => setHeading(2)}
              tooltip={m.wysiwyg_tooltip_h2()}
            >
              <Heading2 class="h-3.5 w-3.5" />
            </TooltipButton>
            <TooltipButton
              type="button"
              variant="ghost"
              size="sm"
              class={cn('h-7 w-7 p-0', isActive('heading', { level: 3 }) && 'bg-accent')}
              onclick={() => setHeading(3)}
              tooltip={m.wysiwyg_tooltip_h3()}
            >
              <Heading3 class="h-3.5 w-3.5" />
            </TooltipButton>
            <TooltipButton
              type="button"
              variant="ghost"
              size="sm"
              class={cn('h-7 w-7 p-0', isActive('heading', { level: 4 }) && 'bg-accent')}
              onclick={() => setHeading(4)}
              tooltip={m.wysiwyg_tooltip_h4()}
            >
              <Heading4 class="h-3.5 w-3.5" />
            </TooltipButton>
            {#if mode === 'full'}
              <TooltipButton
                type="button"
                variant="ghost"
                size="sm"
                class={cn('h-7 w-7 p-0', isActive('heading', { level: 5 }) && 'bg-accent')}
                onclick={() => setHeading(5)}
                tooltip={m.wysiwyg_tooltip_h5()}
              >
                <Heading5 class="h-3.5 w-3.5" />
              </TooltipButton>
              <TooltipButton
                type="button"
                variant="ghost"
                size="sm"
                class={cn('h-7 w-7 p-0', isActive('heading', { level: 6 }) && 'bg-accent')}
                onclick={() => setHeading(6)}
                tooltip={m.wysiwyg_tooltip_h6()}
              >
                <Heading6 class="h-3.5 w-3.5" />
              </TooltipButton>
            {/if}

            <Separator orientation="vertical" class="h-5" />

            <!-- First of the list group: plain, then bulleted, then numbered,
                 fewest markers to most. Clicking outside a list starts one,
                 like its two siblings do. -->
            <TooltipButton
              type="button"
              variant="ghost"
              size="sm"
              class={cn(
                'h-7 w-7 p-0',
                activeAttributes('bulletList')?.plain === true && 'bg-accent'
              )}
              onclick={togglePlainList}
              tooltip={m.wysiwyg_tooltip_plain_list()}
            >
              <PlainListIcon class="h-3.5 w-3.5" />
            </TooltipButton>
            <TooltipButton
              type="button"
              variant="ghost"
              size="sm"
              class={cn('h-7 w-7 p-0', isActive('bulletList') && 'bg-accent')}
              onclick={toggleBulletList}
              tooltip={m.wysiwyg_tooltip_bullet_list()}
            >
              <List class="h-3.5 w-3.5" />
            </TooltipButton>
            <TooltipButton
              type="button"
              variant="ghost"
              size="sm"
              class={cn('h-7 w-7 p-0', isActive('orderedList') && 'bg-accent')}
              onclick={toggleOrderedList}
              tooltip={m.wysiwyg_tooltip_numbered_list()}
            >
              <ListOrdered class="h-3.5 w-3.5" />
            </TooltipButton>

            <Separator orientation="vertical" class="h-5" />

            <TooltipButton
              type="button"
              variant="ghost"
              size="sm"
              class={cn('h-7 w-7 p-0', isActive('blockquote') && 'bg-accent')}
              onclick={toggleBlockquote}
              tooltip={m.wysiwyg_tooltip_blockquote()}
            >
              <Quote class="h-3.5 w-3.5" />
            </TooltipButton>

            <Separator orientation="vertical" class="h-5" />

            <TooltipButton
              type="button"
              variant="ghost"
              size="sm"
              class={cn('h-7 w-7 p-0', isActive('code') && 'bg-accent')}
              onclick={toggleCode}
              tooltip={m.wysiwyg_tooltip_inline_code()}
            >
              <Code class="h-3.5 w-3.5" />
            </TooltipButton>
          {/if}

          {#if mode === 'full'}
            <Separator orientation="vertical" class="h-5" />

            <TooltipButton
              type="button"
              variant="ghost"
              size="sm"
              class="h-7 w-7 p-0"
              onclick={openImagePicker}
              tooltip={m.wysiwyg_tooltip_insert_image()}
            >
              <ImageIcon class="h-3.5 w-3.5" />
            </TooltipButton>

            <Separator orientation="vertical" class="h-5" />

            <TooltipButton
              type="button"
              variant="ghost"
              size="sm"
              class={cn('h-7 w-7 p-0', isActive({ textAlign: 'left' }) && 'bg-accent')}
              onclick={() => setTextAlign('left')}
              tooltip={m.wysiwyg_tooltip_align_left()}
            >
              <AlignLeft class="h-3.5 w-3.5" />
            </TooltipButton>
            <TooltipButton
              type="button"
              variant="ghost"
              size="sm"
              class={cn('h-7 w-7 p-0', isActive({ textAlign: 'center' }) && 'bg-accent')}
              onclick={() => setTextAlign('center')}
              tooltip={m.wysiwyg_tooltip_align_center()}
            >
              <AlignCenter class="h-3.5 w-3.5" />
            </TooltipButton>
            <TooltipButton
              type="button"
              variant="ghost"
              size="sm"
              class={cn('h-7 w-7 p-0', isActive({ textAlign: 'right' }) && 'bg-accent')}
              onclick={() => setTextAlign('right')}
              tooltip={m.wysiwyg_tooltip_align_right()}
            >
              <AlignRight class="h-3.5 w-3.5" />
            </TooltipButton>
          {/if}

          <Separator orientation="vertical" class="h-5" />

          <TooltipButton
            type="button"
            variant="ghost"
            size="sm"
            class={cn('h-7 w-7 p-0', isActive('link') && 'bg-accent')}
            onclick={addLink}
            tooltip={m.wysiwyg_tooltip_add_link()}
          >
            <LinkIcon class="h-3.5 w-3.5" />
          </TooltipButton>
          {#if isActive('link')}
            <TooltipButton
              type="button"
              variant="ghost"
              size="sm"
              class="h-7 w-7 p-0"
              onclick={removeLink}
              tooltip={m.wysiwyg_tooltip_remove_link()}
            >
              <Link2 class="h-3.5 w-3.5" />
            </TooltipButton>
          {/if}
        </div>

        <TooltipButton
          type="button"
          variant="ghost"
          size="sm"
          class={cn('h-7 w-7 p-0', showSource && 'bg-accent')}
          onclick={toggleSourceView}
          tooltip={m.wysiwyg_tooltip_source_view()}
        >
          <Eye class="h-3.5 w-3.5" />
        </TooltipButton>
      </div>

      <!-- Editor content area -->
      <div
        class="resize-y overflow-auto"
        style="min-height: {computedMinHeight}; max-height: {computedMaxHeight}; height: {computedMinHeight};"
      >
        {#if showSource}
          <textarea
            bind:value={sourceContent}
            oninput={updateSourceContent}
            class="w-full resize-none border-0 bg-transparent p-4 font-mono text-sm outline-none"
            style="min-height: {computedMinHeight};"
            placeholder={m.wysiwyg_source_placeholder()}
          ></textarea>
        {/if}
        <!-- Hidden rather than unmounted while the source view is open. TipTap
             attaches to this element once, on mount; taking it out of the DOM
             leaves the editor bound to a detached node, and coming back renders
             a fresh empty div that nothing is attached to. -->
        {#if browser}
          <div bind:this={element} class={showSource ? 'hidden' : ''}></div>
        {/if}
      </div>
    </div>

    {#if placeholder && !value}
      <div class="text-muted-foreground px-4 py-2 text-sm">
        {placeholder}
      </div>
    {/if}
  </div>
</Tooltip.Provider>

<!-- Link Dialog -->
<LinkDialog
  open={showLinkDialog}
  url={currentLinkData?.url || ''}
  text={currentLinkData?.text || ''}
  target={currentLinkData?.target || '_self'}
  onSubmit={handleLinkSubmit}
  onCancel={handleLinkCancel}
/>

<!-- Image Picker -->
<FilePicker
  value=""
  fileType="image"
  multiple={false}
  open={showImagePicker}
  selectOnRowClick={true}
  onSelect={handleImageSelect}
  onOpenChange={(isOpen) => (showImagePicker = isOpen)}
/>
