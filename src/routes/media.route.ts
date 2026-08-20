import { Router } from 'express';
import { authenticate } from '@/middleware/auth.middleware';
import { listMedia, deleteMedia, backfillMedia } from '@/controllers/media.controller';

const router = Router();

// Any authenticated staff member can browse/pick from the shared media
// catalog — no narrower permission, since it mirrors whatever upload
// permissions they already have on the individual content forms.
router.get('/', authenticate, listMedia);
router.post('/backfill', authenticate, backfillMedia);
router.delete('/:id', authenticate, deleteMedia);

export default router;
