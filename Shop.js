const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema(
    {
        shopId: {
            type: String,
            required: [true, 'shopId is required'],
            unique: true,
            trim: true,
            lowercase: true,
            match: [
                /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
                'shopId must be a URL-safe slug (e.g. shop-alpha-01)',
            ],
        },
        name: {
            type: String,
            required: [true, 'Shop name is required'],
            trim: true,
            maxlength: [120, 'Name cannot exceed 120 characters'],
        },
        category: {
            type: String,
            enum: [
                'Hospital',
                'Government Office',
                'Bank',
                'Restaurant',
                'Retail Store',
                'Pharmacy',
                'University',
                'Telecom',
                'Transport',
                'Other',
            ],
            default: 'Other',
        },
        description: {
            type: String,
            trim: true,
            maxlength: [300, 'Description cannot exceed 300 characters'],
            default: '',
        },
        services: {
            type: [String],
            required: [true, 'At least one service is required'],
            validate: {
                validator: (v) => Array.isArray(v) && v.length > 0,
                message: 'Services must contain at least one item.',
            },
        },
        address: {
            type: String,
            trim: true,
            maxlength: [250, 'Address cannot exceed 250 characters'],
            default: '',
        },
        logoUrl: {
            type: String,
            default: '',
        },
        avgServiceTimeMins: {
            type: Number,
            default: 5,
            min: [1, 'Average service time must be at least 1 minute'],
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        /** Cached base64 PNG data URL of the QR code (regenerated on demand) */
        qrCodeData: {
            type: String,
            default: '',
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Virtual: public-facing QR route (for use in controllers)
shopSchema.virtual('qrEndpoint').get(function () {
    return `/api/shops/${this.shopId}/qr`;
});

// Indexes
shopSchema.index({ shopId: 1 });
shopSchema.index({ isActive: 1 });

const Shop = mongoose.model('Shop', shopSchema);
module.exports = Shop;
