import { Router } from 'express';
import {
  createLeague,
  joinLeague,
  getLeague,
  getLeagueMembers,
} from '../controllers/leagueController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/create', authenticate, createLeague);
router.post('/join', authenticate, joinLeague);
router.get('/:leagueId', authenticate, getLeague);
router.get('/:leagueId/members', authenticate, getLeagueMembers);

export default router;
