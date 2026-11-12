/**
 * URL rules for dashboard-managed pages and redirects (Pages → custom pages,
 * page URLs, redirects). Mirrors services/siteRouting.ts in the web app.
 */

/** Built-in public pages whose URL can be changed, with their original path. */
export const BUILT_IN_PAGE_PATHS: Record<string, string> = {
  about: '/aboutus',
  events: '/events',
  tracks: '/tracks',
  challenges: '/challenges',
  communities: '/communities',
  contact: '/contact-us',
  store: '/user-adcc-store',
  marketplace: '/user-marketplace',
  news: '/user-news',
  laffah: '/laffah-ride-registration',
  privacy: '/privacy-policy',
};

/**
 * First URL segments that belong to the dashboard, sign-in, legacy redirects
 * or static files. Pages can't use them, and redirects can't start from them
 * (that could lock admins out of the dashboard).
 */
export const RESERVED_SEGMENTS = new Set([
  // dashboard
  'admin', 'admins', 'audit-log', 'badges', 'cms', 'config', 'contact-messages', 'dashboard', 'feed',
  'laffah-ride-leads', 'languages', 'media', 'merchandise', 'newsletter',
  'notifications', 'pages', 'partners', 'push', 'reports', 'roles', 'static-data', 'users',
  // sign-in and fixed public routes
  'login', 'register', 'forgot', 'home',
  // legacy redirects
  'user-event', 'user-events', 'user-tracks', 'user-challenges', 'user-communities', 'user-store-detail',
  // static files and APIs
  'api', 'v1', 'assets', 'img', 'images', 'fonts', 'video', 'videos', 'favicon.ico',
  'firebase-messaging-sw.js', 'firebase-app-compat.js', 'firebase-messaging-compat.js',
]);

/**
 * Dashboard sections whose URL a built-in public page may also use: visitors
 * get the public page, signed-in staff get the dashboard (as /events always
 * has). Custom pages can't use them, and redirects from them only apply to
 * visitors.
 */
export const ADMIN_SHARED_SEGMENTS = new Set(['events', 'tracks', 'challenges', 'communities', 'news', 'marketplace']);

const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Lowercases, trims and strips trailing slashes; `null` if it isn't a valid site path. */
export const normalizeSitePath = (value: string): string | null => {
  let path = value.trim().toLowerCase();
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/+$/, '');
  if (path === '') return null;
  const segments = path.slice(1).split('/');
  if (segments.length > 4 || !segments.every((s) => SEGMENT.test(s))) return null;
  return path;
};

export const firstSegment = (path: string) => path.split('/')[1] ?? '';

export const isExternalUrl = (value: string) => /^https?:\/\/[^\s]+$/i.test(value.trim());
