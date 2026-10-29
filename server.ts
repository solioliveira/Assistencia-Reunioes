import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { INITIAL_DATABASE } from './src/services/sampleData';
import {
  AttendanceStatus,
  CongregationDatabase,
  Meeting,
  Publisher,
  ShepherdingVisit,
  SyncMetadata,
} from './src/types';

const PORT = 3000;
const DATA_FILE = path.join(process.cwd(), 'data', 'congregation.json');
const BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');

// Garante que o diretório data e backups existam
if (!fs.existsSync(path.join(process.cwd(), 'data'))) {
  fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });
}
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Carrega ou inicializa o banco no servidor
let currentDatabase: CongregationDatabase;
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    currentDatabase = JSON.parse(raw);
    console.log('[Server] Banco de dados congregacional carregado de:', DATA_FILE);
  } else {
    currentDatabase = { ...INITIAL_DATABASE, lastUpdated: new Date().toISOString() };
    fs.writeFileSync(DATA_FILE, JSON.stringify(currentDatabase, null, 2), 'utf-8');
    console.log('[Server] Banco de dados congregacional inicializado com dados oficiais.');
  }
} catch (err) {
  console.error('[Server] Erro ao ler banco local, usando inicial:', err);
  currentDatabase = { ...INITIAL_DATABASE, lastUpdated: new Date().toISOString() };
}

let lastBackupSnapshotTime = 0;

function persistDatabaseToDisk() {
  try {
    const serialized = JSON.stringify(currentDatabase, null, 2);
    fs.writeFileSync(DATA_FILE, serialized, 'utf-8');

    // Snapshot automático de backup com rotação (máximo 1 snapshot a cada 30s para não bloquear I/O em tempo real)
    const now = Date.now();
    if (now - lastBackupSnapshotTime > 30000) {
      lastBackupSnapshotTime = now;
      setImmediate(() => {
        try {
          const backupFile = path.join(BACKUP_DIR, `snapshot-${now}.json`);
          fs.writeFileSync(backupFile, serialized, 'utf-8');

          const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith('snapshot-')).sort();
          if (files.length > 50) {
            for (let i = 0; i < files.length - 50; i++) {
              try {
                fs.unlinkSync(path.join(BACKUP_DIR, files[i]));
              } catch {}
            }
          }
        } catch {}
      });
    }
  } catch (err) {
    console.error('[Server] Falha ao persistir em disco:', err);
  }
}

// Gerenciador de clientes conectados via Server-Sent Events (SSE)
type SseClient = {
  id: string;
  res: Response;
  deviceId?: string;
  deviceName?: string;
};

const sseClients = new Set<SseClient>();
const SSE_FLUSH_PADDING = `: ${' '.repeat(2048)}\n\n`;
const SERVER_BUILD_ID = `v4-${Date.now()}`;

interface RequestLogEntry {
  ts: string;
  method: string;
  url: string;
  ua: string;
  origin: string;
}
const recentRequestsLog: RequestLogEntry[] = [];

