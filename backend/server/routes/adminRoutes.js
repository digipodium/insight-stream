const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect } = require('../middleware/authMiddleware');
const { protectAdmin } = require('../middleware/adminMiddleware');

// All routes are protected and require admin privileges
router.use(protect);
router.use(protectAdmin);

router.get('/stats', adminController.getDashboardStats);
router.get('/users', adminController.getAllUsers);
router.post('/users/manage', adminController.manageUser);
router.get('/settings', adminController.getSettings);
router.post('/settings', adminController.updateSettings);

module.exports = router;
