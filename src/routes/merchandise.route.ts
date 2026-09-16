import express from 'express';
import { validate } from '@/middleware/validate.middleware';
import { authenticate, optionalAuthenticate } from '@/middleware/auth.middleware';
import { authenticatedOnly } from '@/middleware/role.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import {
  merchandiseQuerySchema,
  createMerchandiseProductSchema,
  updateMerchandiseProductSchema,
  updateMerchandiseProductStatusSchema,
  updateMerchandiseProductFeaturedSchema,
  createMerchandiseCategorySchema,
  updateMerchandiseCategorySchema,
  merchandiseOrderQuerySchema,
  createMerchandiseOrderSchema,
  updateMerchandiseOrderStatusSchema,
  updateMerchandiseOrderTrackingSchema,
} from '@/validators/merchandise.validator';
import {
  getMerchandiseProducts,
  getMerchandiseProductById,
  createMerchandiseProduct,
  updateMerchandiseProduct,
  deleteMerchandiseProduct,
  updateMerchandiseProductStatus,
  updateMerchandiseProductFeatured,
  getMerchandiseCategories,
  createMerchandiseCategory,
  updateMerchandiseCategory,
  deleteMerchandiseCategory,
  getMerchandiseOrders,
  getMerchandiseOrderById,
  createMerchandiseOrder,
  updateMerchandiseOrderStatus,
  updateMerchandiseOrderTracking,
} from '@/controllers/merchandise.controller';

const router = express.Router();

// Product API
router.get('/products', optionalAuthenticate, validate(merchandiseQuerySchema), getMerchandiseProducts);
router.get('/products/:id', optionalAuthenticate, getMerchandiseProductById);
router.post('/products', authenticate, authenticatedOnly, validate(createMerchandiseProductSchema), createMerchandiseProduct);
router.patch('/products/:id', authenticate, authenticatedOnly, validate(updateMerchandiseProductSchema), updateMerchandiseProduct);
router.delete('/products/:id', authenticate, authenticatedOnly, deleteMerchandiseProduct);
router.patch('/products/:id/status', authenticate, authenticatedOnly, validate(updateMerchandiseProductStatusSchema), updateMerchandiseProductStatus);
router.patch('/products/:id/featured', authenticate, authenticatedOnly, validate(updateMerchandiseProductFeaturedSchema), updateMerchandiseProductFeatured);

const requireStoreManagement = requireStaffPermission('manage_store', 'admin.panel');

// Category API
router.get('/categories', optionalAuthenticate, getMerchandiseCategories);
router.post('/categories', authenticate, requireStoreManagement, validate(createMerchandiseCategorySchema), createMerchandiseCategory);
router.patch('/categories/:id', authenticate, requireStoreManagement, validate(updateMerchandiseCategorySchema), updateMerchandiseCategory);
router.delete('/categories/:id', authenticate, requireStoreManagement, deleteMerchandiseCategory);

// Order API
router.get('/orders', authenticate, requireStoreManagement, validate(merchandiseOrderQuerySchema), getMerchandiseOrders);
router.get('/orders/:id', authenticate, requireStoreManagement, getMerchandiseOrderById);
router.post('/orders', authenticate, authenticatedOnly, validate(createMerchandiseOrderSchema), createMerchandiseOrder);
router.patch('/orders/:id/status', authenticate, requireStoreManagement, validate(updateMerchandiseOrderStatusSchema), updateMerchandiseOrderStatus);
router.patch('/orders/:id/tracking', authenticate, requireStoreManagement, validate(updateMerchandiseOrderTrackingSchema), updateMerchandiseOrderTracking);

export default router;
