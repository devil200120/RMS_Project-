// routes/schedules.js - COMPLETE FIXED VERSION
const express = require('express');
const { auth, authorize } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const ctrl = require('../controllers/scheduleController');
const router = express.Router();

// Validation middleware for schedule creation/update
const scheduleValidation = [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
  body('startDate').isISO8601().withMessage('Invalid start date format'),
  body('endDate').isISO8601().withMessage('Invalid end date format'),
  body('startTime').matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid start time format'),
  body('endTime').matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid end time format'),
  body('timezone').isIn(['Asia/Kolkata', 'UTC', 'Asia/Mumbai', 'Asia/Delhi', 'Asia/Calcutta', 'Asia/Dhaka', 'Asia/Kathmandu']).withMessage('Invalid timezone'),
  body('priority').optional().isInt({ min: 1, max: 10 }).withMessage('Priority must be between 1 and 10'),
  body('repeat').isIn(['none', 'daily', 'weekly', 'monthly']).withMessage('Invalid repeat option'),
  body('contentIds').isArray({ min: 1 }).withMessage('At least one content item is required')
];

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// GET routes
router.get('/', auth, ctrl.getSchedules);
router.get('/statistics', auth, ctrl.getScheduleStatistics); // ADDED
router.get('/current', auth, ctrl.getCurrentScheduleForViewer);
router.get('/timezone/:timezone', auth, ctrl.getSchedulesByTimezone); // ADDED
router.get('/:id', auth, ctrl.getScheduleById);

// POST/PUT/DELETE routes with validation
router.post('/', auth, authorize('ADMIN','MANAGER'), scheduleValidation, handleValidationErrors, ctrl.createSchedule);
router.put('/:id', auth, authorize('ADMIN','MANAGER'), scheduleValidation, handleValidationErrors, ctrl.updateSchedule);
router.delete('/:id', auth, authorize('ADMIN','MANAGER'), ctrl.deleteSchedule);

module.exports = router;
