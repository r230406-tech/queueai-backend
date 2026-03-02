const mongoose = require('mongoose');
const { PRIORITY_LEVELS, QUEUE_STATUS } = require('../config/constants');

const queueSchema = new mongoose.Schema(
    {
        token: { type: String, unique: true, required: true, trim: true },
        tokenNumber: { type: Number, required: true },
        name: {
            type: String,
            required: [true, 'Customer name is required'],
            trim: true,
            maxlength: [100, 'Name cannot exceed 100 characters'],
        },
        phone: {
            type: String,
            trim: true,
            match: [/^\+?[0-9]{7,15}$/, 'Please provide a valid phone number'],
        },
        email: {
            type: String,
            trim: true,
            lowercase: true,
            match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
        },
        serviceType: {
            type: String,
            required: [true, 'Service type is required'],
            trim: true,
            default: 'General',
        },
        priority: {
            type: Number,
            enum: Object.values(PRIORITY_LEVELS),
            default: PRIORITY_LEVELS.NORMAL,
        },
        priorityLabel: {
            type: String,
            enum: ['low', 'normal', 'high', 'urgent'],
            default: 'normal',
        },
        status: {
            type: String,
            enum: Object.values(QUEUE_STATUS),
            default: QUEUE_STATUS.WAITING,
        },
        estimatedWaitTime: { type: Number, default: 0 }, // minutes
        servedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },
        counterNumber: { type: Number, default: null },
        notes: { type: String, maxlength: [500, 'Notes cannot exceed 500 characters'] },
        aiPriorityScore: { type: Number, min: 0, max: 1, default: null },

        /** Establishment this entry belongs to (ObjectId ref) */
        establishmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Establishment',
            default: null,
            index: true,
        },

        /** Customer user who joined (mobile OTP user) */
        customerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },

        /** Has the user verified arrival via QR scan */
        qrVerified: { type: Boolean, default: false },

        /** Composite dedup key for 30-second guard */
        duplicateCheckKey: { type: String, default: null },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Virtual: waiting duration in minutes
queueSchema.virtual('waitingDuration').get(function () {
    if (this.servedAt && this.createdAt) {
        return Math.round((this.servedAt - this.createdAt) / 60000);
    }
    return Math.round((Date.now() - this.createdAt) / 60000);
});

// Indexes
queueSchema.index({ status: 1, priority: -1, createdAt: 1 });
queueSchema.index({ createdAt: -1 });
queueSchema.index({ establishmentId: 1, status: 1 });

const Queue = mongoose.model('Queue', queueSchema);
module.exports = Queue;
