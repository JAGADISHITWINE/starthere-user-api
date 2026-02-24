const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./src/routes/auth.routes');
require('dotenv').config();
const app = express();
const path = require('path');

// Basic hardening
app.disable('x-powered-by');
app.use(helmet());

// Rate limiting to mitigate brute force / abuse
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10), // limit each IP
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(express.json({ limit: '1mb' })); // Middleware to parse JSON request bodies

// CORS - restrict via env variable (comma-separated), fallback to localhost dev origins
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:4200,http://localhost:8100')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: function(origin, callback){
    // allow requests with no origin (like mobile apps or curl)
    if(!origin) return callback(null, true);
    if(allowedOrigins.indexOf(origin) === -1){
      const msg = 'The CORS policy for this site does not allow access from the specified origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  }
}));

// Apply rate limiter on API routes
app.use('/api/', apiLimiter);

// Use auth routes
app.use('/api/auth', authRoutes);

// Default route
app.get('/', (req, res) => {
  res.send('Server is running...');
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Start the server with a safe default port
const PORT = process.env.PORT || 4002;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
