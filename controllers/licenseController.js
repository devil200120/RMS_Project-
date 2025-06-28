const LicenseKey = require('../models/LicenseKey');
const AuditLog = require('../models/AuditLog');
const { validationResult } = require('express-validator');

// Generate license key
const generateLicense = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      type,
      maxUses = 1,
      expiresAt,
      description,
      metadata,
      prefix = '',
      count = 1
    } = req.body;

    if (count > 100) {
      return res.status(400).json({
        success: false,
        message: 'Cannot generate more than 100 license keys at once'
      });
    }

    const licenses = [];
    
    for (let i = 0; i < count; i++) {
      const key = LicenseKey.generateKey(type, prefix);
      
      const licenseData = {
        key,
        type,
        maxUses,
        generatedBy: req.user._id,
        description,
        metadata
      };

      if (expiresAt) {
        licenseData.expiresAt = new Date(expiresAt);
      }

      const license = await LicenseKey.create(licenseData);
      await license.populate('generatedBy', 'name email');
      licenses.push(license);
    }

    // Log audit
    await AuditLog.create({
      action: 'LICENSE_GENERATE',
      userId: req.user._id,
      details: {
        type,
        count,
        maxUses,
        expiresAt,
        generatedKeys: licenses.map(l => l.key)
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      success: true,
      data: licenses,
      message: `${count} license key(s) generated successfully`
    });
  } catch (error) {
    console.error('Generate license error:', error);
    
    await AuditLog.create({
      action: 'LICENSE_GENERATE',
      userId: req.user._id,
      success: false,
      errorMessage: error.message,
      severity: 'HIGH',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(500).json({
      success: false,
      message: 'Failed to generate license key',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get all licenses
const getLicenses = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const filter = {};
    if (req.query.type) filter.type = req.query.type;
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
    if (req.query.generatedBy) filter.generatedBy = req.query.generatedBy;

    // Search functionality
    if (req.query.search) {
      filter.$or = [
        { key: new RegExp(req.query.search, 'i') },
        { description: new RegExp(req.query.search, 'i') }
      ];
    }

    const licenses = await LicenseKey.find(filter)
      .populate('generatedBy', 'name email')
      .populate('usedBy.userId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await LicenseKey.countDocuments(filter);

    // Calculate statistics
    const stats = await LicenseKey.aggregate([
      {
        $group: {
          _id: null,
          totalKeys: { $sum: 1 },
          activeKeys: { $sum: { $cond: ['$isActive', 1, 0] } },
          usedKeys: { $sum: { $cond: [{ $gt: ['$currentUses', 0] }, 1, 0] } },
          expiredKeys: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ['$expiresAt', null] }, { $lt: ['$expiresAt', new Date()] }] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: licenses,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      stats: stats[0] || {
        totalKeys: 0,
        activeKeys: 0,
        usedKeys: 0,
        expiredKeys: 0
      }
    });
  } catch (error) {
    console.error('Get licenses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch licenses'
    });
  }
};

// Validate license key
const validateLicense = async (req, res) => {
  try {
    const { key } = req.body;
    
    if (!key) {
      return res.status(400).json({
        success: false,
        message: 'License key is required'
      });
    }

    const license = await LicenseKey.findOne({ key: key.toUpperCase() })
      .populate('generatedBy', 'name email');

    if (!license) {
      return res.status(404).json({
        success: false,
        message: 'Invalid license key'
      });
    }

    const validation = license.canBeUsed();
    
    res.json({
      success: true,
      data: {
        isValid: validation.valid,
        reason: validation.reason,
        license: validation.valid ? {
          type: license.type,
          maxUses: license.maxUses,
          currentUses: license.currentUses,
          expiresAt: license.expiresAt,
          description: license.description
        } : null
      }
    });
  } catch (error) {
    console.error('Validate license error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate license key'
    });
  }
};

// Revoke license key
const revokeLicense = async (req, res) => {
  try {
    const license = await LicenseKey.findById(req.params.id);
    
    if (!license) {
      return res.status(404).json({
        success: false,
        message: 'License key not found'
      });
    }

    license.isActive = false;
    await license.save();

    // Log audit
    await AuditLog.create({
      action: 'LICENSE_REVOKE',
      userId: req.user._id,
      targetId: license._id,
      targetType: 'LICENSE',
      details: {
        revokedKey: license.key,
        reason: req.body.reason || 'Manual revocation'
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'License key revoked successfully'
    });
  } catch (error) {
    console.error('Revoke license error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to revoke license key'
    });
  }
};

// Get license usage analytics
const getLicenseAnalytics = async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    
    let matchCondition = {};
    const now = new Date();
    
    switch (timeframe) {
      case '7d':
        matchCondition.createdAt = { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
        break;
      case '30d':
        matchCondition.createdAt = { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
        break;
      case '90d':
        matchCondition.createdAt = { $gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) };
        break;
    }

    const analytics = await LicenseKey.aggregate([
      { $match: matchCondition },
      {
        $group: {
          _id: {
            type: '$type',
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt'
              }
            }
          },
          count: { $sum: 1 },
          used: { $sum: { $cond: [{ $gt: ['$currentUses', 0] }, 1, 0] } }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);

    const usageStats = await LicenseKey.aggregate([
      {
        $group: {
          _id: '$type',
          total: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } },
          used: { $sum: { $cond: [{ $gt: ['$currentUses', 0] }, 1, 0] } },
          expired: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ['$expiresAt', null] }, { $lt: ['$expiresAt', now] }] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        timeline: analytics,
        byType: usageStats,
        timeframe
      }
    });
  } catch (error) {
    console.error('License analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch license analytics'
    });
  }
};

module.exports = {
  generateLicense,
  getLicenses,
  validateLicense,
  revokeLicense,
  getLicenseAnalytics
};
