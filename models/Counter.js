const mongoose = require('mongoose');

/**
 * Counter model – maintains an auto-incrementing token counter per day.
 * Resets every day to keep token numbers short and readable.
 */
const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // e.g., "queue_2024-01-25"
    seq: { type: Number, default: 0 },
});

counterSchema.statics.getNextSequence = async function (date) {
    const dateKey = date || new Date().toISOString().split('T')[0];
    const id = `queue_${dateKey}`;
    const counter = await this.findByIdAndUpdate(
        id,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );
    return counter.seq;
};

const Counter = mongoose.model('Counter', counterSchema);
module.exports = Counter;
