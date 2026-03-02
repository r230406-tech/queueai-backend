require('dotenv').config();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Establishment = require('../models/Establishment');
const OTP = require('../models/OTP');

// ── JWT Helper ────────────────────────────────────────────────────────────────
const signToken = (payload, expiresIn = process.env.JWT_EXPIRES_IN || '7d') =>
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });

// ── Email Helper ──────────────────────────────────────────────────────────────
const sendResetEmail = async (email, token) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
    const resetUrl = `${process.env.CLIENT_URL}/admin/reset-password?token=${token}`;
    await transporter.sendMail({
        from: `"QueueAI" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: 'QueueAI – Password Reset Request',
        html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:500px;margin:auto;background:#0f172a;color:#e2e8f0;padding:40px;border-radius:12px;">
        <h2 style="color:#6366f1;margin-top:0;">Password Reset</h2>
        <p>Click the button below to reset your admin password. This link expires in 15 minutes.</p>
        <a href="${resetUrl}"
          style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:12px 28px;text-decoration:none;border-radius:8px;font-weight:600;margin:16px 0;">
          Reset Password
        </a>
        <p style="font-size:12px;color:#64748b;">If you did not request this, ignore this email.</p>
      </div>`,
    });
};

// ── OTP Generator ─────────────────────────────────────────────────────────────
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// =============================================================================
// ADMIN AUTH
// =============================================================================

// POST /api/auth/admin/signup
const adminSignup = async (req, res, next) => {
    try {
        const {
            name, email, password,
            establishmentName, establishmentCategory,
            establishmentAddress, establishmentServices,
            lat, lng,
        } = req.body;

        if (!name || !email || !password || !establishmentName) {
            return res.status(400).json({ success: false, message: 'Name, email, password, and establishment name are required.' });
        }

        const exists = await User.findOne({ email });
        if (exists) {
            return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
        }

        // Build slug from establishment name
        const slug = establishmentName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') + '-' + Date.now().toString(36);

        // Create establishment first
        const establishment = await Establishment.create({
            name: establishmentName,
            slug,
            category: establishmentCategory || 'Other',
            address: establishmentAddress || '',
            services: establishmentServices
                ? (Array.isArray(establishmentServices) ? establishmentServices : establishmentServices.split(',').map(s => s.trim()))
                : ['General'],
            location: { lat: lat || null, lng: lng || null },
        });

        // Create admin user linked to establishment
        const user = await User.create({
            name,
            email,
            password,
            role: 'admin',
            establishmentId: establishment._id,
        });

        // Link adminId back to establishment
        establishment.adminId = user._id;
        await establishment.save();

        const token = signToken({ id: user._id, role: user.role, establishmentId: establishment._id });

        res.status(201).json({
            success: true,
            message: 'Admin account created successfully.',
            token,
            user: { id: user._id, name: user.name, email: user.email, role: user.role },
            establishment: { id: establishment._id, name: establishment.name, slug: establishment.slug },
        });
    } catch (error) {
        next(error);
    }
};

// POST /api/auth/admin/login
const adminLogin = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required.' });
        }

        const user = await User.findOne({ email, role: { $in: ['admin', 'superadmin'] } }).select('+password');
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }
        if (!user.isActive) {
            return res.status(403).json({ success: false, message: 'Account is deactivated. Contact support.' });
        }

        user.lastLogin = new Date();
        await user.save({ validateBeforeSave: false });

        let establishment = null;
        if (user.establishmentId) {
            establishment = await Establishment.findById(user.establishmentId).select('name slug category isActive queuePaused');
        }

        const token = signToken({ id: user._id, role: user.role, establishmentId: user.establishmentId });

        res.status(200).json({
            success: true,
            token,
            user: { id: user._id, name: user.name, email: user.email, role: user.role },
            establishment,
        });
    } catch (error) {
        next(error);
    }
};

// POST /api/auth/admin/forgot-password
const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email, role: { $in: ['admin', 'superadmin'] } });
        // Always respond 200 to prevent email enumeration
        if (!user) {
            return res.status(200).json({ success: true, message: 'If that email exists, a reset link has been sent.' });
        }

        const rawToken = user.generateResetToken();
        await user.save({ validateBeforeSave: false });

        try {
            await sendResetEmail(email, rawToken);
        } catch (emailErr) {
            console.error('📧 Reset email failed:', emailErr.message);
            // Still return success so user isn't confused
        }

        res.status(200).json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    } catch (error) {
        next(error);
    }
};

