import { Router } from 'express';
import { authenticate } from '@/middleware/auth.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import { validate, validateParams } from '@/middleware/validate.middleware';
import {
  createCustomPage,
  createRedirect,
  deleteCustomPage,
  deleteRedirect,
  getCustomPage,
  getPublishedPage,
  getRouting,
  listCustomPages,
  listPageRoutes,
  listRedirects,
  updateCustomPage,
  updatePageRoute,
  updateRedirect,
} from '@/controllers/site.controller';
import {
  customPageBodySchema,
  idParamsSchema,
  pageRouteBodySchema,
  pageRouteParamsSchema,
  redirectBodySchema,
  slugQuerySchema,
} from '@/validators/site.validator';

/** Dashboard-built pages, page URLs and redirects (Pages in the dashboard). */
const router = Router();
const staff = [authenticate, requireStaffPermission('app_configuration')];

// Public: used by the website to route visitors.
router.get('/routing', getRouting);
router.get('/pages/by-slug', validate(slugQuerySchema), getPublishedPage);

// Custom pages
router.get('/pages', ...staff, listCustomPages);
router.post('/pages', ...staff, validate(customPageBodySchema), createCustomPage);
router.get('/pages/:id', ...staff, validateParams(idParamsSchema), getCustomPage);
router.put('/pages/:id', ...staff, validateParams(idParamsSchema), validate(customPageBodySchema), updateCustomPage);
router.delete('/pages/:id', ...staff, validateParams(idParamsSchema), deleteCustomPage);

// URLs of the built-in pages
router.get('/page-routes', ...staff, listPageRoutes);
router.put(
  '/page-routes/:pageId',
  ...staff,
  validateParams(pageRouteParamsSchema),
  validate(pageRouteBodySchema),
  updatePageRoute
);

// Redirects
router.get('/redirects', ...staff, listRedirects);
router.post('/redirects', ...staff, validate(redirectBodySchema), createRedirect);
router.put('/redirects/:id', ...staff, validateParams(idParamsSchema), validate(redirectBodySchema), updateRedirect);
router.delete('/redirects/:id', ...staff, validateParams(idParamsSchema), deleteRedirect);

export default router;
