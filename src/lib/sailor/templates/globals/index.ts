import { categoriesGlobal } from './categories';
import { faqGlobal } from './faq';
import { menusGlobal } from './menus';
import { detailsGlobal } from './details';
import { submissionsGlobal } from './submissions';

/**
 * Global Definitions
 *
 * Globals are site-wide content (settings, menus, categories).
 * - `dataType: 'flat'` for single records with static fields (Settings)
 * - `dataType: 'repeatable'` for multiple flat records (Categories, FAQs)
 * - `dataType: 'relational'` for complex records with relations (Menus)
 * Core fields are auto-added for repeatable and relational types.
 */
export const globalDefinitions = {
  categories: categoriesGlobal,
  faq: faqGlobal,
  menus: menusGlobal,
  details: detailsGlobal,
  submissions: submissionsGlobal
};
