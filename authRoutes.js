const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const {
    adminSignup,
    adminLogin,
    forgotPassword,
    resetPassword,
    sendOTP,
    verifyOTP,
    getMe,
} = require('../controllers/authController');

// ── Admin Auth ────────────────────────────────────────────────────────────────
router.post('/admin/signup', adminSignup);
router.post('/admin/login', adminLogin);
router.post('/admin/forgot-password', forgotPassword);
router.post('/admin/reset-password/:token', resetPassword);

// ── Customer / User Auth ──────────────────────────────────────────────────────
router.post('/user/send-otp', sendOTP);
router.post('/user/verify-otp', verifyOTP);

// ── Protected ─────────────────────────────────────────────────────────────────
router.get('/me', protect, getMe);

module.exports = router;
