/**
 * aiRoutes.js – Zoya AI brain powered by Google Gemini
 *
 * POST /api/ai/chat
 * Body: { message, lang, history, context }
 *
 * System prompt: Zoya is a bilingual (EN/TE) voice assistant
 * that helps users join a queue. She collects name + service,
 * confirms, and returns { reply, action?, name?, service? }.
 *
 * Requires: GOOGLE_GEMINI_API_KEY in .env
 */

const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');

if (!process.env.GOOGLE_GEMINI_API_KEY) {
    console.warn('⚠️  [Zoya AI] GOOGLE_GEMINI_API_KEY not set. /api/ai/chat will return 503.');
}

// ── System prompt injected into every session ──────────────────────────────────
const SYSTEM_PROMPT = `
You are Zoya, a kind and patient voice assistant for QueueAI — a virtual queue management system.
Your job is to guide ANY user — including illiterate users who may not read — step-by-step to join a queue.

STRICT RULES:
1. Language is chosen before the conversation. Reply ONLY in that language — never mix.
2. English: Use very simple words. Short sentences. One question only. Like talking to a child.
3. Telugu: Use simple everyday spoke Telugu only. No formal/written Telugu. Very short. One question only.
4. Keep every reply UNDER 35 words. Be warm and encouraging.
5. End EVERY reply with exactly one simple question.
6. If the user says their name OR service in the same message, accept both and jump to confirmation.
7. Accept Telugu nicknames or colloquial versions: e.g. "vaidyudu" or "doctor" both mean Doctor service.
8. If user taps a service icon (message like "నాకు డాక్టర్ కావాలి" or "I need Doctor service"), skip directly to name collection.
9. Never ask for spelling. Accept any pronunciation of names.
10. Be encouraging if the user is confused. Offer to repeat or try again.

FLOW:
Step 1 — Ask the user's name. ("మీ పేరు ఏమిటి?" / "What is your name?")
Step 2 — Ask which service they need. List available services simply.
Step 3 — Confirm: repeat name + service clearly. Ask "సరియేనా? అవునా?" / "Is this correct? Yes or No?"
Step 4 — If confirmed with yes/అవును/సరే/ok/okay, reply with ONLY this JSON:
  {"action":"book","name":"<name>","service":"<service>"}
Step 5 — If no/కాదు, apologize warmly and ask what to correct.

COLLOQUIAL TELUGU SERVICE MAP:
వైద్యుడు/డాక్టర్/doctor → Doctor
బ్యాంకు/బ్యాంక్/bank → Bank
జనరల్/సాధారణ/general → General
సెలూన్/అంగట్లో → Salon
హోటల్/తినుబండారాలు → Restaurant
రిపేర్/మరమ్మత్తు → Service

If user says anything off-topic, gently say: "నేను క్యూ బుకింగ్ మాత్రమే చేస్తాను. మీ పేరు చెప్పండి." (Telugu) or "I only help with queue booking. What is your name?" (English).
`.trim();

const genAI = process.env.GOOGLE_GEMINI_API_KEY
    ? new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY)
    : null;

// ── POST /api/ai/chat ──────────────────────────────────────────────────────────
router.post('/chat', async (req, res) => {
    if (!genAI) {
        return res.status(503).json({
            success: false,
            message: 'AI service not configured. Add GOOGLE_GEMINI_API_KEY to backend .env',
        });
    }

    const { message, lang = 'en', history = [], services = [] } = req.body;
    if (!message?.trim()) {
        return res.status(400).json({ success: false, message: 'message is required' });
    }

    try {
        const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            systemInstruction: SYSTEM_PROMPT +
                `\n\nCurrent language: ${lang === 'te' ? 'Telugu' : 'English'}` +
                `\nAvailable services: ${services.length ? services.join(', ') : 'General, Doctor, Bank'}`,
        });

        // Map past history into Gemini format (role: user/model)
        const geminiHistory = history.map(h => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }],
        }));

        const chat = model.startChat({ history: geminiHistory });
        const result = await chat.sendMessage(message);
        const reply = result.response.text().trim();

        // Detect booking action JSON in reply
        let action = null;
        const jsonMatch = reply.match(/\{[\s\S]*"action"\s*:\s*"book"[\s\S]*\}/);
        if (jsonMatch) {
            try { action = JSON.parse(jsonMatch[0]); } catch { /* not valid JSON */ }
        }

        res.json({ success: true, reply, action });
    } catch (err) {
        console.error('[Zoya AI] Gemini error:', err.message);
        res.status(500).json({ success: false, message: 'AI service error', detail: err.message });
    }
});

// ── GET /api/ai/status ─────────────────────────────────────────────────────────
router.get('/status', (_req, res) => {
    res.json({
        success: true,
        aiEnabled: Boolean(genAI),
        model: 'gemini-1.5-flash',
        ttsEnabled: Boolean(process.env.GOOGLE_TTS_API_KEY),
    });
});

module.exports = router;
