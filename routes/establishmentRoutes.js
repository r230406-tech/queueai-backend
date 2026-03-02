const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const {
    listEstablishments,
    getEstablishment,
    getEstablishmentById,
    getMyEstablishment,
    updateMyEstablishment,
    togglePause,
    getEstablishmentQR,
    superAdminListAll,
    superAdminToggle,
    superAdminDelete,
} = require('../controllers/establishmentController');

// ── Public ────────────────────────────────────────────────────────────────────
router.get('/', listEstablishments);
router.get('/by-slug/:slug', getEstablishment);

// ── Admin: own establishment (MUST come before /:id to avoid conflict) ────────
router.get('/my', protect, restrictTo('admin'), getMyEstablishment);
router.patch('/my', protect, restrictTo('admin'), updateMyEstablishment);
router.patch('/my/pause', protect, restrictTo('admin'), togglePause);
router.get('/my/qr', protect, restrictTo('admin'), getEstablishmentQR);

// ── Super Admin ───────────────────────────────────────────────────────────────
router.get('/admin/all', protect, restrictTo('superadmin'), superAdminListAll);
router.patch('/admin/:id/toggle', protect, restrictTo('superadmin'), superAdminToggle);
router.delete('/admin/:id', protect, restrictTo('superadmin'), superAdminDelete);

// ── Public: get by MongoDB _id (used by ShopQueue page) ──────────────────────
router.get('/:id', getEstablishmentById);

module.exports = router;

