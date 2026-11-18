import type { PluginOption } from 'vite';

/** Package subpaths imported as `sailorcms/<subpath>/...`, and their location in the package. */
export const SAILOR_SUBPATHS: ReadonlyArray<readonly [subpath: string, dir: string]>;

/** Aliases, SSR and dep-optimizer settings, and the admin's Paraglide compiler. */
export function sailor(): PluginOption[];
