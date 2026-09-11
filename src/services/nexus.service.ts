import axios from 'axios';
import { AppError } from '@/utils/app-error';
import { normalizePhone } from '@/utils/phone.util';

const NEXUS_BASE = process.env.NEXUS_BASE_URL || 'https://nexus.eandenterprise.com';
const AUTH_EMAIL = process.env.NEXUS_AUTH_EMAIL;
const AUTH_PASSWORD = process.env.NEXUS_AUTH_PASSWORD;

let cachedToken: string | null = null;
let tokenExpiry: number | null = null; // epoch ms

const clearCachedNexusToken = () => {
  cachedToken = null;
  tokenExpiry = null;
};

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
  let token = await loginToNexus();

  const send = async (authToken: string) => {
    const url = `${NEXUS_BASE}/api/v1/sms/send`;
    const rawRecipient = String(payload.recipient || '').trim();
    const normalizedRecipient = normalizePhone(rawRecipient) || rawRecipient;
    const inputPayload = { ...payload, recipient: normalizedRecipient };

    let finalCategory = inputPayload.category ?? 'TXN';
    const c = String(finalCategory).trim().toLowerCase();
    switch (c) {
      case 'tnx':
      case 'txn':
        finalCategory = 'TXN';
        break;
      case 'otp':
        finalCategory = 'OTP';
        break;
      case 'promo':
        finalCategory = 'Promo';
        break;
      case 'subscription':
        finalCategory = 'Subscription';
        break;
      case 'statutory':
        finalCategory = 'statutory';
        break;
      default:
        finalCategory = 'TXN';
    }

    const normalizedPayload = { ...inputPayload, category: finalCategory };
    if (inputPayload.category !== normalizedPayload.category) {
      console.debug('[Nexus] normalized category from', inputPayload.category, 'to', normalizedPayload.category);
    }

    console.debug('[Nexus] sendSms payload:', JSON.stringify(normalizedPayload));
    const headers: any = { 'Content-Type': 'application/json' };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    return axios.post(url, normalizedPayload, { headers, timeout: 10_000 });
  };

  try {
    const resp = await send(token);
    console.debug('[Nexus] sendSms response:', resp.status, resp.data);
    return resp.data;
  } catch (err: any) {
    const status = err?.response?.status;
    const respData = err?.response?.data;

    if (status === 401 || status === 403) {
      console.warn('[Nexus] token expired or rejected, clearing cached token and retrying once');
      clearCachedNexusToken();
      token = await loginToNexus();
      try {
        const retryResp = await send(token);
        console.debug('[Nexus] sendSms retry response:', retryResp.status, retryResp.data);
        return retryResp.data;
      } catch (retryErr: any) {
        const retryStatus = retryErr?.response?.status;
        const retryRespData = retryErr?.response?.data;
        const retryRemoteMsg = retryRespData?.message || retryRespData?.error || JSON.stringify(retryRespData || {});
        const retryMsg = retryRemoteMsg && retryRemoteMsg !== '{}' ? `Nexus sendSms failed: ${retryRemoteMsg}` : 'Failed to send SMS via Nexus';
        throw new AppError(retryMsg, retryStatus === 401 || retryStatus === 403 ? 403 : 502);
      }
    }

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
