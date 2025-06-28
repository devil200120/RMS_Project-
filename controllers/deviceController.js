const Device = require('../models/Device');

const registerDevice = async (req, res) => {
  try {
    const deviceData = {
      ...req.body,
      registeredBy: req.user._id
    };

    const existingDevice = await Device.findOne({ deviceId: deviceData.deviceId });
    if (existingDevice) {
      return res.status(400).json({
        success: false,
        message: 'Device with this ID already exists'
      });
    }

    const device = await Device.create(deviceData);
    await device.populate('registeredBy', 'name email');

    res.status(201).json({
      success: true,
      data: device
    });
  } catch (error) {
    console.error('Register device error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const getDevices = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.location) filter.location = new RegExp(req.query.location, 'i');

    const devices = await Device.find(filter)
      .populate([
        { path: 'registeredBy', select: 'name email' },
        { path: 'currentSchedule', select: 'name startDate endDate' }
      ])
      .sort({ lastSeen: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Device.countDocuments(filter);

    res.json({
      success: true,
      data: devices,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get devices error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const getDeviceById = async (req, res) => {
  try {
    const device = await Device.findById(req.params.id)
      .populate([
        { path: 'registeredBy', select: 'name email' },
        { path: 'currentSchedule', select: 'name startDate endDate content' }
      ]);

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    res.json({
      success: true,
      data: device
    });
  } catch (error) {
    console.error('Get device by ID error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const updateDevice = async (req, res) => {
  try {
    const device = await Device.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate([
      { path: 'registeredBy', select: 'name email' },
      { path: 'currentSchedule', select: 'name startDate endDate' }
    ]);

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    res.json({
      success: true,
      data: device
    });
  } catch (error) {
    console.error('Update device error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const deleteDevice = async (req, res) => {
  try {
    const device = await Device.findByIdAndDelete(req.params.id);

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    res.json({
      success: true,
      message: 'Device deleted successfully'
    });
  } catch (error) {
    console.error('Delete device error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const sendCommand = async (req, res) => {
  try {
    const { command } = req.body;
    const device = await Device.findById(req.params.id);

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    // Here you would implement the actual command sending logic
    // For now, we'll just log the command and return success
    console.log(`Sending command '${command}' to device ${device.deviceId}`);

    // Update last seen timestamp
    device.lastSeen = new Date();
    await device.save();

    res.json({
      success: true,
      message: `Command '${command}' sent to device ${device.name}`,
      data: { command, deviceId: device.deviceId, timestamp: new Date() }
    });
  } catch (error) {
    console.error('Send command error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const updateHeartbeat = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { status, storageInfo, networkInfo } = req.body;

    const device = await Device.findOneAndUpdate(
      { deviceId },
      {
        lastHeartbeat: new Date(),
        lastSeen: new Date(),
        status: status || 'online',
        ...(storageInfo && { storageInfo }),
        ...(networkInfo && { networkInfo })
      },
      { new: true }
    );

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    res.json({
      success: true,
      message: 'Heartbeat updated',
      data: device
    });
  } catch (error) {
    console.error('Update heartbeat error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  registerDevice,
  getDevices,
  getDeviceById,
  updateDevice,
  deleteDevice,
  sendCommand,
  updateHeartbeat
};
