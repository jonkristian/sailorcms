<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import Link from '@tiptap/extension-link';
  import TextAlign from '@tiptap/extension-text-align';
  import Underline from '@tiptap/extension-underline';
  import { CustomImageExtension } from '$sailor/core/editor/extensions/CustomImageExtension';
  import { getFiles } from '$sailor/remote/files.remote.js';
  import { Button } from '$lib/components/ui/button';
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

  const { value, placeholder, required, onChange } = $props<{
    value: string | object; // Can be HTML string or JSON object
    placeholder?: string;
    required?: boolean;
    onChange: (value: string | object) => void;
  }>();

  let editor = $state() as Editor | undefined;
  let element = $state() as HTMLElement;
  let showSource = $state(false);
  let sourceContent = $state('');
  let showLinkDialog = $state(false);
  let currentLinkData = $state(null) as { url: string; text: string; target: string } | null;
  let showImagePicker = $state(false);

  // Helper function to get initial content
  function getInitialContent() {
    // If value is already JSON, convert to HTML for editor
    if (typeof value === 'object') {
      // Convert JSON to HTML for TipTap
      const htmlContent = tiptapJsonToHtml(value);
      return htmlContent;
    }

    // If value is HTML string, use as is
    return value;
  }

  onMount(() => {
    if (!browser) return;

    editor = new Editor({
      element: element,
      extensions: [
        StarterKit.configure({
          link: false, // We'll configure Link separately
          underline: false // We'll configure Underline separately
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: 'text-blue-600 underline hover:text-blue-800'
          }
        }),
        TextAlign.configure({
          types: ['heading', 'paragraph']
        }),
        Underline,
        CustomImageExtension
      ],
      content: getInitialContent(),
      editorProps: {
        attributes: {
          class: 'focus:outline-none min-h-[200px] p-4 prose prose-sm max-w-none'
        }
      },
      onUpdate: ({ editor }) => {
        // Only save as HTML when not in source view mode
        if (!showSource) {
          const htmlContent = editor.getHTML();
          onChange(htmlContent);
        }
      },
      onTransaction: () => {
        // force re-render so `editor.isActive` works as expected
        editor = editor;
      }
    });
  });

  onDestroy(() => {
    if (editor) {
      editor.destroy();
    }
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
        // Get the file data to access the URL
        const result = await getFiles({
          ids: [selectedValue],
          limit: 1
        });

        if (result.success && (result as any).files && (result as any).files.length > 0) {
          const file = (result as any).files[0];
          editor
            ?.chain()
            .focus()
            .setCustomImage({ src: file.url, alt: file.label, alignment: 'none' })
            .run();
        }
      } catch (error) {
        console.error('Error loading image:', error);
      }
    }
    showImagePicker = false;
  }
</script>

