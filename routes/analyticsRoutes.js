const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const {
    getSummary,
    getHourlyChart,
    getDailyChart,
    getServiceTypes,
    getHistory,
    getSuperSummary,
    getCrowdPrediction,
} = require('../controllers/analyticsController');


router.get('/summary', protect, restrictTo('admin', 'superadmin'), getSummary);
router.get('/hourly', protect, restrictTo('admin', 'superadmin'), getHourlyChart);
router.get('/daily', protect, restrictTo('admin', 'superadmin'), getDailyChart);
router.get('/service-types', protect, restrictTo('admin', 'superadmin'), getServiceTypes);
router.get('/history', protect, restrictTo('admin', 'superadmin'), getHistory);
router.get('/crowd-prediction', protect, restrictTo('admin', 'superadmin'), getCrowdPrediction);
router.get('/super-summary', protect, restrictTo('superadmin'), getSuperSummary);


module.exports = router;
