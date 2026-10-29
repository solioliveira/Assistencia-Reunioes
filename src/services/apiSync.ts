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
    deletedPublisherIds?: string[];
    lastUpdated?: string;
    sourceDeviceId?: string;
  }) => void;
  onMeetingUpdated?: (data: {
    meeting?: Meeting;
    meetingId?: string;
    meetings: Meeting[];
    deletedMeetingIds?: string[];
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

let initialServerBuildId: string | null = null;

function encodeBase64Json(obj: unknown): string {
  try {
    const json = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch {
    return '';
  }
}

function encodeCompactAttendance(
  attMap: Record<string, AttendanceStatus | null> | undefined
): string {
  if (!attMap) return '';
  const parts: string[] = [];
  for (const [pid, st] of Object.entries(attMap)) {
    if (!pid) continue;
    const code =
      st === 'presencial'
        ? 'p'
        : st === 'zoom'
        ? 'z'
        : st === 'ausente'
        ? 'a'
        : '_';
    parts.push(`${pid}:${code}`);
  }
  return parts.join(',');
}

async function pushOpViaGet(params: Record<string, string>): Promise<boolean> {
  const device = getDeviceInfo();
  const query = new URLSearchParams({
    ...params,
    did: params.did || device.deviceId,
    dnm: params.dnm || device.deviceName,
  });
  const res = await apiFetchJson<{ success?: boolean }>(
    `/api/sync/push-op?${query.toString()}`,
    { method: 'GET' },
    true,
    2
  );
  return Boolean(res && res.success);
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
export async function pollServerChanges(
  since: string,
  meetingsCount?: number,
  publishersCount?: number
): Promise<{
  changed: boolean;
  buildId?: string;
  lastUpdated: string;
  connectedClients?: number;
  meetingsCount?: number;
  database?: CongregationDatabase;
} | null> {
  const params = new URLSearchParams({
    since: since || '',
  });
  if (typeof meetingsCount === 'number' && meetingsCount >= 0) {
    params.set('mc', String(meetingsCount));
  }
  if (typeof publishersCount === 'number' && publishersCount >= 0) {
    params.set('pc', String(publishersCount));
  }
  const res = await apiFetchJson<{
    changed: boolean;
    buildId?: string;
    lastUpdated: string;
    connectedClients?: number;
    meetingsCount?: number;
    database?: CongregationDatabase;
  }>(`/api/sync/poll?${params.toString()}`, { method: 'GET' }, false, 1);

  if (res && res.buildId) {
    if (!initialServerBuildId) {
      initialServerBuildId = res.buildId;
    } else if (initialServerBuildId !== res.buildId) {
      initialServerBuildId = res.buildId;
      if (typeof window !== 'undefined') {
        const lastBuildReload = Number(sessionStorage.getItem('jw_build_reload_ts') || '0');
        if (Date.now() - lastBuildReload > 15000) {
          sessionStorage.setItem('jw_build_reload_ts', String(Date.now()));
          window.location.reload();
        }
      }
    }
  }

  return res;
}

/**
 * Salva ou atualiza a chamada de uma reunião específica no servidor (com suporte a changes atômicos + fallback GET)
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
    1
  );
  if (data && data.success) {
    return true;
  }

  // Fallback GET imune a proxy 302
  if (Array.isArray(changes) && changes.length > 0 && changes.length <= 40) {
    const deltaAtt: Record<string, AttendanceStatus | null> = {};
    const deltaNotes: Record<string, string> = {};
    for (const ch of changes) {
      deltaAtt[ch.pid] = ch.st;
      if (ch.note !== undefined) deltaNotes[ch.pid] = ch.note;
    }
    return await pushOpViaGet({
      op: 'att',
      mid: meetingId,
      mode: 'delta',
      a: encodeCompactAttendance(deltaAtt),
      n: Object.keys(deltaNotes).length > 0 ? encodeBase64Json(deltaNotes) : '',
      did: device.deviceId,
      dnm: device.deviceName,
      desc: editorInfo?.description || 'Chamada atualizada',
    });
  }

  return await pushOpViaGet({
    op: 'att',
    mid: meetingId,
    mode: 'full',
    a: encodeCompactAttendance(attendanceMap),
    n: notesMap && Object.keys(notesMap).length > 0 ? encodeBase64Json(notesMap) : '',
    did: device.deviceId,
    dnm: device.deviceName,
    desc: editorInfo?.description || 'Chamada atualizada',
  });
}

/**
 * Salva ou atualiza o banco completo no servidor e retorna o banco unificado autoritativo
 */
export async function sendDatabaseToServer(
  database: CongregationDatabase
): Promise<CongregationDatabase | null> {
  const device = getDeviceInfo();
  const data = await apiFetchJson<{
    success: boolean;
    lastUpdated?: string;
    database?: CongregationDatabase;
  }>(
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
    1
  );
  if (data && data.success) {
    return data.database || database;
  }

  // Fallback resiliente via GET /api/sync/push-op caso POST grande seja bloqueado/redirecionado pelo proxy
  try {
    const srvDb = await fetchServerDatabase();
    const srvDelMeets = new Set(srvDb?.deletedMeetingIds || []);
    const srvDelPubs = new Set(srvDb?.deletedPublisherIds || []);

    // 1. Sincroniza exclusões de reuniões locais
    for (const delMid of database.deletedMeetingIds || []) {
      if (!srvDelMeets.has(delMid)) {
        await pushOpViaGet({ op: 'del_meet', mid: delMid });
      }
    }

    // 2. Sincroniza exclusões de publicadores locais
    for (const delPid of database.deletedPublisherIds || []) {
      if (!srvDelPubs.has(delPid)) {
        await pushOpViaGet({ op: 'del_pub', pid: delPid });
      }
    }

    // 3. Sincroniza reuniões e presenças que faltam ou mudaram no servidor
    const srvMeetsMap = new Map((srvDb?.meetings || []).map((m) => [m.id, m]));
    for (const m of database.meetings || []) {
      if (srvDelMeets.has(m.id)) continue;
      const localAtt = database.attendance?.[m.id] || {};
      const localNotes = database.attendanceNotes?.[m.id] || {};
      const srvAtt = srvDb?.attendance?.[m.id] || {};
      const srvNotes = srvDb?.attendanceNotes?.[m.id] || {};

      const isMissingOnServer = !srvMeetsMap.has(m.id);
      const attDiffers =
        JSON.stringify(localAtt) !== JSON.stringify(srvAtt) ||
        JSON.stringify(localNotes) !== JSON.stringify(srvNotes);

      if (isMissingOnServer || attDiffers) {
        await pushOpViaGet({
          op: 'meet',
          m: encodeBase64Json(m),
          a: encodeCompactAttendance(localAtt),
          n: Object.keys(localNotes).length > 0 ? encodeBase64Json(localNotes) : '',
        });
      }
    }

    // 4. Sincroniza publicadores novos ou editados (ex: telefone adicionado)
    const srvPubsMap = new Map((srvDb?.publishers || []).map((p) => [p.id, p]));
    for (const p of database.publishers || []) {
      if (srvDelPubs.has(p.id)) continue;
      const srvP = srvPubsMap.get(p.id);
      if (!srvP || JSON.stringify(srvP) !== JSON.stringify(p)) {
        await pushOpViaGet({
          op: 'pub',
          p: encodeBase64Json(p),
        });
      }
    }

    const updatedSrvDb = await fetchServerDatabase();
    return updatedSrvDb || database;
  } catch (err) {
    console.warn('[ServerSync] Erro no fallback GET de sendDatabaseToServer:', err);
    return null;
  }
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
    1
  );
  if (data && data.success) return true;

  return await pushOpViaGet({
    op: 'pub',
    p: encodeBase64Json(publisher),
  });
}

/**
 * Exclui um publicador no servidor
 */
export async function deletePublisherOnServer(publisherId: string): Promise<boolean> {
  const device = getDeviceInfo();
  const data = await apiFetchJson(
    `/api/sync/publisher/delete/${encodeURIComponent(publisherId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: device.deviceId }),
    },
    true,
    1
  );
  if (data && data.success) return true;

  return await pushOpViaGet({
    op: 'del_pub',
    pid: publisherId,
  });
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
    1
  );
  if (data && data.success) return true;

  return await pushOpViaGet({
    op: 'meet',
    m: encodeBase64Json(meeting),
    a: initialAttendance ? encodeCompactAttendance(initialAttendance) : '',
    n: initialNotes && Object.keys(initialNotes).length > 0 ? encodeBase64Json(initialNotes) : '',
  });
}

/**
 * Exclui uma reunião no servidor
 */
export async function deleteMeetingOnServer(meetingId: string): Promise<boolean> {
  const device = getDeviceInfo();
  const data = await apiFetchJson(
    `/api/sync/meeting/delete/${encodeURIComponent(meetingId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: device.deviceId }),
    },
    true,
    1
  );
  if (data && data.success) return true;

  return await pushOpViaGet({
    op: 'del_meet',
    mid: meetingId,
  });
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
    2
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

