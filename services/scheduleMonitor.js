// services/scheduleMonitor.js
const Schedule = require('../models/Schedule');
const Content = require('../models/Content');
const moment = require('moment-timezone');

class ScheduleMonitor {
  constructor(io) {
    this.io = io;
    this.lastCheckedSchedules = new Map();
    this.currentActiveSchedule = null;
    console.log('📡 ScheduleMonitor initialized');
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

      for (const schedule of activeSchedules) {
        const lastModified = new Date(schedule.updatedAt);
        const lastChecked = this.lastCheckedSchedules.get(schedule._id.toString());

        if (!lastChecked || lastModified > lastChecked) {
          hasChanges = true;
          this.lastCheckedSchedules.set(schedule._id.toString(), currentTime);
        }
      }

      const currentContent = await this.getCurrentActiveContent();
      const newActiveScheduleId = currentContent?.schedule?._id?.toString();
      const oldActiveScheduleId = this.currentActiveSchedule?._id?.toString();

      if (newActiveScheduleId !== oldActiveScheduleId) {
        this.currentActiveSchedule = currentContent?.schedule;
        
        this.io.to('viewers').emit('content-refresh', {
          message: 'Active schedule changed',
          newContent: currentContent,
          timestamp: new Date()
        });

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
      console.error('Error in schedule monitoring:', error);
    }
  }

  async getCurrentActiveContent() {
    try {
      const schedules = await Schedule.find({ isActive: true })
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

        const timezone = schedule.timezone || 'UTC';
        const nowInScheduleTimezone = nowUtc.clone().tz(timezone);

        const [startHour, startMinute] = schedule.startTime.split(':').map(Number);
        const [endHour, endMinute] = schedule.endTime.split(':').map(Number);

        let scheduleStart = moment.tz(schedule.startDate, timezone)
          .hour(startHour).minute(startMinute).second(0);

        let scheduleEnd = moment.tz(schedule.endDate, timezone)
          .hour(endHour).minute(endMinute).second(0);

        if (endHour < startHour || (endHour === startHour && endMinute <= startMinute)) {
          scheduleEnd.add(1, 'day');
        }

        const isWithinDateRange = nowInScheduleTimezone.isBetween(
          moment.tz(schedule.startDate, timezone).startOf('day'),
          moment.tz(schedule.endDate, timezone).endOf('day'),
          null, '[]'
        );

        const isWithinTimeRange = nowInScheduleTimezone.isBetween(scheduleStart, scheduleEnd, null, '[]');

        if (isWithinDateRange && isWithinTimeRange) {
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
          priority: activeSchedule.priority
        }
      };

    } catch (error) {
      console.error('Error getting current active content:', error);
      return null;
    }
  }

  cleanup() {
    this.lastCheckedSchedules.clear();
    this.currentActiveSchedule = null;
  }
}

module.exports = ScheduleMonitor;
