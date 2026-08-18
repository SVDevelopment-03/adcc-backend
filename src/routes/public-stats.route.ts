import { Router } from 'express';
import { getPublicStats } from '@/controllers/public-stats.controller';

const router = Router();

router.get('/stats', getPublicStats);

export default router;
