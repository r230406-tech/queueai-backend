/**
 * ttsRoutes.js – Text-to-Speech proxy for Zoya voice assistant
 *
 * Priority:
 *   1. Google Cloud TTS (WaveNet) — if GOOGLE_TTS_API_KEY is set (best quality)
 *   2. Google Translate TTS proxy   — free fallback, no key needed
 *
 * GET /api/tts/speak?text=...&lang=te&gender=FEMALE
 *
 * Streams MP3 audio back to the browser (same-origin = no CORS issue).
 */

const express = require('express');
const router = express.Router();
const https = require('https');
const axios = require('axios');

// ── Google Cloud TTS voice map ────────────────────────────────────────────────
const CLOUD_VOICES = {
    te: { languageCode: 'te-IN', name: 'te-IN-Standard-A', ssmlGender: 'FEMALE' },
    en: { languageCode: 'en-IN', name: 'en-IN-Wavenet-D', ssmlGender: 'FEMALE' },
    hi: { languageCode: 'hi-IN', name: 'hi-IN-Wavenet-A', ssmlGender: 'FEMALE' },
};

// ── Sanitize input ────────────────────────────────────────────────────────────
function sanitize(str) {
    return (str || '').replace(/[<>"']/g, '').trim().slice(0, 500);
}

// ── Strategy 1: Google Cloud TTS (WaveNet quality) ────────────────────────────
async function speakCloudTTS(text, lang, res) {
    const voice = CLOUD_VOICES[lang] || CLOUD_VOICES.en;
    const payload = {
        input: { text },
        voice,
        audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: lang === 'te' ? 0.85 : 0.9,
            pitch: 1.5, // Slightly higher pitch for female naturalness
            volumeGainDb: 2,
        },
    };

    const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_TTS_API_KEY}`;
    const response = await axios.post(url, payload, { timeout: 10000 });
    const audioContent = response.data.audioContent; // Base64 MP3

    const buffer = Buffer.from(audioContent, 'base64');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
}

// ── Strategy 2: Google Translate TTS proxy (free fallback) ───────────────────
function speakTranslateTTS(text, lang, res) {
    const encoded = encodeURIComponent(text);
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=${lang}&client=tw-ob&ttsspeed=0.85`;

    const options = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Referer': 'https://translate.google.com/',
            'Accept': 'audio/mpeg,audio/*;q=0.9,*/*;q=0.5',
        },
    };

    const req = https.get(url, options, (ttsRes) => {
        if (ttsRes.statusCode === 301 || ttsRes.statusCode === 302) {
            https.get(ttsRes.headers.location, options, (redir) => {
                res.setHeader('Content-Type', 'audio/mpeg');
                res.setHeader('Cache-Control', 'public, max-age=3600');
                redir.pipe(res);
            }).on('error', () => res.status(502).end());
        } else {
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            ttsRes.pipe(res);
        }
    });
    req.on('error', () => res.status(502).end());
    req.setTimeout(8000, () => { req.destroy(); res.status(504).end(); });
}

// ── GET /api/tts/speak ────────────────────────────────────────────────────────
router.get('/speak', async (req, res) => {
    const text = sanitize(req.query.text);
    const lang = (req.query.lang || 'en').replace(/[^a-z\-]/gi, '').slice(0, 10);

    if (!text) return res.status(400).json({ error: 'text is required' });

    try {
        if (process.env.GOOGLE_TTS_API_KEY) {
            // Use WaveNet quality
            await speakCloudTTS(text, lang, res);
        } else {
            // Free fallback
            speakTranslateTTS(text, lang, res);
        }
    } catch (err) {
        console.error('[TTS Proxy] Cloud TTS error:', err.message);
        // Fallback to translate TTS
        try {
            speakTranslateTTS(text, lang, res);
        } catch {
            res.status(502).json({ error: 'TTS unavailable' });
        }
    }
});

// ── GET /api/tts/voices — list available cloud voices ─────────────────────────
router.get('/voices', (_req, res) => {
    res.json({
        success: true,
        cloudTTSEnabled: Boolean(process.env.GOOGLE_TTS_API_KEY),
        voices: CLOUD_VOICES,
    });
});

module.exports = router;
