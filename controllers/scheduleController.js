// controllers/scheduleController.js
const Schedule = require('../models/Schedule');

exports.createSchedule = async (req, res) => {
  try {
    const data = { ...req.body, createdBy: req.user._id };
    const schedule = await Schedule.create(data);
    await schedule.populate([
      { path:'content.contentId', select:'title type duration' },
      { path:'devices', select:'name deviceId location' },
      { path:'createdBy', select:'name email' }
    ]);
    res.status(201).json({ success:true, data: schedule });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success:false, message:e.message });
  }
};

exports.getSchedules = async (req, res) => {
  try {
    const page = +req.query.page||1, limit=+req.query.limit||10, skip=(page-1)*limit;
    let filter = {};
    if(req.query.isActive!==undefined) filter.isActive = req.query.isActive==='true';
    if(req.query.deviceId) filter.devices = req.query.deviceId;
    const schedules = await Schedule.find(filter)
      .populate(['content.contentId','devices','createdBy'])
      .sort({ createdAt:-1 }).skip(skip).limit(limit);
    const total = await Schedule.countDocuments(filter);
    res.json({ success:true, data:schedules, pagination:{page,limit,total,pages:Math.ceil(total/limit)} });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success:false, message:e.message });
  }
};

exports.getScheduleById = async (req, res) => {
  try {
    const s = await Schedule.findById(req.params.id).populate(['content.contentId','devices','createdBy']);
    if(!s) return res.status(404).json({ success:false, message:'Schedule not found' });
    res.json({ success:true, data:s });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success:false, message:e.message });
  }
};

exports.updateSchedule = async (req, res) => {
  try {
    console.log("Update payload content array:", req.body.content);
    const s = await Schedule.findByIdAndUpdate(req.params.id, req.body, { new:true, runValidators:true })
      .populate(['content.contentId','devices','createdBy']);
    if(!s) return res.status(404).json({ success:false, message:'Not found' });
    res.json({ success:true, data:s });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success:false, message:e.message });
  }
};

exports.deleteSchedule = async (req, res) => {
  try {
    const s = await Schedule.findByIdAndDelete(req.params.id);
    if(!s) return res.status(404).json({ success:false, message:'Not found' });
    res.json({ success:true, message:'Deleted' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success:false, message:e.message });
  }
};

exports.getCurrentScheduleForViewer = async (req, res) => {
  try {
    const now = new Date();
    const scheds = await Schedule.find({ isActive:true })
      .populate('content.contentId');
    const active = scheds.find(s => now>=s.startDateTime && now<=s.endDateTime);
    if(!active || !active.content.length) return res.json({ success:true, data:null, message:'No active schedule' });
    res.json({ success:true, data: active.content[0].contentId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success:false, message:'Server error' });
  }
};
