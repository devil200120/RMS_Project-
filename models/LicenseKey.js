// models/LicenseKey.js - FIXED generateKey method
const mongoose = require('mongoose');
const crypto = require('crypto');

const licenseKeySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true,
    minlength: 100,
    maxlength: 100
  },
  type: {
    type: String,
    enum: ['MANAGER', 'VIEWER', 'ADMIN'],
    required: true
  },
  maxUses: {
    type: Number,
    default: 1,
    min: 1
  },
  currentUses: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  expiresAt: {
    type: Date,
    default: null
  },
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  usedBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    usedAt: {
      type: Date,
      default: Date.now
    },
    ipAddress: String,
    userAgent: String
  }],
  description: {
    type: String,
    maxlength: 200
  },
  metadata: {
    organizationName: String,
    department: String,
    contactEmail: String
  }
}, {
  timestamps: true
});

// FIXED: Generate key method that accepts parameters
licenseKeySchema.statics.generateKey = function(type, prefix = '') {
  // Generate base key
  const baseKey = crypto.randomBytes(40).toString('hex').toUpperCase();
  
  // Add type prefix for organization
  const typePrefix = prefix || type.substring(0, 3);
  
  // Add timestamp component for uniqueness
  const timestamp = Date.now().toString(36).toUpperCase();
  
  // Combine and pad to 100 characters
  const combined = `${typePrefix}-${timestamp}-${baseKey}`;
  return combined.substring(0, 100).padEnd(100, '0');
};

// Validate license key usage
licenseKeySchema.methods.canBeUsed = function() {
  if (!this.isActive) return { valid: false, reason: 'License key is inactive' };
  if (this.expiresAt && new Date() > this.expiresAt) {
    return { valid: false, reason: 'License key has expired' };
  }
  if (this.currentUses >= this.maxUses) {
    return { valid: false, reason: 'License key usage limit exceeded' };
  }
  return { valid: true };
};

// Use license key
licenseKeySchema.methods.use = function(userId, ipAddress, userAgent) {
  this.usedBy.push({
    userId,
    usedAt: new Date(),
    ipAddress,
    userAgent
  });
  this.currentUses += 1;
  return this.save();
};

licenseKeySchema.index({ key: 1, isActive: 1 });
licenseKeySchema.index({ expiresAt: 1 });
licenseKeySchema.index({ generatedBy: 1 });

module.exports = mongoose.model('LicenseKey', licenseKeySchema);
