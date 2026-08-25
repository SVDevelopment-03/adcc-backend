import axios from 'axios';
import { AppError } from '@/utils/app-error';

const NEXUS_BASE = process.env.NEXUS_BASE_URL || 'https://nexus.eandenterprise.com';
const AUTH_EMAIL = process.env.NEXUS_AUTH_EMAIL;
const AUTH_PASSWORD = process.env.NEXUS_AUTH_PASSWORD;

let cachedToken: string | null = null;
let tokenExpiry: number | null = null; // epoch ms

const loginToNexus = async (): Promise<string> => {
  // Return cached token if still valid (with small safety margin)
  if (cachedToken && tokenExpiry && Date.now() + 30_000 < tokenExpiry) {
    return cachedToken;
  }

  if (!AUTH_EMAIL || !AUTH_PASSWORD) {
    throw new AppError('Nexus auth not configured (NEXUS_AUTH_EMAIL/NEXUS_AUTH_PASSWORD)', 500);
  }

  try {
    const url = `${NEXUS_BASE}/api/v1/accounts/users/login`;
    const resp = await axios.post(url, { email: AUTH_EMAIL, password: AUTH_PASSWORD }, { timeout: 10_000 });
    const data = resp.data || {};

    // Try common token locations
    const token = data.token || data.accessToken || data.access_token || data.data?.token;
    const expiresIn = data.expiresIn || data.expires_in || data.expires || 60 * 60; // seconds fallback

    if (!token || typeof token !== 'string') {
      throw new AppError('Failed to obtain Nexus auth token: unexpected response', 500);
    }

    cachedToken = token;
    tokenExpiry = Date.now() + Number(expiresIn) * 1000;
    return token;
  } catch (err: any) {
    const respData = err?.response?.data;
    const status = err?.response?.status;
    console.error('Nexus login error', { status, respData, message: err.message });

    // If nexus returns structured error message, surface it for easier debugging
    const remoteMsg = respData?.message || respData?.error || JSON.stringify(respData || {});
    const msg = remoteMsg && remoteMsg !== '{}' ? `Nexus login failed: ${remoteMsg}` : 'Failed to authenticate with Nexus SMS gateway';

    // If it's an auth/whitelist error from nexus, use 403 to indicate forbidden
    const code = status === 401 || status === 403 ? 403 : 502;
    throw new AppError(msg, code);
  }
};

export const sendSmsViaNexus = async (payload: { msg: string; recipient: string; sender: string; category?: string }) => {
  const token = await loginToNexus();
  try {
    const url = `${NEXUS_BASE}/api/v1/sms/send`;
    const headers: any = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const resp = await axios.post(url, payload, { headers, timeout: 10_000 });
    return resp.data;
  } catch (err: any) {
    const respData = err?.response?.data;
    const status = err?.response?.status;
    console.error('Nexus sendSms error', { status, respData, message: err.message });

    const remoteMsg = respData?.message || respData?.error || JSON.stringify(respData || {});
    const msg = remoteMsg && remoteMsg !== '{}' ? `Nexus sendSms failed: ${remoteMsg}` : 'Failed to send SMS via Nexus';
    const code = status === 401 || status === 403 ? 403 : 502;
    throw new AppError(msg, code);
  }
};

export default {
  loginToNexus,
  sendSmsViaNexus,
};
