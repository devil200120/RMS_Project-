// controllers/scheduleController.js - FIXED VERSION
const Schedule = require('../models/Schedule');
const Content = require('../models/Content');
const moment = require('moment-timezone');
const AuditLog = require('../models/AuditLog');

const createSchedule = async (req, res) => {
  try {
    const data = { ...req.body, createdBy: req.user._id };
    
    const schedule = await Schedule.create(data);
    await schedule.populate([
      { path: 'content.contentId', select: 'title type duration filePath url htmlContent' },
      { path: 'devices', select: 'name deviceId location status' },
      { path: 'createdBy', select: 'name email' }
    ]);

    // Emit real-time update if socket.io is available
    if (req.app.get('socketio')) {
      req.app.get('socketio').emit('schedule-created', {
        schedule: schedule,
        message: `New schedule "${schedule.name}" created`,
        timestamp: new Date()
      });

      req.app.get('socketio').emit('content-refresh', {
        message: 'Schedule updated, checking for new content',
        timestamp: new Date()
      });
    }

    res.status(201).json({ success: true, data: schedule });
  } catch (error) {
    console.error('Create schedule error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getSchedules = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    let filter = {};
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
    if (req.query.deviceId) filter.devices = req.query.deviceId;
    
    const schedules = await Schedule.find(filter)
      .populate([
        { path: 'content.contentId', select: 'title type duration' },
        { path: 'devices', select: 'name deviceId location' },
        { path: 'createdBy', select: 'name email' }
      ])
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Schedule.countDocuments(filter);
    
    res.json({ 
      success: true, 
      data: schedules, 
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Get schedules error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getScheduleById = async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id)
      .populate([
        { path: 'content.contentId', select: 'title type duration' },
        { path: 'devices', select: 'name deviceId location' },
        { path: 'createdBy', select: 'name email' }
      ]);
    
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Schedule not found' });
    }
    
    res.json({ success: true, data: schedule });
  } catch (error) {
    console.error('Get schedule by ID error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateSchedule = async (req, res) => {
  try {
    console.log("Update payload content array:", req.body.content);
    
    const schedule = await Schedule.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true, runValidators: true }
    ).populate([
      { path: 'content.contentId', select: 'title type duration' },
      { path: 'devices', select: 'name deviceId location' },
      { path: 'createdBy', select: 'name email' }
    ]);
    
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    // Emit real-time update if socket.io is available
    if (req.app.get('socketio')) {
      req.app.get('socketio').emit('schedule-updated', {
        schedule: schedule,
        message: `Schedule "${schedule.name}" updated`,
        timestamp: new Date()
      });
    }
    
    res.json({ success: true, data: schedule });
  } catch (error) {
    console.error('Update schedule error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteSchedule = async (req, res) => {
  try {
    const schedule = await Schedule.findByIdAndDelete(req.params.id);
    
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    // Emit real-time update if socket.io is available
    if (req.app.get('socketio')) {
      req.app.get('socketio').emit('schedule-deleted', {
        scheduleId: schedule._id,
        scheduleName: schedule.name,
        message: `Schedule "${schedule.name}" deleted`,
        timestamp: new Date()
      });
    }
    
    res.json({ success: true, message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error('Delete schedule error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getCurrentScheduleForViewer = async (req, res) => {
  try {
    console.log('=== Getting Current Schedule for Viewer ===');
    
    const schedules = await Schedule.find({ isActive: true })
      .populate({
        path: 'content.contentId',
        match: { status: 'approved' },
        select: 'title type duration filePath url htmlContent mimeType'
      })
      .populate('devices', 'name deviceId location status')
      .lean();

    console.log(`Found ${schedules.length} active schedules`);

    if (!schedules.length) {
      return res.json({
        success: true,
        data: null,
        message: 'No active schedules found'
      });
    }

    const nowUtc = moment.utc();
    console.log('Current UTC time:', nowUtc.format());

    let activeSchedule = null;
    let bestPriority = 0;

    for (const schedule of schedules) {
      try {
        if (!schedule.content || !schedule.content.length) {
          console.log(`Schedule ${schedule.name} has no content, skipping`);
          continue;
        }

        const validContent = schedule.content.filter(c => c.contentId);
        if (!validContent.length) {
          console.log(`Schedule ${schedule.name} has no approved content, skipping`);
          continue;
        }

        const timezone = schedule.timezone || 'UTC';
        console.log(`Checking schedule: ${schedule.name} in timezone: ${timezone}`);

        const nowInScheduleTimezone = nowUtc.clone().tz(timezone);
        console.log('Current time in schedule timezone:', nowInScheduleTimezone.format());

        const [startHour, startMinute] = schedule.startTime.split(':').map(Number);
        const [endHour, endMinute] = schedule.endTime.split(':').map(Number);

        let scheduleStart = moment.tz(schedule.startDate, timezone)
          .hour(startHour)
          .minute(startMinute)
          .second(0)
          .millisecond(0);

        let scheduleEnd = moment.tz(schedule.endDate, timezone)
          .hour(endHour)
          .minute(endMinute)
          .second(0)
          .millisecond(0);

        // Handle overnight schedules
        if (endHour < startHour || (endHour === startHour && endMinute <= startMinute)) {
          scheduleEnd.add(1, 'day');
        }

        console.log('Schedule start:', scheduleStart.format());
        console.log('Schedule end:', scheduleEnd.format());

        const isWithinDateRange = nowInScheduleTimezone.isBetween(
          moment.tz(schedule.startDate, timezone).startOf('day'),
          moment.tz(schedule.endDate, timezone).endOf('day'),
          null, '[]'
        );

        const isWithinTimeRange = nowInScheduleTimezone.isBetween(scheduleStart, scheduleEnd, null, '[]');

        console.log('Within date range:', isWithinDateRange);
        console.log('Within time range:', isWithinTimeRange);

        if (isWithinDateRange && isWithinTimeRange) {
          console.log(`✅ Schedule ${schedule.name} is currently active!`);
          
          const priority = schedule.priority || 1;
          if (!activeSchedule || priority > bestPriority) {
            activeSchedule = schedule;
            bestPriority = priority;
            console.log(`New best schedule: ${schedule.name} (priority: ${priority})`);
          }
        } else {
          console.log(`❌ Schedule ${schedule.name} is not currently active`);
        }
      } catch (scheduleError) {
        console.error(`Error processing schedule ${schedule.name}:`, scheduleError);
        continue;
      }
    }

    if (!activeSchedule) {
      console.log('No active schedule found');
      return res.json({
        success: true,
        data: null,
        message: 'No schedule is currently active'
      });
    }

    const validContent = activeSchedule.content.filter(c => c.contentId);
    const contentToPlay = validContent[0]?.contentId;

    if (!contentToPlay) {
      console.log('No valid content found in active schedule');
      return res.json({
        success: true,
        data: null,
        message: 'Active schedule has no valid content'
      });
    }

    console.log(`✅ Returning content: ${contentToPlay.title}`);

    // Log successful content delivery
    try {
      await AuditLog.create({
        action: 'CONTENT_DELIVER',
        userId: null,
        targetId: contentToPlay._id,
        targetType: 'CONTENT',
        details: {
          contentTitle: contentToPlay.title,
          scheduleName: activeSchedule.name,
          deliveryTime: new Date()
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
    } catch (auditError) {
      console.error('Failed to log content delivery:', auditError);
    }

    res.json({
      success: true,
      data: {
        ...contentToPlay,
        schedule: {
          name: activeSchedule.name,
          description: activeSchedule.description,
          priority: activeSchedule.priority
        }
      },
      message: 'Content found successfully'
    });

  } catch (error) {
    console.error('Get current schedule error:', error);
    
    try {
      await AuditLog.create({
        action: 'CONTENT_DELIVER',
        userId: null,
        success: false,
        errorMessage: error.message,
        severity: 'HIGH',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
    } catch (auditError) {
      console.error('Failed to log error:', auditError);
    }

    res.status(500).json({
      success: false,
      message: 'Failed to get current schedule',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Export all functions using module.exports (CONSISTENT PATTERN)
module.exports = {
  createSchedule,
  getSchedules,
  getScheduleById,
  updateSchedule,
  deleteSchedule,
  getCurrentScheduleForViewer
};
