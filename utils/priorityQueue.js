const { PRIORITY_LEVELS } = require('../config/constants');

/**
 * Priority Queue – a min-heap-based structure to process entries
 * in order of (priority DESC, createdAt ASC).
 *
 * Priority values: 4=urgent > 3=high > 2=normal > 1=low
 */
class PriorityQueue {
    constructor() {
        this._heap = [];
    }

    get size() {
        return this._heap.length;
    }

    isEmpty() {
        return this._heap.length === 0;
    }

    /**
     * Add an entry to the queue.
     * @param {{ id: string, priority: number, createdAt: Date }} entry
     */
    enqueue(entry) {
        this._heap.push(entry);
        this._bubbleUp(this._heap.length - 1);
    }

    /** Remove and return the highest-priority entry. */
    dequeue() {
        if (this.isEmpty()) return null;
        const top = this._heap[0];
        const last = this._heap.pop();
        if (!this.isEmpty()) {
            this._heap[0] = last;
            this._sinkDown(0);
        }
        return top;
    }

    peek() {
        return this._heap[0] || null;
    }

    /** Higher priority = smaller heap value for comparison. */
    _compare(a, b) {
        if (b.priority !== a.priority) return b.priority - a.priority; // higher prio first
        return new Date(a.createdAt) - new Date(b.createdAt); // earlier first
    }

    _bubbleUp(i) {
        while (i > 0) {
            const parent = Math.floor((i - 1) / 2);
            if (this._compare(this._heap[i], this._heap[parent]) < 0) {
                [this._heap[i], this._heap[parent]] = [this._heap[parent], this._heap[i]];
                i = parent;
            } else break;
        }
    }

    _sinkDown(i) {
        const n = this._heap.length;
        while (true) {
            let smallest = i;
            const left = 2 * i + 1;
            const right = 2 * i + 2;
            if (left < n && this._compare(this._heap[left], this._heap[smallest]) < 0) smallest = left;
            if (right < n && this._compare(this._heap[right], this._heap[smallest]) < 0) smallest = right;
            if (smallest !== i) {
                [this._heap[i], this._heap[smallest]] = [this._heap[smallest], this._heap[i]];
                i = smallest;
            } else break;
        }
    }

    toArray() {
        return [...this._heap].sort(this._compare.bind(this));
    }
}

/**
 * Map priority string labels to numeric values.
 */
const resolvePriority = (label = 'normal') => {
    const map = {
        low: PRIORITY_LEVELS.LOW,
        normal: PRIORITY_LEVELS.NORMAL,
        high: PRIORITY_LEVELS.HIGH,
        urgent: PRIORITY_LEVELS.URGENT,
    };
    return map[label.toLowerCase()] || PRIORITY_LEVELS.NORMAL;
};

module.exports = { PriorityQueue, resolvePriority };
