const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const compression = require('compression');
const expressMongoSanitize = require('@exortek/express-mongo-sanitize');
const cron = require('node-cron');

// Import services and middleware
const errorHandler = require('./middleware/errorHandler');
const ScheduleMonitor = require('./services/scheduleMonitor');
const ContentService = require('./services/contentService');

dotenv.config();

const app = express();
const server = http.createServer(app);

// Production-ready Socket.IO configuration
const io = new Server(server, {
  cors: { 
    origin: process.env.NODE_ENV === 'production' 
      ? [process.env.CLIENT_URL, `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`]
      : ["http://localhost:3000", "http://localhost:5173"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

app.set('socketio', io);
app.set('trust proxy', 1);

// Security and performance middleware
app.use(helmet({ 
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false
}));

app.use(cors({ 
  origin: process.env.NODE_ENV === 'production'
    ? [process.env.CLIENT_URL, `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`]
    : ["http://localhost:3000", "http://localhost:5173"],
  credentials: true
}));

app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(expressMongoSanitize());

// Rate limiting
const limiter = rateLimit({ 
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 200 : 100,
  message: { success: false, message: 'Too many requests' }
});
app.use('/api/', limiter);

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/schedules', require('./routes/schedules'));


// Database connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000
})
.then(() => {
  console.log('✅ MongoDB connected successfully');
  // Initialize services after DB connection
  scheduleMonitor = new ScheduleMonitor(io);
  contentService = new ContentService(io);
  setupCronJobs();
})
.catch(err => {
  console.error('❌ Database connection error:', err);
  process.exit(1);
});

// Initialize services
let scheduleMonitor;
let contentService;

// Enhanced Socket.IO connection handling
const connectedUsers = new Map();
const viewerSessions = new Map();

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);
  
  socket.on('join-room', (userData) => {
    const { userId, role, name } = userData;
    
    connectedUsers.set(socket.id, {
      userId, role, name,
      joinedAt: new Date(),
      lastActivity: new Date()
    });
    
    socket.join(`role-${role}`);
    socket.join(`user-${userId}`);
    
    if (role === 'VIEWER') {
      viewerSessions.set(socket.id, {
        userId, name,
        connectedAt: new Date(),
        lastContentRequest: null
      });
      socket.join('viewers');
      
      // Send immediate content check to new viewer
      socket.emit('content-refresh', {
        message: 'Checking for scheduled content...',
        timestamp: new Date()
      });
    }
    
    // Broadcast user count update
    io.emit('user-count-update', {
      total: connectedUsers.size,
      viewers: viewerSessions.size,
      timestamp: new Date()
    });
  });
  
  socket.on('request-current-content', async (data) => {
    const userInfo = connectedUsers.get(socket.id);
    if (!userInfo || userInfo.role !== 'VIEWER') {
      socket.emit('error', { message: 'Unauthorized' });
      return;
    }
    
    try {
      const content = await contentService.getCurrentContent();
      socket.emit('current-content-response', {
        success: true,
        data: content,
        timestamp: new Date()
      });
    } catch (error) {
      socket.emit('current-content-response', {
        success: false,
        message: 'Failed to get content',
        timestamp: new Date()
      });
    }
  });
  
  socket.on('content-updated', (data) => {
    const userInfo = connectedUsers.get(socket.id);
    if (userInfo && ['ADMIN', 'MANAGER'].includes(userInfo.role)) {
      socket.broadcast.emit('content-refresh', {
        message: 'Content updated',
        updatedBy: userInfo.name,
        timestamp: new Date()
      });
    }
  });
  
  socket.on('schedule-updated', (data) => {
    const userInfo = connectedUsers.get(socket.id);
    if (userInfo && ['ADMIN', 'MANAGER'].includes(userInfo.role)) {
      socket.broadcast.emit('schedule-refresh', {
        message: 'Schedule updated',
        updatedBy: userInfo.name,
        timestamp: new Date()
      });
      
      io.to('viewers').emit('content-refresh', {
        message: 'Schedule updated, checking content',
        timestamp: new Date()
      });
    }
  });
  
  socket.on('disconnect', (reason) => {
    const userInfo = connectedUsers.get(socket.id);
    if (userInfo) {
      if (userInfo.role === 'VIEWER') {
        viewerSessions.delete(socket.id);
      }
      connectedUsers.delete(socket.id);
      
      io.emit('user-count-update', {
        total: connectedUsers.size,
        viewers: viewerSessions.size,
        timestamp: new Date()
      });
    }
  });
});

// Cron jobs for real-time monitoring
function setupCronJobs() {
  // Check schedule changes every 30 seconds
  cron.schedule('*/30 * * * * *', () => {
    if (scheduleMonitor) {
      scheduleMonitor.checkScheduleChanges();
    }
  });

  // Broadcast content every 5 minutes
  cron.schedule('0 */5 * * * *', () => {
    if (contentService && viewerSessions.size > 0) {
      contentService.broadcastCurrentContent();
    }
  });
}

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/content', require('./routes/content'));
app.use('/api/schedules', require('./routes/schedules'));
app.use('/api/devices', require('./routes/devices'));
app.use('/api/licenses', require('./routes/licenses'));
app.use('/api/audit', require('./routes/Audit'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server running',
    timestamp: new Date(),
    uptime: process.uptime(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    connections: {
      total: connectedUsers.size,
      viewers: viewerSessions.size
    }
  });
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  if (scheduleMonitor) scheduleMonitor.cleanup();
  if (contentService) contentService.cleanup();
  io.close();
  await mongoose.connection.close();
  server.close(() => process.exit(0));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app, server, io };