<div class="space-y-2">
  <!-- Unified editor container with border around both toolbar and content -->
  <div class="bg-background rounded-md border">
    <!-- Static toolbar for basic formatting -->
    <div class="bg-muted/30 flex flex-wrap items-center justify-between gap-0.5 border-b p-1.5">
      <div class="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class={cn('h-7 w-7 p-0', editor?.isActive('bold') && 'bg-accent')}
          onclick={toggleBold}
          title="Bold"
        >
          <Bold class="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class={cn('h-7 w-7 p-0', editor?.isActive('italic') && 'bg-accent')}
          onclick={toggleItalic}
          title="Italic"
        >
          <Italic class="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class={cn('h-7 w-7 p-0', editor?.isActive('underline') && 'bg-accent')}
          onclick={toggleUnderline}
          title="Underline"
        >
          <UnderlineIcon class="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class={cn('h-7 w-7 p-0', editor?.isActive('strike') && 'bg-accent')}
          onclick={toggleStrike}
          title="Strikethrough"
        >
          <Strikethrough class="h-3.5 w-3.5" />
        </Button>

        <Separator orientation="vertical" class="h-5" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          class={cn('h-7 w-7 p-0', editor?.isActive('heading', { level: 1 }) && 'bg-accent')}
          onclick={() => setHeading(1)}
          title="Heading 1"
        >
          <Heading1 class="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class={cn('h-7 w-7 p-0', editor?.isActive('heading', { level: 2 }) && 'bg-accent')}
          onclick={() => setHeading(2)}
          title="Heading 2"
        >
          <Heading2 class="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class={cn('h-7 w-7 p-0', editor?.isActive('heading', { level: 3 }) && 'bg-accent')}
          onclick={() => setHeading(3)}
          title="Heading 3"
        >
          <Heading3 class="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class={cn('h-7 w-7 p-0', editor?.isActive('heading', { level: 4 }) && 'bg-accent')}
          onclick={() => setHeading(4)}
          title="Heading 4"
        >
          <Heading4 class="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class={cn('h-7 w-7 p-0', editor?.isActive('heading', { level: 5 }) && 'bg-accent')}
          onclick={() => setHeading(5)}
          title="Heading 5"
        >
          <Heading5 class="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class={cn('h-7 w-7 p-0', editor?.isActive('heading', { level: 6 }) && 'bg-accent')}
          onclick={() => setHeading(6)}
          title="Heading 6"
        >
          <Heading6 class="h-3.5 w-3.5" />
        </Button>

        <Separator orientation="vertical" class="h-5" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          class={cn('h-7 w-7 p-0', editor?.isActive('bulletList') && 'bg-accent')}
          onclick={toggleBulletList}
          title="Bullet List"
        >
          <List class="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class={cn('h-7 w-7 p-0', editor?.isActive('orderedList') && 'bg-accent')}
          onclick={toggleOrderedList}
          title="Numbered List"
        >
          <ListOrdered class="h-3.5 w-3.5" />
        </Button>

        <Separator orientation="vertical" class="h-5" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          class={cn('h-7 w-7 p-0', editor?.isActive('blockquote') && 'bg-accent')}
          onclick={toggleBlockquote}
          title="Blockquote"
        >
          <Quote class="h-3.5 w-3.5" />
        </Button>

        <Separator orientation="vertical" class="h-5" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          class={cn('h-7 w-7 p-0', editor?.isActive('code') && 'bg-accent')}
          onclick={toggleCode}
          title="Inline Code"
        >
          <Code class="h-3.5 w-3.5" />
        </Button>

        <Separator orientation="vertical" class="h-5" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-7 w-7 p-0"
          onclick={openImagePicker}
          title="Insert Image"
        >
          <ImageIcon class="h-3.5 w-3.5" />
        </Button>

        <Separator orientation="vertical" class="h-5" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          class={cn('h-7 w-7 p-0', editor?.isActive({ textAlign: 'left' }) && 'bg-accent')}
          onclick={() => setTextAlign('left')}
          title="Align Left"
        >
          <AlignLeft class="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class={cn('h-7 w-7 p-0', editor?.isActive({ textAlign: 'center' }) && 'bg-accent')}
          onclick={() => setTextAlign('center')}
          title="Align Center"
        >
          <AlignCenter class="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class={cn('h-7 w-7 p-0', editor?.isActive({ textAlign: 'right' }) && 'bg-accent')}
          onclick={() => setTextAlign('right')}
          title="Align Right"
        >
          <AlignRight class="h-3.5 w-3.5" />
        </Button>

        <Separator orientation="vertical" class="h-5" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          class={cn('h-7 w-7 p-0', editor?.isActive('link') && 'bg-accent')}
          onclick={addLink}
          title="Add Link"
        >
          <LinkIcon class="h-3.5 w-3.5" />
        </Button>
        {#if editor?.isActive('link')}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class="h-7 w-7 p-0"
            onclick={removeLink}
            title="Remove Link"
          >
            <Link2 class="h-3.5 w-3.5" />
          </Button>
        {/if}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        class={cn('h-7 w-7 p-0', showSource && 'bg-accent')}
        onclick={toggleSourceView}
        title="Toggle Source View"
      >
        <Eye class="h-3.5 w-3.5" />
      </Button>
    </div>

    <!-- Editor content area -->
    <div class="min-h-[200px]">
      {#if showSource}
        <textarea
          bind:value={sourceContent}
          oninput={updateSourceContent}
          class="min-h-[200px] w-full resize-none border-0 bg-transparent p-4 font-mono text-sm outline-none"
          placeholder="Enter HTML content..."
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
  onSelect={handleImageSelect}
  onOpenChange={(isOpen) => (showImagePicker = isOpen)}
/>

<style>
  /* TipTap Editor Content Styling */
  :global(.ProseMirror) {
    outline: none;
    min-height: 200px;
    height: 100%;
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
