const express = require('express');
const {
  generateLicense,
  getLicenses,
  validateLicense,
  revokeLicense,
  getLicenseAnalytics
} = require('../controllers/licenseController');
const { auth, authorize } = require('../middleware/auth');
const { licenseGenerationValidation } = require('../middleware/validation');

const router = express.Router();

router.get('/', auth, authorize('ADMIN'), getLicenses);
router.get('/analytics', auth, authorize('ADMIN'), getLicenseAnalytics);
router.post('/generate', auth, authorize('ADMIN'), licenseGenerationValidation, generateLicense);
router.post('/validate', validateLicense); // Public endpoint for validation
router.put('/:id/revoke', auth, authorize('ADMIN'), revokeLicense);

module.exports = router;
