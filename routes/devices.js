const express = require('express');
const {
  registerDevice,
  getDevices,
  getDeviceById,
  updateDevice,
  deleteDevice,
  sendCommand,
  updateHeartbeat
} = require('../controllers/deviceController');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, getDevices);
router.get('/:id', auth, getDeviceById);
router.post('/register', auth, authorize('ADMIN', 'MANAGER'), registerDevice);
router.put('/:id', auth, authorize('ADMIN', 'MANAGER'), updateDevice);
router.delete('/:id', auth, authorize('ADMIN'), deleteDevice);
router.post('/:id/command', auth, authorize('ADMIN', 'MANAGER'), sendCommand);
router.put('/heartbeat/:deviceId', updateHeartbeat); // No auth for device heartbeat

module.exports = router;
