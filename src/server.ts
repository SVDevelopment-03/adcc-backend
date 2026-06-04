import dotenv from 'dotenv';

// Load environment variables FIRST, before any other imports
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import mongoose from 'mongoose';
import { connectDB } from './data/database';
import routes from './routes';
import { errorHandler } from './middleware/error.middleware';
import { notFound } from './middleware/not-found.middleware';
import { languageMiddleware } from './middleware/language.middleware';
import { requireDbReady } from './middleware/db-ready.middleware';
import { startEventNotificationScheduler } from './services/event-notification.service';
import { startChallengeNotificationScheduler } from './services/challenge-notification.service';
import { startCommunityRideNotificationScheduler } from './services/community-ride-notification.service';

const app = express();
const PORT = process.env.PORT || 3000;
const API_VERSION = process.env.API_VERSION || 'v1';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowAllOrigins = process.env.ALLOW_ALL_ORIGINS === 'true';
const mobileOrigins = new Set([
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
  'https://localhost',
  'http://127.0.0.1',
  'https://127.0.0.1',
]);

const corsOptions: cors.CorsOptions = {
  credentials: true,
  origin: (origin, callback) => {
    
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowAllOrigins || allowedOrigins.includes(origin) || mobileOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Not allowed by CORS'));
  },
};

  const startNotificationSchedulers = () => {
    startEventNotificationScheduler();
    startChallengeNotificationScheduler();
    startCommunityRideNotificationScheduler();
  };

  const startNotificationSchedulersWhenDbReady = () => {
    if (mongoose.connection.readyState === 1) {
      startNotificationSchedulers();
      return;
    }

    mongoose.connection.once('connected', () => {
      startNotificationSchedulers();
    });
  };


app.use(helmet());
app.use(cors(corsOptions));
app.use(compression());
app.use(morgan('dev'));
// Increase body size limit to handle base64 images (50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));


app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || 'unknown',
    commit: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || 'unknown',
    branch: process.env.RENDER_GIT_BRANCH || process.env.BRANCH_NAME || 'unknown',
    service: process.env.RENDER_SERVICE_NAME || 'local',
  });
});

// Routes with explicit language short code: /v1/en/* or /v1/ar/*
app.use(`/${API_VERSION}/en`, requireDbReady, languageMiddleware, routes);
app.use(`/${API_VERSION}/ar`, requireDbReady, languageMiddleware, routes);

// Backward-compatible routes without language short code
app.use(`/${API_VERSION}`, requireDbReady, languageMiddleware, routes);

// Error handling
app.use(notFound as any);
app.use(errorHandler as any);

const startServer = async () => {
  const isProduction = process.env.NODE_ENV === 'production';

  // In production we fail fast (so the process manager can restart).
  // In development we keep the server up so the frontend doesn't see "ERR_CONNECTION_REFUSED",
  // and we retry DB connection in the background.
  if (isProduction) {
    try {
      await connectDB();
      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
      });
      return;
    } catch (error) {
      console.error('Failed to start server due to database connection error:', error);
      process.exit(1);
    }
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  const retryDelayMs = 10_000;
  const connectLoop = async () => {
    try {
      await connectDB();
      return;
    } catch (error) {
      console.error('Database not connected yet. Retrying...', error);
      setTimeout(connectLoop, retryDelayMs);
    }
  };

  // Avoid Mongoose buffering commands forever while DB isn't connected.
  mongoose.set('bufferCommands', false);
  connectLoop();
};

startServer();
startNotificationSchedulersWhenDbReady();
