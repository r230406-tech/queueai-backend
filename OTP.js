const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema(
    {
        mobile: {
            type: String,
            required: true,
            trim: true,
        },
        otp: {
            type: String,
            required: true,
        },
        expiresAt: {
            type: Date,
            required: true,
            default: () => new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        },
        verified: {
            type: Boolean,
            default: false,
        },
        attempts: {
            type: Number,
            default: 0,
            max: [5, 'Too many failed attempts'],
        },
    },
    { timestamps: true }
);

// Auto-delete 10 minutes after expiry
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 600 });
otpSchema.index({ mobile: 1 });

const OTP = mongoose.model('OTP', otpSchema);
module.exports = OTP;
