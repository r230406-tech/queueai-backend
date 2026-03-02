const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();

const {
    createShop,
    getAllShops,
    getShopById,
    getShopQR,
    refreshQR,
    updateShop,
    deleteShop,
} = require('../controllers/shopController');

const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');

// ── Validation helpers ──────────────────────────────────────────────────────
const shopIdParam = param('shopId').trim().notEmpty().withMessage('shopId param is required');

const createValidation = [
    body('shopId')
        .trim()
        .notEmpty().withMessage('shopId is required')
        .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage('shopId must be a URL-safe slug (e.g. shop-alpha-01)'),
    body('name').trim().notEmpty().withMessage('Shop name is required'),
    body('services')
        .isArray({ min: 1 }).withMessage('At least one service is required'),
    body('avgServiceTimeMins')
        .optional().isInt({ min: 1 }).withMessage('avgServiceTimeMins must be a positive integer'),
];

const updateValidation = [
    shopIdParam,
    body('services')
        .optional().isArray({ min: 1 }).withMessage('Services must be a non-empty array if provided'),
    body('avgServiceTimeMins')
        .optional().isInt({ min: 1 }).withMessage('avgServiceTimeMins must be a positive integer'),
];

// ── Public routes ───────────────────────────────────────────────────────────
router.get('/', getAllShops);
router.get('/:shopId', [shopIdParam], validate, getShopById);
router.get('/:shopId/qr', [shopIdParam], validate, getShopQR);   // returns raw PNG

// ── Protected admin routes ──────────────────────────────────────────────────
router.use(protect, authorize('admin'));

router.post('/', createValidation, validate, createShop);
router.patch('/:shopId/qr', [shopIdParam], validate, refreshQR);
router.patch('/:shopId', updateValidation, validate, updateShop);
router.delete('/:shopId', [shopIdParam], validate, deleteShop);

module.exports = router;
