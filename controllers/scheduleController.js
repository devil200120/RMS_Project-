// controllers/scheduleController.js - ENHANCED VERSION FOR NEW SCHEMA
const Schedule = require('../models/Schedule');
const Content = require('../models/Content');
const moment = require('moment-timezone');
const AuditLog = require('../models/AuditLog');

// Enhanced schedule creation with new fields support
const createSchedule = async (req, res) => {
  try {
    console.log('Creating schedule with data:', req.body);
    
    // Extract and validate the content array structure
    let contentArray = [];
    if (req.body.content && Array.isArray(req.body.content)) {
      contentArray = req.body.content.map((item, index) => ({
        contentId: item.contentId || item,
        order: item.order !== undefined ? item.order : index,
        customDuration: item.customDuration || 10
      }));
    } else if (req.body.contentIds && Array.isArray(req.body.contentIds)) {
      // Handle contentIds array from frontend form
      contentArray = req.body.contentIds.map((id, index) => ({
        contentId: id,
        order: index,
        customDuration: 10
      }));
    }

    // Prepare enhanced schedule data with all new fields
    const scheduleData = {
      name: req.body.name?.trim(),
      description: req.body.description?.trim() || '',
      content: contentArray,
      devices: req.body.devices || [],
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      timezone: req.body.timezone || 'Asia/Kolkata',
      repeat: req.body.repeat || 'none',
      weekDays: req.body.repeat === 'weekly' ? (req.body.weekDays || []) : [],
      priority: Math.min(Math.max(parseInt(req.body.priority) || 1, 1), 10),
      isActive: req.body.isActive !== undefined ? req.body.isActive : true,
      createdBy: req.user._id,
      originalTimezone: req.body.timezone || 'Asia/Kolkata'
    };

    console.log('Processed schedule data:', scheduleData);

    // Validate content exists and is approved
    if (contentArray.length > 0) {
      const contentIds = contentArray.map(item => item.contentId);
      const existingContent = await Content.find({
        _id: { $in: contentIds },
        status: 'approved'
      });

      if (existingContent.length !== contentIds.length) {
        return res.status(400).json({
          success: false,
          message: 'Some selected content items are not found or not approved'
        });
      }
    }

    // Create the schedule
    const schedule = await Schedule.create(scheduleData);
    
    // Populate the created schedule
    await schedule.populate([
      { path: 'content.contentId', select: 'title type duration filePath url htmlContent mimeType' },
      { path: 'devices', select: 'name deviceId location status' },
      { path: 'createdBy', select: 'name email role' }
    ]);

    // Log schedule creation
    await AuditLog.create({
      action: 'SCHEDULE_CREATE',
      userId: req.user._id,
      targetId: schedule._id,
      targetType: 'SCHEDULE',
      details: { 
        scheduleName: schedule.name,
        timezone: schedule.timezone,
        repeat: schedule.repeat,
        priority: schedule.priority
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Emit real-time updates if socket.io is available
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

    res.status(201).json({ 
      success: true, 
      data: schedule,
      message: 'Schedule created successfully'
    });

  } catch (error) {
    console.error('Create schedule error:', error);
    
    // Log the error
    try {
      await AuditLog.create({
        action: 'SCHEDULE_CREATE',
        userId: req.user._id,
        success: false,
        errorMessage: error.message,
        severity: 'HIGH',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
    } catch (auditError) {
      console.error('Failed to log schedule creation error:', auditError);
    }

    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to create schedule'
    });
  }
};

// Enhanced get schedules with filtering and search
const getSchedules = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Build filter object
    let filter = {};
    if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === 'true';
    }
    if (req.query.deviceId) {
      filter.devices = req.query.deviceId;
    }
    if (req.query.timezone) {
      filter.timezone = req.query.timezone;
    }
    if (req.query.repeat) {
      filter.repeat = req.query.repeat;
    }
    if (req.query.priority) {
      filter.priority = parseInt(req.query.priority);
    }
    if (req.query.search) {
      filter.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Get schedules with enhanced population
    const schedules = await Schedule.find(filter)
      .populate([
        { 
          path: 'content.contentId', 
          select: 'title type duration filePath mimeType status',
          match: { status: 'approved' }
        },
        { path: 'devices', select: 'name deviceId location status' },
        { path: 'createdBy', select: 'name email role' }
      ])
      .sort({ priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total count for pagination
    const total = await Schedule.countDocuments(filter);

    // Add current status to each schedule
    const schedulesWithStatus = schedules.map(schedule => {
      try {
        const scheduleDoc = new Schedule(schedule);
        return {
          ...schedule,
          currentStatus: scheduleDoc.currentStatus,
          isCurrentlyActive: scheduleDoc.isCurrentlyActive()
        };
      } catch (error) {
        console.error('Error getting schedule status:', error);
        return {
          ...schedule,
          currentStatus: { status: 'error', message: 'Status unavailable' },
          isCurrentlyActive: false
        };
      }
    });
    
    res.json({ 
      success: true, 
      data: schedulesWithStatus, 
      pagination: { 
        page, 
        limit, 
        total, 
        pages: Math.ceil(total / limit) 
      },
      filters: filter
    });

  } catch (error) {
    console.error('Get schedules error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to get schedules'
    });
  }
};

// Get single schedule by ID with enhanced details
const getScheduleById = async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id)
      .populate([
        { 
          path: 'content.contentId', 
          select: 'title type duration filePath url htmlContent mimeType status createdAt'
        },
        { path: 'devices', select: 'name deviceId location status' },
        { path: 'createdBy', select: 'name email role' }
      ]);
    
    if (!schedule) {
      return res.status(404).json({ 
        success: false, 
        message: 'Schedule not found' 
      });
    }

    // Add enhanced status information
    const scheduleData = schedule.toObject();
    scheduleData.currentStatus = schedule.currentStatus;
    scheduleData.isCurrentlyActive = schedule.isCurrentlyActive();
    scheduleData.timesInIST = schedule.getTimesInIST();
    scheduleData.durationInMinutes = schedule.getDurationInMinutes();
    
    res.json({ success: true, data: scheduleData });

  } catch (error) {
    console.error('Get schedule by ID error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to get schedule'
    });
  }
};

