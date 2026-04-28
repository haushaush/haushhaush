// MFA helper utilities: token hashing, device fingerprint name, recovery code generation.
import { supabase } from '@/integrations/supabase/client';

export const TRUSTED_DEVICE_KEY = 'mfa-trusted-device-token';
export const TRUSTED_DEVICE_DAYS = 30;

export async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generateRecoveryCodes(count = 8): string[] {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  const block = () => Array.from({ length: 4 }, () => {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return alphabet[arr[0] % alphabet.length];
  }).join('');
  return Array.from({ length: count }, () => `${block()}-${block()}`);
}

export function getBrowserName(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Safari/')) return 'Safari';
  return 'Browser';
}

export function getOSName(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Mac OS')) return 'Mac';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('iPhone')) return 'iPhone';
  if (ua.includes('iPad')) return 'iPad';
  if (ua.includes('Android')) return 'Android';
  return 'Unknown';
}

export function getDeviceLabel(): string {
  return `${getBrowserName()} on ${getOSName()}`;
}

export async function isDeviceTrusted(userId: string, token: string): Promise<boolean> {
  if (!token) return false;
  const hash = await sha256Hex(token);
  const { data } = await supabase
    .from('mfa_trusted_devices')
    .select('id, trusted_until')
    .eq('user_id', userId)
    .eq('device_token_hash', hash)
    .gt('trusted_until', new Date().toISOString())
    .maybeSingle();
  return !!data;
}

export async function trustCurrentDevice(userId: string): Promise<void> {
  const token = crypto.randomUUID() + '-' + crypto.randomUUID();
  const hash = await sha256Hex(token);
  const trustedUntil = new Date(Date.now() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from('mfa_trusted_devices').insert({
    user_id: userId,
    device_token_hash: hash,
    device_name: getDeviceLabel(),
    user_agent: navigator.userAgent,
    trusted_until: trustedUntil,
  });
  if (!error) localStorage.setItem(TRUSTED_DEVICE_KEY, token);
}

export function clearTrustedDeviceLocal() {
  localStorage.removeItem(TRUSTED_DEVICE_KEY);
}
