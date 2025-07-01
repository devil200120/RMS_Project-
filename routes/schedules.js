const express = require('express');
const { auth, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/scheduleController');
const router = express.Router();

router.get('/', auth, ctrl.getSchedules);
router.get('/current', auth, ctrl.getCurrentScheduleForViewer);
router.get('/:id', auth, ctrl.getScheduleById);
router.post('/', auth, authorize('ADMIN','MANAGER'), ctrl.createSchedule);
router.put('/:id', auth, authorize('ADMIN','MANAGER'), ctrl.updateSchedule);
router.delete('/:id', auth, authorize('ADMIN','MANAGER'), ctrl.deleteSchedule);

module.exports = router;
