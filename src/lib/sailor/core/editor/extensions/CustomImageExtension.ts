import { Node, mergeAttributes, type NodeViewRenderer } from '@tiptap/core';

interface CustomImageAttributes {
  src: string | null;
  alt: string | null;
  width: string | null;
  height: string | null;
  alignment: 'none' | 'left' | 'center' | 'right';
}

type AlignmentButton = HTMLButtonElement & {
  updateStyle?: (alignment: string) => void;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    customImage: {
      setCustomImage: (attributes: Partial<CustomImageAttributes>) => ReturnType;
      updateImageAlignment: (alignment: string) => ReturnType;
      updateImageSize: (options: { width: string; height: string }) => ReturnType;
    };
  }
}

export const CustomImageExtension = Node.create<Record<string, any>>({
  name: 'customImage',

  addOptions() {
    return {
      HTMLAttributes: {}
    };
  },

  group: 'inline',

  inline: true,

  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null
      },
      alt: {
        default: null
      },
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('width'),
        renderHTML: (attributes: CustomImageAttributes) => {
          if (!attributes.width) return {};
          return { width: attributes.width };
        }
      },
      height: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('height'),
        renderHTML: (attributes: CustomImageAttributes) => {
          if (!attributes.height) return {};
          return { height: attributes.height };
        }
      },
      alignment: {
        default: 'none',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-alignment') || 'none',
        renderHTML: (attributes: CustomImageAttributes) => {
          if (attributes.alignment === 'none') return {};
          return { 'data-alignment': attributes.alignment };
        }
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img',
        getAttrs: (element: HTMLElement) => ({
          src: element.getAttribute('src'),
          alt: element.getAttribute('alt'),
          width: element.getAttribute('width'),
          height: element.getAttribute('height'),
          alignment: element.getAttribute('data-alignment') || 'none'
        })
      }
    ];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, any> }) {
    const { alignment, ...imageAttrs } = HTMLAttributes;
    const alignmentClass = alignment && alignment !== 'none' ? `image-${alignment}` : '';
    const className = `tiptap-image ${alignmentClass}`.trim();

    const attrs: Record<string, string> = {
      class: className
    };

    // Only add data-alignment if alignment is not 'none'
    if (alignment && alignment !== 'none') {
      attrs['data-alignment'] = alignment;
    }

    return ['img', mergeAttributes(this.options.HTMLAttributes, imageAttrs, attrs)];
  },

  addCommands() {
    return {
      setCustomImage:
        (attributes: Partial<CustomImageAttributes>) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes
          });
        },
      updateImageAlignment:
        (alignment: string) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, { alignment });
        },
      updateImageSize:
        ({ width, height }: { width: string; height: string }) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, { width, height });
        }
    };
  },

  addNodeView(): NodeViewRenderer {
    return ({ node, getPos, editor }) => {
      const container = document.createElement('span');
      container.style.position = 'relative';
      const containerAlignClass =
        node.attrs.alignment && node.attrs.alignment !== 'none'
          ? `align-${node.attrs.alignment}`
          : '';
      container.className = `image-container ${containerAlignClass}`.trim();

      // Create an inner wrapper positioned directly around the image
      const imageWrapper = document.createElement('span');
      imageWrapper.style.cssText = `
        position: relative;
        display: inline-block;
        line-height: 0;
      `;

      const img = document.createElement('img');
      img.src = node.attrs.src;
      img.alt = node.attrs.alt || '';
      img.className =
        `tiptap-image ${node.attrs.alignment !== 'none' ? `image-${node.attrs.alignment}` : ''}`.trim();
      img.style.cursor = 'pointer';
      img.style.transition = 'outline 150ms ease-in-out';

      if (node.attrs.width) img.setAttribute('width', node.attrs.width);
      if (node.attrs.height) img.setAttribute('height', node.attrs.height);

      // Check for dark mode
      const isDarkMode =
        document.documentElement.classList.contains('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches;

      // Resize handle - visible on hover/focus with proper positioning
      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'resize-handle';
      resizeHandle.style.cssText = `
        position: absolute;
        bottom: -5px;
        right: -5px;
        width: 16px;
        height: 16px;
        background: ${isDarkMode ? 'hsl(217.2 91.2% 59.8%)' : 'hsl(221.2 83.2% 53.3%)'};
        border: 2px solid ${isDarkMode ? 'hsl(224 71.4% 4.1%)' : 'hsl(0 0% 100%)'};
        border-radius: 50%;
        cursor: se-resize;
        opacity: 0;
        transform: scale(0.8);
        transition: opacity 150ms ease-in-out, transform 150ms ease-in-out;
        z-index: 15;
        pointer-events: auto;
      `;

      // Position resize handle precisely on the image corner - now simpler with imageWrapper
      const updateResizeHandlePosition = (_alignment: string) => {
        // Since handle is now in imageWrapper, it's always positioned relative to the actual image
        resizeHandle.style.position = 'absolute';
        resizeHandle.style.bottom = '-5px';
        resizeHandle.style.right = '-5px';
        resizeHandle.style.left = 'auto';
        resizeHandle.style.top = 'auto';
      };

      // Initial positioning
      updateResizeHandlePosition(node.attrs.alignment);

      // Alignment menu with proper shadcn styling - positioned at top of image
      const alignmentMenu = document.createElement('div');
      alignmentMenu.className = 'alignment-menu';
      alignmentMenu.style.cssText = `
        position: absolute;
        top: 8px;
        left: 50%;
        transform: translateX(-50%);
        background: ${isDarkMode ? 'hsl(224 71.4% 4.1%)' : 'hsl(0 0% 100%)'};
        border: 1px solid ${isDarkMode ? 'hsl(215 27.9% 16.9%)' : 'hsl(214.3 31.8% 91.4%)'};
        border-radius: 6px;
        padding: 2px;
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        display: inline-flex;
        align-items: center;
        gap: 1px;
        opacity: 0;
        visibility: hidden;
        transition: opacity 150ms ease-in-out, visibility 150ms ease-in-out;
        z-index: 50;
        white-space: nowrap;
        backdrop-filter: blur(8px);
      `;

      // Alignment buttons with proper shadcn/ui styling like toggle group
      const alignments = [
        { name: 'left', icon: 'AlignLeft', title: 'Align Left' },
        { name: 'center', icon: 'AlignCenter', title: 'Center' },
        { name: 'right', icon: 'AlignRight', title: 'Align Right' }
      ] as const;

      alignments.forEach(({ name, icon, title }, index) => {
        const button = document.createElement('button') as AlignmentButton;
        button.className = 'alignment-btn';
        button.title = title;
        button.type = 'button';

        // Create SVG icon instead of emoji
        const svgIcons: Record<typeof icon, string> = {
          AlignLeft:
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" x2="3" y1="6" y2="6"/><line x1="15" x2="3" y1="12" y2="12"/><line x1="17" x2="3" y1="18" y2="18"/></svg>',
          AlignCenter:
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" x2="3" y1="6" y2="6"/><line x1="17" x2="7" y1="12" y2="12"/><line x1="19" x2="5" y1="18" y2="18"/></svg>',
          AlignRight:
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" x2="3" y1="6" y2="6"/><line x1="21" x2="9" y1="12" y2="12"/><line x1="21" x2="7" y1="18" y2="18"/></svg>'
        };

        button.innerHTML = svgIcons[icon];

        // Function to update button styling based on current alignment
        const updateButtonStyle = (currentAlignment: string) => {
          const isActive = currentAlignment === name;
          const isFirst = index === 0;
          const isLast = index === alignments.length - 1;

          button.style.cssText = `
            display: inline-flex;
            align-items: center;
            justify-content: center;
            white-space: nowrap;
            border-radius: ${isFirst ? '4px 0 0 4px' : isLast ? '0 4px 4px 0' : '0'};
            border: 1px solid ${isDarkMode ? 'hsl(215 27.9% 16.9%)' : 'hsl(214.3 31.8% 91.4%)'};
            border-left: ${!isFirst ? '0' : `1px solid ${isDarkMode ? 'hsl(215 27.9% 16.9%)' : 'hsl(214.3 31.8% 91.4%)'}`};
            background-color: ${
              isActive ? (isDarkMode ? 'hsl(215 27.9% 16.9%)' : 'hsl(210 40% 98%)') : 'transparent'
            };
            padding: 0;
            font-size: 14px;
            line-height: 1;
            height: 36px;
            width: 36px;
            cursor: pointer;
            transition: all 150ms ease-in-out;
            position: relative;
            color: ${
              isActive
                ? isDarkMode
                  ? 'hsl(210 40% 98%)'
                  : 'hsl(222.2 47.4% 11.2%)'
                : isDarkMode
                  ? 'hsl(215 20.2% 65.1%)'
                  : 'hsl(215.4 16.3% 46.9%)'
            };
          `;
        };

        // Initial styling
        updateButtonStyle(node.attrs.alignment);

        // Store update function on button for later use
        button.updateStyle = updateButtonStyle;

        // Hover effects that check current state dynamically
        button.addEventListener('mouseenter', () => {
          // Check current alignment from the actual node
          const currentPos = getPos();
          if (currentPos === undefined) return;
          const currentNode = editor.state.doc.nodeAt(currentPos);
          const currentAlignment = currentNode?.attrs?.alignment || 'none';
          const isCurrentlyActive = currentAlignment === name;

          if (!isCurrentlyActive) {
            button.style.backgroundColor = isDarkMode ? 'hsl(215 27.9% 16.9%)' : 'hsl(210 40% 96%)';
            button.style.color = isDarkMode ? 'hsl(210 40% 98%)' : 'hsl(222.2 47.4% 11.2%)';
          }
        });

        button.addEventListener('mouseleave', () => {
          // Restore to current state styling
          const currentPos = getPos();
          if (currentPos === undefined) return;
          const currentNode = editor.state.doc.nodeAt(currentPos);
          const currentAlignment = currentNode?.attrs?.alignment || 'none';
          updateButtonStyle(currentAlignment);
        });

        button.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();

          if (typeof getPos === 'function') {
            try {
              // Get current alignment from the actual editor state
              const currentPos = getPos();
              if (currentPos === undefined) return;
              const currentNode = editor.state.doc.nodeAt(currentPos);
              if (!currentNode) return;
              const currentAlignment = currentNode?.attrs?.alignment || 'none';

              // If clicking the already active alignment, deselect it (set to 'none')
              const newAlignment = currentAlignment === name ? 'none' : name;

              // Try alternative approach - directly update the node
              const transaction = editor.state.tr.setNodeMarkup(currentPos, null, {
                ...currentNode.attrs,
                alignment: newAlignment
              });

              editor.view.dispatch(transaction);

              // Update all button styles immediately with a small delay to ensure state change
              setTimeout(() => {
                alignmentMenu.querySelectorAll('.alignment-btn').forEach((btn) => {
                  const alignmentBtn = btn as AlignmentButton;
                  if (alignmentBtn.updateStyle) {
                    alignmentBtn.updateStyle(newAlignment);
                  }
                });
              }, 10);
            } catch (error) {
              console.error('Error in alignment click handler:', error);

              // Fallback to original method
              const pos = getPos();
              if (pos !== undefined) {
                editor
                  .chain()
                  .focus()
                  .setNodeSelection(pos)
                  .updateImageAlignment(name === node.attrs.alignment ? 'none' : name)
                  .run();
              }
            }
          }
        });

        alignmentMenu.appendChild(button);
      });

      // Click-to-focus visibility control with border indication
      let isImageFocused = false;

      const showControls = () => {
        isImageFocused = true;
        alignmentMenu.style.opacity = '1';
        alignmentMenu.style.visibility = 'visible';
        resizeHandle.style.opacity = '1';
        resizeHandle.style.transform = 'scale(1)';
        // Add focused border
        img.style.outline = `2px solid ${isDarkMode ? 'hsl(217.2 91.2% 59.8%)' : 'hsl(221.2 83.2% 53.3%)'}`;
        img.style.outlineOffset = '2px';
      };

      const hideControls = () => {
        isImageFocused = false;
        alignmentMenu.style.opacity = '0';
        alignmentMenu.style.visibility = 'hidden';
        resizeHandle.style.opacity = '0';
        resizeHandle.style.transform = 'scale(0.8)';
        // Remove focused border
        img.style.outline = 'none';
        img.style.outlineOffset = '0';
      };

      // Click on image to show/focus controls
      img.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isImageFocused) {
          showControls();
        }
      });

      // Click outside image to hide controls
      document.addEventListener('click', (e) => {
        const target = e.target;
        if (
          isImageFocused &&
          target &&
          target instanceof Element &&
          !container.contains(target) &&
          !alignmentMenu.contains(target)
        ) {
          hideControls();
        }
      });

      // Prevent menu clicks from hiding controls
      alignmentMenu.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      // Show controls on container hover for better UX
      container.addEventListener('mouseenter', () => {
        if (!isImageFocused) {
          showControls();
        }
      });

      container.addEventListener('mouseleave', () => {
        if (!isImageFocused) {
          hideControls();
        }
      });

      // Resize functionality
      let isResizing = false;
      let startX = 0;
      let startY = 0;
      let startWidth = 0;
      let startHeight = 0;

      resizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startWidth = img.offsetWidth;
        startHeight = img.offsetHeight;

        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
      });

      const handleResize = (e: MouseEvent) => {
        if (!isResizing) return;

        const deltaX = e.clientX - startX;

        const newWidth = Math.max(50, startWidth + deltaX);
        const aspectRatio = startWidth / startHeight;
        const newHeight = newWidth / aspectRatio;

        img.style.width = newWidth + 'px';
        img.style.height = newHeight + 'px';
      };

      const stopResize = () => {
        if (!isResizing) return;

        isResizing = false;
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);

        // Update the node attributes
        if (typeof getPos === 'function') {
          const pos = getPos();
          if (pos !== undefined) {
            const width = img.offsetWidth;
            const height = img.offsetHeight;

            editor
              .chain()
              .focus()
              .setNodeSelection(pos)
              .updateImageSize({ width: width.toString(), height: height.toString() })
              .run();
          }
        }
      };

      // Build the DOM structure: container > (imageWrapper > img + resizeHandle) + alignmentMenu
      imageWrapper.appendChild(img);
      imageWrapper.appendChild(resizeHandle);
      container.appendChild(imageWrapper);
      container.appendChild(alignmentMenu);

      return {
        dom: container,
        update: (updatedNode) => {
          if (updatedNode.type.name !== this.name) return false;

          img.src = updatedNode.attrs.src;
          img.alt = updatedNode.attrs.alt || '';

          if (updatedNode.attrs.width) {
            img.setAttribute('width', updatedNode.attrs.width);
            img.style.width = updatedNode.attrs.width + 'px';
          }
          if (updatedNode.attrs.height) {
            img.setAttribute('height', updatedNode.attrs.height);
            img.style.height = updatedNode.attrs.height + 'px';
          }

          // Update alignment class on image
          const alignmentClass =
            updatedNode.attrs.alignment && updatedNode.attrs.alignment !== 'none'
              ? `image-${updatedNode.attrs.alignment}`
              : '';
          img.className = `tiptap-image ${alignmentClass}`.trim();

          // Update container alignment class for better browser support
          const alignClass =
            updatedNode.attrs.alignment && updatedNode.attrs.alignment !== 'none'
              ? `align-${updatedNode.attrs.alignment}`
              : '';
          container.className = `image-container ${alignClass}`.trim();

          // Update alignment buttons using stored update functions
          alignmentMenu.querySelectorAll('.alignment-btn').forEach((btn) => {
            const alignmentBtn = btn as AlignmentButton;
            if (alignmentBtn.updateStyle) {
              alignmentBtn.updateStyle(updatedNode.attrs.alignment);
            }
          });

          // Update resize handle position based on new alignment
          updateResizeHandlePosition(updatedNode.attrs.alignment);

          return true;
        }
      };
    };
  }
});
