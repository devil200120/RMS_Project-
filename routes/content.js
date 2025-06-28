const express = require('express');
const {
  upload,
  uploadContent,
  getContent,
  getContentById,
  updateContentStatus,
  deleteContent
} = require('../controllers/contentController');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, getContent);
router.get('/:id', auth, getContentById);
router.post('/', auth, authorize('ADMIN', 'MANAGER'), upload.single('file'), uploadContent);
router.put('/:id/status', auth, authorize('ADMIN'), updateContentStatus);
router.delete('/:id', auth, authorize('ADMIN', 'MANAGER'), deleteContent);

module.exports = router;
