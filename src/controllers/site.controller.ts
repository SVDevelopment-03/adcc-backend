import { Request, Response } from 'express';
import CustomPage from '@/models/custom-page.model';
import PageRoute from '@/models/page-route.model';
import Redirect from '@/models/redirect.model';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { AuthRequest } from '@/middleware/auth.middleware';
import {
  ADMIN_SHARED_SEGMENTS,
  BUILT_IN_PAGE_PATHS,
  RESERVED_SEGMENTS,
  firstSegment,
  isExternalUrl,
  normalizeSitePath,
} from '@/utils/site-paths';

/* ─── Shared URL logic ───────────────────────────────────────────────────── */

type RedirectRule = { from: string; to: string };

/** Where `path` goes under one redirect rule, or null if the rule doesn't match. */
export const applyRedirect = (rule: RedirectRule, path: string): string | null => {
  const toBase = rule.to.endsWith('/*') ? rule.to.slice(0, -2) : rule.to;
  if (rule.from.endsWith('/*')) {
    const base = rule.from.slice(0, -2);
    if (path !== base && !path.startsWith(`${base}/`)) return null;
    const rest = path.slice(base.length);
    return rule.to.endsWith('/*') ? `${toBase}${rest}` || '/' : toBase;
  }
  return path === rule.from ? toBase || '/' : null;
};

/** Current path of every built-in page (original unless changed in the dashboard). */
const builtInPaths = async (): Promise<Record<string, string>> => {
  const overrides = await PageRoute.find().lean();
  const paths = { ...BUILT_IN_PAGE_PATHS };
  for (const route of overrides) if (paths[route.pageId]) paths[route.pageId] = route.path;
  return paths;
};

const validPagePath = (value: string) => {
  const path = normalizeSitePath(value);
  if (!path) {
    throw new AppError(
      'Use a URL like "/about-adcc": lowercase letters, numbers and dashes, separated by "/".',
      400
    );
  }
  if (RESERVED_SEGMENTS.has(firstSegment(path))) {
    throw new AppError(`"${path}" is reserved for the dashboard or the site and can't be used.`, 400);
  }
  return path;
};

/**
 * Throws if `path` can't be used by the page (built-in `pageId`, or custom
 * page `customId`). Redirects that only exist because this page moved away
 * from `path` earlier are returned so the caller can remove them.
 */
const checkPagePath = async (
  path: string,
  owner: { pageId: string } | { customId: string | null }
): Promise<string[]> => {
  const first = firstSegment(path);
  const isBuiltIn = 'pageId' in owner;
  const builtIns = await builtInPaths();

  if (isBuiltIn && path.split('/').length > 2) {
    throw new AppError('The URL of this page must be a single word, like "/about-adcc".', 400);
  }
  if (!isBuiltIn && ADMIN_SHARED_SEGMENTS.has(first)) {
    throw new AppError(`"/${first}" is also a dashboard section; choose another URL.`, 400);
  }

  // Built-in pages own everything below their path (detail pages), and their
  // original path keeps redirecting to them.
  for (const [pageId, current] of Object.entries(builtIns)) {
    if (isBuiltIn && owner.pageId === pageId) continue;
    const taken = [firstSegment(current), firstSegment(BUILT_IN_PAGE_PATHS[pageId])];
    if (taken.includes(first)) {
      throw new AppError(`"/${first}" is already used by a built-in page (${pageId}).`, 409);
    }
  }

  const customPages = await CustomPage.find().select('slug').lean();
  for (const page of customPages) {
    if (!isBuiltIn && owner.customId && String(page._id) === owner.customId) continue;
    const clash = isBuiltIn ? firstSegment(page.slug) === first : page.slug === path;
    if (clash) throw new AppError(`"${page.slug}" is already used by another page.`, 409);
  }

  const currentPath = isBuiltIn
    ? builtIns[owner.pageId]
    : owner.customId
      ? (customPages.find((p) => String(p._id) === owner.customId)?.slug ?? null)
      : null;
  const removable: string[] = [];
  for (const redirect of await Redirect.find().lean()) {
    if (!applyRedirect(redirect, path)) continue;
    // A redirect that was created when this page moved away from `path`.
    if (currentPath && (redirect.to === currentPath || redirect.to === `${currentPath}/*`)) {
      removable.push(String(redirect._id));
      continue;
    }
    throw new AppError(
      `A redirect from "${redirect.from}" already covers this URL. Remove it under Pages → Redirects first.`,
      409
    );
  }
  return removable;
};

/** After a page moves, keep its old URL working. */
const redirectOldPath = async (oldPath: string, newPath: string, withChildren: boolean) => {
  const from = withChildren ? `${oldPath}/*` : oldPath;
  const to = withChildren ? `${newPath}/*` : newPath;
  await Redirect.findOneAndUpdate(
    { from },
    { $set: { to, enabled: true, note: 'Added automatically when the page URL changed' } },
    { upsert: true, setDefaultsOnInsert: true }
  );
};

