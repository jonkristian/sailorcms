/**
 * Page title utilities for Sailor CMS admin interface
 */

export function getPageTitle(pathname: string): string {
  if (pathname === '/sailor') return 'Dashboard - Sailor CMS';
  if (pathname === '/sailor/globals') return 'Globals - Sailor CMS';
  if (pathname === '/sailor/account') return 'Account Settings - Sailor CMS';

  if (pathname.startsWith('/sailor/globals/')) {
    const slug = pathname.split('/')[3];
    return `${slug.charAt(0).toUpperCase() + slug.slice(1)} - Sailor CMS`;
  }

  if (pathname.startsWith('/sailor/collections/')) {
    const slug = pathname.split('/')[3];
    return `${slug.charAt(0).toUpperCase() + slug.slice(1)} - Sailor CMS`;
  }

  return 'Sailor CMS';
}
