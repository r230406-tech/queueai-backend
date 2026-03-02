/**
 * QueueAI Notification System
 * Handles Email (Nodemailer/Gmail), SMS (Twilio), and optional Voice (Twilio).
 *
 * All credentials are read from environment variables – never hard-coded.
 * Each channel fails gracefully and logs the error without crashing the server.
 */

const nodemailer = require('nodemailer');
const { buildNearlyReadyEmail, buildServingEmail } = require('./emailTemplates');

// ─────────────────────────────────────────────────────────────────────────────
// Feature flags – channels are silently disabled if credentials are missing
// ─────────────────────────────────────────────────────────────────────────────
const EMAIL_ENABLED = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
const SMS_ENABLED = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_FROM);
const VOICE_ENABLED = SMS_ENABLED && process.env.TWILIO_VOICE_ENABLED === 'true';

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

// ─────────────────────────────────────────────────────────────────────────────
// Nodemailer transporter (lazy-initialised)
// ─────────────────────────────────────────────────────────────────────────────
let _transporter = null;
const getTransporter = () => {
    if (!EMAIL_ENABLED) return null;
    if (_transporter) return _transporter;
    _transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD,   // Gmail App Password (16 chars, no spaces)
        },
    });
    return _transporter;
};

// ─────────────────────────────────────────────────────────────────────────────
// Twilio client (lazy-initialised)
// ─────────────────────────────────────────────────────────────────────────────
let _twilioClient = null;
const getTwilio = () => {
    if (!SMS_ENABLED) return null;
    if (_twilioClient) return _twilioClient;
    const twilio = require('twilio');
    _twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    return _twilioClient;
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Sanitise a phone number to E.164 format if it doesn't already start with '+'. */
const toE164 = (phone) => {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    return phone.startsWith('+') ? phone : `+91${digits}`;   // default country: India
};

/** Structured error logger – never throws. */
const logError = (channel, error) =>
    console.error(`[Notifier] ${channel} error:`, error?.message || error);

const logInfo = (channel, msg) =>
    console.log(`[Notifier] ✅ ${channel}: ${msg}`);

// ─────────────────────────────────────────────────────────────────────────────
// Email
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send an HTML email via Gmail.
 * @param {string} to        – recipient address
 * @param {string} subject   – email subject
 * @param {string} html      – HTML body
 * @returns {Promise<boolean>} true on success
 */
const sendEmail = async (to, subject, html) => {
    if (!EMAIL_ENABLED) {
        console.warn('[Notifier] Email skipped – GMAIL_USER / GMAIL_APP_PASSWORD not configured.');
        return false;
    }
    try {
        const info = await getTransporter().sendMail({
            from: `"QueueAI" <${process.env.GMAIL_USER}>`,
            to,
            subject,
            html,
        });
        logInfo('Email', `Sent to ${to} (id: ${info.messageId})`);
        return true;
    } catch (err) {
        logError('Email', err);
        return false;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// SMS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send an SMS via Twilio.
 * @param {string} to      – phone number (raw or E.164)
 * @param {string} body    – message text (max 160 chars recommended)
 * @returns {Promise<boolean>}
 */
const sendSMS = async (to, body) => {
    if (!SMS_ENABLED) {
        console.warn('[Notifier] SMS skipped – Twilio credentials not configured.');
        return false;
    }
    const phone = toE164(to);
    if (!phone) {
        console.warn('[Notifier] SMS skipped – no valid phone number.');
        return false;
    }
    try {
        const msg = await getTwilio().messages.create({
            body,
            from: process.env.TWILIO_PHONE_FROM,
            to: phone,
        });
        logInfo('SMS', `Sent to ${phone} (sid: ${msg.sid})`);
        return true;
    } catch (err) {
        logError('SMS', err);
        return false;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Voice call
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Make an outbound voice call via Twilio with a TwiML message.
 * @param {string} to      – phone number
 * @param {string} message – text to read aloud (TwiML <Say>)
 * @returns {Promise<boolean>}
 */
const makeVoiceCall = async (to, message) => {
    if (!VOICE_ENABLED) {
        console.warn('[Notifier] Voice call skipped – TWILIO_VOICE_ENABLED not set to true.');
        return false;
    }
    const phone = toE164(to);
    if (!phone) return false;

    // TwiML: read message twice, then hang up
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-IN">${message}</Say>
  <Pause length="1"/>
  <Say voice="alice" language="en-IN">${message}</Say>
</Response>`;

    try {
        const call = await getTwilio().calls.create({
            twiml,
            from: process.env.TWILIO_PHONE_FROM,
            to: phone,
            timeout: 30,
        });
        logInfo('Voice', `Call initiated to ${phone} (sid: ${call.sid})`);
        return true;
    } catch (err) {
        logError('Voice', err);
        return false;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator – "Nearly Ready" (peopleAhead <= 2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send "you're almost up" notifications via all configured channels.
 *
 * @param {object} entry       – Queue document
 * @param {number} position    – current position (1 = next)
 * @param {string} shopName    – optional shop display name
 * @param {number} waitMins    – estimated remaining wait
 */
const notifyNearlyReady = async (entry, position, shopName = '', waitMins = 0) => {
    const { name, email, phone, token } = entry;
    const queueUrl = `${CLIENT_URL}/status/${token}`;

    const results = { email: false, sms: false, voice: false };

    // ── Email ──────────────────────────────────────────────────────────────────
    if (email) {
        const html = buildNearlyReadyEmail({ name, token, position, shopName, estimatedWait: Math.ceil(waitMins), queueUrl });
        results.email = await sendEmail(
            email,
            `⏰ Your turn is near! Token ${token} – Position #${position}`,
            html,
        );
    }

    // ── SMS ────────────────────────────────────────────────────────────────────
    if (phone) {
        const smsText =
            position === 1
                ? `QueueAI: You're NEXT! Token: ${token}${shopName ? ` at ${shopName}` : ''}. Please proceed to the counter now. Track: ${queueUrl}`
                : `QueueAI: Almost your turn! Token: ${token}, Position #${position}${shopName ? ` at ${shopName}` : ''}. Est. wait: ${Math.ceil(waitMins)} min. Track: ${queueUrl}`;
        results.sms = await sendSMS(phone, smsText);
    }

    // ── Voice call (only when next in line) ────────────────────────────────────
    if (phone && position === 1) {
        const voiceMsg =
            `Attention ${name}. Your queue token ${token.split('').join(' ')} is now being called` +
            (shopName ? ` at ${shopName}` : '') +
            `. Please proceed to the service counter immediately.`;
        results.voice = await makeVoiceCall(phone, voiceMsg);
    }

    return results;
};

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator – "Now Serving"
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Notify user that they are being actively served.
 *
 * @param {object} entry         – Queue document
 * @param {number} counterNumber – desk/counter number
 * @param {string} shopName      – optional
 */
const notifyServing = async (entry, counterNumber = '', shopName = '') => {
    const { name, email, phone, token } = entry;
    const results = { email: false, sms: false, voice: false };

    if (email) {
        const html = buildServingEmail({ name, token, counterNumber, shopName });
        results.email = await sendEmail(
            email,
            `🔔 It's your turn! Token ${token} – please come to the counter`,
            html,
        );
    }

    if (phone) {
        const smsText = `QueueAI: Token ${token} – It's your turn!${counterNumber ? ` Please go to Counter ${counterNumber}.` : ' Please proceed to the counter now.'}${shopName ? ` (${shopName})` : ''}`;
        results.sms = await sendSMS(phone, smsText);
    }

    if (phone && VOICE_ENABLED) {
        const voiceMsg =
            `Attention ${name}. Your token ${token.split('').join(' ')} is now being served` +
            (counterNumber ? ` at counter ${counterNumber}` : '') +
            `. Please come to the counter immediately. Thank you.`;
        results.voice = await makeVoiceCall(phone, voiceMsg);
    }

    return results;
};

// ─────────────────────────────────────────────────────────────────────────────
// Notification state tracker (in-memory, prevents duplicate alerts)
// ─────────────────────────────────────────────────────────────────────────────

const _notified = new Map();   // token → Set of events that were already fired

const hasNotified = (token, event) => _notified.get(token)?.has(event) ?? false;

const markNotified = (token, event) => {
    if (!_notified.has(token)) _notified.set(token, new Set());
    _notified.get(token).add(event);
    // Evict tokens older than 2 h to prevent memory leak
    if (_notified.size > 5000) {
        const oldest = _notified.keys().next().value;
        _notified.delete(oldest);
    }
};

module.exports = {
    sendEmail,
    sendSMS,
    makeVoiceCall,
    notifyNearlyReady,
    notifyServing,
    hasNotified,
    markNotified,
    EMAIL_ENABLED,
    SMS_ENABLED,
    VOICE_ENABLED,
};