/* ─── Public ─────────────────────────────────────────────────────────────── */

// GET /site/routing — everything the site needs to route visitors: current
// built-in page URLs, published custom pages and enabled redirects.
export const getRouting = asyncHandler(async (_req: Request, res: Response) => {
  const [pages, customPages, redirects] = await Promise.all([
    builtInPaths(),
    CustomPage.find({ status: 'published' }).select('slug').lean(),
    Redirect.find({ enabled: true }).select('from to').lean(),
  ]);
  sendSuccess(
    res,
    {
      pages,
      customPages: customPages.map((p) => p.slug),
      redirects: redirects.map((r) => ({ from: r.from, to: r.to })),
    },
    'Site routing fetched successfully',
    200
  );
});

// GET /site/pages/by-slug?slug=/about-adcc — a published custom page.
export const getPublishedPage = asyncHandler(async (req: Request, res: Response) => {
  const slug = normalizeSitePath(String(req.query.slug ?? ''));
  const page = slug ? await CustomPage.findOne({ slug, status: 'published' }).lean() : null;
  if (!page) throw new AppError('Page not found', 404);
  sendSuccess(res, page, 'Page fetched successfully', 200);
});

/* ─── Custom pages (dashboard) ───────────────────────────────────────────── */

export const listCustomPages = asyncHandler(async (_req: Request, res: Response) => {
  const pages = await CustomPage.find()
    .select('slug titleEn titleAr status updatedAt createdAt')
    .sort({ updatedAt: -1 })
    .lean();
  sendSuccess(res, pages, 'Pages fetched successfully', 200);
});

export const getCustomPage = asyncHandler(async (req: Request, res: Response) => {
  const page = await CustomPage.findById(req.params.id).lean();
  if (!page) throw new AppError('Page not found', 404);
  sendSuccess(res, page, 'Page fetched successfully', 200);
});

export const createCustomPage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const slug = validPagePath(req.body.slug);
  const removable = await checkPagePath(slug, { customId: null });
  if (removable.length) await Redirect.deleteMany({ _id: { $in: removable } });
  const page = await CustomPage.create({
    ...req.body,
    slug,
    createdBy: req.user?.id,
    updatedBy: req.user?.id,
  });
  sendSuccess(res, page.toObject(), 'Page created successfully', 201);
});

export const updateCustomPage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);
  const existing = await CustomPage.findById(id).lean();
  if (!existing) throw new AppError('Page not found', 404);

  const slug = validPagePath(req.body.slug);
  const removable = await checkPagePath(slug, { customId: id });
  if (removable.length) await Redirect.deleteMany({ _id: { $in: removable } });

  const page = await CustomPage.findByIdAndUpdate(
    id,
    { $set: { ...req.body, slug, updatedBy: req.user?.id } },
    { new: true, runValidators: true }
  ).lean();

  let redirectAdded = false;
  if (existing.slug !== slug && existing.status === 'published') {
    await redirectOldPath(existing.slug, slug, false);
    redirectAdded = true;
  }
  sendSuccess(res, { page, redirectAdded }, 'Page saved successfully', 200);
});

export const deleteCustomPage = asyncHandler(async (req: Request, res: Response) => {
  const page = await CustomPage.findByIdAndDelete(req.params.id).lean();
  if (!page) throw new AppError('Page not found', 404);
  sendSuccess(res, null, 'Page deleted successfully', 200);
});

/* ─── Built-in page URLs (dashboard) ─────────────────────────────────────── */

export const listPageRoutes = asyncHandler(async (_req: Request, res: Response) => {
  const current = await builtInPaths();
  const routes = Object.keys(BUILT_IN_PAGE_PATHS).map((pageId) => ({
    pageId,
    path: current[pageId],
    defaultPath: BUILT_IN_PAGE_PATHS[pageId],
  }));
  sendSuccess(res, routes, 'Page URLs fetched successfully', 200);
});

// PUT /site/page-routes/:pageId — { path }; the old URL (and everything
// below it, e.g. detail pages) redirects to the new one.
export const updatePageRoute = asyncHandler(async (req: Request, res: Response) => {
  const pageId = String(req.params.pageId);
  const path = validPagePath(req.body.path);
  const oldPath = (await builtInPaths())[pageId];
  if (path === oldPath) {
    sendSuccess(res, { pageId, path, defaultPath: BUILT_IN_PAGE_PATHS[pageId], redirectAdded: false }, 'Page URL unchanged', 200);
    return;
  }

  const removable = await checkPagePath(path, { pageId });
  if (removable.length) await Redirect.deleteMany({ _id: { $in: removable } });

  if (path === BUILT_IN_PAGE_PATHS[pageId]) {
    await PageRoute.deleteOne({ pageId });
  } else {
    await PageRoute.findOneAndUpdate({ pageId }, { $set: { path } }, { upsert: true });
  }

  // The original path always redirects on the site itself; any earlier
  // custom path needs a stored redirect.
  const redirectAdded = oldPath !== BUILT_IN_PAGE_PATHS[pageId];
  if (redirectAdded) await redirectOldPath(oldPath, path, true);

  sendSuccess(res, { pageId, path, defaultPath: BUILT_IN_PAGE_PATHS[pageId], redirectAdded }, 'Page URL saved', 200);
});

