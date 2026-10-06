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
    sourceDeviceId?: string;
  }) => void;
  onMeetingUpdated?: (data: {
    meetings: Meeting[];
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

        // Tenta reconectar em 3 segundos
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          connect();
        }, 3000);
      };
    } catch (err) {
      console.warn('[SSE] Falha ao iniciar EventSource:', err);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        connect();
      }, 5000);
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
 * Busca o banco mais atual da congregação no servidor
 */
export async function fetchServerDatabase(): Promise<CongregationDatabase | null> {
  try {
    const res = await fetch('/api/database', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data as CongregationDatabase;
  } catch (err) {
    console.warn('[ServerSync] Falha ao obter banco do servidor:', err);
    return null;
  }
}

/**
 * Salva ou atualiza a chamada de uma reunião específica no servidor
 */
export async function sendAttendanceToServer(
  meetingId: string,
  attendanceMap: Record<string, AttendanceStatus>,
  notesMap?: Record<string, string>,
  editorInfo?: { deviceId: string; deviceName: string; description?: string }
): Promise<boolean> {
  try {
    const device = editorInfo || getDeviceInfo();
    const res = await fetch('/api/sync/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meetingId,
        attendanceMap,
        notesMap,
        editorInfo: {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          description: editorInfo?.description || 'Chamada atualizada',
        },
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn('[ServerSync] Erro ao enviar chamada ao servidor:', err);
    return false;
  }
}

/**
 * Salva ou atualiza o banco completo no servidor
 */
export async function sendDatabaseToServer(database: CongregationDatabase): Promise<boolean> {
  try {
    const device = getDeviceInfo();
    const res = await fetch('/api/database', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...database,
        sourceDeviceId: device.deviceId,
        sourceDeviceName: device.deviceName,
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn('[ServerSync] Erro ao enviar banco completo ao servidor:', err);
    return false;
  }
}

/**
 * Salva ou atualiza um publicador no servidor
 */
export async function sendPublisherToServer(publisher: Publisher): Promise<boolean> {
  try {
    const device = getDeviceInfo();
    const res = await fetch('/api/sync/publisher', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publisher,
        editorInfo: {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
        },
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn('[ServerSync] Erro ao sincronizar publicador:', err);
    return false;
  }
}

/**
 * Exclui um publicador no servidor
 */
export async function deletePublisherOnServer(publisherId: string): Promise<boolean> {
  try {
    const device = getDeviceInfo();
    const res = await fetch(`/api/sync/publisher/${publisherId}?deviceId=${device.deviceId}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch (err) {
    console.warn('[ServerSync] Erro ao excluir publicador no servidor:', err);
    return false;
  }
}

/**
 * Salva ou atualiza uma reunião no servidor
 */
export async function sendMeetingToServer(meeting: Meeting): Promise<boolean> {
  try {
    const device = getDeviceInfo();
    const res = await fetch('/api/sync/meeting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meeting,
        editorInfo: {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
        },
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn('[ServerSync] Erro ao sincronizar reunião:', err);
    return false;
  }
}

/**
 * Exclui uma reunião no servidor
 */
export async function deleteMeetingOnServer(meetingId: string): Promise<boolean> {
  try {
    const device = getDeviceInfo();
    const res = await fetch(`/api/sync/meeting/${meetingId}?deviceId=${device.deviceId}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch (err) {
    console.warn('[ServerSync] Erro ao excluir reunião no servidor:', err);
    return false;
  }
}

/**
 * Salva visita de pastoreio no servidor
 */
export async function sendShepherdingToServer(visit: ShepherdingVisit): Promise<boolean> {
  try {
    const device = getDeviceInfo();
    const res = await fetch('/api/sync/shepherding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visit,
        editorInfo: {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
        },
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn('[ServerSync] Erro ao sincronizar pastoreio:', err);
    return false;
  }
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