// POST /api/auth/admin/reset-password/:token
const resetPassword = async (req, res, next) => {
    try {
        const token = req.params.token;
        const { password } = req.body;
        if (!token || !password) {
            return res.status(400).json({ success: false, message: 'Token and new password are required.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
        }

        const hashed = crypto.createHash('sha256').update(token).digest('hex');
        const user = await User.findOne({
            resetPasswordToken: hashed,
            resetPasswordExpiry: { $gt: Date.now() },
        }).select('+resetPasswordToken +resetPasswordExpiry');

        if (!user) {
            return res.status(400).json({ success: false, message: 'Token is invalid or has expired. Please request a new reset link.' });
        }

        user.password = password;
        user.resetPasswordToken = null;
        user.resetPasswordExpiry = null;
        await user.save();

        res.status(200).json({ success: true, message: 'Password reset successfully. You can now log in.' });
    } catch (error) {
        next(error);
    }
};


// =============================================================================
// CUSTOMER / USER OTP AUTH
// =============================================================================

// POST /api/auth/user/send-otp
const sendOTP = async (req, res, next) => {
    try {
        const { mobile } = req.body;
        if (!mobile) return res.status(400).json({ success: false, message: 'Mobile number is required.' });

        // Delete any existing OTP for this mobile
        await OTP.deleteMany({ mobile });

        const otp = generateOTP();
        await OTP.create({ mobile, otp });

        // In a real app, integrate with Twilio/SMS gateway
        // For demo/expo: log the OTP to console
        console.log(`📱 OTP for ${mobile}: ${otp}`);

        // Try sending via Twilio if configured
        if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_ACCOUNT_SID !== 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') {
            try {
                const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                await twilio.messages.create({
                    body: `Your QueueAI verification code is: ${otp}. Valid for 5 minutes.`,
                    from: process.env.TWILIO_PHONE_FROM,
                    to: mobile,
                });
            } catch (smsErr) {
                console.error('📱 SMS send failed:', smsErr.message);
            }
        }

        res.status(200).json({
            success: true,
            message: 'OTP sent to your mobile number.',
            // In development mode, return OTP for testing
            ...(process.env.NODE_ENV === 'development' && { otp }),
        });
    } catch (error) {
        next(error);
    }
};

// POST /api/auth/user/verify-otp
const verifyOTP = async (req, res, next) => {
    try {
        const { mobile, otp, name } = req.body;
        if (!mobile || !otp) {
            return res.status(400).json({ success: false, message: 'Mobile and OTP are required.' });
        }

        const record = await OTP.findOne({ mobile, verified: false });
        if (!record) {
            return res.status(404).json({ success: false, message: 'OTP not found or already used. Please request a new OTP.' });
        }
        if (record.expiresAt < new Date()) {
            await OTP.deleteOne({ _id: record._id });
            return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
        }

        record.attempts += 1;
        if (record.otp !== otp) {
            await record.save();
            if (record.attempts >= 5) {
                await OTP.deleteOne({ _id: record._id });
                return res.status(403).json({ success: false, message: 'Too many failed attempts. Please request a new OTP.' });
            }
            return res.status(400).json({ success: false, message: `Invalid OTP. ${5 - record.attempts} attempts remaining.` });
        }

        record.verified = true;
        await record.save();

        // Auto-create customer account if not exists
        let user = await User.findOne({ mobile });
        if (!user) {
            user = await User.create({
                name: name || `User ${mobile.slice(-4)}`,
                mobile,
                role: 'customer',
            });
        } else if (name && !user.name.startsWith('User ')) {
            // Update name if provided
            user.name = name;
        }
        user.lastLogin = new Date();
        await user.save({ validateBeforeSave: false });

        const token = signToken({ id: user._id, role: user.role });

        res.status(200).json({
            success: true,
            message: 'Login successful.',
            token,
            user: { id: user._id, name: user.name, mobile: user.mobile, role: user.role },
        });
    } catch (error) {
        next(error);
    }
};

// GET /api/auth/me
const getMe = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id)
            .select('-password -resetPasswordToken -resetPasswordExpiry')
            .populate('establishmentId', 'name slug category isActive queuePaused avgServiceTimeMins');
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

        // Return user + separate establishment for AuthContext
        const userData = {
            id: user._id,
            _id: user._id,
            name: user.name,
            email: user.email,
            mobile: user.mobile,
            role: user.role,
            isActive: user.isActive,
            establishmentId: user.establishmentId,
        };

        res.status(200).json({ success: true, data: userData });
    } catch (error) {
        next(error);
    }
};

module.exports = { adminSignup, adminLogin, forgotPassword, resetPassword, sendOTP, verifyOTP, getMe };
