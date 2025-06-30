// services/contentService.js
const Schedule = require('../models/Schedule');
const Content = require('../models/Content');
const moment = require('moment-timezone');

class ContentService {
  constructor(io) {
    this.io = io;
    this.contentCache = new Map();
    this.lastContentUpdate = null;
    this.cacheTimeout = 30000; // 30 seconds
    console.log('📦 ContentService initialized');
  }

  async getCurrentContent() {
    try {
      const now = Date.now();
      
      if (this.lastContentUpdate && (now - this.lastContentUpdate) < this.cacheTimeout) {
        const cachedContent = this.contentCache.get('current');
        if (cachedContent) {
          return cachedContent;
        }
      }

      const content = await this.fetchCurrentContent();
      this.contentCache.set('current', content);
      this.lastContentUpdate = now;
      
      return content;
    } catch (error) {
      console.error('Error in getCurrentContent:', error);
      return null;
    }
  }

  async fetchCurrentContent() {
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
      console.error('Error fetching current content:', error);
      throw error;
    }
  }

  async broadcastCurrentContent() {
    try {
      const content = await this.getCurrentContent();
      const viewerCount = this.getViewerCount();

      this.io.to('viewers').emit('current-content-broadcast', {
        success: true,
        data: content,
        message: content ? 'Current content update' : 'No active content',
        timestamp: new Date(),
        viewerCount: viewerCount
      });

    } catch (error) {
      console.error('Error broadcasting content:', error);
      
      this.io.to('viewers').emit('current-content-broadcast', {
        success: false,
        data: null,
        message: 'Failed to get current content',
        error: error.message,
        timestamp: new Date()
      });
    }
  }

  getViewerCount() {
    try {
      const viewerRoom = this.io.sockets.adapter.rooms.get('viewers');
      return viewerRoom ? viewerRoom.size : 0;
    } catch (error) {
      return 0;
    }
  }

  cleanup() {
    this.contentCache.clear();
    this.lastContentUpdate = null;
  }
}

module.exports = ContentService;
