import {
  AttendanceStatus,
  CongregationDatabase,
  Meeting,
  Publisher,
  ShepherdingVisit,
  SyncMetadata,
} from '../types';
import { getDeviceInfo } from './device';

export interface ServerSyncEventCallbacks {
  onAttendanceUpdated?: (data: {
    meetingId: string;
    attendance: Record<string, AttendanceStatus>;
    notes?: Record<string, string>;
    metadata?: SyncMetadata;
    lastUpdated?: string;
    sourceDeviceId?: string;
    sourceDeviceName?: string;
  }) => void;
  onDatabaseUpdated?: (data: {
    database: CongregationDatabase;
    sourceDeviceId?: string;
    sourceDeviceName?: string;
  }) => void;
  onPublisherUpdated?: (data: {
    publishers: Publisher[];
    lastUpdated?: string;
    sourceDeviceId?: string;
  }) => void;
  onMeetingUpdated?: (data: {
    meeting?: Meeting;
    meetingId?: string;
    meetings: Meeting[];
    attendance?: Record<string, Record<string, AttendanceStatus>>;
    attendanceNotes?: Record<string, Record<string, string>>;
    metadata?: SyncMetadata;
    lastUpdated?: string;
    sourceDeviceId?: string;
  }) => void;
  onPresenceChanged?: (connectedClients: number) => void;
  onConnectionStatusChange?: (isConnected: boolean) => void;
}

let activeEventSource: EventSource | null = null;
let reconnectTimer: any = null;
let isConnected = false;
let connectedDevicesCount = 1;

export function getIsServerConnected(): boolean {
  return isConnected;
}

export function getConnectedDevicesCount(): number {
  return connectedDevicesCount;
}

/**
 * Conecta ao fluxo Server-Sent Events (SSE) para receber alterações de outros aparelhos em tempo real
 */
export function subscribeToServerEvents(callbacks: ServerSyncEventCallbacks): () => void {
  const device = getDeviceInfo();

  function connect() {
    if (typeof window === 'undefined' || !window.EventSource) {
      return;
    }

    if (activeEventSource) {
      activeEventSource.close();
      activeEventSource = null;
    }

    const query = new URLSearchParams({
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      _t: String(Date.now()),
    }).toString();

    try {
      const es = new EventSource(`/api/sync/events?${query}`);
      activeEventSource = es;

      es.onopen = () => {
        isConnected = true;
        callbacks.onConnectionStatusChange?.(true);
      };

      es.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);

          if (payload.connectedClients !== undefined) {
            connectedDevicesCount = payload.connectedClients;
            callbacks.onPresenceChanged?.(payload.connectedClients);
          }

          if (payload.type === 'attendance_updated') {
            callbacks.onAttendanceUpdated?.(payload);
          } else if (payload.type === 'database_updated') {
            callbacks.onDatabaseUpdated?.(payload);
          } else if (payload.type === 'publisher_updated' || payload.type === 'publisher_deleted') {
            callbacks.onPublisherUpdated?.(payload);
          } else if (payload.type === 'meeting_updated' || payload.type === 'meeting_deleted') {
            callbacks.onMeetingUpdated?.(payload);
          }
        } catch (err) {
          console.warn('[SSE] Erro ao parsear mensagem:', err);
        }
      };

      es.onerror = () => {
        isConnected = false;
        callbacks.onConnectionStatusChange?.(false);
        es.close();
        activeEventSource = null;

        // Tenta reconectar em 2 segundos
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          connect();
        }, 2000);
      };
    } catch (err) {
      console.warn('[SSE] Falha ao iniciar EventSource:', err);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        connect();
      }, 3000);
    }
  }

  connect();

  return () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (activeEventSource) {
      activeEventSource.close();
      activeEventSource = null;
    }
    isConnected = false;
  };
}

/**
 * Helper resiliente para requisições JSON na API com re-tentativa automática
 * (resolve redirecionamentos 302 de cache de token e evita falhas falsas de conexão no iOS/Safari/Mobile)
 */
async function apiFetchJson<T = any>(
  path: string,
  options: RequestInit = {},
  requireSuccessField: boolean = false,
  maxAttempts: number = 3
): Promise<T | null> {
  const method = (options.method || 'GET').toUpperCase();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const separator = path.includes('?') ? '&' : '?';
      const url = `${path}${separator}_t=${Date.now()}&__storage_access_granted=1`;

      const res = await fetch(url, {
        ...options,
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          ...(options.headers || {}),
        },
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        // Se foi redirecionado para cookie_check ou warmup HTML, faz um GET /api/health para aquecer o cache de token do Nginx
        if (attempt < maxAttempts) {
          await fetch(`/api/health?_t=${Date.now()}&__storage_access_granted=1`, {
            credentials: 'include',
            cache: 'no-store',
          }).catch(() => {});
          await new Promise((r) => setTimeout(r, 180 * attempt));
          continue;
        }
        return null;
      }

      const data = await res.json();

      // Se um POST sofreu redirect 302 no Nginx (que converte POST em GET e aquece o cache),
      // data.success não será true na primeira tentativa; a segunda tentativa logo em seguida passa direto como POST!
      if (requireSuccessField && (!data || data.success !== true)) {
        if (attempt < maxAttempts && method !== 'GET') {
          await new Promise((r) => setTimeout(r, 80));
          continue;
        }
        return null;
      }

      isConnected = true;
      return data as T;
    } catch (err) {
      if (attempt < maxAttempts) {
        await fetch(`/api/health?_t=${Date.now()}&__storage_access_granted=1`, {
          credentials: 'include',
          cache: 'no-store',
        }).catch(() => {});
        await new Promise((r) => setTimeout(r, 200 * attempt));
        continue;
      }
      console.warn(`[ServerSync] Falha em ${method} ${path}:`, err);
      return null;
    }
  }
  return null;
}

