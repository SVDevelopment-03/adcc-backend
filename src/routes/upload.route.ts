import express from 'express';
import { authenticate } from '@/middleware/auth.middleware';
import { uploadSingleImage, uploadMultipleImages } from '@/middleware/upload.middleware';
import { uploadImage, uploadImages } from '@/controllers/upload.controller';

const router = express.Router();

router.post('/image', authenticate, uploadSingleImage, uploadImage);
router.post('/image/:folder', authenticate, uploadSingleImage, uploadImage);
router.post('/images', authenticate, uploadMultipleImages, uploadImages);
router.post('/images/:folder', authenticate, uploadMultipleImages, uploadImages);

export default router;
