// models/Schedule.js

const mongoose = require('mongoose');
const moment = require('moment-timezone');

const scheduleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
    index: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  content: [{
    contentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Content',
      required: true
    },
    order: {
      type: Number,
      required: true,
      min: 0
    },
    customDuration: {
      type: Number,
      min: 1,
      max: 86400 // seconds
    }
  }],
  devices: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device'
  }],
  startDate: {
    type: Date,
    required: true,
    validate: {
      validator: v => v instanceof Date && !isNaN(v),
      message: 'Start date must be a valid date'
    }
  },
  endDate: {
    type: Date,
    required: true,
    validate: {
      validator: function(v) {
        return v instanceof Date && !isNaN(v) && v >= this.startDate;
      },
      message: 'End date must be a valid date and not before start date'
    }
  },
  startTime: {
    type: String,
    required: true,
    match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Start time must be HH:MM'],
    validate: {
      validator: v => {
        const [h, m] = v.split(':').map(Number);
        return h >= 0 && h <= 23 && m >= 0 && m <= 59;
      },
      message: 'Invalid start time'
    }
  },
  endTime: {
    type: String,
    required: true,
    match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'End time must be HH:MM'],
    validate: {
      validator: v => {
        const [h, m] = v.split(':').map(Number);
        return h >= 0 && h <= 23 && m >= 0 && m <= 59;
      },
      message: 'Invalid end time'
    }
  },
  timezone: {
    type: String,
    default: 'Asia/Kolkata',
    enum: [
      'Asia/Kolkata',
      'Asia/Mumbai',
      'Asia/Delhi',
      'Asia/Calcutta',
      'UTC',
      'Asia/Dhaka',
      'Asia/Kathmandu'
    ],
    validate: {
      validator: tz => moment.tz.zone(tz) !== null,
      message: 'Invalid timezone'
    }
  },
  repeat: {
    type: String,
    enum: ['none', 'daily', 'weekly', 'monthly'],
    default: 'none',
    validate: {
      validator: function(v) {
        if (v === 'weekly') {
          return Array.isArray(this.weekDays) && this.weekDays.length > 0;
        }
        return true;
      },
      message: 'Weekly schedules must specify at least one week day'
    }
  },
  weekDays: [{
    type: Number,
    min: 0,
    max: 6,
    validate: {
      validator: v => Number.isInteger(v),
      message: 'Week day must be an integer 0–6'
    }
  }],
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  priority: {
    type: Number,
    default: 1,
    min: 1,
    max: 10,
    validate: {
      validator: v => Number.isInteger(v),
      message: 'Priority must be an integer 1–10'
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  originalTimezone: {
    type: String,
    default: 'Asia/Kolkata'
  },
  metadata: {
    lastActivated: Date,
    activationCount: { type: Number, default: 0 },
    estimatedViewers: { type: Number, default: 0 }
  }
}, {
  timestamps: true,
  collection: 'schedules'
});

// Indexes
scheduleSchema.index({ isActive: 1, startDate: 1, endDate: 1, timezone: 1 });
scheduleSchema.index({ timezone: 1, isActive: 1 });
scheduleSchema.index({ createdBy: 1, isActive: 1 });
scheduleSchema.index({ priority: -1, isActive: 1 });
scheduleSchema.index({ 'metadata.lastActivated': -1 });

// Check if schedule is active now
scheduleSchema.methods.isCurrentlyActive = function() {
  if (!this.isActive) return false;

  const tz = this.timezone || 'Asia/Kolkata';
  const now = moment.tz(tz);
  
  // Build today's time window
  const [sh, sm] = this.startTime.split(':').map(Number);
  const [eh, em] = this.endTime.split(':').map(Number);

  const start = now.clone().hour(sh).minute(sm).second(0);
  let end = now.clone().hour(eh).minute(em).second(0);
  if (end.isSameOrBefore(start)) end.add(1, 'day');

  // Date range check for non-repeating
  if (this.repeat === 'none') {
    const today = now.format('YYYY-MM-DD');
    const sd = moment.tz(this.startDate, tz).format('YYYY-MM-DD');
    const ed = moment.tz(this.endDate, tz).format('YYYY-MM-DD');
    if (today < sd || today > ed) return false;
  }

  // Repeat patterns
  if (this.repeat === 'weekly') {
    if (!this.weekDays.includes(now.day())) return false;
  }
  if (this.repeat === 'monthly') {
    if (now.date() !== moment.tz(this.startDate, tz).date()) return false;
  }
  // Daily and none both require time check
  return now.isBetween(start, end, null, '[]');
};

