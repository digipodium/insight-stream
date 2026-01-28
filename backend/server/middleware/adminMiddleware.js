const protectAdmin = (req, res, next) => {
    if (req.user && req.user.isAdmin) {
        next();
    } else {
        res.status(401).json({
            success: false,
            message: 'Not authorized as an admin',
        });
    }
};

module.exports = { protectAdmin };
