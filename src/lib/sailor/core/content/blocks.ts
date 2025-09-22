import {
  generateUUID,
  updateItemInArray,
  removeItemFromArray,
  addItemToArray
} from '../utils/common';

// Define a base type for all blocks
export interface BaseBlock {
  id: string;
  blockType: string;
  content: Record<string, unknown>;
  sort: number;
}

export type SchemaProperty = {
  type: string;
  title?: string;
  description?: string;
  properties?: Record<string, SchemaProperty>;
  items?: SchemaProperty;
};

export type Schema = {
  type: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
};

// Block manipulation functions
export const addBlock = (blocks: BaseBlock[], blockType: string, schema: Schema): BaseBlock[] => {
  // Create initial content based on schema properties
  const initialContent: Record<string, unknown> = {};
  const properties = schema.properties || {};
  Object.keys(properties).forEach((key) => {
    const prop = properties[key];
    if (prop.type === 'string') {
      initialContent[key] = '';
    } else if (prop.type === 'number') {
      initialContent[key] = 0;
    } else if (prop.type === 'boolean') {
      initialContent[key] = false;
    } else if (prop.type === 'array') {
      initialContent[key] = [];
    } else if (prop.type === 'object') {
      initialContent[key] = {};
    }
  });

  const newBlock: BaseBlock = {
    id: generateUUID(),
    blockType,
    content: initialContent,
    sort: blocks.length
  };

  return addItemToArray(blocks, newBlock);
};

export const updateBlockContent = (
  blocks: BaseBlock[],
  blockId: string,
  content: Record<string, unknown>
): BaseBlock[] => {
  return updateItemInArray(blocks, blockId, { content });
};

export const removeBlock = (blocks: BaseBlock[], blockId: string): BaseBlock[] => {
  return removeItemFromArray(blocks, blockId);
};

export const moveBlock = (blocks: BaseBlock[], blockId: string, newIndex: number): BaseBlock[] => {
  const blockIndex = blocks.findIndex((block) => block.id === blockId);
  if (blockIndex === -1) return blocks;

  const newBlocks = [...blocks];
  const [block] = newBlocks.splice(blockIndex, 1);
  newBlocks.splice(newIndex, 0, block);

  // Update sort for all blocks
  return newBlocks.map((block, index) => ({
    ...block,
    sort: index
  }));
};
