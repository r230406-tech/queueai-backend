const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Middleware: Protect routes – verify JWT and attach user to request.
 * Also attaches establishmentId from JWT payload for performance.
 */
const protect = async (req, res, next) => {
    try {
        let token;

        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');

        if (!user || !user.isActive) {
            return res.status(401).json({ success: false, message: 'User not found or deactivated.' });
        }

        // Attach establishmentId from JWT for fast scoping
        if (decoded.establishmentId) {
            user.establishmentId = decoded.establishmentId;
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Token expired. Please login again.' });
        }
        return res.status(401).json({ success: false, message: 'Invalid token.' });
    }
};

/**
 * Middleware: Restrict to specific roles.
 * Usage: restrictTo('admin', 'superadmin')
 */
const restrictTo = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Role '${req.user.role}' is not authorized to access this route.`,
            });
        }
        next();
    };
};

// Keep authorize as alias for backwards compatibility
const authorize = restrictTo;

module.exports = { protect, authorize, restrictTo };
