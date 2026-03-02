require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/queueai';

const User = require('../models/User');

async function seed() {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const existing = await User.findOne({ email: 'superadmin@queueai.com' });
    if (existing) {
        console.log('ℹ️  Super admin already exists:', existing.email);
    } else {
        await User.create({
            name: 'Super Admin',
            email: 'superadmin@queueai.com',
            password: 'SuperAdmin@123',
            role: 'superadmin',
            isActive: true,
        });
        console.log('✅ Super admin created: superadmin@queueai.com / SuperAdmin@123');
    }

    await mongoose.disconnect();
    console.log('✅ Done.');
    process.exit(0);
}

seed().catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
});
