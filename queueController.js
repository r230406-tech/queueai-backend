const Queue = require('../models/Queue');
const Establishment = require('../models/Establishment');
const { generateToken } = require('../utils/tokenGenerator');
const { resolvePriority } = require('../utils/priorityQueue');
const { QUEUE_STATUS } = require('../config/constants');
const axios = require('axios');
const { notifyNearlyReady, notifyServing, hasNotified, markNotified } = require('../utils/notifier');
const { emitQueueUpdate } = require('../socket');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const buildDupKey = (estId, phone, mobile) => {
    const identity = (phone || mobile || '').toLowerCase().replace(/\s+/g, '');
    return identity ? `${estId || 'global'}|${identity}` : null;
};

const estimateWaitTime = async (priority, estId, avgMins = 5) => {
    const filter = { status: QUEUE_STATUS.WAITING, priority: { $gte: priority } };
    if (estId) filter.establishmentId = estId;
    const aheadCount = await Queue.countDocuments(filter);
    return aheadCount * avgMins;
};

const findRecentDuplicate = async (dupKey, estId) => {
    if (!dupKey) return null;
    const since = new Date(Date.now() - 30 * 1000);
    return Queue.findOne({
        duplicateCheckKey: dupKey,
        establishmentId: estId || null,
        status: QUEUE_STATUS.WAITING,
        createdAt: { $gte: since },
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/queue/join
// ─────────────────────────────────────────────────────────────────────────────
const joinQueue = async (req, res, next) => {
    try {
        const { name, phone, mobile, email, serviceType, priorityLabel, notes, establishmentId, customerId } = req.body;

        const contactPhone = phone || mobile;

        // 1. Establishment validation
        let establishment = null;
        if (establishmentId) {
            establishment = await Establishment.findById(establishmentId);
            if (!establishment || !establishment.isActive) {
                return res.status(404).json({ success: false, message: 'Establishment not found or inactive.' });
            }
            if (establishment.queuePaused) {
                return res.status(503).json({ success: false, message: 'The queue is currently paused. Please wait.' });
            }
        }

        // 2. Duplicate guard
        const dupKey = buildDupKey(establishmentId, contactPhone, email);
        const existing = await findRecentDuplicate(dupKey, establishmentId || null);
        if (existing) {
            return res.status(429).json({
                success: false,
                message: 'A token was already issued for this contact within the last 30 seconds.',
                existingToken: existing.token,
                retryAfter: Math.ceil((existing.createdAt.getTime() + 30000 - Date.now()) / 1000),
            });
        }

        // 3. Priority
        const priority = resolvePriority(priorityLabel || 'normal');
        const avgServiceMins = establishment?.avgServiceTimeMins ?? 5;

        // 4. Optional AI priority score
        let aiPriorityScore = null;
        try {
            const aiRes = await axios.post(
                `${process.env.AI_SERVICE_URL}/predict-priority`,
                { name, serviceType, priorityLabel },
                { timeout: 3000 }
            );
            aiPriorityScore = aiRes.data?.score ?? null;
        } catch (_) { /* AI service unavailable */ }

        // 5. Token + wait time
        const { token, tokenNumber } = await generateToken();
        const estimatedWaitTime = await estimateWaitTime(priority, establishmentId || null, avgServiceMins);

        // 6. Create entry
        const entry = await Queue.create({
            token,
            tokenNumber,
            name,
            phone: contactPhone,
            email,
            serviceType: serviceType || 'General',
            priority,
            priorityLabel: priorityLabel || 'normal',
            estimatedWaitTime,
            notes,
            aiPriorityScore,
            establishmentId: establishmentId || null,
            customerId: customerId || null,
            duplicateCheckKey: dupKey,
            qrVerified: false,
        });

        res.status(201).json({
            success: true,
            message: establishment ? `You have joined the queue at ${establishment.name}.` : 'You have joined the queue.',
            data: entry,
        });

        emitQueueUpdate(establishmentId || null, { event: 'join', establishmentId: establishmentId || null });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/queue  – Admin: full queue list for own establishment
// ─────────────────────────────────────────────────────────────────────────────
const getQueue = async (req, res, next) => {
    try {
        const { status, priority, page = 1, limit = 50 } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (priority) filter.priority = Number(priority);

        // Scope to admin's own establishment
        if (req.user?.role === 'admin' && req.user.establishmentId) {
            filter.establishmentId = req.user.establishmentId;
        } else if (req.query.establishmentId) {
            filter.establishmentId = req.query.establishmentId;
        }

        const skip = (Number(page) - 1) * Number(limit);
        const [entries, total] = await Promise.all([
            Queue.find(filter).sort({ priority: -1, createdAt: 1 }).skip(skip).limit(Number(limit)),
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
// GET /api/queue/status/:token  – Public: check own status
// ─────────────────────────────────────────────────────────────────────────────
const getTokenStatus = async (req, res, next) => {
    try {
        const entry = await Queue.findOne({ token: req.params.token });
        if (!entry) return res.status(404).json({ success: false, message: 'Token not found.' });

        const aheadFilter = {
            status: QUEUE_STATUS.WAITING,
            $or: [
                { priority: { $gt: entry.priority } },
                { priority: entry.priority, createdAt: { $lt: entry.createdAt } },
            ],
        };
        if (entry.establishmentId) aheadFilter.establishmentId = entry.establishmentId;

        const ahead = await Queue.countDocuments(aheadFilter);

        let establishmentName = '';
        let avgMins = 5;
        if (entry.establishmentId) {
            const est = await Establishment.findById(entry.establishmentId).select('avgServiceTimeMins name');
            if (est) { avgMins = est.avgServiceTimeMins; establishmentName = est.name; }
        }

        const position = ahead + 1;
        const estimatedWait = ahead * avgMins;

        if (entry.status === QUEUE_STATUS.WAITING && ahead <= 2 && !hasNotified(entry.token, 'nearlyReady')) {
            markNotified(entry.token, 'nearlyReady');
            notifyNearlyReady(entry, position, establishmentName, estimatedWait).catch(() => { });
        }

        res.status(200).json({
            success: true,
            data: { ...entry.toJSON(), positionInQueue: position, estimatedWaitTime: estimatedWait, establishmentName },
        });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/queue/:id/status  – Admin: update status
// ─────────────────────────────────────────────────────────────────────────────
const updateStatus = async (req, res, next) => {
    try {
        const { status, counterNumber } = req.body;
        const entry = await Queue.findById(req.params.id);
        if (!entry) return res.status(404).json({ success: false, message: 'Queue entry not found.' });

        // Ensure admin can only update their own establishment's entries
        if (req.user?.role === 'admin' && req.user.establishmentId?.toString() !== entry.establishmentId?.toString()) {
            return res.status(403).json({ success: false, message: 'Forbidden.' });
        }

        const prevStatus = entry.status;
        entry.status = status;
        if (status === QUEUE_STATUS.SERVING) entry.servedAt = new Date();
        if (status === QUEUE_STATUS.COMPLETED) entry.completedAt = new Date();
        if (counterNumber !== undefined) entry.counterNumber = counterNumber;
        await entry.save();

        if (status === QUEUE_STATUS.SERVING && prevStatus !== QUEUE_STATUS.SERVING && !hasNotified(entry.token, 'serving')) {
            markNotified(entry.token, 'serving');
            let estName = '';
            if (entry.establishmentId) {
                const e = await Establishment.findById(entry.establishmentId).select('name');
                if (e) estName = e.name;
            }
            notifyServing(entry, counterNumber ?? '', estName).catch(() => { });
        }

        res.status(200).json({ success: true, message: 'Status updated.', data: entry });
        emitQueueUpdate(entry.establishmentId || null, {
            event: 'status_change', token: entry.token, status, establishmentId: entry.establishmentId || null,
        });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/queue/verify-qr  – Admin: scan QR, verify arrival, auto-call next
// ─────────────────────────────────────────────────────────────────────────────
const verifyQR = async (req, res, next) => {
    try {
        const { token } = req.body;
        const entry = await Queue.findOne({ token });
        if (!entry) return res.status(404).json({ success: false, message: 'Token not found.' });

        if (entry.status !== QUEUE_STATUS.WAITING) {
            return res.status(400).json({ success: false, message: `Entry is already ${entry.status}.` });
        }

        // Verify arrival
        entry.qrVerified = true;
        entry.status = QUEUE_STATUS.SERVING;
        entry.servedAt = new Date();
        await entry.save();

        emitQueueUpdate(entry.establishmentId || null, {
            event: 'qr_verified', token: entry.token, status: QUEUE_STATUS.SERVING,
        });

        res.status(200).json({ success: true, message: `QR verified. ${entry.name} is now being served.`, data: entry });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/queue/next  – Admin: next highest-priority waiting entry
// ─────────────────────────────────────────────────────────────────────────────
const getNextEntry = async (req, res, next) => {
    try {
        const filter = { status: QUEUE_STATUS.WAITING };
        if (req.user?.role === 'admin' && req.user.establishmentId) {
            filter.establishmentId = req.user.establishmentId;
        } else if (req.query.establishmentId) {
            filter.establishmentId = req.query.establishmentId;
        }

        const nextEntry = await Queue.findOne(filter).sort({ priority: -1, createdAt: 1 });
        if (!nextEntry) return res.status(200).json({ success: true, message: 'Queue is empty.', data: null });
        res.status(200).json({ success: true, data: nextEntry });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/queue/call-next  – Admin: call next and mark as serving
// ─────────────────────────────────────────────────────────────────────────────
const callNext = async (req, res, next) => {
    try {
        const filter = { status: QUEUE_STATUS.WAITING };
        if (req.user?.role === 'admin' && req.user.establishmentId) {
            filter.establishmentId = req.user.establishmentId;
        }

        const nextEntry = await Queue.findOne(filter).sort({ priority: -1, createdAt: 1 });
        if (!nextEntry) return res.status(200).json({ success: true, message: 'Queue is empty.', data: null });

        nextEntry.status = QUEUE_STATUS.SERVING;
        nextEntry.servedAt = new Date();
        await nextEntry.save();

        emitQueueUpdate(nextEntry.establishmentId || null, {
            event: 'called_next', token: nextEntry.token, status: QUEUE_STATUS.SERVING,
        });

        // Notify the user
        if (!hasNotified(nextEntry.token, 'serving')) {
            markNotified(nextEntry.token, 'serving');
            notifyServing(nextEntry, '', '').catch(() => { });
        }

        res.status(200).json({ success: true, message: `Now serving: ${nextEntry.name} (${nextEntry.token})`, data: nextEntry });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/queue/:id  – Admin: remove entry
// ─────────────────────────────────────────────────────────────────────────────
const removeEntry = async (req, res, next) => {
    try {
        const entry = await Queue.findByIdAndDelete(req.params.id);
        if (!entry) return res.status(404).json({ success: false, message: 'Queue entry not found.' });
        emitQueueUpdate(entry.establishmentId || null, { event: 'removed', token: entry.token });
        res.status(200).json({ success: true, message: 'Entry removed from queue.' });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/queue/stats
// ─────────────────────────────────────────────────────────────────────────────
const getStats = async (req, res, next) => {
    try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const baseFilter = { createdAt: { $gte: todayStart } };
        if (req.user?.role === 'admin' && req.user.establishmentId) {
            baseFilter.establishmentId = req.user.establishmentId;
        }

        const [total, waiting, serving, completed] = await Promise.all([
            Queue.countDocuments(baseFilter),
            Queue.countDocuments({ ...baseFilter, status: QUEUE_STATUS.WAITING }),
            Queue.countDocuments({ ...baseFilter, status: QUEUE_STATUS.SERVING }),
            Queue.countDocuments({ ...baseFilter, status: QUEUE_STATUS.COMPLETED }),
        ]);

        res.status(200).json({ success: true, data: { total, waiting, serving, completed } });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/queue/cancel-by-token  – Public: self-cancel
// ─────────────────────────────────────────────────────────────────────────────
const cancelByToken = async (req, res, next) => {
    try {
        const { token } = req.body;
        const entry = await Queue.findOne({ token });
        if (!entry) return res.status(404).json({ success: false, message: 'Token not found.' });
        if (['completed', 'cancelled', 'no_show'].includes(entry.status)) {
            return res.status(400).json({ success: false, message: `Entry is already ${entry.status}.` });
        }
        entry.status = QUEUE_STATUS.CANCELLED;
        await entry.save();

        emitQueueUpdate(entry.establishmentId || null, {
            event: 'status_change', token: entry.token, status: QUEUE_STATUS.CANCELLED,
        });

        res.status(200).json({ success: true, message: 'You have left the queue.' });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    joinQueue, getQueue, getTokenStatus, updateStatus, verifyQR,
    callNext, getNextEntry, removeEntry, getStats, cancelByToken,
};
