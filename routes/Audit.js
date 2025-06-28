const express = require('express');
const AuditLog = require('../models/AuditLog');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// Get audit logs (admin only)
router.get('/', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    
    const filter = {};
    if (req.query.action) filter.action = req.query.action;
    if (req.query.userId) filter.userId = req.query.userId;
    if (req.query.success !== undefined) filter.success = req.query.success === 'true';
    if (req.query.severity) filter.severity = req.query.severity;
    
    // Date range filter
    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {};
      if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate) filter.createdAt.$lte = new Date(req.query.endDate);
    }

    const logs = await AuditLog.find(filter)
      .populate('userId', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await AuditLog.countDocuments(filter);

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
});

// Get audit log statistics
router.get('/stats', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { timeframe = '7d' } = req.query;
    
    let matchCondition = {};
    const now = new Date();
    
    switch (timeframe) {
      case '1d':
        matchCondition.createdAt = { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) };
        break;
      case '7d':
        matchCondition.createdAt = { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
        break;
      case '30d':
        matchCondition.createdAt = { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
        break;
    }

    const stats = await AuditLog.aggregate([
      { $match: matchCondition },
      {
        $group: {
          _id: {
            action: '$action',
            success: '$success'
          },
          count: { $sum: 1 }
        }
      }
    ]);

    const errorsByUser = await AuditLog.aggregate([
      { 
        $match: { 
          ...matchCondition,
          success: false 
        } 
      },
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
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      data: {
        actionStats: stats,
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
});

module.exports = router;
