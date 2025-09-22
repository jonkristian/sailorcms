import { heroBlock } from './hero';
import { richTextBlock } from './richText';
import { featuresBlock } from './features';
import { galleryBlock } from './gallery';
import { mediaTextBlock } from './mediaText';
import { servicesBlock } from './services';

/**
 * Block Definitions
 *
 * Blocks are reusable content components used within collections.
 */
export const blockDefinitions = {
  hero: heroBlock,
  features: featuresBlock,
  gallery: galleryBlock,
  rich_text: richTextBlock,
  media_text: mediaTextBlock,
  services: servicesBlock
};
