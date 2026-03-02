const { v4: uuidv4 } = require('uuid');
const Counter = require('../models/Counter');
const { TOKEN_PREFIX } = require('../config/constants');

/**
 * Generates a unique, human-readable token.
 * Format: Q-<DATE>-<SEQUENCE> e.g. Q-20240125-007
 *
 * @returns {{ token: string, tokenNumber: number }}
 */
const generateToken = async () => {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const seq = await Counter.getNextSequence();
    const paddedSeq = String(seq).padStart(3, '0');
    const token = `${TOKEN_PREFIX}-${today}-${paddedSeq}`;
    return { token, tokenNumber: seq };
};

/**
 * Generates a simple UUID-based token for internal reference.
 */
const generateReferenceId = () => uuidv4();

module.exports = { generateToken, generateReferenceId };
