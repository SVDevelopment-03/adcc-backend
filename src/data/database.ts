import dns from 'node:dns';
import mongoose from 'mongoose';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isLikelyDnsSrvError = (error: unknown): boolean => {
  const code = (error as any)?.code as string | undefined;
  const message = (error as any)?.message as string | undefined;
  const syscall = (error as any)?.syscall as string | undefined;

  if (syscall === 'querySrv') return true;
  if (!code && !message) return false;

  // Common DNS-ish failures seen when resolving MongoDB Atlas SRV records
  if (code && ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEOUT'].includes(code)) {
    return true;
  }
  if (message && /querySrv|ENOTFOUND|EAI_AGAIN|ECONNREFUSED/i.test(message)) {
    return true;
  }
  return false;
};

export const connectDB = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not set');
  }

  const dnsServers = process.env.MONGODB_DNS_SERVERS
    ?.split(',')
    .map((server) => server.trim())
    .filter(Boolean);

  const maxRetries = Number(process.env.MONGODB_CONNECT_RETRIES ?? 3);
  const retryDelayMs = Number(process.env.MONGODB_CONNECT_RETRY_DELAY_MS ?? 2000);
  let lastError: unknown;
  let customDnsApplied = false;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      await mongoose.connect(mongoUri);
      console.log('MongoDB Connected');
      return;
    } catch (error) {
      lastError = error;
      console.error(
        `Database connection error (attempt ${attempt}/${maxRetries}):`,
        error
      );

      // Some environments (corp networks, Docker, locked-down hosts) block outbound DNS to 8.8.8.8/1.1.1.1.
      // Only switch to custom DNS as a *fallback* after seeing a DNS/SRV resolution failure.
      if (!customDnsApplied && dnsServers?.length && isLikelyDnsSrvError(error)) {
        dns.setServers(dnsServers);
        customDnsApplied = true;
        console.log(`Using custom DNS servers for MongoDB: ${dnsServers.join(', ')}`);
      }

      if (attempt < maxRetries) {
        await wait(retryDelayMs * attempt);
      }
    }
  }

  throw lastError;
};