// Convert times to IST for display
scheduleSchema.methods.getTimesInIST = function() {
  const tz = this.timezone || 'Asia/Kolkata';
  const [sh, sm] = this.startTime.split(':').map(Number);
  const [eh, em] = this.endTime.split(':').map(Number);

  const start = moment.tz(tz).hour(sh).minute(sm).second(0).tz('Asia/Kolkata');
  const end = moment.tz(tz).hour(eh).minute(em).second(0).tz('Asia/Kolkata');

  return {
    startIST: start.format('YYYY-MM-DD HH:mm:ss'),
    endIST: end.format('YYYY-MM-DD HH:mm:ss'),
    startISTTime: start.format('HH:mm'),
    endISTTime: end.format('HH:mm')
  };
};

// Duration in minutes
scheduleSchema.methods.getDurationInMinutes = function() {
  const [sh, sm] = this.startTime.split(':').map(Number);
  const [eh, em] = this.endTime.split(':').map(Number);
  let startM = sh * 60 + sm;
  let endM = eh * 60 + em;
  if (endM <= startM) endM += 1440;
  return endM - startM;
};

// Convert single time to minutes
scheduleSchema.methods.getTimeInMinutes = function(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

// Find active schedules
scheduleSchema.statics.findCurrentlyActive = async function() {
  const all = await this.find({ isActive: true })
    .populate('content.contentId', null, { status: 'approved' })
    .lean();
  return all.filter(doc => new this(doc).isCurrentlyActive())
    .sort((a, b) => (b.priority || 1) - (a.priority || 1));
};

// Find by timezone
scheduleSchema.statics.findByTimezone = function(tz = 'Asia/Kolkata') {
  return this.find({ timezone: tz, isActive: true })
    .populate('content.contentId', null, { status: 'approved' })
    .sort({ priority: -1, createdAt: -1 })
    .lean();
};

// Statistics aggregation
scheduleSchema.statics.getStatistics = async function() {
  const stats = await this.aggregate([
    { $group: {
        _id: null,
        totalSchedules: { $sum: 1 },
        activeSchedules: { $sum: { $cond: ['$isActive', 1, 0] } },
        averagePriority: { $avg: '$priority' },
        timezones: { $push: '$timezone' }
    }}
  ]);
  return stats[0] || { totalSchedules: 0, activeSchedules: 0, averagePriority: 0, timezones: [] };
};

// Pre-save middleware
scheduleSchema.pre('save', function(next) {
  // Auto-correct common timezone typos
  if (this.timezone === 'AsiaKolkata') this.timezone = 'Asia/Kolkata';
  if (this.timezone === 'AsiaCalcutta') this.timezone = 'Asia/Calcutta';
  if (this.timezone === 'AsiaMumbai') this.timezone = 'Asia/Mumbai';
  if (this.timezone === 'AsiaDelhi') this.timezone = 'Asia/Delhi';

  // Validate dates
  if (this.endDate < this.startDate) {
    return next(new Error('End date must be on or after start date'));
  }
  next();
});

// Virtual status
scheduleSchema.virtual('currentStatus').get(function() {
  if (!this.isActive) return 'inactive';
  const active = this.isCurrentlyActive();
  return active ? 'active' : 'scheduled';
});

// Ensure virtuals in JSON
scheduleSchema.set('toJSON', { virtuals: true });
scheduleSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Schedule', scheduleSchema);
