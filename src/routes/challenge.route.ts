import express from 'express';
import {
  createChallenge,
  getAllChallenges,
  getChallengeById,
  updateChallenge,
  deleteChallenge,
  joinChallenge,
  getChallengeMemberStatus,
  updateChallengeProgress,
  getChallengeParticipants,
} from '@/controllers/challenge.controller';
import { validate } from '@/middleware/validate.middleware';
import {
  createChallengeSchema,
  updateChallengeSchema,
  updateChallengeProgressSchema,
  getChallengesQuerySchema,
} from '@/validators/challenge.validator';
import { authenticate, optionalAuthenticate } from '@/middleware/auth.middleware';
import { isAdmin } from '@/middleware/role.middleware';
import { uploadChallengeImageIfMultipart, requireParsedMultipartBody } from '@/middleware/upload.middleware';

const router = express.Router();

router.get('/', validate(getChallengesQuerySchema), getAllChallenges);
router.get('/:id', optionalAuthenticate, getChallengeById);
router.get('/:id/participants', authenticate, isAdmin, getChallengeParticipants);
router.get('/:id/member-status', authenticate, getChallengeMemberStatus);

// Join a challenge (increment participants)
router.post('/:id/join', authenticate, joinChallenge);
router.patch('/:id/progress', authenticate, validate(updateChallengeProgressSchema), updateChallengeProgress);

router.post(
  '/',
  authenticate,
  isAdmin,
  uploadChallengeImageIfMultipart,
  requireParsedMultipartBody,
  validate(createChallengeSchema),
  createChallenge
);

router.patch(
  '/:id',
  authenticate,
  isAdmin,
  uploadChallengeImageIfMultipart,
  requireParsedMultipartBody,
  validate(updateChallengeSchema),
  updateChallenge
);

router.delete('/:id', authenticate, isAdmin, deleteChallenge);

export default router;
