require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const { RATE_LIMIT } = require('./config/constants');
const { initIO } = require('./socket');
const authRoutes = require('./routes/authRoutes');
const queueRoutes = require('./routes/queueRoutes');
const establishmentRoutes = require('./routes/establishmentRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const ttsRoutes = require('./routes/ttsRoutes');
const aiRoutes = require('./routes/aiRoutes');
const errorHandler = require('./middleware/errorHandler');

// ── Connect to MongoDB ───────────────────────────────────────────────────────
connectDB();

const app = express();

// ── Security & Utilities ─────────────────────────────────────────────────────
app.use(helmet());
app.use(
    cors({
        origin: [
            process.env.CLIENT_URL || 'http://localhost:3000',
            'http://localhost:3000',
            'http://localhost:3001',
        ],
        credentials: true,
    })
);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate Limiting ────────────────────────────────────────────────────────────
// General API rate limit — generous for dashboard/polling use
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500,                  // 500 requests per window (was 100 — way too low for dashboards)
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for socket.io polling requests
        if (req.path.startsWith('/socket.io')) return true;
        // Skip health check
        if (req.path === '/health') return true;
        return false;
    },
    message: { success: false, message: 'Too many requests. Please slow down and try again in a few minutes.' },
});

// Strict limit ONLY for auth/OTP endpoints (prevents brute force)
const authLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 20,                   // 20 auth attempts per 10 min
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many auth attempts. Please wait 10 minutes.' },
});

app.use('/api/', generalLimiter);
app.use('/api/auth/user/send-otp', authLimiter);
app.use('/api/auth/admin/login', authLimiter);

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) =>
    res.status(200).json({ success: true, message: 'QueueAI API is running 🚀', timestamp: new Date().toISOString() })
);

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/establishments', establishmentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/tts', ttsRoutes);
app.use('/api/ai', aiRoutes);

// Legacy: keep /api/shops pointing to establishments for QR backward compat
app.use('/api/shops', establishmentRoutes);

// ── 404 Handler ──────────────────────────────────────────────────────────────
app.use((_req, res) =>
    res.status(404).json({ success: false, message: 'Route not found.' })
);

// ── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

initIO(server);

server.listen(PORT, () => {
    console.log(`🚀 QueueAI server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

// ── Graceful Shutdown ────────────────────────────────────────────────────────
process.on('unhandledRejection', (err) => {
    console.error(`❌ Unhandled Rejection: ${err.message}`);
    server.close(() => process.exit(1));
});

process.on('SIGTERM', () => {
    console.log('SIGTERM received. Closing server gracefully...');
    server.close(() => process.exit(0));
});

module.exports = app;
