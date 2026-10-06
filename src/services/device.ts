import { DeviceInfo } from '../types';

const DEVICE_ID_KEY = 'jw_attendance_device_id';
const DEVICE_NAME_KEY = 'jw_attendance_device_name';

function detectDefaultDeviceName(): string {
  if (typeof window === 'undefined') return 'Aparelho';

  const ua = window.navigator.userAgent;
  if (/iPhone/i.test(ua)) return 'iPhone do Irmão';
  if (/iPad/i.test(ua)) return 'iPad do Salão';
  if (/Android/i.test(ua)) return 'Celular Android';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'PC Windows';

  // Fallback com número curto
  const randomNum = Math.floor(10 + Math.random() * 89);
  return `Aparelho #${randomNum}`;
}

export function getDeviceInfo(): DeviceInfo {
  if (typeof window === 'undefined') {
    return { deviceId: 'server', deviceName: 'Servidor', deviceType: 'desktop' };
  }

  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `dev-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  let deviceName = localStorage.getItem(DEVICE_NAME_KEY);
  if (!deviceName) {
    deviceName = detectDefaultDeviceName();
    localStorage.setItem(DEVICE_NAME_KEY, deviceName);
  }

  const ua = window.navigator.userAgent;
  let deviceType: 'mobile' | 'tablet' | 'desktop' = 'mobile';
  if (/iPad|Tablet/i.test(ua)) {
    deviceType = 'tablet';
  } else if (/Macintosh|Windows|Linux/i.test(ua) && !/Mobile|Android/i.test(ua)) {
    deviceType = 'desktop';
  }

  return { deviceId, deviceName, deviceType };
}

export function saveDeviceName(name: string): DeviceInfo {
  const trimmed = name.trim();
  const validName = trimmed.length > 0 ? trimmed : detectDefaultDeviceName();
  localStorage.setItem(DEVICE_NAME_KEY, validName);
  const info = getDeviceInfo();
  return { ...info, deviceName: validName };
}

export const updateDeviceName = saveDeviceName;

export function formatRelativeTime(isoString?: string): string {
  if (!isoString) return 'recentemente';
  try {
    const diffSeconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diffSeconds < 5) return 'agora mesmo';
    if (diffSeconds < 60) return `há ${diffSeconds} segundos`;
    const minutes = Math.floor(diffSeconds / 60);
    if (minutes === 1) return 'há 1 minuto';
    if (minutes < 60) return `há ${minutes} minutos`;
    const hours = Math.floor(minutes / 60);
    if (hours === 1) return 'há 1 hora';
    if (hours < 24) return `há ${hours} horas`;
    return new Date(isoString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'recentemente';
  }
}