/* ─── Redirects (dashboard) ──────────────────────────────────────────────── */

const normalizeRedirect = async (body: { from: string; to: string }, ignoreId?: string) => {
  const wildcard = body.from.trim().endsWith('/*');
  const fromPath = normalizeSitePath(wildcard ? body.from.trim().slice(0, -2) : body.from);
  if (!fromPath) {
    throw new AppError('"From" must be a URL of this site, like "/old-page" or "/old-folder/*".', 400);
  }
  if (RESERVED_SEGMENTS.has(firstSegment(fromPath))) {
    throw new AppError(`"${fromPath}" is reserved for the dashboard or the site and can't be redirected.`, 400);
  }
  const from = wildcard ? `${fromPath}/*` : fromPath;

  let to = body.to.trim();
  if (isExternalUrl(to)) {
    // kept as entered
  } else {
    const toWildcard = to.endsWith('/*');
    const toPath = to === '/' ? '/' : normalizeSitePath(toWildcard ? to.slice(0, -2) : to);
    if (!toPath) throw new AppError('"To" must be a URL of this site (like "/events") or a full https:// link.', 400);
    if (toWildcard && !wildcard) {
      throw new AppError('"To" can only end in "/*" when "From" ends in "/*" too.', 400);
    }
    to = toWildcard ? `${toPath === '/' ? '' : toPath}/*` : toPath;
  }

  // A live page can't be redirected away from; move or unpublish it instead.
  const builtIns = await builtInPaths();
  const livePages = [
    ...Object.values(builtIns),
    ...(await CustomPage.find({ status: 'published' }).select('slug').lean()).map((p) => p.slug),
  ];
  const covered = livePages.find((page) => applyRedirect({ from, to }, page) !== null);
  if (covered) {
    throw new AppError(`"${covered}" is a live page. Change that page's URL instead of redirecting it.`, 409);
  }

  const duplicate = await Redirect.findOne({ from, ...(ignoreId ? { _id: { $ne: ignoreId } } : {}) }).lean();
  if (duplicate) throw new AppError(`A redirect from "${from}" already exists.`, 409);

  // Follow the chain from this redirect; it must end somewhere.
  const rules: RedirectRule[] = [
    { from, to },
    ...(await Redirect.find({ enabled: true, ...(ignoreId ? { _id: { $ne: ignoreId } } : {}) }).lean()),
    ...Object.entries(builtIns)
      .filter(([pageId, current]) => current !== BUILT_IN_PAGE_PATHS[pageId])
      .map(([pageId, current]) => ({ from: `${BUILT_IN_PAGE_PATHS[pageId]}/*`, to: `${current}/*` })),
  ];
  let path = fromPath;
  const seen = new Set<string>([path]);
  for (let hop = 0; hop < 10; hop += 1) {
    const rule = rules.find((r) => applyRedirect(r, path) !== null);
    if (!rule) break;
    const next = applyRedirect(rule, path)!;
    if (isExternalUrl(next)) break;
    if (seen.has(next)) throw new AppError(`This redirect would loop back to "${next}".`, 400);
    seen.add(next);
    path = next;
  }

  return { from, to };
};

export const listRedirects = asyncHandler(async (_req: Request, res: Response) => {
  const redirects = await Redirect.find().sort({ from: 1 }).lean();
  sendSuccess(res, redirects, 'Redirects fetched successfully', 200);
});

export const createRedirect = asyncHandler(async (req: Request, res: Response) => {
  const { from, to } = await normalizeRedirect(req.body);
  const redirect = await Redirect.create({ ...req.body, from, to });
  sendSuccess(res, redirect.toObject(), 'Redirect created successfully', 201);
});

export const updateRedirect = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!(await Redirect.exists({ _id: id }))) throw new AppError('Redirect not found', 404);
  const { from, to } = await normalizeRedirect(req.body, id);
  const redirect = await Redirect.findByIdAndUpdate(
    id,
    { $set: { ...req.body, from, to } },
    { new: true, runValidators: true }
  ).lean();
  sendSuccess(res, redirect, 'Redirect saved successfully', 200);
});

export const deleteRedirect = asyncHandler(async (req: Request, res: Response) => {
  const redirect = await Redirect.findByIdAndDelete(req.params.id).lean();
  if (!redirect) throw new AppError('Redirect not found', 404);
  sendSuccess(res, null, 'Redirect deleted successfully', 200);
});
