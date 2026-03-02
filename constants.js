/**
 * Application-wide constants for QueueAI
 */

const PRIORITY_LEVELS = {
    LOW: 1,
    NORMAL: 2,
    HIGH: 3,
    URGENT: 4,
};

const QUEUE_STATUS = {
    WAITING: 'waiting',
    SERVING: 'serving',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    NO_SHOW: 'no_show',
};

const TOKEN_PREFIX = 'Q';

const RATE_LIMIT = {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 100,
};

module.exports = {
    PRIORITY_LEVELS,
    QUEUE_STATUS,
    TOKEN_PREFIX,
    RATE_LIMIT,
};