/**
 * Busca o banco mais atual da congregação no servidor (sem cache)
 */
export async function fetchServerDatabase(): Promise<CongregationDatabase | null> {
  const data = await apiFetchJson<CongregationDatabase>('/api/database', { method: 'GET' }, false, 3);
  if (data && Array.isArray(data.publishers)) {
    return data;
  }
  return null;
}

/**
 * Polling rápido de 1 segundo para sincronismo simultâneo instantâneo entre todos os aparelhos
 */
export async function pollServerChanges(since: string): Promise<{
  changed: boolean;
  lastUpdated: string;
  connectedClients?: number;
  database?: CongregationDatabase;
} | null> {
  return await apiFetchJson(
    `/api/sync/poll?since=${encodeURIComponent(since || '')}`,
    { method: 'GET' },
    false,
    1
  );
}

/**
 * Salva ou atualiza a chamada de uma reunião específica no servidor (com suporte a changes atômicos)
 */
export async function sendAttendanceToServer(
  meetingId: string,
  attendanceMap: Record<string, AttendanceStatus>,
  notesMap?: Record<string, string>,
  editorInfo?: { deviceId: string; deviceName: string; description?: string },
  changes?: Array<{ pid: string; st: AttendanceStatus | null; note?: string }>
): Promise<boolean> {
  const device = editorInfo || getDeviceInfo();
  const data = await apiFetchJson(
    '/api/sync/attendance',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meetingId,
        attendanceMap,
        notesMap,
        changes,
        editorInfo: {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          description: editorInfo?.description || 'Chamada atualizada',
        },
      }),
    },
    true,
    3
  );
  return Boolean(data && data.success);
}

/**
 * Salva ou atualiza o banco completo no servidor
 */
export async function sendDatabaseToServer(database: CongregationDatabase): Promise<boolean> {
  const device = getDeviceInfo();
  const data = await apiFetchJson(
    '/api/database',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...database,
        sourceDeviceId: device.deviceId,
        sourceDeviceName: device.deviceName,
      }),
    },
    true,
    3
  );
  return Boolean(data && data.success);
}

/**
 * Salva ou atualiza um publicador no servidor
 */
export async function sendPublisherToServer(publisher: Publisher): Promise<boolean> {
  const device = getDeviceInfo();
  const data = await apiFetchJson(
    '/api/sync/publisher',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publisher,
        editorInfo: {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
        },
      }),
    },
    true,
    3
  );
  return Boolean(data && data.success);
}

/**
 * Exclui um publicador no servidor
 */
export async function deletePublisherOnServer(publisherId: string): Promise<boolean> {
  const device = getDeviceInfo();
  const data = await apiFetchJson(
    `/api/sync/publisher/${publisherId}?deviceId=${encodeURIComponent(device.deviceId)}`,
    {
      method: 'DELETE',
    },
    true,
    3
  );
  return Boolean(data && data.success);
}

/**
 * Salva ou atualiza uma reunião no servidor (com presença inicial opcional)
 */
export async function sendMeetingToServer(
  meeting: Meeting,
  initialAttendance?: Record<string, AttendanceStatus>,
  initialNotes?: Record<string, string>
): Promise<boolean> {
  const device = getDeviceInfo();
  const data = await apiFetchJson(
    '/api/sync/meeting',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meeting,
        initialAttendance,
        initialNotes,
        editorInfo: {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
        },
      }),
    },
    true,
    3
  );
  return Boolean(data && data.success);
}

/**
 * Exclui uma reunião no servidor
 */
export async function deleteMeetingOnServer(meetingId: string): Promise<boolean> {
  const device = getDeviceInfo();
  const data = await apiFetchJson(
    `/api/sync/meeting/${meetingId}?deviceId=${encodeURIComponent(device.deviceId)}`,
    {
      method: 'DELETE',
    },
    true,
    3
  );
  return Boolean(data && data.success);
}

/**
 * Salva visita de pastoreio no servidor
 */
export async function sendShepherdingToServer(visit: ShepherdingVisit): Promise<boolean> {
  const device = getDeviceInfo();
  const data = await apiFetchJson(
    '/api/sync/shepherding',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visit,
        editorInfo: {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
        },
      }),
    },
    true,
    3
  );
  return Boolean(data && data.success);
}

/**
 * Solicita ao servidor restaurar e assegurar as reuniões de Terça-feira e Sábado
 */
export async function restoreTuesdaySaturdayOnServer(): Promise<CongregationDatabase | null> {
  try {
    const res = await fetch('/api/restore-tuesday-saturday', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.database || null;
  } catch (err) {
    console.warn('[ServerSync] Erro ao solicitar restauração no servidor:', err);
    return null;
  }
}

/**
 * Busca lista de snapshots de backup disponíveis no servidor
 */
export async function getServerBackups(): Promise<Array<{ filename: string; timestamp: number; isoDate: string; size: number }>> {
  try {
    const res = await fetch('/api/backups');
    if (!res.ok) return [];
    const json = await res.json();
    return json.backups || [];
  } catch {
    return [];
  }
}

/**
 * Restaura um snapshot específico no servidor
 */
export async function restoreServerBackup(filename: string): Promise<CongregationDatabase | null> {
  try {
    const res = await fetch(`/api/backups/restore/${encodeURIComponent(filename)}`, {
      method: 'POST',
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.database || null;
  } catch {
    return null;
  }
}

