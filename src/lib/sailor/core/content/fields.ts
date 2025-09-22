import { CORE_FIELDS, type CollectionDefinition, type GlobalDefinition } from '../types';

/**
 * Developer utility functions for inspecting effective fields
 */

/**
 * Get all effective fields for a collection (core + template fields)
 * @param definition Collection definition
 * @returns Object with all fields that will be available
 */
export function getCollectionFields(definition: CollectionDefinition) {
  return {
    // System fields (always present)
    id: { type: 'string', title: 'ID', core: true, readonly: true },
    created_at: { type: 'date', title: 'Created At', core: true, readonly: true },
    updated_at: { type: 'date', title: 'Updated At', core: true, readonly: true },

    // Core fields (includes sort)
    ...CORE_FIELDS,

    // Template fields (merge, allowing overrides)
    ...definition.fields
  };
}

/**
 * Get all effective fields for a global (core + template fields)
 * @param definition Global definition
 * @returns Object with all fields that will be available
 */
export function getGlobalFields(definition: GlobalDefinition) {
  const skipCoreFields = definition.dataType === 'flat';

  const systemFields = {
    // System fields (always present)
    id: { type: 'string', title: 'ID', core: true, readonly: true },
    created_at: { type: 'date', title: 'Created At', core: true, readonly: true },
    updated_at: { type: 'date', title: 'Updated At', core: true, readonly: true }
  };

  const coreFields = skipCoreFields ? {} : CORE_FIELDS;

  return {
    ...systemFields,
    ...coreFields,
    ...definition.fields
  };
}
