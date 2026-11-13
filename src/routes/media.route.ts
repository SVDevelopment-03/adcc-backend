import { Router } from 'express';
import { authenticate } from '@/middleware/auth.middleware';
import { requireStaff } from '@/middleware/require-staff.middleware';
import { listMedia, deleteMedia, backfillMedia, getMediaFile } from '@/controllers/media.controller';

const router = Router();

// Any staff member can browse/pick from the shared media catalog — no
// narrower permission, since it mirrors whatever upload permissions they
// already have on the individual content forms. Members (app users) have no
// access: before, any signed-in member could list, rescan and delete entries.
router.get('/', authenticate, requireStaff, listMedia);
router.get('/:id/file', authenticate, requireStaff, getMediaFile);
router.post('/backfill', authenticate, requireStaff, backfillMedia);
router.delete('/:id', authenticate, requireStaff, deleteMedia);

export default router;
