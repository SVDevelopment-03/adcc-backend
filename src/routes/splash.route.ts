import { Router } from 'express';
import { getSplashPublic } from '@/controllers/splash.controller';

const router = Router();

// Public splash endpoint
router.get('/', getSplashPublic);

export default router;
