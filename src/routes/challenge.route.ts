import express from 'express';
import {
  createChallenge,
  getAllChallenges,
  getChallengeById,
  getChallengeLeaderboard,
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
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import { uploadChallengeImageIfMultipart, requireParsedMultipartBody } from '@/middleware/upload.middleware';

const router = express.Router();
const requireChallengeManagement = requireStaffPermission('manage_events', 'admin.panel');

router.get('/leaderboard', getChallengeLeaderboard);
router.get('/', validate(getChallengesQuerySchema), getAllChallenges);
router.get('/:id', optionalAuthenticate, getChallengeById);
router.get('/:id/participants', authenticate, requireChallengeManagement, getChallengeParticipants);
router.get('/:id/member-status', authenticate, getChallengeMemberStatus);

// Join a challenge (increment participants)
router.post('/:id/join', authenticate, joinChallenge);
router.patch('/:id/progress', authenticate, validate(updateChallengeProgressSchema), updateChallengeProgress);

router.post(
  '/',
  authenticate,
  requireChallengeManagement,
  uploadChallengeImageIfMultipart,
  requireParsedMultipartBody,
  validate(createChallengeSchema),
  createChallenge
);

router.patch(
  '/:id',
  authenticate,
  requireChallengeManagement,
  uploadChallengeImageIfMultipart,
  requireParsedMultipartBody,
  validate(updateChallengeSchema),
  updateChallenge
);

router.delete('/:id', authenticate, requireChallengeManagement, deleteChallenge);

export default router;
