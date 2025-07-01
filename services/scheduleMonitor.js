// services/scheduleMonitor.js
const Schedule = require('../models/Schedule');
const moment = require('moment-timezone');

class ScheduleMonitor {
  constructor(io) {
    this.io = io;
    this.lastCheckedSchedules = new Map();
    this.currentActiveSchedule = null;
    this.checkInterval = null;
    console.log('📡 ScheduleMonitor initialized');
  }

  startMonitoring(interval = 30000) {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    this.checkInterval = setInterval(() => this.checkScheduleChanges(), interval);
    console.log(`⏱️ Schedule monitoring started (${interval}ms interval)`);
  }

  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('⏹️ Schedule monitoring stopped');
    }
  }

  async checkScheduleChanges() {
    try {
      const activeSchedules = await Schedule.find({ isActive: true })
        .populate({
          path: 'content.contentId',
          match: { status: 'approved' },
          select: 'title type duration filePath url htmlContent mimeType'
        })
        .lean();

      let hasChanges = false;
      const currentTime = new Date();

      // Check for schedule updates
      for (const schedule of activeSchedules) {
        const lastModified = new Date(schedule.updatedAt);
        const lastChecked = this.lastCheckedSchedules.get(schedule._id.toString());

        if (!lastChecked || lastModified > lastChecked) {
          hasChanges = true;
          this.lastCheckedSchedules.set(schedule._id.toString(), currentTime);
          console.log(`🔄 Schedule updated: ${schedule.name}`);
        }
      }

      // Check for active schedule changes
      const currentContent = await this.getCurrentActiveContent(activeSchedules);
      const newActiveScheduleId = currentContent?.schedule?._id?.toString();
      const oldActiveScheduleId = this.currentActiveSchedule?._id?.toString();

      if (newActiveScheduleId !== oldActiveScheduleId) {
        this.currentActiveSchedule = currentContent?.schedule;
        
        if (currentContent) {
          console.log(`🎬 New active schedule: ${currentContent.schedule.name}`);
          this.io.to('viewers').emit('content-refresh', {
            message: 'Active schedule changed',
            newContent: currentContent,
            timestamp: new Date()
          });
        } else {
          console.log('⏸️ No active schedule found');
          this.io.to('viewers').emit('content-refresh', {
            message: 'No active schedule',
            timestamp: new Date()
          });
        }

        hasChanges = true;
      }

      if (hasChanges) {
        this.io.emit('schedule-status-update', {
          activeSchedules: activeSchedules.length,
          currentlyActive: !!currentContent,
          lastCheck: currentTime
        });
      }

    } catch (error) {
      console.error('❌ Error in schedule monitoring:', error);
    }
  }

  async getCurrentActiveContent(activeSchedules = []) {
    try {
      // If not provided, fetch active schedules
      const schedules = activeSchedules.length 
        ? activeSchedules 
        : await Schedule.find({ isActive: true })
            .populate({
              path: 'content.contentId',
              match: { status: 'approved' },
              select: 'title type duration filePath url htmlContent mimeType'
            })
            .lean();

      if (!schedules.length) return null;

      const nowUtc = moment.utc();
      let activeSchedule = null;
      let bestPriority = 0;

      for (const schedule of schedules) {
        if (!schedule.content || !schedule.content.length) continue;

        const validContent = schedule.content.filter(c => c.contentId);
        if (!validContent.length) continue;

        // Use the model's isCurrentlyActive method
        const scheduleDoc = new Schedule(schedule);
        if (scheduleDoc.isCurrentlyActive()) {
          const priority = schedule.priority || 1;
          if (!activeSchedule || priority > bestPriority) {
            activeSchedule = schedule;
            bestPriority = priority;
          }
        }
      }

      if (!activeSchedule) return null;

      const validContent = activeSchedule.content.filter(c => c.contentId);
      const contentToPlay = validContent[0]?.contentId;

      if (!contentToPlay) return null;

      return {
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
      };

    } catch (error) {
      console.error('❌ Error getting current active content:', error);
      return null;
    }
  }

  cleanup() {
    this.lastCheckedSchedules.clear();
    this.currentActiveSchedule = null;
    this.stopMonitoring();
    console.log('🧹 ScheduleMonitor cleaned up');
  }
}

module.exports = ScheduleMonitor;
