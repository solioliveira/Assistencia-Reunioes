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

  // Desabilita qualquer cache HTTP nas rotas da API para garantir sincronismo simultâneo em iPhones/iPads/Android
  app.use('/api', (req: Request, res: Response, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
  });

  // Desabilita e remove qualquer Service Worker antigo que possa interceptar rotas de autenticação ou API no iOS/Android/Mac
  const SELF_DESTRUCT_SW = `
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => {
        clients.forEach((client) => {
          if ('navigate' in client) {
            client.navigate(client.url).catch(() => {});
          }
        });
      })
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
      timestamp: new Date().toISOString(),
      connectedClients: sseClients.size,
    });
  });

  // 2. Status da sincronização e aparelhos conectados
  app.get('/api/sync/status', (req: Request, res: Response) => {
    res.json({
      success: true,
      connectedClients: sseClients.size,
      lastUpdated: currentDatabase.lastUpdated,
      syncMetadata: currentDatabase.syncMetadata,
    });
  });

  // 2b. Polling ultra-leve de 1 segundo para sincronismo simultâneo instantâneo
  app.get('/api/sync/poll', (req: Request, res: Response) => {
    const since = (req.query.since as string) || '';
    const changed = !since || since !== currentDatabase.lastUpdated;
    if (!changed) {
      return res.json({
        changed: false,
        lastUpdated: currentDatabase.lastUpdated,
        connectedClients: sseClients.size,
      });
    }
    return res.json({
      changed: true,
      lastUpdated: currentDatabase.lastUpdated,
      connectedClients: sseClients.size,
      database: currentDatabase,
    });
  });

  // 3. Obter banco completo da congregação
  app.get('/api/database', (req: Request, res: Response) => {
    res.json(currentDatabase);
  });

  // 4. Salvar banco completo ou sincronizar simultaneamente todos os aparelhos
  app.post('/api/database', (req: Request, res: Response) => {
    try {
      const incoming = req.body as CongregationDatabase;
      if (!incoming || typeof incoming !== 'object') {
        return res.status(400).json({ error: 'Formato de banco inválido.' });
      }

      const nowIso = new Date().toISOString();
      const sourceDeviceId = req.body?.sourceDeviceId;
      const sourceDeviceName = req.body?.sourceDeviceName;

      // Protege contra sobrescrita acidental por payload vazio
      const incomingPublishers =
        Array.isArray(incoming.publishers) && incoming.publishers.length > 0
          ? incoming.publishers
          : currentDatabase.publishers;

      const incomingMeetings = Array.isArray(incoming.meetings)
        ? incoming.meetings
        : currentDatabase.meetings;

      // Mescla chamadas para não perder marcações de outras reuniões feitas em outros aparelhos
      const mergedAttendance: Record<string, Record<string, AttendanceStatus>> = {
        ...(currentDatabase.attendance || {}),
      };
      if (incoming.attendance && typeof incoming.attendance === 'object') {
        for (const [mid, attMap] of Object.entries(incoming.attendance)) {
          if (attMap && typeof attMap === 'object') {
            mergedAttendance[mid] = {
              ...(mergedAttendance[mid] || {}),
              ...attMap,
            };
          }
        }
      }

      const mergedNotes: Record<string, Record<string, string>> = {
        ...(currentDatabase.attendanceNotes || {}),
      };
      if (incoming.attendanceNotes && typeof incoming.attendanceNotes === 'object') {
        for (const [mid, noteMap] of Object.entries(incoming.attendanceNotes)) {
          if (noteMap && typeof noteMap === 'object') {
            mergedNotes[mid] = {
              ...(mergedNotes[mid] || {}),
              ...noteMap,
            };
          }
        }
      }

      // Garante que apenas reuniões existentes permaneçam no mapa de chamadas caso alguma tenha sido excluída
      const validMeetingIds = new Set(incomingMeetings.map((m) => m.id));
      for (const mid of Object.keys(mergedAttendance)) {
        if (!validMeetingIds.has(mid) && incoming.attendance && !(mid in incoming.attendance)) {
          delete mergedAttendance[mid];
          delete mergedNotes[mid];
        }
      }

      currentDatabase = {
        ...currentDatabase,
        ...incoming,
        publishers: incomingPublishers,
        meetings: incomingMeetings,
        attendance: mergedAttendance,
        attendanceNotes: mergedNotes,
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

  // 7. Excluir Publicador
  app.delete('/api/sync/publisher/:id', (req: Request, res: Response) => {
    try {
      const pubId = req.params.id;
      const editorDeviceId = req.query.deviceId as string | undefined;

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
          lastUpdated: nowIso,
          sourceDeviceId: editorDeviceId,
        },
        editorDeviceId
      );

      return res.json({ success: true, lastUpdated: nowIso });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

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

      const index = currentDatabase.meetings.findIndex((m) => m.id === meeting.id);
      if (index >= 0) {
        currentDatabase.meetings[index] = meeting;
      } else {
        currentDatabase.meetings.unshift(meeting);
      }

      if (initialAttendance) {
        if (!currentDatabase.attendance) currentDatabase.attendance = {};
        currentDatabase.attendance[meeting.id] = { ...initialAttendance };
      }
      if (initialNotes) {
        if (!currentDatabase.attendanceNotes) currentDatabase.attendanceNotes = {};
        currentDatabase.attendanceNotes[meeting.id] = { ...initialNotes };
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
          attendance: currentDatabase.attendance,
          attendanceNotes: currentDatabase.attendanceNotes,
          metadata: currentDatabase.syncMetadata,
          lastUpdated: nowIso,
          sourceDeviceId: editorInfo?.deviceId,
        },
        editorInfo?.deviceId
      );

      return res.json({ success: true, meeting, lastUpdated: nowIso });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 9. Excluir Reunião
  app.delete('/api/sync/meeting/:id', (req: Request, res: Response) => {
    try {
      const meetingId = req.params.id;
      const editorDeviceId = req.query.deviceId as string | undefined;

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
          attendance: currentDatabase.attendance,
          attendanceNotes: currentDatabase.attendanceNotes,
          lastUpdated: nowIso,
          sourceDeviceId: editorDeviceId,
        },
        editorDeviceId
      );

      return res.json({ success: true, lastUpdated: nowIso });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

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
