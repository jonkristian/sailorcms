<script lang="ts">
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
  } from '$lib/components/ui/card';
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
  } from '$lib/components/ui/table';
  import * as Collapsible from '$lib/components/ui/collapsible/index';
  import { onMount } from 'svelte';
  import { formatJson } from '$sailor/core/ui/syntax-highlighting';
  import { Database, FileJson, Table as TableIcon, ChevronDown, Globe } from '@lucide/svelte';
  import { Badge } from '$lib/components/ui/badge';
  import Header from '$lib/components/sailor/Header.svelte';

  let { data } = $props<{
    data: {
      tables: TableInfo[];
      collectionTypes: CollectionInfo[];
      blockTypes: BlockInfo[];
      globalTypes: GlobalTypeInfo[];
      availableGlobals: GlobalInfo[];
    };
  }>();

  interface CollectionInfo {
    id: string;
    name_singular: string;
    name_plural: string;
    slug: string;
    description: string;
    schema: string;
  }

  interface BlockInfo {
    id: string;
    name: string;
    schema: string;
  }

  interface GlobalTypeInfo {
    id: string;
    name_singular: string;
    name_plural: string;
    slug: string;
    description: string;
    data_type: string;
    schema: string;
    options: string;
  }

  interface GlobalInfo {
    slug: string;
    name: {
      singular: string;
      plural: string;
    };
    description: string;
    options?: {
      singleton?: boolean;
      sortable?: boolean;
      nestable?: boolean;
    };
  }

  interface TableInfo {
    name: string;
    rowCount: number | string;
  }

  // Reactive formatted schemas
  let formattedSchemas = $state<Record<string, string>>({});

  onMount(async () => {
    // Pre-format all schemas for better performance
    const schemasToFormat = [
      ...data.collectionTypes.map((c: CollectionInfo) => ({ id: c.id, schema: c.schema })),
      ...data.blockTypes.map((b: BlockInfo) => ({ id: b.id, schema: b.schema })),
      ...data.globalTypes.map((g: GlobalTypeInfo) => ({ id: g.id, schema: g.schema }))
    ];

    for (const { id, schema } of schemasToFormat) {
      formattedSchemas[id] = await formatJson(schema);
    }
  });

  function getGlobalType(global: GlobalTypeInfo | GlobalInfo): string {
    // Handle both database and template global types
    let baseType = 'Global';
    let isNestable = false;

    if ('options' in global && typeof global.options === 'string') {
      // Database global type - use the stored data_type
      try {
        const options = JSON.parse(global.options || '{}');
        isNestable = options.nestable;
        // Use the stored data_type from database
        if ((global as GlobalTypeInfo).data_type) {
          const dataType = (global as GlobalTypeInfo).data_type;
          baseType = dataType.charAt(0).toUpperCase() + dataType.slice(1);
        } else {
          baseType = 'Global';
        }
      } catch {
        baseType = 'Global';
      }
    } else if ('options' in global && typeof global.options === 'object') {
      // Template global type - check if it has dataType property
      if ((global as any).dataType) {
        const dataType = (global as any).dataType;
        baseType = dataType.charAt(0).toUpperCase() + dataType.slice(1);
      }
      isNestable = global.options?.nestable ?? false;
    }

    // Add nestable modifier if applicable
    if (isNestable && baseType === 'Repeatable') {
      return 'Nestable';
    }

    return baseType;
  }

  function isGlobalTable(tableName: string): boolean {
    return tableName.startsWith('global_');
  }

  function isGlobalDataTable(tableName: string): boolean {
    if (!tableName.startsWith('global_')) return false;

    // Check if this matches an actual global type from the database
    const globalSlug = tableName.replace('global_', '');
    const isActualGlobal = data.globalTypes.some((global: any) => global.slug === globalSlug);

    return !isActualGlobal; // If it doesn't match a global, it's probably a data table
  }

  function getTableType(tableName: string): string {
    // Meta tables that store type definitions
    if (tableName === 'block_types') return 'Meta';
    if (tableName === 'collection_types') return 'Meta';
    if (tableName === 'global_types') return 'Meta';

    if (isGlobalDataTable(tableName)) {
      // Extract global name for data tables (e.g., global_menus_items -> Menus Data)
      const parts = tableName.split('_');
      if (parts.length > 2) {
        const globalName = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
        return `${globalName} Data`;
      }
      return 'Global Data';
    }
    if (isGlobalTable(tableName)) return 'Global';
    if (tableName.startsWith('collection_')) return 'Collection';
    if (tableName.startsWith('junction_')) return 'Junction';
    if (tableName.startsWith('block_')) {
      // Check if this matches an actual block type from the database
      const blockSlug = tableName.replace('block_', '');
      const isActualBlock = data.blockTypes.some((block: any) => {
        const blockNameSnake = block.name.toLowerCase().replace(/\s+/g, '_');
        const blockNameKebab = block.name.toLowerCase().replace(/\s+/g, '-');
        const blockNameSingle = block.name.toLowerCase().replace(/\s.*/, ''); // Just first word

        return (
          blockNameSnake === blockSlug ||
          blockNameKebab === blockSlug.replace(/_/g, '-') ||
          blockNameSingle === blockSlug ||
          blockSlug === blockNameSingle
        );
      });

      if (isActualBlock) {
        return 'Block';
      } else {
        // This is a block data table - extract the parent block name
        const parts = tableName.split('_');
        if (parts.length > 2) {
          const blockName = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
          return `${blockName} Data`;
        }
        return 'Block Data';
      }
    }
    return 'System';
  }
