const mongoose = require('mongoose');

const contentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  type: {
    type: String,
    enum: ['video', 'image', 'url', 'html'],
    required: [true, 'Content type is required']
  },
  filePath: {
    type: String,
    required: function() {
      return this.type !== 'url' && this.type !== 'html';
    }
  },
  url: {
    type: String,
    required: function() {
      return this.type === 'url';
    }
  },
  htmlContent: {
    type: String,
    required: function() {
      return this.type === 'html';
    }
  },
  duration: {
    type: Number,
    default: 10,
    min: [1, 'Duration must be at least 1 second'],
    max: [3600, 'Duration cannot exceed 1 hour']
  },
  fileSize: Number,
  mimeType: String,
  checksum: String,
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  tags: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true
});

contentSchema.index({ title: 'text', description: 'text', tags: 'text' });

module.exports = mongoose.model('Content', contentSchema);
