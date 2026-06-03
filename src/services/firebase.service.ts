import admin from 'firebase-admin';
import { AppError } from '@/utils/app-error';
import path from 'path';

// Lazy initialization - only initialize when needed
const initializeFirebase = () => {
  if (!admin.apps.length) {
    let serviceAccount: admin.ServiceAccount;

    // Option 1: Use individual environment variables (preferred for cloud deployment)
    if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_PRIVATE_KEY &&
      process.env.FIREBASE_CLIENT_EMAIL
    ) {
      serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Replace literal \n with actual newlines
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        clientId: process.env.FIREBASE_CLIENT_ID,
        authUri: process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
        tokenUri: process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
        authProviderX509CertUrl:
          process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL ||
          'https://www.googleapis.com/oauth2/v1/certs',
        clientX509CertUrl: process.env.FIREBASE_CLIENT_X509_CERT_URL,
        universeDomain: process.env.FIREBASE_UNIVERSE_DOMAIN || 'googleapis.com',
      } as admin.ServiceAccount;
    }
    // Option 2: Use JSON string environment variable (alternative for cloud deployment)
    else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      } catch (error) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON');
      }
    }
    // Option 3: Use file path (for local development - deprecated, use env vars instead)
    else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const absolutePath = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      try {
        serviceAccount = require(absolutePath) as admin.ServiceAccount;
      } catch (error) {
        throw new Error(`Failed to load service account from ${absolutePath}. File may not exist or is invalid JSON.`);
      }
    } else {
      throw new Error(
        'Firebase service account not configured. Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL environment variables.'
      );
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log('Firebase Admin initialized');
  }
};

/**
 * Verify Firebase ID token and extract user info
 * Supports both mobile app (phone OTP) and web app (email/password) authentication
 * @param idToken - Firebase ID token from client (mobile app or web app)
 * @returns User UID and optional phone (for phone auth) or email (for email/password auth)
 */
export const verifyFirebaseToken = async (
  idToken: string
): Promise<{ uid: string; phone?: string; email?: string }> => {
  // Initialize Firebase if not already initialized
  initializeFirebase();

  // Basic token format validation
  if (!idToken || typeof idToken !== 'string') {
    throw new AppError('Firebase ID token is required', 400);
  }

  // Aggressive whitespace cleanup for Firebase ID tokens
  const trimmedToken = idToken
    .trim()
    .replace(/\r\n/g, '') // Remove Windows line endings
    .replace(/\n/g, '')   // Remove Unix line endings
    .replace(/\s+/g, ''); // Remove all whitespace

  // Log token details for debugging
  const preview = trimmedToken.slice(0, 50);
  const tokenLength = trimmedToken.length;
  const tokenParts = trimmedToken.split('.');
  const partCount = tokenParts.length;
  
  console.debug(`[FIREBASE TOKEN] length=${tokenLength}, parts=${partCount}, preview=${preview}...`);

  // Check if token looks like a JWT (has 3 parts separated by dots)
  if (partCount !== 3) {
    const detailedParts = tokenParts.map((p, i) => `[${i}]=${p.length}chars`).join(', ');
    console.error(`[FIREBASE TOKEN ERROR] Expected 3 parts, got ${partCount}. Parts: ${detailedParts}`);
    
    // Provide actionable error message
    const errorMsg = partCount > 3 
      ? `Token contains extra characters or formatting issues (${partCount} parts found). Ensure token is extracted cleanly from getIdToken().`
      : `Token appears incomplete or corrupted (${partCount} parts found instead of 3). Try refreshing the Firebase token.`;
    
    throw new AppError(
      `Invalid Firebase ID token format: ${errorMsg}`,
      400
    );
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(trimmedToken);

    return {
      uid: decodedToken.uid,
      phone: decodedToken.phone_number || undefined, // Present for phone authentication
      email: decodedToken.email || undefined, // Present for email/password authentication
    };
  } catch (error: any) {
    if (error instanceof AppError) {
      throw error;
    }
    
    // Log the actual Firebase error for debugging
    console.error('Firebase token verification error:', {
      code: error.code,
      message: error.message,
      error: error,
    });
    
    // Provide more specific error messages
    if (error.code === 'auth/id-token-expired') {
      throw new AppError('Firebase token has expired. Please login again.', 401);
    }
    if (error.code === 'auth/argument-error') {
      // auth/argument-error can mean invalid format OR invalid signature (wrong project)
      if (error.message?.includes('invalid signature')) {
        throw new AppError(
          'Firebase token signature is invalid. The token may be from a different Firebase project. ' +
          'Please ensure your service account key matches the project that issued this token.',
          401
        );
      }
      throw new AppError(
        'Invalid Firebase token format or signature. Ensure you are using the correct Firebase project. ' +
        'Error: ' + (error.message || 'Unknown format error'),
        401
      );
    }
    if (error.code === 'auth/id-token-revoked') {
      throw new AppError('Firebase token has been revoked', 401);
    }
    if (error.code === 'auth/project-not-found') {
      throw new AppError('Firebase project not found. Check your service account configuration.', 500);
    }
    
    throw new AppError(
      `Failed to verify Firebase token: ${error.message || error.code || 'Unknown error'}. ` +
      `Token format is valid but verification failed. Check Firebase configuration.`,
      401
    );
  }
};

