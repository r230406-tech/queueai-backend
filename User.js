const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
            maxlength: [100, 'Name cannot exceed 100 characters'],
        },
        email: {
            type: String,
            trim: true,
            lowercase: true,
            sparse: true,
            match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
        },
        mobile: {
            type: String,
            trim: true,
            sparse: true,
            match: [/^\+?[0-9]{7,15}$/, 'Please provide a valid mobile number'],
        },
        password: {
            type: String,
            minlength: [6, 'Password must be at least 6 characters'],
            select: false,
        },
        role: {
            type: String,
            enum: ['superadmin', 'admin', 'customer'],
            default: 'customer',
        },
        /**
         * For admin users – the establishment they manage.
         * ObjectId reference to Establishment.
         */
        establishmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Establishment',
            default: null,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        lastLogin: {
            type: Date,
            default: null,
        },
        // ── Forgot-password ───────────────────────────────────────────────────
        resetPasswordToken: {
            type: String,
            default: null,
            select: false,
        },
        resetPasswordExpiry: {
            type: Date,
            default: null,
            select: false,
        },
    },
    { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password') || !this.password) return next();
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Generate a reset token
userSchema.methods.generateResetToken = function () {
    const token = crypto.randomBytes(32).toString('hex');
    this.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
    this.resetPasswordExpiry = Date.now() + 15 * 60 * 1000; // 15 minutes
    return token;
};

const User = mongoose.model('User', userSchema);
module.exports = User;
