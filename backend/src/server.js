require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./utils/db');
const listingsRouter = require('./routes/listings');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors({ 
  origin: process.env.FRONTEND_URL || 'http://localhost:5173' 
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/ping', (req, res) => {
  res.json({ 
    message: '🍁 MapleNest API is running!', 
    timestamp: new Date(),
    environment: process.env.NODE_ENV 
  });
});

app.use('/api/listings', listingsRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'Route not found' 
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    error: 'Something went wrong!' 
  });
});

app.listen(PORT, () => {
  console.log(`\n🍁 MapleNest API Server`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📡 Running on: http://localhost:${PORT}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Endpoints:`);
  console.log(`  GET  /ping                - Health check`);
  console.log(`  GET  /api/listings        - Get all listings`);
  console.log(`  POST /api/listings        - Create listing`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});
