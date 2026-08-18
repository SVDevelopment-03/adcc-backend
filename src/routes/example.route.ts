import express from 'express';
import { getExamples, createExample } from '../controllers/example.controller';
import { validate } from '@/middleware/validate.middleware';
import { createExampleSchema } from '@/validators/example.validator';

const router = express.Router();

router.get('/', getExamples);
router.post('/', validate(createExampleSchema), createExample);

export default router;