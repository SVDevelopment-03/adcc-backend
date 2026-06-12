import express from 'express';
import {
  createStoreItem,
  getStoreItems,
  getStoreItemById,
  updateStoreItem,
  archiveStoreItem,
  approveStoreItem,
  rejectStoreItem,
  featureStoreItem,
  markStoreItemSold,
  getMyStoreItems,
  getAdminStoreItems,
} from '@/controllers/store.controller';
import { validate } from '@/middleware/validate.middleware';
import {
  createStoreItemSchema,
  updateStoreItemSchema,
  storeItemQuerySchema,
  approveStoreItemSchema,
  rejectStoreItemSchema,
  featureStoreItemSchema,
} from '@/validators/store.validator';
import { authenticate, optionalAuthenticate } from '@/middleware/auth.middleware';
import { authenticatedOnly, isAdmin } from '@/middleware/role.middleware';
import { requireParsedMultipartBody, uploadStoreItemImagesIfMultipart } from '@/middleware/upload.middleware';

const router = express.Router();

const normalizeStoreItemFormData = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
  if (req.body && typeof req.body === 'object') {
    const body: any = req.body;

    if (body['photos[]'] !== undefined && body.photos === undefined) {
      body.photos = body['photos[]'];
    }

    if (body.price !== undefined && typeof body.price === 'string') {
      const trimmed = body.price.trim();
      if (trimmed !== '') {
        const value = Number(trimmed);
        if (!Number.isNaN(value)) {
          body.price = value;
        }
      }
    }

    if (body.photos !== undefined) {
      if (Array.isArray(body.photos)) {
        body.photos = body.photos
          .filter((item: unknown): item is string => typeof item === 'string')
          .map((item: string) => item.trim())
          .filter(Boolean);
      } else if (typeof body.photos === 'string') {
        const trimmed = body.photos.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
              body.photos = parsed
                .filter((item: unknown): item is string => typeof item === 'string')
                .map((item: string) => item.trim())
                .filter(Boolean);
            }
          } catch {
            // leave as-is; validation will catch invalid input
          }
        } else if (trimmed) {
          body.photos = [trimmed];
        }
      }
    }

    if (body.status !== undefined) {
      delete body.status;
    }
  }

  next();
};

router.get('/items', optionalAuthenticate, validate(storeItemQuerySchema), getStoreItems);
router.get('/items/:id', optionalAuthenticate, getStoreItemById);

// Member/Staff
router.post(
  '/items',
  authenticate,
  authenticatedOnly,
  uploadStoreItemImagesIfMultipart,
  requireParsedMultipartBody,
  normalizeStoreItemFormData,
  validate(createStoreItemSchema),
  createStoreItem
);
router.get('/my-items', authenticate, authenticatedOnly, getMyStoreItems);
router.patch(
  '/items/:id',
  authenticate,
  authenticatedOnly,
  uploadStoreItemImagesIfMultipart,
  requireParsedMultipartBody,
  normalizeStoreItemFormData,
  validate(updateStoreItemSchema),
  updateStoreItem
);
router.delete('/items/:id', authenticate, authenticatedOnly, archiveStoreItem);
router.post('/items/:id/sold', authenticate, authenticatedOnly, markStoreItemSold);

// Admin moderation
router.get('/admin/items', authenticate, isAdmin, validate(storeItemQuerySchema), getAdminStoreItems);
router.post('/items/:id/approve', authenticate, isAdmin, validate(approveStoreItemSchema), approveStoreItem);
router.post('/items/:id/reject', authenticate, isAdmin, validate(rejectStoreItemSchema), rejectStoreItem);
router.post('/items/:id/feature', authenticate, isAdmin, validate(featureStoreItemSchema), featureStoreItem);

export default router;
