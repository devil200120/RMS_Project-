const User = require('../models/User');
const LicenseKey = require('../models/LicenseKey');
const AuditLog = require('../models/AuditLog');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { 
    expiresIn: '7d',
    issuer: 'remote-cms',
    audience: 'remote-cms-client'
  });
};

const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await AuditLog.create({
        action: 'USER_REGISTER',
        userId: null,
        success: false,
        errorMessage: 'Validation failed',
        details: { errors: errors.array() },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        severity: 'MEDIUM'
      });

      return res.status(400).json({ 
        success: false, 
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, email, password, role, licenseKey: providedLicenseKey } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      await AuditLog.create({
        action: 'USER_REGISTER',
        userId: null,
        success: false,
        errorMessage: 'Email already exists',
        details: { email },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        severity: 'MEDIUM'
      });

      return res.status(400).json({ 
        success: false, 
        message: 'User already exists with this email' 
      });
    }

    // Validate license key if not VIEWER or if provided
    let licenseDoc = null;
    if (role !== 'VIEWER' || providedLicenseKey) {
      if (!providedLicenseKey) {
        return res.status(400).json({
          success: false,
          message: 'License key is required for this role'
        });
      }

      licenseDoc = await LicenseKey.findOne({ 
        key: providedLicenseKey.toUpperCase(),
        isActive: true 
      });

      if (!licenseDoc) {
        await AuditLog.create({
          action: 'USER_REGISTER',
          userId: null,
          success: false,
          errorMessage: 'Invalid license key',
          details: { email, licenseKey: providedLicenseKey },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          severity: 'HIGH'
        });

        return res.status(400).json({
          success: false,
          message: 'Invalid or inactive license key'
        });
      }

      // Validate license key can be used
      const validation = licenseDoc.canBeUsed();
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.reason
        });
      }

      // Check if license type matches requested role
      if (licenseDoc.type !== role) {
        return res.status(400).json({
          success: false,
          message: `License key is for ${licenseDoc.type} role, but you requested ${role}`
        });
      }
    }

    // Create user
    const user = await User.create({ 
      name, 
      email, 
      password, 
      role: role || 'VIEWER'
    });

    // Use license key if provided
    if (licenseDoc) {
      await licenseDoc.use(user._id, req.ip, req.get('User-Agent'));
    }

    const token = generateToken(user._id);

    // Log successful registration
    await AuditLog.create({
      action: 'USER_REGISTER',
      userId: user._id,
      success: true,
      details: { 
        role: user.role,
        usedLicenseKey: providedLicenseKey ? providedLicenseKey : null
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token
      },
      message: 'User registered successfully'
    });
  } catch (error) {
    console.error('Register error:', error);
    
    await AuditLog.create({
      action: 'USER_REGISTER',
      userId: null,
      success: false,
      errorMessage: error.message,
      severity: 'HIGH',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(500).json({ 
      success: false, 
      message: 'Registration failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    const user = await User.findOne({ email }).select('+password');
    
    if (!user || !(await user.comparePassword(password))) {
      await AuditLog.create({
        action: 'USER_LOGIN',
        userId: user ? user._id : null,
        success: false,
        errorMessage: 'Invalid credentials',
        details: { email },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        severity: 'MEDIUM'
      });

      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    if (!user.isActive) {
      await AuditLog.create({
        action: 'USER_LOGIN',
        userId: user._id,
        success: false,
        errorMessage: 'Account deactivated',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        severity: 'MEDIUM'
      });

      return res.status(401).json({ 
        success: false, 
        message: 'Account is deactivated' 
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);

    // Log successful login
    await AuditLog.create({
      action: 'USER_LOGIN',
      userId: user._id,
      success: true,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        lastLogin: user.lastLogin,
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    
    await AuditLog.create({
      action: 'USER_LOGIN',
      userId: null,
      success: false,
      errorMessage: error.message,
      severity: 'HIGH',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(500).json({ 
      success: false, 
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getProfile = async (req, res) => {
  try {
    // Get user with additional stats
    const user = await User.findById(req.user._id)
      .select('-password')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user activity stats
    const activityStats = await AuditLog.aggregate([
      { $match: { userId: req.user._id } },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          lastActivity: { $max: '$createdAt' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        ...user,
        activityStats
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get profile'
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name },
      { new: true, runValidators: true }
    ).select('-password');

    // Log profile update
    await AuditLog.create({
      action: 'USER_UPDATE',
      userId: req.user._id,
      details: { updatedFields: ['name'] },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update profile'
    });
  }
};

const logout = async (req, res) => {
  try {
    // Log logout
    await AuditLog.create({
      action: 'USER_LOGOUT',
      userId: req.user._id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
};

// Get system health (admin only)
const getSystemHealth = async (req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get various system metrics
    const [
      userStats,
      contentStats,
      licenseStats,
      errorStats,
      recentActivity
    ] = await Promise.all([
      User.aggregate([
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 },
            active: { $sum: { $cond: ['$isActive', 1, 0] } }
          }
        }
      ]),
      User.countDocuments(), // Content stats would go here
      LicenseKey.aggregate([
        {
          $group: {
            _id: '$type',
            total: { $sum: 1 },
            active: { $sum: { $cond: ['$isActive', 1, 0] } },
            used: { $sum: { $cond: [{ $gt: ['$currentUses', 0] }, 1, 0] } }
          }
        }
      ]),
      AuditLog.countDocuments({
        success: false,
        createdAt: { $gte: last24h }
      }),
      AuditLog.find({
        createdAt: { $gte: last24h }
      })
      .populate('userId', 'name email role')
      .sort({ createdAt: -1 })
      .limit(50)
    ]);

    res.json({
      success: true,
      data: {
        users: userStats,
        licenses: licenseStats,
        errors24h: errorStats,
        recentActivity,
        systemUptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        timestamp: now
      }
    });
  } catch (error) {
    console.error('System health error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get system health'
    });
  }
};

module.exports = { 
  register, 
  login, 
  getProfile, 
  updateProfile, 
  logout,
  getSystemHealth,
  authLimiter
};
