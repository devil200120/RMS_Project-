// models/Schedule.js - PRODUCTION-READY VERSION WITH ALL FIXES
const mongoose = require('mongoose');
const moment = require('moment-timezone');

// Helper function for timezone conversion
const convertToUTC = (dateString, timeString, timezone) => {
  try {
    return moment.tz(`${dateString} ${timeString}`, 'YYYY-MM-DD HH:mm', timezone).utc().toDate();
  } catch (error) {
    console.error('Date conversion error:', error);
    return new Date();
  }
};

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
      max: 86400 // Max 24 hours in seconds
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
      validator: function(value) {
        return value instanceof Date && !isNaN(value);
      },
      message: 'Start date must be a valid date'
    }
  },
  endDate: {
    type: Date,
    required: true,
    validate: {
      validator: function(value) {
        return value instanceof Date && !isNaN(value);
      },
      message: 'End date must be a valid date'
    }
  },
  startTime: {
    type: String,
    required: true,
    match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Start time must be in HH:MM format'],
    validate: {
      validator: function(value) {
        const [hours, minutes] = value.split(':').map(Number);
        return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
      },
      message: 'Invalid start time - hours must be 0-23, minutes must be 0-59'
    }
  },
  endTime: {
    type: String,
    required: true,
    match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'End time must be in HH:MM format'],
    validate: {
      validator: function(value) {
        const [hours, minutes] = value.split(':').map(Number);
        return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
      },
      message: 'Invalid end time - hours must be 0-23, minutes must be 0-59'
    }
  },
  timezone: {
    type: String,
    default: 'Asia/Kolkata',
    enum: {
      values: [
        'Asia/Kolkata',     // India Standard Time (IST)
        'Asia/Mumbai',      // Alternative IST identifier
        'Asia/Delhi',       // Alternative IST identifier  
        'Asia/Calcutta',    // Legacy IST identifier
        'UTC',              // Universal Coordinated Time
        'Asia/Dhaka',       // Bangladesh Standard Time
        'Asia/Kathmandu'    // Nepal Time (for regional compatibility)
      ],
      message: 'Timezone must be a supported timezone'
    },
    validate: {
      validator: function(timezone) {
        try {
          return moment.tz.zone(timezone) !== null;
        } catch (error) {
          return false;
        }
      },
      message: 'Invalid timezone identifier'
    }
  },
  repeat: {
    type: String,
    enum: {
      values: ['none', 'daily', 'weekly', 'monthly'],
      message: 'Repeat must be one of: none, daily, weekly, monthly'
    },
    default: 'none',
    validate: {
      validator: function(value) {
        // Weekly schedules must have weekDays specified
        if (value === 'weekly') {
          return this.weekDays && this.weekDays.length > 0;
        }
        return true;
      },
      message: 'Weekly schedules must include at least one week day'
    }
  },
  weekDays: [{
    type: Number,
    min: [0, 'Week day must be between 0 (Sunday) and 6 (Saturday)'],
    max: [6, 'Week day must be between 0 (Sunday) and 6 (Saturday)'],
    validate: {
      validator: function(value) {
        return Number.isInteger(value) && value >= 0 && value <= 6;
      },
      message: 'Week day must be an integer between 0 and 6'
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
    min: [1, 'Priority must be at least 1'],
    max: [10, 'Priority cannot exceed 10'],
    validate: {
      validator: function(value) {
        return Number.isInteger(value);
      },
      message: 'Priority must be an integer'
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
  // Enhanced metadata
  metadata: {
    lastActivated: Date,
    activationCount: {
      type: Number,
      default: 0
    },
    estimatedViewers: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  collection: 'schedules'
});

// ENHANCED INDEXING for optimal performance
scheduleSchema.index({ isActive: 1, startDate: 1, endDate: 1, timezone: 1 });
scheduleSchema.index({ timezone: 1, isActive: 1 });
scheduleSchema.index({ createdBy: 1, isActive: 1 });
scheduleSchema.index({ priority: -1, isActive: 1 });
scheduleSchema.index({ 'metadata.lastActivated': -1 });
scheduleSchema.index({ startDate: 1, endDate: 1, isActive: 1 });
scheduleSchema.index({ repeat: 1, isActive: 1 });

// ENHANCED: Robust schedule activity checking with proper repeat handling
scheduleSchema.methods.isCurrentlyActive = function() {
  try {
    if (!this.isActive) {
      return false;
    }

    const scheduleTimezone = this.timezone || 'Asia/Kolkata';
    const now = moment.tz(scheduleTimezone);

    // Parse time components
    const [startHour, startMinute] = this.startTime.split(':').map(Number);
    const [endHour, endMinute] = this.endTime.split(':').map(Number);

    // Check if current date is within the schedule date range (for non-repeating schedules)
    if (this.repeat === 'none') {
      const currentDate = now.format('YYYY-MM-DD');
      const startDate = moment.tz(this.startDate, scheduleTimezone).format('YYYY-MM-DD');
      const endDate = moment.tz(this.endDate, scheduleTimezone).format('YYYY-MM-DD');

      if (currentDate < startDate || currentDate > endDate) {
        return false;
      }
    }

    // FIXED: Create today's schedule times (not using startDate/endDate for time window)
    const todayStart = moment.tz(scheduleTimezone)
      .hour(startHour)
      .minute(startMinute)
      .second(0)
      .millisecond(0);

    let todayEnd = moment.tz(scheduleTimezone)
      .hour(endHour)
      .minute(endMinute)
      .second(0)
      .millisecond(0);

    // Handle overnight schedules (end time is next day)
    if (endHour < startHour || (endHour === startHour && endMinute <= startMinute)) {
      todayEnd.add(1, 'day');
    }

    // Check if current time is within today's schedule time range
    const isWithinTimeRange = now.isBetween(todayStart, todayEnd, null, '[]');

    // ADDED: Handle repeat patterns
    if (this.repeat === 'weekly') {
      if (!this.weekDays || this.weekDays.length === 0) {
        return false; // Invalid weekly schedule
      }
      const currentWeekDay = now.day(); // 0 = Sunday, 6 = Saturday
      const isValidWeekDay = this.weekDays.includes(currentWeekDay);
      return isWithinTimeRange && isValidWeekDay;
    }

    if (this.repeat === 'daily') {
      // For daily schedules, only check time range (ignore date range)
      const scheduleStartDate = moment.tz(this.startDate, scheduleTimezone);
      const scheduleEndDate = moment.tz(this.endDate, scheduleTimezone);
      
      // Check if today is within the overall schedule period
      if (now.isBefore(scheduleStartDate, 'day') || now.isAfter(scheduleEndDate, 'day')) {
        return false;
      }
      
      return isWithinTimeRange;
    }

    if (this.repeat === 'monthly') {
      const currentDay = now.date();
      const scheduleDay = moment.tz(this.startDate, scheduleTimezone).date();
      
      // Check if today's date matches the schedule's day of month
      if (currentDay !== scheduleDay) {
        return false;
      }
      
      return isWithinTimeRange;
    }

    // For 'none' repeat, check both date and time range
    return isWithinTimeRange;

  } catch (error) {
    console.error('Error checking schedule activity:', error);
    return false;
  }
};

// ENHANCED: Better timezone conversion methods
scheduleSchema.methods.getTimesInIST = function() {
  try {
    const scheduleTimezone = this.timezone || 'Asia/Kolkata';
    
    // Parse time components
    const [startHour, startMinute] = this.startTime.split(':').map(Number);
    const [endHour, endMinute] = this.endTime.split(':').map(Number);
    
    // Create moments for start and end times in the schedule timezone
    const startMoment = moment.tz(scheduleTimezone)
      .hour(startHour)
      .minute(startMinute)
      .second(0);
      
    const endMoment = moment.tz(scheduleTimezone)
      .hour(endHour)
      .minute(endMinute)
      .second(0);

    // Convert to IST
    const startIST = startMoment.clone().tz('Asia/Kolkata');
    const endIST = endMoment.clone().tz('Asia/Kolkata');

    return {
      startIST: startIST.format('YYYY-MM-DD HH:mm:ss'),
      endIST: endIST.format('YYYY-MM-DD HH:mm:ss'),
      startISTTime: startIST.format('HH:mm'),
      endISTTime: endIST.format('HH:mm'),
      startISTDate: startIST.format('YYYY-MM-DD'),
      endISTDate: endIST.format('YYYY-MM-DD')
    };
  } catch (error) {
    console.error('Error converting times to IST:', error);
    return null;
  }
};

// NEW: Get schedule duration in minutes
scheduleSchema.methods.getDurationInMinutes = function() {
  try {
    const [startHour, startMinute] = this.startTime.split(':').map(Number);
    const [endHour, endMinute] = this.endTime.split(':').map(Number);

    let startTotalMinutes = startHour * 60 + startMinute;
    let endTotalMinutes = endHour * 60 + endMinute;

    // Handle overnight schedules
    if (endTotalMinutes <= startTotalMinutes) {
      endTotalMinutes += 24 * 60; // Add 24 hours
    }

    return endTotalMinutes - startTotalMinutes;
  } catch (error) {
    console.error('Error calculating duration:', error);
    return 0;
  }
};

// NEW: Check if schedule conflicts with another schedule
scheduleSchema.methods.conflictsWith = function(otherSchedule) {
  try {
    // Check if schedules overlap in date range
    const thisStart = moment(this.startDate);
    const thisEnd = moment(this.endDate);
    const otherStart = moment(otherSchedule.startDate);
    const otherEnd = moment(otherSchedule.endDate);

    const datesOverlap = thisStart.isSameOrBefore(otherEnd) && thisEnd.isSameOrAfter(otherStart);
    
    if (!datesOverlap) {
      return false;
    }

    // Check if time ranges overlap
    const thisStartMinutes = this.getTimeInMinutes(this.startTime);
    const thisEndMinutes = this.getTimeInMinutes(this.endTime);
    const otherStartMinutes = this.getTimeInMinutes(otherSchedule.startTime);
    const otherEndMinutes = this.getTimeInMinutes(otherSchedule.endTime);

    // Handle overnight schedules
    const thisEndAdjusted = thisEndMinutes <= thisStartMinutes ? thisEndMinutes + 1440 : thisEndMinutes;
    const otherEndAdjusted = otherEndMinutes <= otherStartMinutes ? otherEndMinutes + 1440 : otherEndMinutes;

    return thisStartMinutes < otherEndAdjusted && thisEndAdjusted > otherStartMinutes;
  } catch (error) {
    console.error('Error checking schedule conflicts:', error);
    return false;
  }
};

// HELPER: Convert time string to minutes
scheduleSchema.methods.getTimeInMinutes = function(timeString) {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
};

// ENHANCED: Static method to find currently active schedules
scheduleSchema.statics.findCurrentlyActive = async function() {
  try {
    const schedules = await this.find({ isActive: true })
      .populate({
        path: 'content.contentId',
        match: { status: 'approved' },
        select: 'title type duration filePath url htmlContent mimeType status'
      })
      .populate('devices', 'name deviceId location status')
      .populate('createdBy', 'name email role')
      .lean();

    if (!schedules || schedules.length === 0) {
      return [];
    }

    // Filter schedules that are currently active
    const activeSchedules = [];
    
    for (const schedule of schedules) {
      try {
        // Convert lean object back to mongoose document for method access
        const scheduleDoc = new this(schedule);
        
        if (scheduleDoc.isCurrentlyActive()) {
          // Filter out content items where contentId is null (failed population)
          schedule.content = schedule.content.filter(item => item.contentId);
          
          // Only include schedules that have valid content
          if (schedule.content.length > 0) {
            activeSchedules.push(schedule);
          }
        }
      } catch (error) {
        console.error('Error checking individual schedule:', schedule._id, error);
      }
    }

    // Sort by priority (highest first), then by creation date
    return activeSchedules.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  } catch (error) {
    console.error('Error finding currently active schedules:', error);
    return [];
  }
};

// NEW: Find schedules by timezone
scheduleSchema.statics.findByTimezone = function(timezone = 'Asia/Kolkata') {
  return this.find({ timezone, isActive: true })
    .populate('content.contentId', 'title type status')
    .populate('createdBy', 'name email')
    .sort({ priority: -1, createdAt: -1 });
};

// NEW: Get schedule statistics
scheduleSchema.statics.getStatistics = async function() {
  try {
    const stats = await this.aggregate([
      {
        $group: {
          _id: null,
          totalSchedules: { $sum: 1 },
          activeSchedules: {
            $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
          },
          averagePriority: { $avg: '$priority' },
          timezoneDistribution: {
            $push: '$timezone'
          }
        }
      }
    ]);

    return stats[0] || {
      totalSchedules: 0,
      activeSchedules: 0,
      averagePriority: 0,
      timezoneDistribution: []
    };
  } catch (error) {
    console.error('Error getting schedule statistics:', error);
    return null;
  }
};

// ENHANCED PRE-SAVE MIDDLEWARE with timezone auto-correction and date validation
scheduleSchema.pre('save', function(next) {
  try {
    // FIXED: Auto-correct common timezone format errors
    if (this.timezone) {
      // Correct missing slash in timezone names
      if (this.timezone === 'AsiaKolkata') {
        console.log('Auto-correcting timezone: AsiaKolkata → Asia/Kolkata');
        this.timezone = 'Asia/Kolkata';
      }
      if (this.timezone === 'AsiaCalcutta') {
        console.log('Auto-correcting timezone: AsiaCalcutta → Asia/Calcutta');
        this.timezone = 'Asia/Calcutta';
      }
      if (this.timezone === 'AsiaMumbai') {
        console.log('Auto-correcting timezone: AsiaMumbai → Asia/Mumbai');
        this.timezone = 'Asia/Mumbai';
      }
      if (this.timezone === 'AsiaDelhi') {
        console.log('Auto-correcting timezone: AsiaDelhi → Asia/Delhi');
        this.timezone = 'Asia/Delhi';
      }
    }

    // Set original timezone if not set
    if (!this.originalTimezone) {
      this.originalTimezone = this.timezone || 'Asia/Kolkata';
    }

    // FIXED: Enhanced date validation with timezone awareness
    const timezone = this.timezone || 'Asia/Kolkata';
    const startMoment = moment.tz(this.startDate, timezone);
    const endMoment = moment.tz(this.endDate, timezone);

    // Validate date relationship in the schedule's timezone
    if (endMoment.isBefore(startMoment, 'day')) {
      return next(new Error('End date must be after or equal to start date'));
    }

    // Validate timezone exists in moment-timezone
    if (!moment.tz.zone(this.timezone)) {
      return next(new Error(`Invalid timezone: ${this.timezone}. Please use a valid IANA timezone identifier.`));
    }

    // Validate content array
    if (!this.content || this.content.length === 0) {
      return next(new Error('Schedule must contain at least one content item'));
    }

    // Validate time format more strictly
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(this.startTime) || !timeRegex.test(this.endTime)) {
      return next(new Error('Invalid time format. Use HH:MM format (e.g., 09:30, 14:45)'));
    }

    // Validate weekly schedules have weekDays
    if (this.repeat === 'weekly' && (!this.weekDays || this.weekDays.length === 0)) {
      return next(new Error('Weekly schedules must specify at least one week day'));
    }

    // Set default metadata if not present
    if (!this.metadata) {
      this.metadata = {
        activationCount: 0,
        estimatedViewers: 0
      };
    }

    next();
  } catch (error) {
    console.error('Error in pre-save middleware:', error);
    next(error);
  }
});

// POST-SAVE MIDDLEWARE: Update activation tracking
scheduleSchema.post('save', function(doc) {
  try {
    if (doc.isActive && doc.isCurrentlyActive()) {
      doc.metadata.lastActivated = new Date();
      doc.metadata.activationCount = (doc.metadata.activationCount || 0) + 1;
    }
  } catch (error) {
    console.error('Error in post-save middleware:', error);
  }
});

// ENHANCED VIRTUAL: Get current status with detailed information
scheduleSchema.virtual('currentStatus').get(function() {
  if (!this.isActive) {
    return {
      status: 'inactive',
      message: 'Schedule is disabled'
    };
  }
  
  try {
    const isActive = this.isCurrentlyActive();
    const now = moment.tz(this.timezone || 'Asia/Kolkata');
    const scheduleStart = moment.tz(this.startDate, this.timezone || 'Asia/Kolkata');
    const scheduleEnd = moment.tz(this.endDate, this.timezone || 'Asia/Kolkata');

    if (this.repeat === 'none' && now.isBefore(scheduleStart, 'day')) {
      return {
        status: 'scheduled',
        message: `Starts ${scheduleStart.fromNow()}`,
        startsAt: scheduleStart.format()
      };
    } else if (this.repeat === 'none' && now.isAfter(scheduleEnd, 'day')) {
      return {
        status: 'expired',
        message: `Ended ${scheduleEnd.fromNow()}`,
        endedAt: scheduleEnd.format()
      };
    } else if (isActive) {
      return {
        status: 'active',
        message: 'Currently playing content',
        duration: this.getDurationInMinutes()
      };
    } else {
      return {
        status: 'waiting',
        message: 'Waiting for scheduled time',
        nextStart: this.getNextStartTime()
      };
    }
  } catch (error) {
    console.error('Error in currentStatus virtual:', error);
    return {
      status: 'error',
      message: 'Error determining status'
    };
  }
});

// NEW: Get next start time for recurring schedules
scheduleSchema.methods.getNextStartTime = function() {
  try {
    const now = moment.tz(this.timezone || 'Asia/Kolkata');
    const [startHour, startMinute] = this.startTime.split(':').map(Number);

    if (this.repeat === 'daily') {
      const nextStart = now.clone().hour(startHour).minute(startMinute).second(0);
      if (nextStart.isSameOrBefore(now)) {
        nextStart.add(1, 'day');
      }
      return nextStart.format();
    }

    if (this.repeat === 'weekly' && this.weekDays && this.weekDays.length > 0) {
      const currentDay = now.day();
      const nextWeekDay = this.weekDays.find(day => day > currentDay) || this.weekDays[0];
      const daysToAdd = nextWeekDay > currentDay ? nextWeekDay - currentDay : 7 - currentDay + nextWeekDay;
      
      const nextStart = now.clone()
        .add(daysToAdd, 'days')
        .hour(startHour)
        .minute(startMinute)
        .second(0);
      
      return nextStart.format();
    }

    return null;
  } catch (error) {
    console.error('Error calculating next start time:', error);
    return null;
  }
};

// Configure JSON output
scheduleSchema.set('toJSON', { 
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

scheduleSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Schedule', scheduleSchema);
