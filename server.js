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


// Import error handler
const errorHandler = require('./middleware/errorHandler');

dotenv.config();


const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: process.env.CLIENT_URL || "http://localhost:3000", 
    methods: ["GET", "POST", "PUT", "DELETE"] 
  }
});

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);


// Security middleware
app.use(helmet({ 
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false // Disable for development, configure properly for production
}));

app.use(cors({ 
  origin: process.env.CLIENT_URL || "http://localhost:3000", 
  credentials: true 
}));

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Data sanitization against NoSQL query injection
app.use(expressMongoSanitize());

// Rate limiting
const limiter = rateLimit({ 
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Database connection with better error handling
mongoose.connect(process.env.MONGO_URI, { 
  useNewUrlParser: true, 
  useUnifiedTopology: true,
  maxPoolSize: 10, // Maintain up to 10 socket connections
  serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
  socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
 
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => {
  console.error('Database connection error:', err);
  process.exit(1);
});

// Mongoose connection event handlers
mongoose.connection.on('error', err => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await mongoose.connection.close();
  process.exit(0);
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/content', require('./routes/content'));
app.use('/api/schedules', require('./routes/schedules'));
app.use('/api/devices', require('./routes/devices'));
app.use('/api/licenses', require('./routes/licenses'));
app.use('/api/audit', require('./routes/Audit.js'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Socket.io for real-time updates
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  
  socket.on('join-room', (userId) => {
    socket.join(`user-${userId}`);
    console.log(`User ${userId} joined their room`);
  });
  
  // Content events
  socket.on('content-updated', (data) => {
    io.emit('content-refresh', data);
  });
  
  // Schedule events
  socket.on('schedule-updated', (data) => {
    io.emit('schedule-refresh', data);
  });
  
  // Device events
  socket.on('device-updated', (data) => {
    io.emit('device-refresh', data);
  });
  
  // License events
  socket.on('license-updated', (data) => {
    io.emit('license-refresh', data);
  });
  
  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});


const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log(`Unhandled Promise Rejection: ${err.message}`);
  // Close server & exit process
  server.close(() => {
    process.exit(1);
  });
});
