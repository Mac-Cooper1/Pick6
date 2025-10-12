import { Router } from 'express';
import {
  getAllTeams,
  getDraftPicks,
  draftTeam,
  getAvailableTeams,
} from '../controllers/draftController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/teams', authenticate, getAllTeams);
router.get('/:leagueId/picks', authenticate, getDraftPicks);
router.post('/:leagueId/pick', authenticate, draftTeam);
router.get('/:leagueId/available', authenticate, getAvailableTeams);

export default router;