function decodeBase64Json<T = any>(b64: string | undefined): T | null {
  if (!b64) return null;
  try {
    const json = Buffer.from(b64, 'base64').toString('utf-8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function parseCompactAttendance(
  compact: string | undefined
): Record<string, AttendanceStatus | null> {
  const result: Record<string, AttendanceStatus | null> = {};
  if (!compact || typeof compact !== 'string') return result;
  const pairs = compact.split(',');
  for (const pair of pairs) {
    if (!pair) continue;
    const idx = pair.lastIndexOf(':');
    if (idx <= 0) continue;
    const pid = pair.slice(0, idx);
    const code = pair.slice(idx + 1);
    if (code === 'p' || code === 'presencial') result[pid] = 'presencial';
    else if (code === 'z' || code === 'zoom') result[pid] = 'zoom';
    else if (code === 'a' || code === 'ausente') result[pid] = 'ausente';
    else if (code === '_' || code === 'null') result[pid] = null;
  }
  return result;
}

function broadcastSseEvent(eventData: Record<string, any>, excludeDeviceId?: string) {
  const payload = `data: ${JSON.stringify(eventData)}\n\n${SSE_FLUSH_PADDING}`;
  for (const client of sseClients) {
    if (excludeDeviceId && client.deviceId === excludeDeviceId) {
      continue;
    }
    try {
      client.res.write(payload);
      if (typeof (client.res as any).flush === 'function') {
        (client.res as any).flush();
      }
    } catch {
      sseClients.delete(client);
    }
  }
}

async function startServer() {
  const app = express();

  // Middlewares para parsing de JSON
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Desabilita qualquer cache HTTP e habilita CORS completo nas rotas da API para garantir sincronismo simultâneo em iPhones/iPads/Android
  app.use('/api', (req: Request, res: Response, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Accept, Cache-Control, Pragma, Authorization, X-Requested-With'
    );
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    if (req.path !== '/sync/poll' && req.path !== '/debug/logs') {
      recentRequestsLog.push({
        ts: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl.slice(0, 180),
        ua: String(req.headers['user-agent'] || '').slice(0, 80),
        origin: String(req.headers.origin || req.headers.referer || '').slice(0, 80),
      });
      if (recentRequestsLog.length > 60) {
        recentRequestsLog.shift();
      }
    }

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    next();
  });

  // Desabilita e remove qualquer Service Worker antigo que possa interceptar rotas de autenticação ou API no iOS/Android/Mac
  const SELF_DESTRUCT_SW = `
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        await self.clients.claim();
      } catch (e) {}
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (e) {}
      let clients = [];
      try {
        clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      } catch (e) {}
      try {
        await self.registration.unregister();
      } catch (e) {}
      for (const client of clients) {
        try {
          if ('navigate' in client) {
            await client.navigate(client.url);
          }
        } catch (e) {}
      }
    })()
  );
});
`;

  app.get(['/sw.js', '/dev-sw.js', '/workbox-*.js'], (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.send(SELF_DESTRUCT_SW);
  });

  app.get('/registerSW.js', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.send(`
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const r of regs) r.unregister();
  }).catch(() => {});
}
`);
  });

  // ==========================================
  // API ROUTES
  // ==========================================

  // 1. Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      buildId: SERVER_BUILD_ID,
      timestamp: new Date().toISOString(),
      connectedClients: sseClients.size,
      meetingsCount: currentDatabase.meetings?.length || 0,
      lastUpdated: currentDatabase.lastUpdated,
    });
  });

  app.get('/api/debug/logs', (req: Request, res: Response) => {
    res.json({
      buildId: SERVER_BUILD_ID,
      connectedClients: sseClients.size,
      meetingsCount: currentDatabase.meetings?.length || 0,
      meetingIds: (currentDatabase.meetings || []).map((m) => m.id),
      deletedMeetingIds: currentDatabase.deletedMeetingIds || [],
      lastUpdated: currentDatabase.lastUpdated,
      recentRequests: recentRequestsLog,
    });
  });

  // 2. Status da sincronização e aparelhos conectados
  app.get('/api/sync/status', (req: Request, res: Response) => {
    res.json({
      success: true,
      buildId: SERVER_BUILD_ID,
      connectedClients: sseClients.size,
      lastUpdated: currentDatabase.lastUpdated,
      meetingsCount: currentDatabase.meetings?.length || 0,
      syncMetadata: currentDatabase.syncMetadata,
    });
  });

  // 2b. Polling ultra-leve de 1 segundo para sincronismo simultâneo instantâneo
  app.get('/api/sync/poll', (req: Request, res: Response) => {
    const since = (req.query.since as string) || '';
    const mc = req.query.mc !== undefined ? Number(req.query.mc) : -1;
    const pc = req.query.pc !== undefined ? Number(req.query.pc) : -1;
    const serverMeetingsCount = currentDatabase.meetings?.length || 0;
    const serverPublishersCount = currentDatabase.publishers?.length || 0;

    const changed =
      !since ||
      since !== currentDatabase.lastUpdated ||
      (mc >= 0 && mc !== serverMeetingsCount) ||
      (pc >= 0 && pc !== serverPublishersCount);

    if (!changed) {
      return res.json({
        changed: false,
        buildId: SERVER_BUILD_ID,
        lastUpdated: currentDatabase.lastUpdated,
        connectedClients: sseClients.size,
        meetingsCount: serverMeetingsCount,
      });
    }
    return res.json({
      changed: true,
      buildId: SERVER_BUILD_ID,
      lastUpdated: currentDatabase.lastUpdated,
      connectedClients: sseClients.size,
      meetingsCount: serverMeetingsCount,
      database: currentDatabase,
    });
  });

  // 2c. Endpoint GET/POST resiliente (/api/sync/push-op) imune a redirecionamentos 302 de proxies mobile
  const handlePushOp = (req: Request, res: Response) => {
    try {
      const params = { ...(req.query as Record<string, string>), ...(req.body || {}) };
      const op = params.op;
      const did = params.did || 'aparelho';
      const dnm = params.dnm || 'Aparelho';
      const nowIso = new Date().toISOString();

      if (op === 'meet') {
        const meeting = decodeBase64Json<Meeting>(params.m);
        if (!meeting || !meeting.id || !meeting.date) {
          return res.status(400).json({ error: 'Reunião inválida em push-op.' });
        }

        if (Array.isArray(currentDatabase.deletedMeetingIds)) {
          currentDatabase.deletedMeetingIds = currentDatabase.deletedMeetingIds.filter(
            (id) => id !== meeting.id
          );
        }

        const idx = currentDatabase.meetings.findIndex((m) => m.id === meeting.id);
        if (idx >= 0) {
          currentDatabase.meetings[idx] = { ...currentDatabase.meetings[idx], ...meeting };
        } else {
          currentDatabase.meetings.unshift(meeting);
        }
        currentDatabase.meetings.sort((a, b) =>
          String(b.date || '').localeCompare(String(a.date || ''))
        );

        if (params.a !== undefined) {
          const parsedAtt = parseCompactAttendance(params.a);
          if (!currentDatabase.attendance) currentDatabase.attendance = {};
          const nextAtt: Record<string, AttendanceStatus> = {
            ...(currentDatabase.attendance[meeting.id] || {}),
          };
          for (const [pid, st] of Object.entries(parsedAtt)) {
            if (st) nextAtt[pid] = st;
            else delete nextAtt[pid];
          }
          currentDatabase.attendance[meeting.id] = nextAtt;
        }

        if (params.n !== undefined) {
          const parsedNotes = decodeBase64Json<Record<string, string>>(params.n);
          if (parsedNotes && typeof parsedNotes === 'object') {
            if (!currentDatabase.attendanceNotes) currentDatabase.attendanceNotes = {};
            currentDatabase.attendanceNotes[meeting.id] = {
              ...(currentDatabase.attendanceNotes[meeting.id] || {}),
              ...parsedNotes,
            };
          }
        }

        currentDatabase.lastUpdated = nowIso;
        currentDatabase.syncMetadata = {
          lastEditorDeviceId: did,
          lastEditorDeviceName: dnm,
          lastEditedAt: nowIso,
          lastEditedMeetingId: meeting.id,
          lastEditedDescription: `Reunião ${meeting.date} sincronizada`,
        };
        persistDatabaseToDisk();

        broadcastSseEvent(
          {
            type: 'meeting_updated',
            meeting,
            meetings: currentDatabase.meetings,
            deletedMeetingIds: currentDatabase.deletedMeetingIds,
            attendance: currentDatabase.attendance,
            attendanceNotes: currentDatabase.attendanceNotes,
            metadata: currentDatabase.syncMetadata,
            lastUpdated: nowIso,
            sourceDeviceId: did,
          },
          did
        );

        return res.json({
          success: true,
          lastUpdated: nowIso,
          meetingsCount: currentDatabase.meetings.length,
        });
      }

      if (op === 'att') {
        const mid = params.mid;
        if (!mid) {
          return res.status(400).json({ error: 'mid obrigatório em op=att.' });
        }
        const mode = params.mode || 'full';
        const parsedAtt = parseCompactAttendance(params.a);
        const parsedNotes = decodeBase64Json<Record<string, string>>(params.n);

        if (!currentDatabase.attendance) currentDatabase.attendance = {};
        if (!currentDatabase.attendanceNotes) currentDatabase.attendanceNotes = {};

        if (mode === 'delta') {
          const curAtt = { ...(currentDatabase.attendance[mid] || {}) };
          for (const [pid, st] of Object.entries(parsedAtt)) {
            if (st) curAtt[pid] = st;
            else delete curAtt[pid];
          }
          currentDatabase.attendance[mid] = curAtt;

          if (parsedNotes && typeof parsedNotes === 'object') {
            const curNotes = { ...(currentDatabase.attendanceNotes[mid] || {}) };
            for (const [pid, note] of Object.entries(parsedNotes)) {
              if (note && note.trim()) curNotes[pid] = note.trim();
              else delete curNotes[pid];
            }
            currentDatabase.attendanceNotes[mid] = curNotes;
          }
        } else {
          const nextAtt: Record<string, AttendanceStatus> = {};
          for (const [pid, st] of Object.entries(parsedAtt)) {
            if (st) nextAtt[pid] = st;
          }
          currentDatabase.attendance[mid] = nextAtt;
          if (parsedNotes && typeof parsedNotes === 'object') {
            currentDatabase.attendanceNotes[mid] = { ...parsedNotes };
          }
        }

        const metadata: SyncMetadata = {
          lastEditorDeviceId: did,
          lastEditorDeviceName: dnm,
          lastEditedAt: nowIso,
          lastEditedMeetingId: mid,
          lastEditedDescription: params.desc || 'Chamada atualizada',
        };
        currentDatabase.syncMetadata = metadata;
        currentDatabase.lastUpdated = nowIso;
        persistDatabaseToDisk();

        broadcastSseEvent(
          {
            type: 'attendance_updated',
            meetingId: mid,
            attendance: currentDatabase.attendance[mid] || {},
            notes: currentDatabase.attendanceNotes[mid] || {},
            metadata,
            lastUpdated: nowIso,
            sourceDeviceId: did,
            sourceDeviceName: dnm,
          },
          did
        );

        return res.json({
          success: true,
          lastUpdated: nowIso,
          metadata,
        });
      }

      if (op === 'del_meet') {
        const mid = params.mid;
        if (!mid) return res.status(400).json({ error: 'mid obrigatório.' });
        currentDatabase.deletedMeetingIds = Array.from(
          new Set([...(currentDatabase.deletedMeetingIds || []), mid])
        );
        currentDatabase.meetings = currentDatabase.meetings.filter((m) => m.id !== mid);
        if (currentDatabase.attendance) delete currentDatabase.attendance[mid];
        if (currentDatabase.attendanceNotes) delete currentDatabase.attendanceNotes[mid];
        currentDatabase.lastUpdated = nowIso;
        persistDatabaseToDisk();

        broadcastSseEvent(
          {
            type: 'meeting_deleted',
            meetingId: mid,
            meetings: currentDatabase.meetings,
            deletedMeetingIds: currentDatabase.deletedMeetingIds,
            attendance: currentDatabase.attendance,
            attendanceNotes: currentDatabase.attendanceNotes,
            lastUpdated: nowIso,
            sourceDeviceId: did,
          },
          did
        );

        return res.json({
          success: true,
          lastUpdated: nowIso,
          meetingsCount: currentDatabase.meetings.length,
        });
      }

      if (op === 'pub') {
        const publisher = decodeBase64Json<Publisher>(params.p);
        if (!publisher || !publisher.id || !publisher.name) {
          return res.status(400).json({ error: 'Publicador inválido.' });
        }
        if (Array.isArray(currentDatabase.deletedPublisherIds)) {
          currentDatabase.deletedPublisherIds = currentDatabase.deletedPublisherIds.filter(
            (id) => id !== publisher.id
          );
        }
        const idx = currentDatabase.publishers.findIndex((p) => p.id === publisher.id);
        if (idx >= 0) {
          currentDatabase.publishers[idx] = { ...currentDatabase.publishers[idx], ...publisher };
        } else {
          currentDatabase.publishers.push(publisher);
        }
        currentDatabase.lastUpdated = nowIso;
        persistDatabaseToDisk();

        broadcastSseEvent(
          {
            type: 'publisher_updated',
            publisher,
            publishers: currentDatabase.publishers,
            deletedPublisherIds: currentDatabase.deletedPublisherIds,
            lastUpdated: nowIso,
            sourceDeviceId: did,
          },
          did
        );

        return res.json({ success: true, lastUpdated: nowIso });
      }

      if (op === 'del_pub') {
        const pid = params.pid;
        if (!pid) return res.status(400).json({ error: 'pid obrigatório.' });
        currentDatabase.deletedPublisherIds = Array.from(
          new Set([...(currentDatabase.deletedPublisherIds || []), pid])
        );
        currentDatabase.publishers = currentDatabase.publishers.filter((p) => p.id !== pid);
        if (currentDatabase.attendance) {
          Object.keys(currentDatabase.attendance).forEach((mid) => {
            if (currentDatabase.attendance[mid]) delete currentDatabase.attendance[mid][pid];
          });
        }
        if (currentDatabase.attendanceNotes) {
          Object.keys(currentDatabase.attendanceNotes).forEach((mid) => {
            if (currentDatabase.attendanceNotes![mid]) delete currentDatabase.attendanceNotes![mid][pid];
          });
        }
        currentDatabase.lastUpdated = nowIso;
        persistDatabaseToDisk();

        broadcastSseEvent(
          {
            type: 'publisher_deleted',
            publisherId: pid,
            publishers: currentDatabase.publishers,
            deletedPublisherIds: currentDatabase.deletedPublisherIds,
            lastUpdated: nowIso,
            sourceDeviceId: did,
          },
          did
        );

        return res.json({ success: true, lastUpdated: nowIso });
      }

      return res.status(400).json({ error: 'Operação desconhecida.' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Erro em push-op' });
    }
  };

  app.get('/api/sync/push-op', handlePushOp);
  app.post('/api/sync/push-op', handlePushOp);

  // 3. Obter banco completo da congregação
  app.get('/api/database', (req: Request, res: Response) => {
    res.json(currentDatabase);
  });

  // 4. Salvar banco completo ou sincronizar simultaneamente todos os aparelhos (com união inteligente de reuniões e publicadores)
  app.post('/api/database', (req: Request, res: Response) => {
    try {
      const incoming = req.body as CongregationDatabase;
      if (!incoming || typeof incoming !== 'object') {
        return res.status(400).json({ error: 'Formato de banco inválido.' });
      }

      const nowIso = new Date().toISOString();
      const sourceDeviceId = req.body?.sourceDeviceId;
      const sourceDeviceName = req.body?.sourceDeviceName;

      // 1. União de IDs excluídos explicitamente (tombstones)
      const deletedMeetingIds = Array.from(
        new Set([
          ...(currentDatabase.deletedMeetingIds || []),
          ...(Array.isArray(incoming.deletedMeetingIds) ? incoming.deletedMeetingIds : []),
        ])
      );
      const deletedPublisherIds = Array.from(
        new Set([
          ...(currentDatabase.deletedPublisherIds || []),
          ...(Array.isArray(incoming.deletedPublisherIds) ? incoming.deletedPublisherIds : []),
        ])
      );
      const deletedMeetSet = new Set(deletedMeetingIds);
      const deletedPubSet = new Set(deletedPublisherIds);

      // 2. União de reuniões (meetings) por ID para nunca perder uma 8ª reunião criada em outro aparelho
      const meetingsMap = new Map<string, Meeting>();
      for (const m of currentDatabase.meetings || []) {
        if (m && m.id && !deletedMeetSet.has(m.id)) {
          meetingsMap.set(m.id, m);
        }
      }
      if (Array.isArray(incoming.meetings)) {
        for (const m of incoming.meetings) {
          if (m && m.id && !deletedMeetSet.has(m.id)) {
            meetingsMap.set(m.id, { ...(meetingsMap.get(m.id) || {}), ...m });
          }
        }
      }
      const mergedMeetings = Array.from(meetingsMap.values()).sort((a, b) =>
        String(b.date || '').localeCompare(String(a.date || ''))
      );

      // 3. União de publicadores (publishers) por ID
      const publishersMap = new Map<string, Publisher>();
      for (const p of currentDatabase.publishers || []) {
        if (p && p.id && !deletedPubSet.has(p.id)) {
          publishersMap.set(p.id, p);
        }
      }
      if (Array.isArray(incoming.publishers)) {
        for (const p of incoming.publishers) {
          if (p && p.id && !deletedPubSet.has(p.id)) {
            publishersMap.set(p.id, { ...(publishersMap.get(p.id) || {}), ...p });
          }
        }
      }
      const mergedPublishers = Array.from(publishersMap.values());

      // 4. Mescla chamadas e notas para todas as reuniões válidas
      const validMeetingIds = new Set(mergedMeetings.map((m) => m.id));
      const mergedAttendance: Record<string, Record<string, AttendanceStatus>> = {};
      const mergedNotes: Record<string, Record<string, string>> = {};

      for (const mid of validMeetingIds) {
        const curAtt = currentDatabase.attendance?.[mid] || {};
        const incAtt = incoming.attendance?.[mid] || {};
        const combinedAtt: Record<string, AttendanceStatus> = {};
        for (const [pid, st] of Object.entries({ ...curAtt, ...incAtt })) {
          if (!deletedPubSet.has(pid) && st) {
            combinedAtt[pid] = st;
          }
        }
        mergedAttendance[mid] = combinedAtt;

        const curNotes = currentDatabase.attendanceNotes?.[mid] || {};
        const incNotes = incoming.attendanceNotes?.[mid] || {};
        const combinedNotes: Record<string, string> = {};
        for (const [pid, note] of Object.entries({ ...curNotes, ...incNotes })) {
          if (!deletedPubSet.has(pid) && note) {
            combinedNotes[pid] = note;
          }
        }
        if (Object.keys(combinedNotes).length > 0) {
          mergedNotes[mid] = combinedNotes;
        }
      }

      // 5. União de visitas de pastoreio
      const visitsMap = new Map<string, ShepherdingVisit>();
      for (const v of currentDatabase.shepherdingVisits || []) {
        if (v && v.id) visitsMap.set(v.id, v);
      }
      if (Array.isArray(incoming.shepherdingVisits)) {
        for (const v of incoming.shepherdingVisits) {
          if (v && v.id) visitsMap.set(v.id, v);
        }
      }

      currentDatabase = {
        ...currentDatabase,
        ...incoming,
        congregationName: incoming.congregationName || currentDatabase.congregationName,
        publishers: mergedPublishers,
        meetings: mergedMeetings,
        attendance: mergedAttendance,
        attendanceNotes: mergedNotes,
        shepherdingVisits: Array.from(visitsMap.values()),
        deletedMeetingIds,
        deletedPublisherIds,
        lastUpdated: nowIso,
        syncMetadata: incoming.syncMetadata || {
          lastEditorDeviceId: sourceDeviceId || 'aparelho',
          lastEditorDeviceName: sourceDeviceName || 'Aparelho',
          lastEditedAt: nowIso,
          lastEditedDescription: 'Sincronização completa',
        },
      };
      persistDatabaseToDisk();

      broadcastSseEvent({
        type: 'database_updated',
        database: currentDatabase,
        sourceDeviceId,
        sourceDeviceName,
      });

      return res.json({
        success: true,
        lastUpdated: currentDatabase.lastUpdated,
        database: currentDatabase,
      });
    } catch (err: any) {
      console.error('[Server] Erro ao salvar banco:', err);
      return res.status(500).json({ error: err.message || 'Erro ao salvar' });
    }
  });

  // 4b. Listar pontos de restauração (snapshots)
  app.get('/api/backups', (req: Request, res: Response) => {
    try {
      const files = fs
        .readdirSync(BACKUP_DIR)
        .filter((f) => f.startsWith('snapshot-') && f.endsWith('.json'))
        .sort()
        .reverse();

      const backups = files.slice(0, 30).map((file) => {
        const stats = fs.statSync(path.join(BACKUP_DIR, file));
        const timestamp = Number(file.replace('snapshot-', '').replace('.json', ''));
        return {
          filename: file,
          timestamp,
          isoDate: new Date(timestamp).toISOString(),
          size: stats.size,
        };
      });

      return res.json({ success: true, backups });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 4c. Restaurar backup a partir de snapshot
  app.post('/api/backups/restore/:filename', (req: Request, res: Response) => {
    try {
      const { filename } = req.params;
      const targetPath = path.join(BACKUP_DIR, filename);
      if (!fs.existsSync(targetPath)) {
        return res.status(404).json({ error: 'Arquivo de backup não encontrado.' });
      }

      const raw = fs.readFileSync(targetPath, 'utf-8');
      const restored = JSON.parse(raw);
      currentDatabase = {
        ...restored,
        lastUpdated: new Date().toISOString(),
      };
      persistDatabaseToDisk();

      broadcastSseEvent({
        type: 'database_updated',
        database: currentDatabase,
        sourceDeviceName: 'Restauração de Backup',
      });

      return res.json({ success: true, database: currentDatabase });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 4d. Restaurar e assegurar reuniões de Terça-feira e Sábado passado
  app.post('/api/restore-tuesday-saturday', (req: Request, res: Response) => {
    try {
      const targetMeetings: Meeting[] = [
        {
          id: 'meet-sabado-12',
          type: 'weekend',
          date: '2026-09-12',
          dayOfWeek: 'Sábado',
          titleOrTheme: 'Discurso Público e Estudo de A Sentinela',
          observations: 'Reunião de fim de semana (Sábado). Chamada realizada.',
          createdAt: '2026-09-12T18:00:00.000Z',
        },
        {
          id: 'meet-terca-08',
          type: 'midweek',
          date: '2026-09-08',
          dayOfWeek: 'Terça-feira',
          titleOrTheme: 'Nossa Vida e Ministério Cristão: Faça o Seu Melhor no Ministério',
          observations: 'Reunião de meio de semana (Terça-feira passada) realizada.',
          createdAt: '2026-09-08T19:30:00.000Z',
        },
        {
          id: 'meet-sabado-05',
          type: 'weekend',
          date: '2026-09-05',
          dayOfWeek: 'Sábado',
          titleOrTheme: 'Discurso Público e Estudo de A Sentinela',
          observations: 'Reunião de fim de semana (Sábado passado) realizada com excelente assistência.',
          createdAt: '2026-09-05T18:00:00.000Z',
        },
        {
          id: 'meet-terca-01',
          type: 'midweek',
          date: '2026-09-01',
          dayOfWeek: 'Terça-feira',
          titleOrTheme: 'Nossa Vida e Ministério Cristão',
          observations: 'Reunião de meio de semana (Terça-feira).',
          createdAt: '2026-09-01T19:30:00.000Z',
        },
      ];

      const currentMeetings = currentDatabase.meetings || [];
      const mergedMeetings = [...targetMeetings];
      for (const cm of currentMeetings) {
        if (!mergedMeetings.some((m) => m.id === cm.id || m.date === cm.date)) {
          mergedMeetings.push(cm);
        }
      }

      currentDatabase.meetings = mergedMeetings;
      currentDatabase.attendance = currentDatabase.attendance || {};
      currentDatabase.attendanceNotes = currentDatabase.attendanceNotes || {};

      if (currentDatabase.attendance['meet-03'] && !currentDatabase.attendance['meet-terca-08']) {
        currentDatabase.attendance['meet-terca-08'] = { ...currentDatabase.attendance['meet-03'] };
      }
      if (currentDatabase.attendance['meet-02'] && !currentDatabase.attendance['meet-sabado-05']) {
        currentDatabase.attendance['meet-sabado-05'] = { ...currentDatabase.attendance['meet-02'] };
      }
      if (currentDatabase.attendance['meet-02'] && !currentDatabase.attendance['meet-sabado-12']) {
        currentDatabase.attendance['meet-sabado-12'] = { ...currentDatabase.attendance['meet-02'] };
      }

      if (currentDatabase.attendanceNotes['meet-03'] && !currentDatabase.attendanceNotes['meet-terca-08']) {
        currentDatabase.attendanceNotes['meet-terca-08'] = { ...currentDatabase.attendanceNotes['meet-03'] };
      }
      if (currentDatabase.attendanceNotes['meet-01'] && !currentDatabase.attendanceNotes['meet-sabado-05']) {
        currentDatabase.attendanceNotes['meet-sabado-05'] = { ...currentDatabase.attendanceNotes['meet-01'] };
      }

      currentDatabase.lastUpdated = new Date().toISOString();
      persistDatabaseToDisk();

      broadcastSseEvent({
        type: 'database_updated',
        database: currentDatabase,
        sourceDeviceName: 'Restauração Terça e Sábado',
      });

      return res.json({ success: true, database: currentDatabase });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 5. Sincronização em tempo real de CHAMADA (Attendance) com suporte a mudanças atômicas simultâneas
  app.post('/api/sync/attendance', (req: Request, res: Response) => {
    try {
      const { meetingId, attendanceMap, attendance, notesMap, notes, changes, editorInfo } = req.body;
      const incomingAtt = attendanceMap || attendance;
      const incomingNotes = notesMap !== undefined ? notesMap : notes;

      if (!meetingId || (!incomingAtt && !Array.isArray(changes))) {
        return res.status(400).json({ error: 'meetingId e dados de chamada são obrigatórios.' });
      }

      const nowIso = new Date().toISOString();

      if (!currentDatabase.attendance) {
        currentDatabase.attendance = {};
      }
      if (!currentDatabase.attendanceNotes) {
        currentDatabase.attendanceNotes = {};
      }

      // Se vier lista de alterações pontuais (changes), aplica de forma atômica preservando marcações simultâneas de outros aparelhos
      if (Array.isArray(changes) && changes.length > 0) {
        const curAtt = { ...(currentDatabase.attendance[meetingId] || {}) };
        const curNotes = { ...(currentDatabase.attendanceNotes[meetingId] || {}) };

        for (const ch of changes) {
          if (!ch || !ch.pid) continue;
          if (ch.st) {
            curAtt[ch.pid] = ch.st;
          } else if (ch.st === null) {
            delete curAtt[ch.pid];
          }
          if (ch.note !== undefined) {
            if (typeof ch.note === 'string' && ch.note.trim()) {
              curNotes[ch.pid] = ch.note.trim();
            } else {
              delete curNotes[ch.pid];
            }
          }
          if (ch.st !== undefined && ch.st !== 'zoom' && ch.st !== 'ausente' && !ch.pid.startsWith('__')) {
            delete curNotes[ch.pid];
          }
        }

        currentDatabase.attendance[meetingId] = curAtt;
        currentDatabase.attendanceNotes[meetingId] = curNotes;
      } else {
        if (incomingAtt) {
          currentDatabase.attendance[meetingId] = { ...incomingAtt };
        }
        if (incomingNotes !== undefined) {
          currentDatabase.attendanceNotes[meetingId] = { ...incomingNotes };
        }
      }

      const metadata: SyncMetadata = {
        lastEditorDeviceId: editorInfo?.deviceId || 'desconhecido',
        lastEditorDeviceName: editorInfo?.deviceName || 'Outro aparelho',
        lastEditedAt: nowIso,
        lastEditedMeetingId: meetingId,
        lastEditedDescription: editorInfo?.description || 'Chamada atualizada',
      };

      currentDatabase.syncMetadata = metadata;
      currentDatabase.lastUpdated = nowIso;

      persistDatabaseToDisk();

      const finalAtt = currentDatabase.attendance[meetingId] || {};
      const finalNotes = currentDatabase.attendanceNotes[meetingId] || {};

      // Envia notificação instantânea para TODOS os aparelhos conectados via SSE
      broadcastSseEvent(
        {
          type: 'attendance_updated',
          meetingId,
          attendance: finalAtt,
          notes: finalNotes,
          metadata,
          lastUpdated: nowIso,
          sourceDeviceId: editorInfo?.deviceId,
          sourceDeviceName: editorInfo?.deviceName,
        },
        editorInfo?.deviceId
      );

      return res.json({
        success: true,
        metadata,
        lastUpdated: nowIso,
        attendance: finalAtt,
        notes: finalNotes,
      });
    } catch (err: any) {
      console.error('[Server] Erro na sincronização de chamada:', err);
      return res.status(500).json({ error: err.message || 'Erro ao sincronizar chamada' });
    }
  });

  // 6. Sincronização de Publicador (Criar / Editar)
  app.post('/api/sync/publisher', (req: Request, res: Response) => {
    try {
      const { publisher, editorInfo } = req.body as {
        publisher: Publisher;
        editorInfo?: { deviceId: string; deviceName: string };
      };

      if (!publisher || !publisher.id || !publisher.name) {
        return res.status(400).json({ error: 'Dados incompletos do publicador.' });
      }

      if (Array.isArray(currentDatabase.deletedPublisherIds)) {
        currentDatabase.deletedPublisherIds = currentDatabase.deletedPublisherIds.filter(
          (id) => id !== publisher.id
        );
      }

      const index = currentDatabase.publishers.findIndex((p) => p.id === publisher.id);
      if (index >= 0) {
        currentDatabase.publishers[index] = publisher;
      } else {
        currentDatabase.publishers.push(publisher);
      }

      const nowIso = new Date().toISOString();
      currentDatabase.lastUpdated = nowIso;
      if (editorInfo) {
        currentDatabase.syncMetadata = {
          lastEditorDeviceId: editorInfo.deviceId,
          lastEditorDeviceName: editorInfo.deviceName,
          lastEditedAt: nowIso,
          lastEditedDescription: `Publicador ${publisher.name} atualizado`,
        };
      }

      persistDatabaseToDisk();

      broadcastSseEvent(
        {
          type: 'publisher_updated',
          publisher,
          publishers: currentDatabase.publishers,
          deletedPublisherIds: currentDatabase.deletedPublisherIds,
          metadata: currentDatabase.syncMetadata,
          lastUpdated: nowIso,
          sourceDeviceId: editorInfo?.deviceId,
        },
        editorInfo?.deviceId
      );

      return res.json({ success: true, publisher, lastUpdated: nowIso });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 7. Excluir Publicador (suporta DELETE e POST para compatibilidade com todos os proxies mobile)
  const handleDeletePublisherRoute = (req: Request, res: Response) => {
    try {
      const pubId = req.params.id;
      const editorDeviceId = (req.query.deviceId || req.body?.deviceId) as string | undefined;

      currentDatabase.deletedPublisherIds = Array.from(
        new Set([...(currentDatabase.deletedPublisherIds || []), pubId])
      );
      currentDatabase.publishers = currentDatabase.publishers.filter((p) => p.id !== pubId);
      if (currentDatabase.attendance) {
        Object.keys(currentDatabase.attendance).forEach((mid) => {
          if (currentDatabase.attendance[mid]) {
            delete currentDatabase.attendance[mid][pubId];
          }
        });
      }
      if (currentDatabase.attendanceNotes) {
        Object.keys(currentDatabase.attendanceNotes).forEach((mid) => {
          if (currentDatabase.attendanceNotes![mid]) {
            delete currentDatabase.attendanceNotes![mid][pubId];
          }
        });
      }
      const nowIso = new Date().toISOString();
      currentDatabase.lastUpdated = nowIso;
      persistDatabaseToDisk();

      broadcastSseEvent(
        {
          type: 'publisher_deleted',
          publisherId: pubId,
          publishers: currentDatabase.publishers,
          deletedPublisherIds: currentDatabase.deletedPublisherIds,
          lastUpdated: nowIso,
          sourceDeviceId: editorDeviceId,
        },
        editorDeviceId
      );

      return res.json({
        success: true,
        lastUpdated: nowIso,
        deletedPublisherIds: currentDatabase.deletedPublisherIds,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  };

  app.delete('/api/sync/publisher/:id', handleDeletePublisherRoute);
  app.post('/api/sync/publisher/delete/:id', handleDeletePublisherRoute);

  // 8. Sincronização de Reunião (Criar / Editar) com presença inicial atômica
  app.post('/api/sync/meeting', (req: Request, res: Response) => {
    try {
      const { meeting, initialAttendance, initialNotes, editorInfo } = req.body as {
        meeting: Meeting;
        initialAttendance?: Record<string, AttendanceStatus>;
        initialNotes?: Record<string, string>;
        editorInfo?: { deviceId: string; deviceName: string };
      };

      if (!meeting || !meeting.id || !meeting.date) {
        return res.status(400).json({ error: 'Dados incompletos da reunião.' });
      }

      if (Array.isArray(currentDatabase.deletedMeetingIds)) {
        currentDatabase.deletedMeetingIds = currentDatabase.deletedMeetingIds.filter(
          (id) => id !== meeting.id
        );
      }

      const index = currentDatabase.meetings.findIndex((m) => m.id === meeting.id);
      if (index >= 0) {
        currentDatabase.meetings[index] = meeting;
      } else {
        currentDatabase.meetings.unshift(meeting);
      }
      currentDatabase.meetings.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

      if (initialAttendance) {
        if (!currentDatabase.attendance) currentDatabase.attendance = {};
        currentDatabase.attendance[meeting.id] = {
          ...(currentDatabase.attendance[meeting.id] || {}),
          ...initialAttendance,
        };
      }
      if (initialNotes) {
        if (!currentDatabase.attendanceNotes) currentDatabase.attendanceNotes = {};
        currentDatabase.attendanceNotes[meeting.id] = {
          ...(currentDatabase.attendanceNotes[meeting.id] || {}),
          ...initialNotes,
        };
      }

      const nowIso = new Date().toISOString();
      currentDatabase.lastUpdated = nowIso;
      currentDatabase.syncMetadata = {
        lastEditorDeviceId: editorInfo?.deviceId || 'aparelho',
        lastEditorDeviceName: editorInfo?.deviceName || 'Outro aparelho',
        lastEditedAt: nowIso,
        lastEditedMeetingId: meeting.id,
        lastEditedDescription: `Reunião ${meeting.date} atualizada`,
      };
      persistDatabaseToDisk();

      broadcastSseEvent(
        {
          type: 'meeting_updated',
          meeting,
          meetings: currentDatabase.meetings,
          deletedMeetingIds: currentDatabase.deletedMeetingIds,
          attendance: currentDatabase.attendance,
          attendanceNotes: currentDatabase.attendanceNotes,
          metadata: currentDatabase.syncMetadata,
          lastUpdated: nowIso,
          sourceDeviceId: editorInfo?.deviceId,
        },
        editorInfo?.deviceId
      );

      return res.json({
        success: true,
        meeting,
        meetings: currentDatabase.meetings,
        lastUpdated: nowIso,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 9. Excluir Reunião (suporta DELETE e POST para compatibilidade com todos os proxies mobile)
  const handleDeleteMeetingRoute = (req: Request, res: Response) => {
    try {
      const meetingId = req.params.id;
      const editorDeviceId = (req.query.deviceId || req.body?.deviceId) as string | undefined;

      currentDatabase.deletedMeetingIds = Array.from(
        new Set([...(currentDatabase.deletedMeetingIds || []), meetingId])
      );
      currentDatabase.meetings = currentDatabase.meetings.filter((m) => m.id !== meetingId);
      if (currentDatabase.attendance) {
        delete currentDatabase.attendance[meetingId];
      }
      if (currentDatabase.attendanceNotes) {
        delete currentDatabase.attendanceNotes[meetingId];
      }
      const nowIso = new Date().toISOString();
      currentDatabase.lastUpdated = nowIso;
      persistDatabaseToDisk();

      broadcastSseEvent(
        {
          type: 'meeting_deleted',
          meetingId,
          meetings: currentDatabase.meetings,
          deletedMeetingIds: currentDatabase.deletedMeetingIds,
          attendance: currentDatabase.attendance,
          attendanceNotes: currentDatabase.attendanceNotes,
          lastUpdated: nowIso,
          sourceDeviceId: editorDeviceId,
        },
        editorDeviceId
      );

      return res.json({
        success: true,
        lastUpdated: nowIso,
        meetings: currentDatabase.meetings,
        deletedMeetingIds: currentDatabase.deletedMeetingIds,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  };

  app.delete('/api/sync/meeting/:id', handleDeleteMeetingRoute);
  app.post('/api/sync/meeting/delete/:id', handleDeleteMeetingRoute);

  // 10. Visitas de Pastoreio
  app.post('/api/sync/shepherding', (req: Request, res: Response) => {
    try {
      const { visit, editorInfo } = req.body as {
        visit: ShepherdingVisit;
        editorInfo?: { deviceId: string; deviceName: string };
      };

      if (!visit || !visit.id) {
        return res.status(400).json({ error: 'Dados da visita inválidos.' });
      }

      if (!currentDatabase.shepherdingVisits) {
        currentDatabase.shepherdingVisits = [];
      }

      const index = currentDatabase.shepherdingVisits.findIndex((v) => v.id === visit.id);
      if (index >= 0) {
        currentDatabase.shepherdingVisits[index] = visit;
      } else {
        currentDatabase.shepherdingVisits.push(visit);
      }

      const nowIso = new Date().toISOString();
      currentDatabase.lastUpdated = nowIso;
      persistDatabaseToDisk();

      broadcastSseEvent(
        {
          type: 'shepherding_updated',
          visits: currentDatabase.shepherdingVisits,
          lastUpdated: nowIso,
          sourceDeviceId: editorInfo?.deviceId,
        },
        editorInfo?.deviceId
      );

      return res.json({ success: true, visit, lastUpdated: nowIso });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 11. Endpoint SSE (Server-Sent Events) para sincronização em tempo real entre todos os aparelhos
  app.get('/api/sync/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, no-transform, must-revalidate');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const deviceId = (req.query.deviceId as string) || '';
    const deviceName = (req.query.deviceName as string) || '';

    const newClient: SseClient = { id: clientId, res, deviceId, deviceName };
    sseClients.add(newClient);

    // Envia evento inicial de confirmação com padding para forçar flush no proxy
    res.write(
      `data: ${JSON.stringify({
        type: 'connected',
        connectedClients: sseClients.size,
        metadata: currentDatabase.syncMetadata,
        lastUpdated: currentDatabase.lastUpdated,
      })}\n\n${SSE_FLUSH_PADDING}`
    );

    // Notifica outros sobre novo aparelho conectado
    broadcastSseEvent({
      type: 'presence',
      connectedClients: sseClients.size,
    });

    // Heartbeat a cada 10 segundos para evitar que conexões móveis caiam
    const pingInterval = setInterval(() => {
      try {
        res.write(`: ping ${Date.now()}\n\n`);
      } catch {
        clearInterval(pingInterval);
        sseClients.delete(newClient);
      }
    }, 10000);

    req.on('close', () => {
      clearInterval(pingInterval);
      sseClients.delete(newClient);
      broadcastSseEvent({
        type: 'presence',
        connectedClients: sseClients.size,
      });
    });
  });

  // ==========================================
  // VITE / STATIC FILE SERVING
  // ==========================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Congregational Attendance Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