</script>

<svelte:head>
  <title>Database - Sailor CMS</title>
</svelte:head>

<div class="container mx-auto px-6">
  <Header
    title="Database"
    description="View your database schema, tables, and generated content types"
  />

  <div class="flex flex-col gap-6">
    <!-- Summary Statistics -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent class="p-4">
          <div class="flex items-center gap-4">
            <Database class="h-6 w-6 text-blue-600" />
            <div>
              <p class="text-muted-foreground text-sm font-medium">Collections</p>
              <p class="text-2xl font-bold">{data.collectionTypes.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="p-4">
          <div class="flex items-center gap-4">
            <Globe class="h-6 w-6 text-green-600" />
            <div>
              <p class="text-muted-foreground text-sm font-medium">Globals</p>
              <p class="text-2xl font-bold">{data.globalTypes.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="p-4">
          <div class="flex items-center gap-4">
            <FileJson class="h-6 w-6 text-purple-600" />
            <div>
              <p class="text-muted-foreground text-sm font-medium">Blocks</p>
              <p class="text-2xl font-bold">{data.blockTypes.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="p-4">
          <div class="flex items-center gap-4">
            <TableIcon class="h-6 w-6 text-gray-600" />
            <div>
              <p class="text-muted-foreground text-sm font-medium">Tables</p>
              <p class="text-2xl font-bold">{data.tables.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    {#if data.collectionTypes.length > 0 || data.availableCollections.length > 0}
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <Database class="h-5 w-5" />
            Collections
          </CardTitle>
          <CardDescription>Content type definitions for your collections</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="space-y-3">
            {#each data.availableCollections as collection (collection.slug)}
              {@const implementedSchema = data.collectionTypes.find(
                (c: any) => c.slug === collection.slug
              )}
              {@const isImplemented = !!implementedSchema}

              {#if isImplemented}
                <Collapsible.Root>
                  <Collapsible.Trigger class="w-full">
                    <div
                      class="bg-surface hover:bg-surface/80 flex items-center justify-between rounded-lg px-4 py-3"
                    >
                      <div class="flex items-center gap-3">
                        <span class="font-medium">{collection.name.plural}</span>
                        <Badge
                          variant="secondary"
                          class="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                        >
                          Collection
                        </Badge>
                        <Badge
                          variant="default"
                          class="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        >
                          Implemented
                        </Badge>
                        {#if collection.description}
                          <span class="text-muted-foreground text-sm">{collection.description}</span
                          >
                        {/if}
                      </div>
                      <ChevronDown class="h-4 w-4" />
                    </div>
                  </Collapsible.Trigger>
                  <Collapsible.Content>
                    <div class="bg-surface/50 mt-2 rounded-lg">
                      <div class="sugar-high-wrapper p-4">
                        {@html formattedSchemas[implementedSchema.id]}
                      </div>
                    </div>
                  </Collapsible.Content>
                </Collapsible.Root>
              {:else}
                <div class="bg-surface flex items-center justify-between rounded-lg px-4 py-3">
                  <div class="flex items-center gap-3">
                    <span class="text-muted-foreground font-medium">{collection.name.plural}</span>
                    <Badge
                      variant="outline"
                      class="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    >
                      Collection
                    </Badge>
                    <Badge
                      variant="outline"
                      class="border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300"
                    >
                      Available
                    </Badge>
                    {#if collection.description}
                      <span class="text-muted-foreground text-sm">{collection.description}</span>
                    {/if}
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        </CardContent>
      </Card>
    {/if}

    {#if data.globalTypes.length > 0 || data.availableGlobals.length > 0}
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <Globe class="h-5 w-5" />
            Globals
          </CardTitle>
          <CardDescription>Global content and site-wide configuration</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="space-y-3">
            {#each data.availableGlobals as global (global.slug)}
              {@const implementedSchema = data.globalTypes.find((g: any) => g.slug === global.slug)}
              {@const isImplemented = !!implementedSchema}

              {#if isImplemented}
                <Collapsible.Root>
                  <Collapsible.Trigger class="w-full">
                    <div
                      class="bg-surface hover:bg-surface/80 flex items-center justify-between rounded-lg px-4 py-3"
                    >
                      <div class="flex items-center gap-3">
                        <span class="font-medium">{global.name.plural}</span>
                        <Badge
                          variant="secondary"
                          class="bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200"
                        >
                          {getGlobalType(global)}
                        </Badge>
                        <Badge
                          variant="default"
                          class="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        >
                          Implemented
                        </Badge>
                        {#if global.description}
                          <span class="text-muted-foreground text-sm">{global.description}</span>
                        {/if}
                      </div>
                      <ChevronDown class="h-4 w-4" />
                    </div>
                  </Collapsible.Trigger>
                  <Collapsible.Content>
                    <div class="bg-surface/50 mt-2 rounded-lg">
                      <div class="sugar-high-wrapper p-4">
                        {@html formattedSchemas[implementedSchema.id]}
                      </div>
                    </div>
                  </Collapsible.Content>
                </Collapsible.Root>
              {:else}
                <div class="bg-surface flex items-center justify-between rounded-lg px-4 py-3">
                  <div class="flex items-center gap-3">
                    <span class="text-muted-foreground font-medium">{global.name.plural}</span>
                    <Badge
                      variant="outline"
                      class="bg-cyan-100 text-cyan-600 dark:bg-cyan-900 dark:text-cyan-400"
                    >
                      {getGlobalType(global)}
                    </Badge>
                    <Badge
                      variant="outline"
                      class="border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300"
                    >
                      Available
                    </Badge>
                    {#if global.description}
                      <span class="text-muted-foreground text-sm">{global.description}</span>
                    {/if}
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        </CardContent>
      </Card>
    {/if}

    {#if data.blockTypes.length > 0 || data.availableBlocks.length > 0}
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <FileJson class="h-5 w-5" />
            Blocks
          </CardTitle>
          <CardDescription>Reusable content components for page building</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="space-y-3">
            {#each data.availableBlocks as block (block.slug)}
              {@const implementedSchema = data.blockTypes.find((b: any) => b.name === block.name)}
              {@const isImplemented = !!implementedSchema}

              {#if isImplemented}
                <Collapsible.Root>
                  <Collapsible.Trigger class="w-full">
                    <div
                      class="bg-surface hover:bg-surface/80 flex items-center justify-between rounded-lg px-4 py-3"
                    >
                      <div class="flex items-center gap-3">
                        <span class="font-medium">{block.name}</span>
                        <Badge
                          variant="secondary"
                          class="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                        >
                          Block
                        </Badge>
                        <Badge
                          variant="default"
                          class="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        >
                          Implemented
                        </Badge>
                        {#if block.description}
                          <span class="text-muted-foreground text-sm">{block.description}</span>
                        {/if}
                      </div>
                      <ChevronDown class="h-4 w-4" />
                    </div>
                  </Collapsible.Trigger>
                  <Collapsible.Content>
                    <div class="bg-surface/50 mt-2 rounded-lg">
                      <div class="sugar-high-wrapper p-4">
                        {@html formattedSchemas[implementedSchema.id]}
                      </div>
                    </div>
                  </Collapsible.Content>
                </Collapsible.Root>
              {:else}
                <div class="bg-surface flex items-center justify-between rounded-lg px-4 py-3">
                  <div class="flex items-center gap-3">
                    <span class="text-muted-foreground font-medium">{block.name}</span>
                    <Badge
                      variant="outline"
                      class="bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400"
                    >
                      Block
                    </Badge>
                    <Badge
                      variant="outline"
                      class="border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300"
                    >
                      Available
                    </Badge>
                    {#if block.description}
                      <span class="text-muted-foreground text-sm">{block.description}</span>
                    {/if}
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        </CardContent>
      </Card>
    {/if}

    {#if data.tables.length > 0}
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <TableIcon class="h-5 w-5" />
            Tables ({data.tables.length})
          </CardTitle>
          <CardDescription>Current tables in the database</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Rows</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {@const metaTables = data.tables.filter(
                (table: any) => getTableType(table.name) === 'Meta'
              )}
              {@const otherTables = data.tables.filter(
                (table: any) => getTableType(table.name) !== 'Meta'
              )}
              {@const sortedTables = [...otherTables, ...metaTables]}

              {#each sortedTables as table (table.name)}
                {@const tableType = getTableType(table.name)}
                <TableRow>
                  <TableCell class="font-medium">{table.name}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      class={tableType === 'Collection'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                        : tableType === 'Global'
                          ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200'
                          : tableType === 'Block'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                            : tableType.endsWith(' Data') && table.name.startsWith('block_')
                              ? 'border-purple-200 bg-transparent text-purple-600 dark:border-purple-800 dark:text-purple-400'
                              : tableType.endsWith(' Data') && table.name.startsWith('global_')
                                ? 'border-cyan-200 bg-transparent text-cyan-600 dark:border-cyan-800 dark:text-cyan-400'
                                : tableType === 'Junction'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                                  : tableType === 'Meta'
                                    ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200'
                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}
                      >{tableType}</Badge
                    >
                  </TableCell>
                  <TableCell>{table.rowCount}</TableCell>
                </TableRow>
              {/each}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    {/if}
  </div>
</div>

<style>
  /* Sugar High syntax highlighting - Default (light) theme - Catppuccin Latte colors */
  .sugar-high-wrapper {
    --sh-sign: #dc8a78; /* Rosewater - for brackets, commas */
    --sh-string: #40a02b; /* Green - for string values */
    --sh-keyword: #8839ef; /* Mauve - for keywords */
    --sh-class: #fe640b; /* Orange - for numbers */
    --sh-identifier: #7c7f93; /* Subtext1 - for identifiers */
    --sh-comment: #9ca0b0; /* Subtext0 - for comments */
    --sh-jsxliterals: #40a02b; /* Green - for JSX literals */
    --sh-property: #1e66f5; /* Blue - for property names */
    --sh-entity: #8839ef; /* Mauve - for entities */
    --sh-break: transparent;
    --sh-space: transparent;
  }

  /* Dark theme - Catppuccin Macchiato colors */
  :global(.dark) .sugar-high-wrapper {
    --sh-sign: #f4dbd6; /* Rosewater - for brackets, commas */
    --sh-string: #a6da95; /* Green - for string values */
    --sh-keyword: #c6a0f6; /* Mauve - for keywords */
    --sh-class: #f5a97f; /* Peach - for numbers */
    --sh-identifier: #b8c0e0; /* Subtext1 - for identifiers */
    --sh-comment: #a5adcb; /* Subtext0 - for comments */
    --sh-jsxliterals: #a6da95; /* Green - for JSX literals */
    --sh-property: #8aadf4; /* Blue - for property names */
    --sh-entity: #c6a0f6; /* Mauve - for entities */
  }

  :global(.prose pre) {
    background: transparent !important;
    padding: 0 !important;
    margin: 0 !important;
  }
  :global(.prose code) {
    background: transparent !important;
    padding: 0 !important;
  }
</style>
