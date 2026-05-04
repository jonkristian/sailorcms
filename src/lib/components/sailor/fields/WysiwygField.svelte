<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { Editor } from '@tiptap/core';
  import type { Editor as TiptapEditor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import Link from '@tiptap/extension-link';
  import TextAlign from '@tiptap/extension-text-align';
  import Underline from '@tiptap/extension-underline';
  import { CustomImageExtension } from '$sailor/core/editor/extensions/CustomImageExtension';
  import { getFiles } from '$sailor/remote/files.remote.js';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import TooltipButton from '$lib/components/sailor/TooltipButton.svelte';
  import { Separator } from '$lib/components/ui/separator';
  import { LinkDialog } from '$lib/components/sailor/dialogs';
  import {
    Bold,
    Italic,
    Underline as UnderlineIcon,
    Strikethrough,
    List,
    ListOrdered,
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
  import { cn } from '$lib/sailor/utils';
  import {
    formatHTML,
    cleanFormattedHTML,
    tiptapJsonToHtml
  } from '$lib/sailor/core/content/content';
  import FilePicker from '$lib/components/sailor/files/file-picker.svelte';
  import { m } from '$sailor/i18n';

  type EditorMode = 'minimal' | 'compact' | 'full';

  const {
    value,
    mode = 'full',
    placeholder,
    required,
    height,
    maxHeight,
    onChange
  }: {
    value: string | object;
    mode?: EditorMode;
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

  function getExtensions() {
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
          underline: false
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: { class: 'text-blue-600 underline hover:text-blue-800' }
        }),
        Underline
      ];
    }

    // Full
    return [
      StarterKit.configure({ link: false, underline: false }),
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
        onTransaction: ({ editor: e }) => {
          editorState = { editor: e };
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
        const result = await getFiles({ ids: [selectedValue], limit: 1 }).run();

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
            class={cn('h-7 w-7 p-0', editor?.isActive('bold') && 'bg-accent')}
            onclick={toggleBold}
            tooltip={m.wysiwyg_tooltip_bold()}
          >
            <Bold class="h-3.5 w-3.5" />
          </TooltipButton>
          <TooltipButton
            type="button"
            variant="ghost"
            size="sm"
            class={cn('h-7 w-7 p-0', editor?.isActive('italic') && 'bg-accent')}
            onclick={toggleItalic}
            tooltip={m.wysiwyg_tooltip_italic()}
          >
            <Italic class="h-3.5 w-3.5" />
          </TooltipButton>
          <TooltipButton
            type="button"
            variant="ghost"
            size="sm"
            class={cn('h-7 w-7 p-0', editor?.isActive('underline') && 'bg-accent')}
            onclick={toggleUnderline}
            tooltip={m.wysiwyg_tooltip_underline()}
          >
            <UnderlineIcon class="h-3.5 w-3.5" />
          </TooltipButton>
          <TooltipButton
            type="button"
            variant="ghost"
            size="sm"
            class={cn('h-7 w-7 p-0', editor?.isActive('strike') && 'bg-accent')}
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
                class={cn('h-7 w-7 p-0', editor?.isActive('heading', { level: 1 }) && 'bg-accent')}
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
              class={cn('h-7 w-7 p-0', editor?.isActive('heading', { level: 2 }) && 'bg-accent')}
              onclick={() => setHeading(2)}
              tooltip={m.wysiwyg_tooltip_h2()}
            >
              <Heading2 class="h-3.5 w-3.5" />
            </TooltipButton>
            <TooltipButton
              type="button"
              variant="ghost"
              size="sm"
              class={cn('h-7 w-7 p-0', editor?.isActive('heading', { level: 3 }) && 'bg-accent')}
              onclick={() => setHeading(3)}
              tooltip={m.wysiwyg_tooltip_h3()}
            >
              <Heading3 class="h-3.5 w-3.5" />
            </TooltipButton>
            <TooltipButton
              type="button"
              variant="ghost"
              size="sm"
              class={cn('h-7 w-7 p-0', editor?.isActive('heading', { level: 4 }) && 'bg-accent')}
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
                class={cn('h-7 w-7 p-0', editor?.isActive('heading', { level: 5 }) && 'bg-accent')}
                onclick={() => setHeading(5)}
                tooltip={m.wysiwyg_tooltip_h5()}
              >
                <Heading5 class="h-3.5 w-3.5" />
              </TooltipButton>
              <TooltipButton
                type="button"
                variant="ghost"
                size="sm"
                class={cn('h-7 w-7 p-0', editor?.isActive('heading', { level: 6 }) && 'bg-accent')}
                onclick={() => setHeading(6)}
                tooltip={m.wysiwyg_tooltip_h6()}
              >
                <Heading6 class="h-3.5 w-3.5" />
              </TooltipButton>
            {/if}

            <Separator orientation="vertical" class="h-5" />

            <TooltipButton
              type="button"
              variant="ghost"
              size="sm"
              class={cn('h-7 w-7 p-0', editor?.isActive('bulletList') && 'bg-accent')}
              onclick={toggleBulletList}
              tooltip={m.wysiwyg_tooltip_bullet_list()}
            >
              <List class="h-3.5 w-3.5" />
            </TooltipButton>
            <TooltipButton
              type="button"
              variant="ghost"
              size="sm"
              class={cn('h-7 w-7 p-0', editor?.isActive('orderedList') && 'bg-accent')}
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
              class={cn('h-7 w-7 p-0', editor?.isActive('blockquote') && 'bg-accent')}
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
              class={cn('h-7 w-7 p-0', editor?.isActive('code') && 'bg-accent')}
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
              class={cn('h-7 w-7 p-0', editor?.isActive({ textAlign: 'left' }) && 'bg-accent')}
              onclick={() => setTextAlign('left')}
              tooltip={m.wysiwyg_tooltip_align_left()}
            >
              <AlignLeft class="h-3.5 w-3.5" />
            </TooltipButton>
            <TooltipButton
              type="button"
              variant="ghost"
              size="sm"
              class={cn('h-7 w-7 p-0', editor?.isActive({ textAlign: 'center' }) && 'bg-accent')}
              onclick={() => setTextAlign('center')}
              tooltip={m.wysiwyg_tooltip_align_center()}
            >
              <AlignCenter class="h-3.5 w-3.5" />
            </TooltipButton>
            <TooltipButton
              type="button"
              variant="ghost"
              size="sm"
              class={cn('h-7 w-7 p-0', editor?.isActive({ textAlign: 'right' }) && 'bg-accent')}
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
            class={cn('h-7 w-7 p-0', editor?.isActive('link') && 'bg-accent')}
            onclick={addLink}
            tooltip={m.wysiwyg_tooltip_add_link()}
          >
            <LinkIcon class="h-3.5 w-3.5" />
          </TooltipButton>
          {#if editor?.isActive('link')}
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
        {:else if browser}
          <div bind:this={element}></div>
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

<style>
  /* TipTap Editor Content Styling */
  :global(.ProseMirror) {
    outline: none;
    min-height: 100%;
    padding: 1rem;
  }

  /* Ensure the editor container has proper height */
  :global(.ProseMirror-focused) {
    outline: none;
  }

  /* Paragraphs */
  :global(.ProseMirror p) {
    margin: 0.5em 0;
    line-height: 1.6;
    font-size: 0.9rem;
  }

  /* Headings */
  :global(.ProseMirror h1) {
    font-size: 1.3em;
    font-weight: bold;
    margin: 0.75em 0 0.5em 0;
    line-height: 1.3;
  }

  :global(.ProseMirror h2) {
    font-size: 1.1em;
    font-weight: bold;
    margin: 0.75em 0 0.5em 0;
    line-height: 1.3;
  }

  :global(.ProseMirror h3) {
    font-size: 1em;
    font-weight: bold;
    margin: 0.75em 0 0.5em 0;
    line-height: 1.3;
  }

  :global(.ProseMirror h4) {
    font-size: 0.95em;
    font-weight: bold;
    margin: 0.75em 0 0.5em 0;
    line-height: 1.3;
  }

  :global(.ProseMirror h5) {
    font-size: 0.9em;
    font-weight: bold;
    margin: 0.75em 0 0.5em 0;
    line-height: 1.3;
  }

  :global(.ProseMirror h6) {
    font-size: 0.85em;
    font-weight: bold;
    margin: 0.75em 0 0.5em 0;
    line-height: 1.3;
  }

  /* Lists */
  :global(.ProseMirror ul),
  :global(.ProseMirror ol) {
    margin: 0.5em 0;
    padding-left: 1.5em;
  }

  :global(.ProseMirror li) {
    margin: 0.25em 0;
    line-height: 1.6;
  }

  :global(.ProseMirror ul li) {
    list-style-type: disc;
  }

  :global(.ProseMirror ol li) {
    list-style-type: decimal;
  }

  /* Nested lists */
  :global(.ProseMirror ul ul),
  :global(.ProseMirror ol ol),
  :global(.ProseMirror ul ol),
  :global(.ProseMirror ol ul) {
    margin: 0.25em 0;
  }

  :global(.ProseMirror ul ul li) {
    list-style-type: circle;
  }

  :global(.ProseMirror ul ul ul li) {
    list-style-type: square;
  }

  /* Blockquotes */
  :global(.ProseMirror blockquote) {
    border-left: 3px solid #ddd;
    margin: 0.75em 0;
    padding-left: 1em;
    font-style: italic;
    color: #666;
  }

  /* Code */
  :global(.ProseMirror code) {
    background-color: #f1f1f1;
    padding: 0.2em 0.4em;
    border-radius: 3px;
    font-family: monospace;
    font-size: 0.9em;
  }

  :global(.ProseMirror pre) {
    background-color: rgba(0, 0, 0, 0.2);
    padding: 1em;
    border-radius: 4px;
    overflow-x: auto;
    margin: 0.75em 0;
  }

  :global(.ProseMirror pre code) {
    background-color: transparent;
    padding: 0;
  }

  /* Links */
  :global(.ProseMirror a) {
    color: #3b82f6;
    text-decoration: underline;
  }

  :global(.ProseMirror a:hover) {
    color: #1d4ed8;
  }

  /* Text alignment */
  :global(.ProseMirror .text-left) {
    text-align: left;
  }

  :global(.ProseMirror .text-center) {
    text-align: center;
  }

  :global(.ProseMirror .text-right) {
    text-align: right;
  }

  :global(.ProseMirror .text-justify) {
    text-align: justify;
  }

  /* Images - using framework-agnostic CSS */
  :global(.ProseMirror img),
  :global(.tiptap-image) {
    max-width: 100%;
    height: auto;
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    display: block;
  }

  :global(.ProseMirror img.ProseMirror-selectednode) {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }

  /* Custom image extension alignment with proper text wrapping */
  :global(.ProseMirror .image-container) {
    position: relative;
    line-height: 0;
    overflow: visible; /* Allow outline to show */
  }

  /* Image alignment - consistent using padding to avoid margin collapse */
  :global(.ProseMirror .image-container.align-left) {
    float: left !important;
    padding: 0.5em 1em 0.5em 0 !important;
    margin: 0 !important;
    clear: left;
  }

  :global(.ProseMirror .image-container.align-right) {
    float: right !important;
    padding: 0.5em 0 0.5em 1em !important;
    margin: 0 !important;
    clear: right;
  }

  :global(.ProseMirror .image-container.align-center) {
    display: block !important;
    padding: 0.5em 0 !important;
    margin: 0 auto !important;
    float: none !important;
    clear: both;
    text-align: center;
  }

  :global(.ProseMirror .image-container.align-center .tiptap-image) {
    margin: 0 auto !important;
  }

  /* Default alignment (none) - consistent with other alignments */
  :global(.ProseMirror .image-container:not(.align-left):not(.align-right):not(.align-center)) {
    display: inline-block;
    padding: 0.5em 0;
    margin: 0;
    float: none;
  }

  /* Image styles */
  :global(.ProseMirror .image-container .tiptap-image) {
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    max-width: 100%;
    height: auto;
    display: block;
  }

  /* Ensure paragraphs can wrap around floated images */
  :global(.ProseMirror p) {
    overflow: visible;
    line-height: 1.6;
  }

  /* Fix container to properly contain floated images */
  :global(.ProseMirror) {
    overflow: hidden; /* Contains floated children */
  }

  /* Alternative containment method using clearfix */
  :global(.ProseMirror::after) {
    content: '';
    display: table;
    clear: both;
  }

  /* Ensure floated images don't escape editor bounds */
  :global(.ProseMirror .image-container) {
    max-width: 100%;
    box-sizing: border-box;
  }

  /* Resize handle styles for better visibility and interaction */
  :global(.ProseMirror .image-container .resize-handle) {
    position: absolute;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    transition:
      opacity 150ms ease-in-out,
      transform 150ms ease-in-out,
      box-shadow 150ms ease-in-out;
    pointer-events: auto;
    z-index: 15;
  }

  :global(.ProseMirror .image-container .resize-handle:hover) {
    transform: scale(1.1) !important;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  }

  /* Ensure resize handle is properly positioned relative to the image for all alignments */
  :global(.ProseMirror .image-container.align-left .resize-handle),
  :global(.ProseMirror .image-container.align-right .resize-handle),
  :global(.ProseMirror .image-container.align-center .resize-handle),
  :global(.ProseMirror .image-container .resize-handle) {
    bottom: -5px;
    right: -5px;
    left: auto;
    top: auto;
  }

  /* Empty paragraph placeholder */
  :global(.ProseMirror p.is-editor-empty:first-child::before) {
    color: #adb5bd;
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
  }
</style>
