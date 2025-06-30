// models/Schedule.js - FIXED FOR INDIA (IST)
const mongoose = require('mongoose');
const moment = require('moment-timezone');

const scheduleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true
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
    customDuration: Number
  }],
  devices: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device'
  }],
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  startTime: {
    type: String,
    required: true,
    match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
  },
  endTime: {
    type: String,
    required: true,
    match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
  },
  timezone: {
    type: String,
    default: 'Asia/Kolkata',  // CHANGED: Default to IST instead of UTC
    enum: [
      'Asia/Kolkata',     // India Standard Time (IST)
      'UTC',              // Universal Coordinated Time
      'Asia/Mumbai',      // Alternative IST identifier
      'Asia/Delhi',       // Alternative IST identifier
      'Asia/Calcutta'     // Legacy IST identifier
    ],
    validate: {
      validator: function(timezone) {
        // Validate timezone using moment-timezone
        return moment.tz.zone(timezone) !== null;
      },
      message: 'Invalid timezone. Please use a valid timezone identifier.'
    }
  },
  repeat: {
    type: String,
    enum: ['none', 'daily', 'weekly', 'monthly'],
    default: 'none'
  },
  weekDays: [{
    type: Number,
    min: 0,
    max: 6
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  priority: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // NEW: Store original timezone for reference
  originalTimezone: {
    type: String,
    default: 'Asia/Kolkata'
  }
}, {
  timestamps: true
});

// ENHANCED: Better indexing for India-specific queries
scheduleSchema.index({ isActive: 1, startDate: 1, endDate: 1, timezone: 1 });
scheduleSchema.index({ timezone: 1, isActive: 1 });
scheduleSchema.index({ createdBy: 1, isActive: 1 });

// HELPER METHOD: Check if schedule is currently active in IST
scheduleSchema.methods.isCurrentlyActive = function() {
  const now = moment.tz('Asia/Kolkata');
  const scheduleTimezone = this.timezone || 'Asia/Kolkata';
  
  // Convert current time to schedule's timezone
  const nowInScheduleTimezone = now.clone().tz(scheduleTimezone);
  
  // Parse start and end times
  const [startHour, startMinute] = this.startTime.split(':').map(Number);
  const [endHour, endMinute] = this.endTime.split(':').map(Number);
  
  // Create start and end moments for today in the schedule's timezone
  let scheduleStart = moment.tz(this.startDate, scheduleTimezone)
    .hour(startHour)
    .minute(startMinute)
    .second(0);
    
  let scheduleEnd = moment.tz(this.endDate, scheduleTimezone)
    .hour(endHour)
    .minute(endMinute)
    .second(0);
  
  // Handle overnight schedules
  if (endHour < startHour || (endHour === startHour && endMinute <= startMinute)) {
    scheduleEnd.add(1, 'day');
  }
  
  // Check if within date range
  const isWithinDateRange = nowInScheduleTimezone.isBetween(
    moment.tz(this.startDate, scheduleTimezone).startOf('day'),
    moment.tz(this.endDate, scheduleTimezone).endOf('day'),
    null, '[]'
  );
  
  // Check if within time range
  const isWithinTimeRange = nowInScheduleTimezone.isBetween(scheduleStart, scheduleEnd, null, '[]');
  
  return this.isActive && isWithinDateRange && isWithinTimeRange;
};

// HELPER METHOD: Get schedule times in IST
scheduleSchema.methods.getTimesInIST = function() {
  const scheduleTimezone = this.timezone || 'Asia/Kolkata';
  
  const startInIST = moment.tz(`${this.startDate.toISOString().split('T')[0]} ${this.startTime}`, scheduleTimezone)
    .tz('Asia/Kolkata');
    
  const endInIST = moment.tz(`${this.endDate.toISOString().split('T')[0]} ${this.endTime}`, scheduleTimezone)
    .tz('Asia/Kolkata');
  
  return {
    startIST: startInIST.format('YYYY-MM-DD HH:mm:ss'),
    endIST: endInIST.format('YYYY-MM-DD HH:mm:ss'),
    startISTTime: startInIST.format('HH:mm'),
    endISTTime: endInIST.format('HH:mm')
  };
};

// STATIC METHOD: Find currently active schedules in IST
scheduleSchema.statics.findCurrentlyActive = function() {
  return this.find({ isActive: true })
    .populate({
      path: 'content.contentId',
      match: { status: 'approved' }
    })
    .then(schedules => {
      return schedules.filter(schedule => {
        try {
          return schedule.isCurrentlyActive();
        } catch (error) {
          console.error('Error checking schedule activity:', error);
          return false;
        }
      });
    });
};

// PRE-SAVE MIDDLEWARE: Ensure timezone consistency
scheduleSchema.pre('save', function(next) {
  // Set original timezone if not set
  if (!this.originalTimezone) {
    this.originalTimezone = this.timezone || 'Asia/Kolkata';
  }
  
  // Validate start/end date relationship
  if (this.endDate < this.startDate) {
    return next(new Error('End date must be after start date'));
  }
  
  // Validate timezone
  if (!moment.tz.zone(this.timezone)) {
    return next(new Error(`Invalid timezone: ${this.timezone}`));
  }
  
  next();
});

// VIRTUAL: Get current status
scheduleSchema.virtual('currentStatus').get(function() {
  if (!this.isActive) return 'inactive';
  
  try {
    return this.isCurrentlyActive() ? 'active' : 'scheduled';
  } catch (error) {
    return 'error';
  }
});

// Ensure virtuals are included in JSON output
scheduleSchema.set('toJSON', { virtuals: true });
scheduleSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Schedule', scheduleSchema);
