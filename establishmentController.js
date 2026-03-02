const Establishment = require('../models/Establishment');
const User = require('../models/User');
const Queue = require('../models/Queue');
const qrcode = require('qrcode');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: calculate Haversine distance in km
// ─────────────────────────────────────────────────────────────────────────────
const haversineKm = (lat1, lng1, lat2, lng2) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/establishments  – Public: list active establishments
// ─────────────────────────────────────────────────────────────────────────────
const listEstablishments = async (req, res, next) => {
    try {
        const { category, lat, lng, radius = 50 } = req.query;
        const filter = { isActive: true };
        if (category) filter.category = category;

        const all = await Establishment.find(filter).select('-qrCodeData').lean();

        let results = all;

        // If GPS coords provided, compute distance and sort
        if (lat && lng) {
            const userLat = parseFloat(lat);
            const userLng = parseFloat(lng);
            results = all
                .map((e) => {
                    const distKm =
                        e.location?.lat && e.location?.lng
                            ? haversineKm(userLat, userLng, e.location.lat, e.location.lng)
                            : 9999;
                    return { ...e, distanceKm: Math.round(distKm * 10) / 10 };
                })
                .filter((e) => e.distanceKm <= parseFloat(radius))
                .sort((a, b) => a.distanceKm - b.distanceKm);
        }

        // Attach live waiting count to each
        const withCounts = await Promise.all(
            results.map(async (e) => {
                const waitingCount = await Queue.countDocuments({
                    establishmentId: e._id,
                    status: 'waiting',
                });
                return { ...e, waitingCount };
            })
        );

        res.status(200).json({ success: true, data: withCounts });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/establishments/:slug  – Public: get single establishment by slug
// ─────────────────────────────────────────────────────────────────────────────
const getEstablishment = async (req, res, next) => {
    try {
        const est = await Establishment.findOne({ slug: req.params.slug })
            .populate('adminId', 'name email')
            .lean();
        if (!est) return res.status(404).json({ success: false, message: 'Establishment not found.' });

        const waitingCount = await Queue.countDocuments({ establishmentId: est._id, status: 'waiting' });
        res.status(200).json({ success: true, data: { ...est, waitingCount } });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/establishments/:id  – Public: get single establishment by MongoDB _id
// ─────────────────────────────────────────────────────────────────────────────
const getEstablishmentById = async (req, res, next) => {
    try {
        const est = await Establishment.findById(req.params.id)
            .populate('adminId', 'name email')
            .lean();
        if (!est) return res.status(404).json({ success: false, message: 'Establishment not found.' });

        const waitingCount = await Queue.countDocuments({ establishmentId: est._id, status: 'waiting' });
        res.status(200).json({ success: true, data: { ...est, waitingCount } });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/establishments/my  – Admin: get own establishment
// ─────────────────────────────────────────────────────────────────────────────
const getMyEstablishment = async (req, res, next) => {
    try {
        const est = await Establishment.findById(req.user.establishmentId);
        if (!est) return res.status(404).json({ success: false, message: 'No establishment linked to your account.' });

        const waitingCount = await Queue.countDocuments({ establishmentId: est._id, status: 'waiting' });
        res.status(200).json({ success: true, data: { ...est.toJSON(), waitingCount } });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/establishments/my  – Admin: update own establishment
// ─────────────────────────────────────────────────────────────────────────────
const updateMyEstablishment = async (req, res, next) => {
    try {
        const { name, category, address, description, services, avgServiceTimeMins, lat, lng, logoUrl } = req.body;
        const est = await Establishment.findById(req.user.establishmentId);
        if (!est) return res.status(404).json({ success: false, message: 'No establishment linked to your account.' });

        if (name) est.name = name;
        if (category) est.category = category;
        if (address) est.address = address;
        if (description !== undefined) est.description = description;
        if (services) est.services = Array.isArray(services) ? services : services.split(',').map(s => s.trim());
        if (avgServiceTimeMins) est.avgServiceTimeMins = avgServiceTimeMins;
        if (lat !== undefined && lng !== undefined) est.location = { lat, lng };
        if (logoUrl !== undefined) est.logoUrl = logoUrl;
        await est.save();

        res.status(200).json({ success: true, message: 'Establishment updated.', data: est });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/establishments/my/pause  – Admin: pause or resume queue
// ─────────────────────────────────────────────────────────────────────────────
const togglePause = async (req, res, next) => {
    try {
        const est = await Establishment.findById(req.user.establishmentId);
        if (!est) return res.status(404).json({ success: false, message: 'Establishment not found.' });
        est.queuePaused = !est.queuePaused;
        await est.save();
        res.status(200).json({
            success: true,
            message: `Queue ${est.queuePaused ? 'paused' : 'resumed'}.`,
            queuePaused: est.queuePaused,
        });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/establishments/my/qr  – Admin: generate QR code for establishment
// ─────────────────────────────────────────────────────────────────────────────
const getEstablishmentQR = async (req, res, next) => {
    try {
        const est = await Establishment.findById(req.user.establishmentId);
        if (!est) return res.status(404).json({ success: false, message: 'Establishment not found.' });

        const qrUrl = `${process.env.CLIENT_URL}/shop/${est._id}`;
        const qrData = await qrcode.toDataURL(qrUrl, { width: 300, margin: 2 });
        est.qrCodeData = qrData;
        await est.save();

        res.status(200).json({ success: true, qrData, qrUrl });
    } catch (error) {
        next(error);
    }
};

// =============================================================================
// SUPER ADMIN – Manage all establishments
// =============================================================================

// GET /api/establishments/admin/all  – SuperAdmin: all establishments
const superAdminListAll = async (req, res, next) => {
    try {
        const establishments = await Establishment.find()
            .populate('adminId', 'name email isActive')
            .lean();
        res.status(200).json({ success: true, data: establishments });
    } catch (error) {
        next(error);
    }
};

// PATCH /api/establishments/admin/:id/toggle  – SuperAdmin: toggle active state
const superAdminToggle = async (req, res, next) => {
    try {
        const est = await Establishment.findById(req.params.id);
        if (!est) return res.status(404).json({ success: false, message: 'Establishment not found.' });
        est.isActive = !est.isActive;
        await est.save();
        res.status(200).json({ success: true, message: `Establishment ${est.isActive ? 'activated' : 'deactivated'}.`, data: est });
    } catch (error) {
        next(error);
    }
};

// DELETE /api/establishments/admin/:id  – SuperAdmin: delete establishment
const superAdminDelete = async (req, res, next) => {
    try {
        const est = await Establishment.findByIdAndDelete(req.params.id);
        if (!est) return res.status(404).json({ success: false, message: 'Establishment not found.' });
        // Also deactivate the linked admin
        if (est.adminId) {
            await User.findByIdAndUpdate(est.adminId, { isActive: false });
        }
        res.status(200).json({ success: true, message: 'Establishment deleted.' });
    } catch (error) {
        next(error);
    }
};

module.exports = {
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
};

