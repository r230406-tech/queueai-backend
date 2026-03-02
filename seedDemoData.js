/**
 * seedDemoData.js
 * Seeds the database with:
 *  1. A super admin account
 *  2. 8 sample establishments across different categories
 *  3. An admin user linked to each establishment
 *
 * Run: node scripts/seedDemoData.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Establishment = require('../models/Establishment');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/queueai';

const DEMO_ESTABLISHMENTS = [
    {
        adminEmail: 'hospital@demo.com',
        adminName: 'Dr. Hospital Admin',
        adminPassword: 'Demo@123',
        establishment: {
            name: 'City General Hospital',
            slug: 'city-general-hospital',
            category: 'Hospital',
            address: '14 Medical Lane, Hyderabad',
            description: 'Multi-speciality hospital with OPD, Emergency & Lab services',
            services: ['OPD', 'Emergency', 'Lab Tests', 'Pharmacy', 'X-Ray'],
            avgServiceTimeMins: 8,
        },
    },
    {
        adminEmail: 'restaurant@demo.com',
        adminName: 'Chef Restaurant Admin',
        adminPassword: 'Demo@123',
        establishment: {
            name: 'Spice Garden Restaurant',
            slug: 'spice-garden-restaurant',
            category: 'Restaurant',
            address: '27 Food Street, Banjara Hills, Hyderabad',
            description: 'Authentic South Indian and Continental cuisine',
            services: ['Dine-In', 'Takeaway', 'Pre-Order'],
            avgServiceTimeMins: 20,
        },
    },
    {
        adminEmail: 'bank@demo.com',
        adminName: 'Bank Branch Admin',
        adminPassword: 'Demo@123',
        establishment: {
            name: 'State Bank of India - Main Branch',
            slug: 'sbi-main-branch',
            category: 'Bank',
            address: '1 Bank Road, Secunderabad',
            description: 'Full banking services including loans, deposits and remittances',
            services: ['Cash Deposit', 'Withdrawal', 'Loan Enquiry', 'Account Opening', 'DD / Cheque'],
            avgServiceTimeMins: 12,
        },
    },
    {
        adminEmail: 'salon@demo.com',
        adminName: 'Salon Manager',
        adminPassword: 'Demo@123',
        establishment: {
            name: 'Style Zone Salon',
            slug: 'style-zone-salon',
            category: 'Salon',
            address: '8 Beauty Ave, Jubilee Hills, Hyderabad',
            description: 'Premium unisex salon with skincare and beauty treatments',
            services: ['Haircut', 'Hair Color', 'Facial', 'Pedicure', 'Manicure', 'Beard Trim'],
            avgServiceTimeMins: 30,
        },
    },
    {
        adminEmail: 'govt@demo.com',
        adminName: 'Govt Office Admin',
        adminPassword: 'Demo@123',
        establishment: {
            name: 'Passport Seva Kendra',
            slug: 'passport-seva-kendra-hyd',
            category: 'Government Office',
            address: '5th Floor, CGO Complex, Hyderabad',
            description: 'Passport application, renewal and document verification',
            services: ['Fresh Application', 'Renewal', 'Tatkal', 'Police Clearance'],
            avgServiceTimeMins: 15,
        },
    },
    {
        adminEmail: 'pharmacy@demo.com',
        adminName: 'Pharmacy Admin',
        adminPassword: 'Demo@123',
        establishment: {
            name: 'MedPlus Pharmacy',
            slug: 'medplus-pharmacy-madhapur',
            category: 'Pharmacy',
            address: '33 HSR Layout, Madhapur, Hyderabad',
            description: '24/7 pharmacy with prescription and OTC medicines',
            services: ['Prescription Medicines', 'OTC Medicines', 'Health Products'],
            avgServiceTimeMins: 5,
        },
    },
    {
        adminEmail: 'service@demo.com',
        adminName: 'Service Center Admin',
        adminPassword: 'Demo@123',
        establishment: {
            name: 'QuickFix Service Center',
            slug: 'quickfix-service-center',
            category: 'Service Center',
            address: '62 Tech Park Road, HITEC City, Hyderabad',
            description: 'Mobile, laptop & appliance repair center',
            services: ['Mobile Repair', 'Laptop Repair', 'AC Service', 'TV Repair'],
            avgServiceTimeMins: 25,
        },
    },
    {
        adminEmail: 'hotel@demo.com',
        adminName: 'Hotel Reception Admin',
        adminPassword: 'Demo@123',
        establishment: {
            name: 'Grand Palace Hotel',
            slug: 'grand-palace-hotel-hyd',
            category: 'Hotel',
            address: '1 Palace Road, Nampally, Hyderabad',
            description: '4-star hotel with check-in, dining and concierge services',
            services: ['Check-In', 'Check-Out', 'Room Service', 'Restaurant', 'Concierge'],
            avgServiceTimeMins: 10,
        },
    },
];

const SUPER_ADMIN = {
    name: 'Super Administrator',
    email: 'superadmin@queueai.com',
    password: 'SuperAdmin@123',
    role: 'superadmin',
};

async function seed() {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB:', MONGO_URI);

    // ── Super Admin ─────────────────────────────────────────────────────────────
    const existingSuper = await User.findOne({ email: SUPER_ADMIN.email });
    if (!existingSuper) {
        await User.create(SUPER_ADMIN);
        console.log('👑 Super admin created:', SUPER_ADMIN.email);
    } else {
        console.log('👑 Super admin already exists, skipping.');
    }

    // ── Demo Establishments ─────────────────────────────────────────────────────
    for (const demo of DEMO_ESTABLISHMENTS) {
        const { adminEmail, adminName, adminPassword, establishment } = demo;

        // Skip if establishment already exists
        const exists = await Establishment.findOne({ slug: establishment.slug });
        if (exists) {
            console.log(`⏭️  Establishment already exists: ${establishment.name}`);
            continue;
        }

        // Create / find admin user
        let adminUser = await User.findOne({ email: adminEmail });
        if (!adminUser) {
            adminUser = await User.create({
                name: adminName,
                email: adminEmail,
                password: adminPassword,
                role: 'admin',
            });
        }

        // Create establishment
        const est = await Establishment.create({
            ...establishment,
            adminId: adminUser._id,
            isActive: true,
        });

        // Link back
        adminUser.establishmentId = est._id;
        await adminUser.save({ validateBeforeSave: false });

        console.log(`🏢 Created: ${est.name} [${est.category}]`);
    }

    console.log('\n🎉 Seeding complete!\n');
    console.log('─'.repeat(50));
    console.log('SUPER ADMIN LOGIN:');
    console.log(`  Email:    ${SUPER_ADMIN.email}`);
    console.log(`  Password: ${SUPER_ADMIN.password}`);
    console.log('\nDEMO ADMIN LOGINS (for each establishment):');
    DEMO_ESTABLISHMENTS.forEach(d => {
        console.log(`  ${d.establishment.name}: ${d.adminEmail} / ${d.adminPassword}`);
    });
    console.log('─'.repeat(50));

    await mongoose.disconnect();
    process.exit(0);
}

seed().catch((err) => {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
});
