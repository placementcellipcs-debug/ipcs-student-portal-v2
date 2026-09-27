const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectSheet = require('./config/db');

// Load environment variables
dotenv.config();

const app = express();

// Configure CORS for local development and future production URLs
const allowedOrigins = [...new Set([
  ...(process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean),
  ...(process.env.NATIVE_APP_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean),
  'http://localhost:3000',
])];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Increase payload limit for base64 image/resume uploads
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Initialize DB Connection
connectSheet().catch((err) => {
    console.error("Warning: Initial connection check failed.", err.message);
});

// Health Check Route
app.get('/', (req, res) => {
    res.status(200).json({ status: 'Active', message: 'Talenzo API is running.' });
});

// We will mount our modular routes here in the next step
// app.use('/api/auth', authRoutes);
// app.use('/api/dashboard', dashboardRoutes);
const authRoutes = require('./routes/authRoutes');

// Mount routes
app.use('/api/auth', authRoutes);
// app.use('/api/dashboard', dashboardRoutes); // We will uncomment this when we build the dashboard controller

const dashboardRoutes = require('./routes/dashboardRoutes'); // <--- ADD THIS LINE

app.use('/api/dashboard', dashboardRoutes); // <--- UNCOMMENT OR ADD THIS LINE

const gamePalRoutes = require('./routes/gamePalRoutes');
app.use('/api/gamepal', gamePalRoutes);

const careerHubRoutes = require('./routes/careerHubRoutes');
app.use('/api/career-hub', careerHubRoutes);


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server executing on port ${PORT}`);
});
