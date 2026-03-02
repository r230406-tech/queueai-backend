const QRCode = require('qrcode');
const Shop = require('../models/Shop');

// ─────────────────────────────────────────────────────────────────────────────
// Utility: generate QR code PNG buffer & base64 data URL for a shop
// ─────────────────────────────────────────────────────────────────────────────
const buildQRContent = (shopId) => {
    const base = process.env.CLIENT_URL || 'http://localhost:3000';
    return `${base}/shop/${shopId}`;
};

const generateQRBuffer = (shopId) =>
    QRCode.toBuffer(buildQRContent(shopId), {
        errorCorrectionLevel: 'H',
        type: 'png',
        margin: 2,
        color: { dark: '#0f0f1a', light: '#ffffff' },
        width: 300,
    });

const generateQRDataURL = (shopId) =>
    QRCode.toDataURL(buildQRContent(shopId), {
        errorCorrectionLevel: 'H',
        margin: 2,
        color: { dark: '#0f0f1a', light: '#ffffff' },
        width: 300,
    });

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/shops  – Admin: create shop + pre-generate QR
// ─────────────────────────────────────────────────────────────────────────────
const createShop = async (req, res, next) => {
    try {
        const { shopId, name, description, category, services, address, logoUrl, avgServiceTimeMins } = req.body;

        // Pre-generate and cache the QR data URL
        const qrCodeData = await generateQRDataURL(shopId);

        const shop = await Shop.create({
            shopId,
            name,
            description,
            category,
            services,
            address,
            logoUrl,
            avgServiceTimeMins,
            qrCodeData,
            createdBy: req.user?._id || null,
        });

        res.status(201).json({ success: true, message: 'Shop created successfully.', data: shop });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/shops  – Public: list all active shops
// ─────────────────────────────────────────────────────────────────────────────
const getAllShops = async (req, res, next) => {
    try {
        const filter = { isActive: true };
        if (req.query.category) filter.category = req.query.category;
        const shops = await Shop.find(filter).select('-qrCodeData').sort({ name: 1 });
        res.status(200).json({ success: true, count: shops.length, data: shops });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/shops/:shopId  – Public: get one shop by slug
// ─────────────────────────────────────────────────────────────────────────────
const getShopById = async (req, res, next) => {
    try {
        const shop = await Shop.findOne({ shopId: req.params.shopId }).select('-qrCodeData');
        if (!shop || !shop.isActive) {
            return res.status(404).json({ success: false, message: 'Shop not found or inactive.' });
        }
        res.status(200).json({ success: true, data: shop });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/shops/:shopId/qr  – Public: serve QR as raw PNG image
// ─────────────────────────────────────────────────────────────────────────────
const getShopQR = async (req, res, next) => {
    try {
        const shop = await Shop.findOne({ shopId: req.params.shopId });
        if (!shop || !shop.isActive) {
            return res.status(404).json({ success: false, message: 'Shop not found.' });
        }

        // Serve as PNG binary stream
        const buffer = await generateQRBuffer(shop.shopId);
        res.set({
            'Content-Type': 'image/png',
            'Content-Length': buffer.length,
            'Cache-Control': 'public, max-age=86400',
            'Content-Disposition': `inline; filename="qr-${shop.shopId}.png"`,
        });
        res.send(buffer);
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/shops/:shopId/qr  – Admin: regenerate + save QR
// ─────────────────────────────────────────────────────────────────────────────
const refreshQR = async (req, res, next) => {
    try {
        const shop = await Shop.findOne({ shopId: req.params.shopId });
        if (!shop) {
            return res.status(404).json({ success: false, message: 'Shop not found.' });
        }

        shop.qrCodeData = await generateQRDataURL(shop.shopId);
        await shop.save({ validateBeforeSave: false });

        res.status(200).json({ success: true, message: 'QR code refreshed.', qrCodeData: shop.qrCodeData });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/shops/:shopId  – Admin: update shop fields
// ─────────────────────────────────────────────────────────────────────────────
const updateShop = async (req, res, next) => {
    try {
        const allowed = ['name', 'description', 'category', 'services', 'address', 'logoUrl', 'avgServiceTimeMins', 'isActive'];
        const updates = Object.fromEntries(
            Object.entries(req.body).filter(([k]) => allowed.includes(k))
        );

        const shop = await Shop.findOneAndUpdate(
            { shopId: req.params.shopId },
            updates,
            { new: true, runValidators: true }
        ).select('-qrCodeData');

        if (!shop) return res.status(404).json({ success: false, message: 'Shop not found.' });

        res.status(200).json({ success: true, message: 'Shop updated.', data: shop });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/shops/:shopId  – Admin: soft-delete (isActive = false)
// ─────────────────────────────────────────────────────────────────────────────
const deleteShop = async (req, res, next) => {
    try {
        const shop = await Shop.findOneAndUpdate(
            { shopId: req.params.shopId },
            { isActive: false },
            { new: true }
        );
        if (!shop) return res.status(404).json({ success: false, message: 'Shop not found.' });
        res.status(200).json({ success: true, message: `Shop '${shop.name}' deactivated.` });
    } catch (error) {
        next(error);
    }
};

module.exports = { createShop, getAllShops, getShopById, getShopQR, refreshQR, updateShop, deleteShop };
