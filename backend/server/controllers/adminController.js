const User = require('../models/User');
const Dataset = require('../models/Dataset');
const PromptLog = require('../models/PromptLog');
const SystemConfig = require('../models/SystemConfig');

// @desc    Get Admin Dashboard Stats
// @route   GET /api/admin/stats
exports.getDashboardStats = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalFiles = await Dataset.countDocuments();
        const totalPrompts = await PromptLog.countDocuments();

        res.status(200).json({
            success: true,
            stats: {
                totalUsers,
                totalFiles,
                totalPrompts
            }
        });
    } catch (error) {
        console.error('Error fetching admin stats:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get All Users with Stats
// @route   GET /api/admin/users
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find({}).select('-password');

        // Aggregate prompts per user
        const promptsByUser = await PromptLog.aggregate([
            { $group: { _id: "$user", count: { $sum: 1 } } }
        ]);

        // Aggregate files per user
        const filesByUser = await Dataset.aggregate([
            { $group: { _id: "$user", count: { $sum: 1 } } }
        ]);

        const formatUsers = users.map(user => {
            const promptCount = promptsByUser.find(p => p._id.toString() === user._id.toString())?.count || 0;
            const fileCount = filesByUser.find(f => f._id.toString() === user._id.toString())?.count || 0;
            return {
                ...user._doc,
                promptCount,
                fileCount
            };
        });

        res.status(200).json({
            success: true,
            users: formatUsers
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Manage User (Block/Unblock/Delete)
// @route   POST /api/admin/users/manage
exports.manageUser = async (req, res) => {
    try {
        const { userId, action } = req.body; // action: 'block', 'unblock', 'delete'

        if (userId === req.user._id.toString()) {
            return res.status(400).json({ success: false, message: 'Cannot manage yourself' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (action === 'block') {
            user.isBlocked = true;
            await user.save();
        } else if (action === 'unblock') {
            user.isBlocked = false;
            await user.save();
        } else if (action === 'delete') {
            await User.findByIdAndDelete(userId);
            // Optional: Delete associated data (Files, Logs)
            await Dataset.deleteMany({ user: userId });
            await PromptLog.deleteMany({ user: userId });
            return res.status(200).json({ success: true, message: 'User deleted' });
        } else {
            return res.status(400).json({ success: false, message: 'Invalid action' });
        }

        res.status(200).json({ success: true, message: `User ${action}ed successfully` });

    } catch (error) {
        console.error('Error managing user:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get System Settings
// @route   GET /api/admin/settings
exports.getSettings = async (req, res) => {
    try {
        const config = await SystemConfig.find({});
        // Transform to key-value object
        const settings = {};
        config.forEach(item => {
            settings[item.key] = item.value;
        });

        // Defaults if not set
        if (!settings.maxFileSize) settings.maxFileSize = 10; // Default 10MB in DB logic

        res.status(200).json({ success: true, settings });
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
}

// @desc    Update System Settings
// @route   POST /api/admin/settings
exports.updateSettings = async (req, res) => {
    try {
        const { maxFileSize } = req.body;

        if (maxFileSize !== undefined) {
            await SystemConfig.findOneAndUpdate(
                { key: 'maxFileSize' },
                { key: 'maxFileSize', value: maxFileSize, description: 'Max file size in MB' },
                { upsert: true, new: true }
            );
        }

        res.status(200).json({ success: true, message: 'Settings updated' });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
