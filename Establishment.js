const mongoose = require('mongoose');

const establishmentSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Establishment name is required'],
            trim: true,
            maxlength: [120, 'Name cannot exceed 120 characters'],
        },
        slug: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
            match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be URL-safe'],
        },
        category: {
            type: String,
            enum: [
                'Hospital',
                'Restaurant',
                'Hotel',
                'Government Office',
                'Salon',
                'Service Center',
                'Bank',
                'Pharmacy',
                'University',
                'Telecom',
                'Retail Store',
                'Transport',
                'Other',
            ],
            default: 'Other',
        },
        description: {
            type: String,
            trim: true,
            maxlength: [400, 'Description cannot exceed 400 characters'],
            default: '',
        },
        address: {
            type: String,
            trim: true,
            maxlength: [300, 'Address cannot exceed 300 characters'],
            default: '',
        },
        /** GPS coordinates for nearby-search */
        location: {
            lat: { type: Number, default: null },
            lng: { type: Number, default: null },
        },
        services: {
            type: [String],
            default: ['General'],
        },
        avgServiceTimeMins: {
            type: Number,
            default: 5,
            min: [1, 'Average service time must be at least 1 minute'],
        },
        logoUrl: {
            type: String,
            default: '',
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        /** The admin user who owns/manages this establishment */
        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        /** Pause/Resume the queue at this establishment */
        queuePaused: {
            type: Boolean,
            default: false,
        },
        /** Cached QR PNG data URL */
        qrCodeData: {
            type: String,
            default: '',
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

establishmentSchema.index({ isActive: 1 });
establishmentSchema.index({ adminId: 1 });
// Geospatial index for nearby establishments
establishmentSchema.index({ 'location.lat': 1, 'location.lng': 1 });

const Establishment = mongoose.model('Establishment', establishmentSchema);
module.exports = Establishment;
