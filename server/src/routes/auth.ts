import { Router } from 'express';
import { register, login, getCurrentUser, updateCurrentUser } from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post('/register', asyncHandler(register));
router.post('/login', asyncHandler(login));
router.get('/me', authenticate, asyncHandler(getCurrentUser));
router.patch('/me', authenticate, asyncHandler(updateCurrentUser));

export default router;
