import express from 'express';
import {
  createBadge,
  deleteBadge,
  getAllBadges,
  getBadgeById,
  getBadgeIcons,
  updateBadge,
} from '@/controllers/badge.controller';
import { validate } from '@/middleware/validate.middleware';
import {
  createBadgeSchema,
  updateBadgeSchema,
  getBadgesQuerySchema,
} from '@/validators/badge.validator';
import { authenticate } from '@/middleware/auth.middleware';
import { isAdmin } from '@/middleware/role.middleware';
import { uploadBadgeImageIfMultipart, requireParsedMultipartBody } from '@/middleware/upload.middleware';

const router = express.Router();

router.get('/icons', authenticate, getBadgeIcons);
router.get('/', authenticate, validate(getBadgesQuerySchema), getAllBadges);
router.get('/:id', authenticate, getBadgeById);

router.post(
  '/',
  authenticate,
  isAdmin,
  uploadBadgeImageIfMultipart,
  requireParsedMultipartBody,
  validate(createBadgeSchema),
  createBadge
);

router.patch(
  '/:id',
  authenticate,
  isAdmin,
  uploadBadgeImageIfMultipart,
  requireParsedMultipartBody,
  validate(updateBadgeSchema),
  updateBadge
);

router.delete('/:id', authenticate, isAdmin, deleteBadge);

export default router;