/**
 * Create a Firebase user with email and password
 * Used for seeding admin users or creating users from backend
 * @param email - User's email address
 * @param password - User's password
 * @param displayName - Optional display name
 * @param emailVerified - Whether email is verified (default: true for seeded admins)
 * @returns Created Firebase user record with UID
 */
export const createFirebaseUser = async (
  email: string,
  password: string,
  displayName?: string,
  emailVerified: boolean = true
): Promise<admin.auth.UserRecord> => {
  // Initialize Firebase if not already initialized
  initializeFirebase();

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName,
      emailVerified, // Set to true for seeded admin users
      disabled: false,
    });

    return userRecord;
  } catch (error: any) {
    if (error.code === 'auth/email-already-exists') {
      throw new Error('User with this email already exists in Firebase');
    }
    if (error.code === 'auth/invalid-email') {
      throw new Error('Invalid email address');
    }
    if (error.code === 'auth/weak-password') {
      throw new Error('Password is too weak');
    }
    // Network connectivity errors
    if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
      throw new Error(
        'Cannot connect to Firebase servers. Check your internet connection, firewall settings, or proxy configuration.'
      );
    }
    if (error.code === 'ENOTFOUND' || error.message?.includes('ENOTFOUND')) {
      throw new Error(
        'Cannot resolve Firebase server address. Check your DNS settings and internet connection.'
      );
    }
    throw new Error(`Failed to create Firebase user: ${error.message || error.code || 'Unknown error'}`);
  }
};

/**
 * Get Firebase user by email
 * Used for seed scripts when user might already exist in Firebase
 * @param email - User's email address
 * @returns Firebase user record with UID
 */
export const getFirebaseUserByEmail = async (
  email: string
): Promise<admin.auth.UserRecord> => {
  // Initialize Firebase if not already initialized
  initializeFirebase();

  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    return userRecord;
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      throw new Error('User with this email not found in Firebase');
    }
    throw new Error(`Failed to get Firebase user: ${error.message}`);
  }
};

export interface WebPushPayload {
  title: string;
  body: string;
  url?: string;
}

export const sendWebPushNotification = async (
  tokens: string[],
  payload: WebPushPayload
): Promise<admin.messaging.BatchResponse> => {
  initializeFirebase();

  if (!tokens.length) {
    return {
      successCount: 0,
      failureCount: 0,
      responses: [],
    };
  }

  return admin.messaging().sendEachForMulticast({
    tokens,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    webpush: {
      notification: {
        title: payload.title,
        body: payload.body,
      },
      fcmOptions: payload.url ? { link: payload.url } : undefined,
    },
    data: payload.url ? { url: payload.url } : undefined,
  });
};
