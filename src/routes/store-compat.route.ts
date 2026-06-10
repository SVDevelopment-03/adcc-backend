import express from 'express';
import { optionalAuthenticate } from '@/middleware/auth.middleware';
import { validate } from '@/middleware/validate.middleware';
import { getStoreItemById, getStoreItems } from '@/controllers/store.controller';
import { storeItemQuerySchema } from '@/validators/store.validator';

const router = express.Router();

// Mobile backward-compatible aliases:
// /v1/ar/items and /v1/items
router.get('/', optionalAuthenticate, validate(storeItemQuerySchema), getStoreItems);
router.get('/:id', optionalAuthenticate, getStoreItemById);

export default router;
