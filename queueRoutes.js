const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const {
    joinQueue, getQueue, getTokenStatus, updateStatus, verifyQR,
    callNext, getNextEntry, removeEntry, getStats, cancelByToken,
} = require('../controllers/queueController');

// Public
router.post('/join', joinQueue);
router.get('/status/:token', getTokenStatus);
router.post('/cancel-by-token', cancelByToken);

// Admin
router.get('/', protect, restrictTo('admin', 'superadmin'), getQueue);
router.get('/stats', protect, restrictTo('admin', 'superadmin'), getStats);
router.get('/next', protect, restrictTo('admin', 'superadmin'), getNextEntry);
router.post('/call-next', protect, restrictTo('admin', 'superadmin'), callNext);
router.post('/verify-qr', protect, restrictTo('admin', 'superadmin'), verifyQR);
router.patch('/:id/status', protect, restrictTo('admin', 'superadmin'), updateStatus);
router.delete('/:id', protect, restrictTo('admin', 'superadmin'), removeEntry);

module.exports = router;
