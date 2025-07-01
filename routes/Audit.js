// routes/audit.js

const express = require('express');
const { query, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const AuditLog = require('../models/AuditLog');

const router = express.Router();

// Validation middleware
const auditValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be an integer >= 1'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be an integer between 1 and 100'),
  query('action')
    .optional()
    .isIn(AuditLog.schema.path('action').enumValues)
    .withMessage('Invalid action'),
  query('userId')
    .optional()
    .isMongoId()
    .withMessage('Invalid userId'),
  query('success')
    .optional()
    .isBoolean()
    .withMessage('Success must be "true" or "false"'),
  query('severity')
    .optional()
    .isIn(AuditLog.schema.path('severity').enumValues)
    .withMessage('Invalid severity'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('startDate must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('endDate must be a valid ISO 8601 date'),
];

// Handle validation errors
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

// GET /api/audit — list logs with filters and pagination
router.get(
  '/',
  auth,
  authorize('ADMIN'),
  auditValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const skip = (page - 1) * limit;
      const filter = {};

      if (req.query.action) filter.action = req.query.action;
      if (req.query.userId) filter.userId = req.query.userId;
      if (req.query.success !== undefined) filter.success = req.query.success === 'true';
      if (req.query.severity) filter.severity = req.query.severity;

      if (req.query.startDate || req.query.endDate) {
        filter.createdAt = {};
        if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
        if (req.query.endDate) filter.createdAt.$lte = new Date(req.query.endDate);
      }

      const [logs, total] = await Promise.all([
        AuditLog.find(filter)
          .populate('userId', 'name email role')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        AuditLog.countDocuments(filter)
      ]);

      res.json({
        success: true,
        data: logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Get audit logs error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch audit logs'
      });
    }
  }
);

// GET /api/audit/stats — aggregated stats over a timeframe
router.get(
  '/stats',
  auth,
  authorize('ADMIN'),
  [
    query('timeframe')
      .optional()
      .isIn(['1d', '7d', '30d'])
      .withMessage('Timeframe must be one of 1d, 7d, or 30d')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { timeframe = '7d' } = req.query;
      const now = new Date();
      let matchCondition = {};

      if (timeframe === '1d') {
        matchCondition.createdAt = { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) };
      } else if (timeframe === '7d') {
        matchCondition.createdAt = { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
      } else if (timeframe === '30d') {
        matchCondition.createdAt = { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
      }

      const actionStats = await AuditLog.aggregate([
        { $match: matchCondition },
        {
          $group: {
            _id: { action: '$action', success: '$success' },
            count: { $sum: 1 }
          }
        }
      ]);

      const errorsByUser = await AuditLog.aggregate([
        { $match: { ...matchCondition, success: false } },
        {
          $group: {
            _id: '$userId',
            errorCount: { $sum: 1 },
            lastError: { $max: '$createdAt' }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        { $unwind: '$user' },
        { $sort: { errorCount: -1 } },
        { $limit: 10 },
        {
          $project: {
            _id: 0,
            userId: '$_id',
            errorCount: 1,
            lastError: 1,
            user: { _id: 1, name: 1, email: 1 }
          }
        }
      ]);

      res.json({
        success: true,
        data: {
          actionStats,
          errorsByUser,
          timeframe
        }
      });
    } catch (error) {
      console.error('Get audit stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch audit statistics'
      });
    }
  }
);

module.exports = router;
