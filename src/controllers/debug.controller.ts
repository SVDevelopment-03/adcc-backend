import { Request, Response } from 'express';
import axios from 'axios';
import { asyncHandler } from '@/utils/async-handler';
import { sendSuccess } from '@/utils/response';

/**
 * GET /v1/debug/public-ip
 * Returns the public IP address seen by external services.
 */
export const getPublicIp = asyncHandler(async (_req: Request, res: Response) => {
  try {
    // Use a reliable external service to fetch public IP
    const resp = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
    const ip = resp.data?.ip || null;
    sendSuccess(res, { ip }, 'Public IP retrieved');
  } catch (err) {
    // Fallback: attempt another service
    try {
      const resp = await axios.get('https://ifconfig.co/json', { timeout: 5000 });
      const ip = resp.data?.ip || null;
      sendSuccess(res, { ip }, 'Public IP retrieved (via fallback)');
    } catch (err2) {
      // If both fail, return an informative error response
      throw new Error('Failed to determine public IP from external services');
    }
  }
});
