const express = require('express');
const router = express.Router();
const dataController = require('../controllers/dataController');
const upload = require('../middleware/upload');
const { protect } = require('../middleware/authMiddleware');

// Protect all routes? Or just specific ones? 
// Uploading requires user association now, so it must be protected.
// History definitely protected.
// Processing existing data linked to a user -> better be protected.

router.post('/upload', protect, upload.single('file'), dataController.uploadCSV);
router.get('/history', protect, dataController.getUserDatasets);
router.get('/:id', protect, dataController.getDataset);

router.post('/process', protect, dataController.processCommand);
router.post('/insights', protect, dataController.getInsights);
router.post('/ask', protect, dataController.askQuestion);
router.post('/chart', protect, dataController.generateChart);
router.get('/download/:dataId', protect, dataController.downloadData);

module.exports = router;