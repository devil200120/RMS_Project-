const Content = require('../models/Content');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'uploads/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|mp4|avi|mov|webm|mkv/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images and videos are allowed.'));
  }
};

const upload = multer({ 
  storage,
  limits: { 
    fileSize: 500 * 1024 * 1024 // 500MB
  },
  fileFilter
});

const uploadContent = async (req, res) => {
  try {
    const { title, description, type, duration, url, htmlContent, tags } = req.body;
    
    let filePath = null;
    let fileSize = null;
    let mimeType = null;
    let checksum = null;

    if (req.file) {
      filePath = req.file.path;
      fileSize = req.file.size;
      mimeType = req.file.mimetype;
      
      // Generate checksum
      const fileBuffer = fs.readFileSync(req.file.path);
      checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    }

    const contentData = {
      title,
      description,
      type,
      duration: duration || 10,
      uploadedBy: req.user._id
    };

    if (filePath) {
      contentData.filePath = filePath;
      contentData.fileSize = fileSize;
      contentData.mimeType = mimeType;
      contentData.checksum = checksum;
    }

    if (url) contentData.url = url;
    if (htmlContent) contentData.htmlContent = htmlContent;
    if (tags) contentData.tags = JSON.parse(tags);

    const content = await Content.create(contentData);
    await content.populate('uploadedBy', 'name email');

    res.status(201).json({
      success: true,
      data: content
    });
  } catch (error) {
    console.error('Upload content error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

const getContent = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.search) {
      filter.$text = { $search: req.query.search };
    }

    const content = await Content.find(filter)
      .populate('uploadedBy', 'name email')
      .populate('approvedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Content.countDocuments(filter);

    res.json({
      success: true,
      data: content,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

const getContentById = async (req, res) => {
  try {
    const content = await Content.findById(req.params.id)
      .populate('uploadedBy', 'name email')
      .populate('approvedBy', 'name email');
      
    if (!content) {
      return res.status(404).json({ 
        success: false, 
        message: 'Content not found' 
      });
    }

    res.json({
      success: true,
      data: content
    });
  } catch (error) {
    console.error('Get content by ID error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

const updateContentStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    const updateData = { status };
    if (status === 'approved') {
      updateData.approvedBy = req.user._id;
      updateData.approvedAt = new Date();
    }

    const content = await Content.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('uploadedBy', 'name email')
     .populate('approvedBy', 'name email');
    
    if (!content) {
      return res.status(404).json({ 
        success: false, 
        message: 'Content not found' 
      });
    }
    
    res.json({
      success: true,
      data: content
    });
  } catch (error) {
    console.error('Update content status error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

const deleteContent = async (req, res) => {
  try {
    const content = await Content.findById(req.params.id);
    
    if (!content) {
      return res.status(404).json({ 
        success: false, 
        message: 'Content not found' 
      });
    }

    // Delete file if exists
    if (content.filePath && fs.existsSync(content.filePath)) {
      fs.unlinkSync(content.filePath);
    }

    await Content.findByIdAndDelete(req.params.id);
    
    res.json({ 
      success: true, 
      message: 'Content deleted successfully' 
    });
  } catch (error) {
    console.error('Delete content error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

module.exports = {
  upload,
  uploadContent,
  getContent,
  getContentById,
  updateContentStatus,
  deleteContent
};
