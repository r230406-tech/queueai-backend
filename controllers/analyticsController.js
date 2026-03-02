const mongoose = require('mongoose');
const Queue = require('../models/Queue');
const Establishment = require('../models/Establishment');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build date range
// ─────────────────────────────────────────────────────────────────────────────
const getDateRange = (period) => {
    const now = new Date();
    const start = new Date();
    if (period === 'week') {
        start.setDate(now.getDate() - 6);
        start.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
    } else {
        // day – midnight today
        start.setHours(0, 0, 0, 0);
    }
    return { start, end: now };
};

// Helper: safely cast to ObjectId (avoids type mismatch in aggregates)
const toObjectId = (id) => {
    if (!id) return null;
    try {
        return new mongoose.Types.ObjectId(id.toString());
    } catch {
        return null;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/summary?period=day|week|month
// ─────────────────────────────────────────────────────────────────────────────
const getSummary = async (req, res, next) => {
    try {
        const { period = 'day' } = req.query;
        const { start, end } = getDateRange(period);
        const estId = toObjectId(req.user.establishmentId);

        const baseFilter = {
            ...(estId && { establishmentId: estId }),
            createdAt: { $gte: start, $lte: end },
        };

        const [total, waiting, serving, completed, cancelled] = await Promise.all([
            Queue.countDocuments(baseFilter),
            Queue.countDocuments({ ...baseFilter, status: 'waiting' }),
            Queue.countDocuments({ ...baseFilter, status: 'serving' }),
            Queue.countDocuments({ ...baseFilter, status: 'completed' }),
            Queue.countDocuments({ ...baseFilter, status: { $in: ['cancelled', 'no_show'] } }),
        ]);

        const avgWaitAgg = await Queue.aggregate([
            { $match: { ...baseFilter, status: 'completed', servedAt: { $ne: null } } },
            {
                $project: {
                    waitMin: { $divide: [{ $subtract: ['$servedAt', '$createdAt'] }, 60000] },
                },
            },
            { $group: { _id: null, avg: { $avg: '$waitMin' } } },
        ]);
        const avgWaitMins = Math.round(avgWaitAgg[0]?.avg || 0);

        res.status(200).json({
            success: true,
            data: { total, waiting, serving, completed, cancelled, avgWaitMins, period },
        });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/hourly
// ─────────────────────────────────────────────────────────────────────────────
const getHourlyChart = async (req, res, next) => {
    try {
        const { period = 'day' } = req.query;
        const { start } = getDateRange(period);
        const estId = toObjectId(req.user.establishmentId);

        const matchStage = { createdAt: { $gte: start } };
        if (estId) matchStage.establishmentId = estId;

        const data = await Queue.aggregate([
            { $match: matchStage },
            { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]);

        const hours = Array.from({ length: 24 }, (_, h) => {
            const found = data.find((d) => d._id === h);
            return { hour: `${String(h).padStart(2, '0')}:00`, count: found?.count || 0 };
        });

        res.status(200).json({ success: true, data: hours });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/daily
// ─────────────────────────────────────────────────────────────────────────────
const getDailyChart = async (req, res, next) => {
    try {
        const { period = 'week' } = req.query;
        const { start } = getDateRange(period);
        const estId = toObjectId(req.user.establishmentId);

        const matchStage = { createdAt: { $gte: start } };
        if (estId) matchStage.establishmentId = estId;

        const data = await Queue.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                        day: { $dayOfMonth: '$createdAt' },
                    },
                    total: { $sum: 1 },
                    completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                },
            },
            { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
        ]);

        const formatted = data.map((d) => ({
            date: `${d._id.year}-${String(d._id.month).padStart(2, '0')}-${String(d._id.day).padStart(2, '0')}`,
            total: d.total,
            completed: d.completed,
        }));

        res.status(200).json({ success: true, data: formatted });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/service-types
// ─────────────────────────────────────────────────────────────────────────────
const getServiceTypes = async (req, res, next) => {
    try {
        const { period = 'week' } = req.query;
        const { start } = getDateRange(period);
        const estId = toObjectId(req.user.establishmentId);

        const matchStage = { createdAt: { $gte: start } };
        if (estId) matchStage.establishmentId = estId;

        const data = await Queue.aggregate([
            { $match: matchStage },
            { $group: { _id: '$serviceType', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]);

        res.status(200).json({
            success: true,
            data: data.map((d) => ({ name: d._id || 'Unknown', value: d.count })),
        });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/history?period=day|week|month&page=1&limit=30
// Returns ALL completed/cancelled entries for the admin's establishment.
// Does NOT require QR verification — any status change saves to history.
// ─────────────────────────────────────────────────────────────────────────────
const getHistory = async (req, res, next) => {
    try {
        const { period = 'day', page = 1, limit = 50 } = req.query;
        const { start } = getDateRange(period);
        const estId = toObjectId(req.user.establishmentId);

        // Build filter — scope to establishment if available
        const filter = {
            status: { $in: ['completed', 'cancelled', 'no_show'] },
        };

        // When period is 'all', skip date filter — keeps history persistent
        if (period !== 'all') {
            filter.createdAt = { $gte: start };
        }

        // Scope to admin's own establishment
        if (estId) {
            filter.establishmentId = estId;
        } else if (req.user.role === 'admin') {
            // Admin without establishment - return empty
            return res.status(200).json({ success: true, total: 0, page: 1, pages: 0, data: [] });
        }

        const skip = (Number(page) - 1) * Number(limit);
        const [entries, total] = await Promise.all([
            Queue.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .lean(),
            Queue.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: entries,
        });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/crowd-prediction
// AI-style crowd forecasting based on 30-day historical hourly patterns
// ─────────────────────────────────────────────────────────────────────────────
const getCrowdPrediction = async (req, res, next) => {
    try {
        const estId = toObjectId(req.user.establishmentId);

        // Collect 30 days of data grouped by hour-of-day
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const matchStage = { createdAt: { $gte: thirtyDaysAgo } };
        if (estId) matchStage.establishmentId = estId;

        const historical = await Queue.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: {
                        hour: { $hour: '$createdAt' },
                        dayOfWeek: { $dayOfWeek: '$createdAt' },
                    },
                    count: { $sum: 1 },
                },
            },
        ]);

        // Build a 24-slot average per hour across all days
        const hourTotals = Array(24).fill(0);
        const hourDays = Array(24).fill(0);  // how many day-samples contributed
        for (const r of historical) {
            const h = r._id.hour;
            hourTotals[h] += r.count;
            hourDays[h] += 1;
        }
        const hourAvg = hourTotals.map((total, h) =>
            hourDays[h] > 0 ? Math.round(total / hourDays[h]) : 0
        );

        // Smooth with a simple 3-tap moving average
        const smoothed = hourAvg.map((v, i) => {
            const prev = hourAvg[(i + 23) % 24];
            const next = hourAvg[(i + 1) % 24];
            return Math.round((prev + v * 2 + next) / 4);
        });

        const maxVal = Math.max(...smoothed, 1);

        const getCrowdLevel = (val) => {
            const pct = val / maxVal;
            if (pct < 0.2) return { label: 'Quiet', color: '#10b981', emoji: '😌' };
            if (pct < 0.5) return { label: 'Moderate', color: '#06b6d4', emoji: '🙂' };
            if (pct < 0.8) return { label: 'Busy', color: '#f59e0b', emoji: '😰' };
            return { label: 'Very Busy', color: '#ef4444', emoji: '🔥' };
        };

        // Next 12 hours from now
        const nowHour = new Date().getHours();
        const nextHours = Array.from({ length: 12 }, (_, i) => {
            const h = (nowHour + i) % 24;
            const predicted = smoothed[h];
            const { label, color, emoji } = getCrowdLevel(predicted);
            const dataPoints = hourDays[h];
            // Confidence: more historical data = more confidence
            const confidence = Math.min(100, Math.round((dataPoints / 30) * 100));
            return {
                hour: `${String(h).padStart(2, '0')}:00`,
                hourInt: h,
                predicted,
                label,
                color,
                emoji,
                confidence,
                isCurrent: i === 0,
            };
        });

        // All 24h for the background heatmap
        const fullDay = Array.from({ length: 24 }, (_, h) => {
            const predicted = smoothed[h];
            const { label, color, emoji } = getCrowdLevel(predicted);
            return { hour: `${String(h).padStart(2, '0')}:00`, hourInt: h, predicted, label, color, emoji };
        });

        // Best time to visit = quietest morning/afternoon hour (6am–8pm)
        let bestHour = 9;
        let bestVal = Infinity;
        for (let h = 6; h <= 20; h++) {
            if (smoothed[h] < bestVal) { bestVal = smoothed[h]; bestHour = h; }
        }

        // Peak hour
        const peakHour = smoothed.indexOf(Math.max(...smoothed));

        const totalDataPoints = historical.length;
        const hasEnoughData = totalDataPoints > 5;

        res.status(200).json({
            success: true,
            data: {
                nextHours,
                fullDay,
                bestTimeToVisit: `${String(bestHour).padStart(2, '0')}:00`,
                peakHour: `${String(peakHour).padStart(2, '0')}:00`,
                currentHour: `${String(nowHour).padStart(2, '0')}:00`,
                currentCrowd: getCrowdLevel(smoothed[nowHour]),
                currentPredicted: smoothed[nowHour],
                hasEnoughData,
                dataPoints: totalDataPoints,
            },
        });
    } catch (error) {
        next(error);
    }
};

const getSuperSummary = async (req, res, next) => {
    try {
        const { start } = getDateRange('month');
        const [totalEst, activeEst, totalQueue, completedQueue] = await Promise.all([
            Establishment.countDocuments(),
            Establishment.countDocuments({ isActive: true }),
            Queue.countDocuments({ createdAt: { $gte: start } }),
            Queue.countDocuments({ status: 'completed', createdAt: { $gte: start } }),
        ]);

        const topEst = await Queue.aggregate([
            { $match: { createdAt: { $gte: start } } },
            { $group: { _id: '$establishmentId', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 },
            {
                $lookup: {
                    from: 'establishments',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'est',
                },
            },
            { $unwind: { path: '$est', preserveNullAndEmpty: true } },
            { $project: { name: '$est.name', category: '$est.category', count: 1 } },
        ]);

        res.status(200).json({
            success: true,
            data: { totalEst, activeEst, totalQueue, completedQueue, topEstablishments: topEst },
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getSummary,
    getHourlyChart,
    getDailyChart,
    getServiceTypes,
    getHistory,
    getSuperSummary,
    getCrowdPrediction,
};