// Enhanced schedule update with new fields support
const updateSchedule = async (req, res) => {
  try {
    console.log('Updating schedule with data:', req.body);
    
    // Extract and validate the content array structure
    let contentArray = [];
    if (req.body.content && Array.isArray(req.body.content)) {
      contentArray = req.body.content.map((item, index) => ({
        contentId: item.contentId || item,
        order: item.order !== undefined ? item.order : index,
        customDuration: item.customDuration || 10
      }));
    } else if (req.body.contentIds && Array.isArray(req.body.contentIds)) {
      contentArray = req.body.contentIds.map((id, index) => ({
        contentId: id,
        order: index,
        customDuration: 10
      }));
    }

    // Prepare update data
    const updateData = {
      name: req.body.name?.trim(),
      description: req.body.description?.trim(),
      content: contentArray,
      devices: req.body.devices,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      timezone: req.body.timezone,
      repeat: req.body.repeat,
      weekDays: req.body.repeat === 'weekly' ? (req.body.weekDays || []) : [],
      priority: Math.min(Math.max(parseInt(req.body.priority) || 1, 1), 10),
      isActive: req.body.isActive
    };

    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    // Validate content if provided
    if (contentArray.length > 0) {
      const contentIds = contentArray.map(item => item.contentId);
      const existingContent = await Content.find({
        _id: { $in: contentIds },
        status: 'approved'
      });

      if (existingContent.length !== contentIds.length) {
        return res.status(400).json({
          success: false,
          message: 'Some selected content items are not found or not approved'
        });
      }
    }

    // Update the schedule
    const schedule = await Schedule.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    ).populate([
      { path: 'content.contentId', select: 'title type duration filePath url htmlContent mimeType' },
      { path: 'devices', select: 'name deviceId location status' },
      { path: 'createdBy', select: 'name email role' }
    ]);
    
    if (!schedule) {
      return res.status(404).json({ 
        success: false, 
        message: 'Schedule not found' 
      });
    }

    // Log schedule update
    await AuditLog.create({
      action: 'SCHEDULE_UPDATE',
      userId: req.user._id,
      targetId: schedule._id,
      targetType: 'SCHEDULE',
      details: { 
        scheduleName: schedule.name,
        updatedFields: Object.keys(updateData)
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Emit real-time update if socket.io is available
    if (req.app.get('socketio')) {
      req.app.get('socketio').emit('schedule-updated', {
        schedule: schedule,
        message: `Schedule "${schedule.name}" updated`,
        timestamp: new Date()
      });

      req.app.get('socketio').emit('content-refresh', {
        message: 'Schedule updated, checking for new content',
        timestamp: new Date()
      });
    }
    
    res.json({ 
      success: true, 
      data: schedule,
      message: 'Schedule updated successfully'
    });

  } catch (error) {
    console.error('Update schedule error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to update schedule'
    });
  }
};

// Enhanced schedule deletion
const deleteSchedule = async (req, res) => {
  try {
    const schedule = await Schedule.findByIdAndDelete(req.params.id);
    
    if (!schedule) {
      return res.status(404).json({ 
        success: false, 
        message: 'Schedule not found' 
      });
    }

    // Log schedule deletion
    await AuditLog.create({
      action: 'SCHEDULE_DELETE',
      userId: req.user._id,
      targetId: schedule._id,
      targetType: 'SCHEDULE',
      details: { 
        scheduleName: schedule.name,
        deletedAt: new Date()
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Emit real-time update if socket.io is available
    if (req.app.get('socketio')) {
      req.app.get('socketio').emit('schedule-deleted', {
        scheduleId: schedule._id,
        scheduleName: schedule.name,
        message: `Schedule "${schedule.name}" deleted`,
        timestamp: new Date()
      });

      req.app.get('socketio').emit('content-refresh', {
        message: 'Schedule deleted, checking for content changes',
        timestamp: new Date()
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Schedule deleted successfully',
      data: { id: schedule._id, name: schedule.name }
    });

  } catch (error) {
    console.error('Delete schedule error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to delete schedule'
    });
  }
};

// COMPLETELY REWRITTEN: Use enhanced schema method for current schedule
const getCurrentScheduleForViewer = async (req, res) => {
  try {
    console.log('=== Getting Current Schedule for Viewer (Enhanced) ===');
    
    // Use the enhanced static method from the schema
    const activeSchedules = await Schedule.findCurrentlyActive();
    
    console.log(`Found ${activeSchedules.length} currently active schedules`);

    if (!activeSchedules.length) {
      return res.json({
        success: true,
        data: null,
        message: 'No schedule is currently active'
      });
    }

    // Get the highest priority schedule (they're already sorted by priority)
    const activeSchedule = activeSchedules[0];
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

    console.log(`✅ Returning content: ${contentToPlay.title} from schedule: ${activeSchedule.name}`);

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
          scheduleTimezone: activeSchedule.timezone,
          scheduleRepeat: activeSchedule.repeat,
          schedulePriority: activeSchedule.priority,
          deliveryTime: new Date()
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
    } catch (auditError) {
      console.error('Failed to log content delivery:', auditError);
    }

    // Return enhanced content data
    res.json({
      success: true,
      data: {
        ...contentToPlay,
        schedule: {
          _id: activeSchedule._id,
          name: activeSchedule.name,
          description: activeSchedule.description,
          priority: activeSchedule.priority,
          timezone: activeSchedule.timezone,
          repeat: activeSchedule.repeat,
          startTime: activeSchedule.startTime,
          endTime: activeSchedule.endTime
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

// NEW: Get schedule statistics
const getScheduleStatistics = async (req, res) => {
  try {
    const stats = await Schedule.getStatistics();
    
    // Get currently active schedules count
    const activeSchedules = await Schedule.findCurrentlyActive();
    
    res.json({
      success: true,
      data: {
        ...stats,
        currentlyActiveSchedules: activeSchedules.length,
        timestamp: new Date()
      }
    });

  } catch (error) {
    console.error('Get schedule statistics error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to get schedule statistics'
    });
  }
};

// NEW: Get schedules by timezone
const getSchedulesByTimezone = async (req, res) => {
  try {
    const timezone = req.params.timezone || 'Asia/Kolkata';
    const schedules = await Schedule.findByTimezone(timezone);
    
    res.json({
      success: true,
      data: schedules,
      timezone: timezone,
      count: schedules.length
    });

  } catch (error) {
    console.error('Get schedules by timezone error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to get schedules by timezone'
    });
  }
};

// Export all functions
module.exports = {
  createSchedule,
  getSchedules,
  getScheduleById,
  updateSchedule,
  deleteSchedule,
  getCurrentScheduleForViewer,
  getScheduleStatistics,
  getSchedulesByTimezone
};
