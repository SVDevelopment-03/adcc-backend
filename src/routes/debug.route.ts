import { Router } from 'express';
import { getPublicIp } from '@/controllers/debug.controller';

const router = Router();

router.get('/public-ip', getPublicIp);

export default router;
