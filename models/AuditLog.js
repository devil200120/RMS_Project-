const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      'USER_LOGIN', 'USER_LOGOUT', 'USER_REGISTER', 'USER_UPDATE',
      'CONTENT_CREATE', 'CONTENT_UPDATE', 'CONTENT_DELETE', 'CONTENT_APPROVE', 'CONTENT_REJECT',
      'SCHEDULE_CREATE', 'SCHEDULE_UPDATE', 'SCHEDULE_DELETE',
      'DEVICE_REGISTER', 'DEVICE_UPDATE', 'DEVICE_DELETE', 'DEVICE_COMMAND',
      'LICENSE_GENERATE', 'LICENSE_USE', 'LICENSE_REVOKE',
      'SYSTEM_ERROR', 'SECURITY_VIOLATION'
    ]
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  targetId: {
    type: String, // Can be any entity ID
    default: null
  },
  targetType: {
    type: String,
    enum: ['USER', 'CONTENT', 'SCHEDULE', 'DEVICE', 'LICENSE', 'SYSTEM'],
    default: null
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ipAddress: String,
  userAgent: String,
  success: {
    type: Boolean,
    default: true
  },
  errorMessage: String,
  severity: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'LOW'
  }
}, {
  timestamps: true
});

// Index for efficient querying
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
auditLogSchema.index({ severity: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
