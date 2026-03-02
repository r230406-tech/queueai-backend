/**
 * Socket.io singleton – updated for QueueAI v2 (Establishment model)
 * Usage:
 *   const { initIO, getIO } = require('./socket');
 *   initIO(httpServer);
 *   getIO().to(room).emit(...);
 */
const { Server } = require('socket.io');

let _io = null;

const initIO = (httpServer) => {
    _io = new Server(httpServer, {
        cors: {
            origin: [
                process.env.CLIENT_URL || 'http://localhost:3000',
                'http://localhost:3000',
                'http://localhost:3001',
            ],
            methods: ['GET', 'POST'],
            credentials: true,
        },
        transports: ['websocket', 'polling'],
    });

    _io.on('connection', (socket) => {
        // ── Establishment room (admin + users watching that establishment) ───────
        socket.on('join-room', (roomId) => {
            if (roomId) socket.join(roomId);
        });
        socket.on('leave-room', (roomId) => {
            if (roomId) socket.leave(roomId);
        });

        // Legacy shop-based subscriptions (backward compat)
        socket.on('subscribe:shop', (shopId) => {
            if (shopId) socket.join(`shop:${shopId}`);
        });
        socket.on('unsubscribe:shop', (shopId) => {
            if (shopId) socket.leave(`shop:${shopId}`);
        });

        // Admin subscribes to all establishments they manage
        socket.on('subscribe:admin', () => {
            socket.join('admin');
        });

        socket.on('disconnect', () => { });
    });

    return _io;
};

const getIO = () => {
    if (!_io) return null; // graceful degradation instead of throwing
    return _io;
};

/**
 * Emit a queue-update event to everyone watching an establishment and all admins.
 * Safe to call even if socket.io isn't ready.
 */
const emitQueueUpdate = (establishmentId, payload) => {
    try {
        const io = getIO();
        if (!io) return;
        if (establishmentId) {
            io.to(`establishment-${establishmentId}`).emit('queue-update', payload);
            // Legacy shop room
            io.to(`shop:${establishmentId}`).emit('queue:update', payload);
        }
        io.to('admin').emit('queue-update', { ...payload, establishmentId });
    } catch (_) { /* graceful degradation */ }
};

module.exports = { initIO, getIO, emitQueueUpdate };
