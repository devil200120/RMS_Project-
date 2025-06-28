const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Device name is required'],
    trim: true
  },
  deviceId: {
    type: String,
    required: [true, 'Device ID is required'],
    unique: true,
    trim: true
  },
  location: {
    type: String,
    trim: true
  },
  model: String,
  resolution: {
    width: Number,
    height: Number
  },
  os: {
    type: String,
    default: 'Tizen'
  },
  version: String,
  status: {
    type: String,
    enum: ['online', 'offline', 'maintenance', 'error'],
    default: 'offline'
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  lastHeartbeat: Date,
  currentSchedule: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Schedule'
  },
  storageInfo: {
    total: Number,
    used: Number,
    available: Number
  },
  networkInfo: {
    ip: String,
    mac: String,
    ssid: String
  },
  registeredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  settings: {
    volume: {
      type: Number,
      default: 50,
      min: 0,
      max: 100
    },
    brightness: {
      type: Number,
      default: 80,
      min: 0,
      max: 100
    },
    autoUpdate: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true
});

deviceSchema.index({ deviceId: 1 });
deviceSchema.index({ status: 1 });

module.exports = mongoose.model('Device', deviceSchema);
