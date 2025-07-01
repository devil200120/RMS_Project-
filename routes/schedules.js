// routes/schedules.js

const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/scheduleController');

const router = express.Router();

// Validation middleware
const scheduleValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),
  body('startDate')
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  body('endDate')
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  body('startTime')
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Start time must be in HH:MM format'),
  body('endTime')
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('End time must be in HH:MM format'),
  body('timezone')
    .isIn(['Asia/Kolkata','Asia/Mumbai','Asia/Delhi','Asia/Calcutta','UTC','Asia/Dhaka','Asia/Kathmandu'])
    .withMessage('Invalid timezone'),
  body('repeat')
    .isIn(['none','daily','weekly','monthly'])
    .withMessage('Repeat must be one of none, daily, weekly, monthly'),
  body('priority')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Priority must be an integer between 1 and 10'),
  body('contentIds')
    .isArray({ min: 1 })
    .withMessage('At least one contentId must be provided'),
];

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(err => err.msg),
    });
  }
  next();
};

// Routes
router.get('/', auth, ctrl.getSchedules);
router.get('/statistics', auth, ctrl.getScheduleStatistics);
router.get('/current', auth, ctrl.getCurrentScheduleForViewer);
router.get('/timezone/:timezone', auth, ctrl.getSchedulesByTimezone);
router.get('/:id', auth, ctrl.getScheduleById);

router.post(
  '/',
  auth,
  authorize('ADMIN', 'MANAGER'),
  scheduleValidation,
  handleValidationErrors,
  ctrl.createSchedule
);

router.put(
  '/:id',
  auth,
  authorize('ADMIN', 'MANAGER'),
  scheduleValidation,
  handleValidationErrors,
  ctrl.updateSchedule
);

router.delete(
  '/:id',
  auth,
  authorize('ADMIN', 'MANAGER'),
  ctrl.deleteSchedule
);

module.exports = router;
