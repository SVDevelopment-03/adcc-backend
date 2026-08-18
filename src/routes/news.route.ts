import express from 'express';
import {
  createNews,
  getAllNews,
  getNewsById,
  getAdminNews,
  getAdminNewsById,
  updateNews,
  deleteNews,
} from '@/controllers/news.controller';
import { validate } from '@/middleware/validate.middleware';
import { createNewsSchema, updateNewsSchema, getNewsQuerySchema } from '@/validators/news.validator';
import { authenticate } from '@/middleware/auth.middleware';
import { isAdmin } from '@/middleware/role.middleware';
import { uploadNewsImageIfMultipart, requireParsedMultipartBody } from '@/middleware/upload.middleware';

const router = express.Router();

// Public: Published-only listing/detail
router.get('/', validate(getNewsQuerySchema), getAllNews);

// Admin / content-manager dashboard: any status (Draft/Published/Trash)
router.get('/admin/all', authenticate, isAdmin, validate(getNewsQuerySchema), getAdminNews);
router.get('/admin/:id', authenticate, isAdmin, getAdminNewsById);

router.get('/:id', getNewsById);

// Admin / content-manager only
router.post(
  '/',
  authenticate,
  isAdmin,
  uploadNewsImageIfMultipart,
  requireParsedMultipartBody,
  validate(createNewsSchema),
  createNews
);

router.patch(
  '/:id',
  authenticate,
  isAdmin,
  uploadNewsImageIfMultipart,
  requireParsedMultipartBody,
  validate(updateNewsSchema),
  updateNews
);

router.delete('/:id', authenticate, isAdmin, deleteNews);

export default router;
