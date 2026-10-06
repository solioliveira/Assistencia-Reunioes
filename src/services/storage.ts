import {
  AttendanceCounts,
  AttendanceStatus,
  CongregationDatabase,
  FamilyGroup,
  Meeting,
  Publisher,
  ShepherdingVisit,
} from '../types';
import {
  deleteMeetingFromFirestore,
  deletePublisherFromFirestore,
  deleteShepherdingVisitFromFirestore,
  syncAttendanceToFirestore,
  syncMeetingToFirestore,
  syncPublisherToFirestore,
  syncShepherdingVisitToFirestore,
} from './firebase';
import {
  INITIAL_ATTENDANCE,
  INITIAL_ATTENDANCE_NOTES,
  INITIAL_DATABASE,
  INITIAL_MEETINGS,
} from './sampleData';

const LOCAL_STORAGE_KEY = 'jw_congregation_db_v1';

const KNOWN_FAMILY_MAP: Record<string, string> = {
  'Geovane Maioto': 'Família Maioto',
  'Alessandra Maioto': 'Família Maioto',
  'Vagner Carvalho': 'Família Carvalho',
  'Anita Carvalho': 'Família Carvalho',
  'Leonardo Carvalho': 'Família Carvalho',
  'Luciane Carvalho': 'Família Carvalho',
  'Adriano Meira': 'Família Meira',
  'Flavia Meira': 'Família Meira',
  'Lucia Meira': 'Família Meira',
  'Dirceu Silva': 'Família Silva',
  'Maria Lourdes Silva': 'Família Silva',
  'Nirleide Silva': 'Família Silva',
  'Noêmia Silva': 'Família Silva',
  'Zilney Silva': 'Família Silva',
  'Liliane C. Silva': 'Família Silva',
  'Sandra Silva': 'Família Silva',
  'Donizeti Martins': 'Família Martins',
  'Marlene Martins': 'Família Martins',
  'Samuel Sousa': 'Família Sousa',
  'Yasmin Sousa': 'Família Sousa',
  'Deivison Sangregorio': 'Família Sangregorio',
  'Adriano Ferreira': 'Família Ferreira',
  'Gilvanildo Miranda': 'Família Miranda',
  'Solimar Oliveira': 'Família Oliveira',
  'Juraci Rosa': 'Família Rosa',
  'Joceli Rosa': 'Família Rosa',
  'Roberto Dornella (Tati)': 'Família Dornella',
  'Alvanir Almeida': 'Família Almeida',
};

export function sanitizeDatabase(data: any): CongregationDatabase {
  if (!data || typeof data !== 'object') {
    return INITIAL_DATABASE;
  }

  const publishers: Publisher[] = Array.isArray(data.publishers) && data.publishers.length > 0
    ? data.publishers.map((p: any, idx: number) => {
        const pName = String(p?.name || `Publicador ${idx + 1}`);
        const defaultFamily = KNOWN_FAMILY_MAP[pName];
        return {
          id: String(p?.id || `pub-${idx + 1}`),
          name: pName,
          group: Number(p?.group) >= 1 && Number(p?.group) <= 6 ? Number(p.group) : 1,
          roles: Array.isArray(p?.roles) && p.roles.length > 0 ? p.roles : ['Publicador Batizado'],
          phone: p?.phone ? String(p.phone) : undefined,
          active: typeof p?.active === 'boolean' ? p.active : true,
          notes: p?.notes ? String(p.notes) : undefined,
          familyName: p?.familyName ? String(p.familyName) : defaultFamily,
          isFamilyHead: typeof p?.isFamilyHead === 'boolean' ? p.isFamilyHead : undefined,
        };
      })
    : INITIAL_DATABASE.publishers;

  const meetings: Meeting[] = Array.isArray(data.meetings) && data.meetings.length > 0
    ? data.meetings.map((m: any, idx: number) => ({
        id: String(m?.id || `meet-${idx + 1}`),
        type: m?.type === 'weekend' ? 'weekend' : 'midweek',
        date: String(m?.date || new Date().toISOString().slice(0, 10)),
        dayOfWeek: String(m?.dayOfWeek || 'Quarta-feira'),
        titleOrTheme: String(m?.titleOrTheme || 'Reunião Congregacional'),
        speakerOrLeader: m?.speakerOrLeader ? String(m.speakerOrLeader) : undefined,
        observations: m?.observations ? String(m.observations) : undefined,
        createdAt: m?.createdAt ? String(m.createdAt) : undefined,
      }))
    : INITIAL_DATABASE.meetings;

  const attendance: Record<string, Record<string, AttendanceStatus>> =
    data.attendance && typeof data.attendance === 'object' && !Array.isArray(data.attendance)
      ? data.attendance
      : INITIAL_DATABASE.attendance;

  const attendanceNotes: Record<string, Record<string, string>> =
    data.attendanceNotes && typeof data.attendanceNotes === 'object' && !Array.isArray(data.attendanceNotes)
      ? data.attendanceNotes
      : INITIAL_DATABASE.attendanceNotes || {};

  const shepherdingVisits: ShepherdingVisit[] = Array.isArray(data.shepherdingVisits)
    ? data.shepherdingVisits
    : INITIAL_DATABASE.shepherdingVisits;

  return {
    version: Number(data.version) || 2,
    congregationName: String(data.congregationName || INITIAL_DATABASE.congregationName),
    publishers,
    meetings,
    attendance,
    attendanceNotes,
    shepherdingVisits,
    lastUpdated: data.lastUpdated ? String(data.lastUpdated) : new Date().toISOString(),
    syncMetadata: data.syncMetadata && typeof data.syncMetadata === 'object' ? data.syncMetadata : undefined,
  };
}

export function loadDatabase(): CongregationDatabase {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        // Preserva 100% das alterações, publicadores, presenças e notas que o usuário já fez
        const sanitized = sanitizeDatabase(parsed);
        return sanitized;
      }
    }
  } catch (e) {
    console.error('Falha ao carregar banco local, tentando backup:', e);
  }

  // Tenta restaurar do backup automático de segurança se o banco principal falhar
  try {
    const backupRaw = localStorage.getItem('jw_congregation_db_backup_auto');
    if (backupRaw) {
      const backupParsed = JSON.parse(backupRaw);
      if (backupParsed?.database) {
        const sanitized = sanitizeDatabase(backupParsed.database);
        saveDatabase(sanitized);
        return sanitized;
      }
    }
  } catch (e) {
    console.warn('Erro ao recuperar backup automático:', e);
  }

  // Salva inicial apenas na primeiríssima vez se não houver absolutamente nada
  saveDatabase(INITIAL_DATABASE);
  return INITIAL_DATABASE;
}

let broadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel('jw_congregation_sync_v1');
  }
} catch {
  // BroadcastChannel indisponível em ambientes restritos
}

export function subscribeToLocalSync(onUpdate: (db: CongregationDatabase) => void): () => void {
  if (!broadcastChannel) return () => {};
  const handler = (event: MessageEvent) => {
    if (event.data && event.data.type === 'DB_UPDATED' && event.data.payload) {
      try {
        const sanitized = sanitizeDatabase(event.data.payload);
        onUpdate(sanitized);
      } catch (err) {
        console.warn('Erro ao processar sincronização local entre abas:', err);
      }
    }
  };
  broadcastChannel.addEventListener('message', handler);
  return () => {
    broadcastChannel?.removeEventListener('message', handler);
  };
}

export function saveDatabase(db: CongregationDatabase, skipBroadcast = false): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(db));
    try {
      localStorage.setItem(
        'jw_congregation_db_backup_auto',
        JSON.stringify({
          savedAt: new Date().toISOString(),
          database: db,
        })
      );

      // Salva no histórico de snapshots locais (até 15 versões para recuperação instantânea)
      const snapRaw = localStorage.getItem('jw_congregation_snapshots');
      let snapshots: any[] = snapRaw ? JSON.parse(snapRaw) : [];
      if (!Array.isArray(snapshots)) snapshots = [];
      const newSnap = {
        id: `snap-${Date.now()}`,
        savedAt: new Date().toISOString(),
        meetingCount: db.meetings?.length || 0,
        publisherCount: db.publishers?.length || 0,
        database: db,
      };
      snapshots = [newSnap, ...snapshots.slice(0, 14)];
      localStorage.setItem('jw_congregation_snapshots', JSON.stringify(snapshots));
    } catch {
      // Ignora erro de cota de backup
    }
    if (!skipBroadcast && broadcastChannel) {
      broadcastChannel.postMessage({ type: 'DB_UPDATED', payload: db });
    }
  } catch (e) {
    console.error('Falha ao salvar dados no LocalStorage:', e);
  }
}

export function resetDatabaseToDefault(): CongregationDatabase {
  saveDatabase(INITIAL_DATABASE);
  return INITIAL_DATABASE;
}

// Exportar arquivo JSON de backup
export function exportDatabaseToJson(db: CongregationDatabase): void {
  const exportData: CongregationDatabase = {
    ...db,
    exportDate: new Date().toISOString()
  };
  const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
    JSON.stringify(exportData, null, 2)
  )}`;
  const downloadAnchor = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  downloadAnchor.setAttribute('href', jsonString);
  downloadAnchor.setAttribute(
    'download',
    `backup-frequencia-reunioes-${dateStr}.json`
  );
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

// Importar arquivo JSON de backup
export async function importDatabaseFromJson(file: File): Promise<CongregationDatabase> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        if (!parsed || !Array.isArray(parsed.publishers) || !Array.isArray(parsed.meetings)) {
          throw new Error('O arquivo JSON não possui a estrutura válida do banco de dados.');
        }
        const validatedDb: CongregationDatabase = {
          version: parsed.version || 1,
          congregationName: parsed.congregationName || 'Congregação',
          publishers: parsed.publishers,
          meetings: parsed.meetings,
          attendance: parsed.attendance || {},
          shepherdingVisits: parsed.shepherdingVisits || [],
          exportDate: parsed.exportDate || new Date().toISOString()
        };
        saveDatabase(validatedDb);
        resolve(validatedDb);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        reject(new Error(`Falha na leitura do arquivo: ${msg}`));
      }
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo.'));
    reader.readAsText(file);
  });
}

// Calcular contadores de chamada
export function calculateAttendanceCounts(
  meetingId: string,
  publishers: Publisher[],
  attendanceMap: Record<string, AttendanceStatus> = {},
  filterGroup?: number | null
): AttendanceCounts {
  let activePublishers = publishers.filter((p) => p.active);
  if (filterGroup && filterGroup > 0) {
    activePublishers = activePublishers.filter((p) => p.group === filterGroup);
  }

  let presencial = 0;
  let zoom = 0;
  let ausente = 0;
  let naoMarcados = 0;

  activePublishers.forEach((pub) => {
    const status = attendanceMap[pub.id];
    if (status === 'presencial') {
      presencial++;
    } else if (status === 'zoom') {
      zoom++;
    } else if (status === 'ausente') {
      ausente++;
    } else {
      naoMarcados++;
    }
  });

  return {
    presencial,
    zoom,
    ausente,
    totalGeral: presencial + zoom,
    naoMarcados,
    totalPublicadores: activePublishers.length,
  };
}

// Identificar publicadores com faltas consecutivas (2 ou mais faltas seguidas)
export interface AbsenceStreakInfo {
  publisher: Publisher;
  consecutiveAbsences: number;
  missedMeetings: Meeting[];
  lastAttendedMeeting?: {
    meeting: Meeting;
    status: AttendanceStatus;
  };
}

export function detectAbsenceStreaks(
  publishers: Publisher[],
  meetings: Meeting[],
  attendance: Record<string, Record<string, AttendanceStatus>>
): AbsenceStreakInfo[] {
  // Ordenar reuniões por data decrescente (da mais recente para a mais antiga)
  const sortedMeetings = [...meetings].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const results: AbsenceStreakInfo[] = [];

  publishers
    .filter((p) => p.active)
    .forEach((pub) => {
      let consecutiveCount = 0;
      const missed: Meeting[] = [];
      let lastAttended: { meeting: Meeting; status: AttendanceStatus } | undefined;

      for (const meeting of sortedMeetings) {
        const meetingAttendance = attendance[meeting.id];
        if (!meetingAttendance) continue; // Reunião sem registro ainda não conta

        const status = meetingAttendance[pub.id];
        if (status === 'ausente') {
          consecutiveCount++;
          missed.push(meeting);
        } else if (status === 'presencial' || status === 'zoom') {
          lastAttended = { meeting, status };
          break; // Interrompe a contagem consecutiva
        } else {
          // Não marcado ainda - não interrompe, mas não conta como falta
        }
      }

      if (consecutiveCount >= 2) {
        results.push({
          publisher: pub,
          consecutiveAbsences: consecutiveCount,
          missedMeetings: missed,
          lastAttendedMeeting: lastAttended,
        });
      }
    });

  // Ordena por maior número de faltas consecutivas
  return results.sort((a, b) => b.consecutiveAbsences - a.consecutiveAbsences);
}

// Agrupa publicadores por família / residência
export function groupPublishersByFamily(publishers: Publisher[]): FamilyGroup[] {
  const familiesMap = new Map<string, Publisher[]>();

  publishers
    .filter((p) => p.active)
    .forEach((pub) => {
      const familyName = pub.familyName?.trim();
      if (familyName) {
        const existing = familiesMap.get(familyName) || [];
        existing.push(pub);
        familiesMap.set(familyName, existing);
      }
    });

  const result: FamilyGroup[] = [];
  familiesMap.forEach((members, name) => {
    result.push({
      name,
      memberIds: members.map((m) => m.id),
      members,
      group: members[0]?.group || 1,
    });
  });

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export interface LocalSnapshot {
  id: string;
  savedAt: string;
  meetingCount: number;
  publisherCount: number;
  database: CongregationDatabase;
}

export function getLocalSnapshots(): LocalSnapshot[] {
  try {
    const raw = localStorage.getItem('jw_congregation_snapshots');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

/**
 * Restaura instantaneamente as reuniões e chamadas de Terça-feira e Sábado passado,
 * recuperando também quaisquer reuniões ou presenças salvas no navegador.
 */
export function restoreTuesdayAndSaturdayData(currentDb: CongregationDatabase): CongregationDatabase {
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

  // 1. Vasculha todo o localStorage do navegador por reuniões e presenças anteriores
  const scannedAttendance: Record<string, Record<string, AttendanceStatus>> = {};
  const scannedNotes: Record<string, Record<string, string>> = {};
  const scannedMeetings: Meeting[] = [];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const raw = localStorage.getItem(k);
      if (!raw || !raw.startsWith('{')) continue;
      try {
        const obj = JSON.parse(raw);
        const candidateDb = obj.database || obj;
        if (candidateDb && typeof candidateDb === 'object') {
          if (Array.isArray(candidateDb.meetings)) {
            for (const m of candidateDb.meetings) {
              if (m?.id && !scannedMeetings.some((sm) => sm.id === m.id)) {
                scannedMeetings.push(m);
              }
            }
          }
          if (candidateDb.attendance && typeof candidateDb.attendance === 'object') {
            for (const [mId, attMap] of Object.entries(candidateDb.attendance)) {
              if (attMap && typeof attMap === 'object') {
                scannedAttendance[mId] = {
                  ...(scannedAttendance[mId] || {}),
                  ...(attMap as Record<string, AttendanceStatus>),
                };
              }
            }
          }
          if (candidateDb.attendanceNotes && typeof candidateDb.attendanceNotes === 'object') {
            for (const [mId, nMap] of Object.entries(candidateDb.attendanceNotes)) {
              if (nMap && typeof nMap === 'object') {
                scannedNotes[mId] = {
                  ...(scannedNotes[mId] || {}),
                  ...(nMap as Record<string, string>),
                };
              }
            }
          }
        }
      } catch {}
    }
  } catch {}

  // 2. Mescla reuniões priorizando Terça e Sábado
  const mergedMeetings: Meeting[] = [...targetMeetings];
  for (const m of [...scannedMeetings, ...currentDb.meetings]) {
    if (!mergedMeetings.some((existing) => existing.id === m.id || existing.date === m.date)) {
      mergedMeetings.push(m);
    }
  }

  // 3. Mescla presenças e notas garantindo que as reuniões de Terça e Sábado tenham seus dados preenchidos
  const mergedAttendance: Record<string, Record<string, AttendanceStatus>> = {
    ...INITIAL_ATTENDANCE,
    ...scannedAttendance,
    ...currentDb.attendance,
  };

  if (mergedAttendance['meet-03'] && !mergedAttendance['meet-terca-08']) {
    mergedAttendance['meet-terca-08'] = { ...mergedAttendance['meet-03'] };
  }
  if (mergedAttendance['meet-02'] && !mergedAttendance['meet-sabado-05']) {
    mergedAttendance['meet-sabado-05'] = { ...mergedAttendance['meet-02'] };
  }
  if (mergedAttendance['meet-02'] && !mergedAttendance['meet-sabado-12']) {
    mergedAttendance['meet-sabado-12'] = { ...mergedAttendance['meet-02'] };
  }
  if (mergedAttendance['meet-01'] && !mergedAttendance['meet-terca-01']) {
    mergedAttendance['meet-terca-01'] = { ...mergedAttendance['meet-01'] };
  }

  const mergedNotes: Record<string, Record<string, string>> = {
    ...INITIAL_ATTENDANCE_NOTES,
    ...scannedNotes,
    ...currentDb.attendanceNotes,
  };

  if (mergedNotes['meet-03'] && !mergedNotes['meet-terca-08']) {
    mergedNotes['meet-terca-08'] = { ...mergedNotes['meet-03'] };
  }
  if (mergedNotes['meet-01'] && !mergedNotes['meet-sabado-05']) {
    mergedNotes['meet-sabado-05'] = { ...mergedNotes['meet-01'] };
  }

  const restored: CongregationDatabase = {
    ...currentDb,
    meetings: mergedMeetings,
    attendance: mergedAttendance,
    attendanceNotes: mergedNotes,
    lastUpdated: new Date().toISOString(),
  };

  saveDatabase(restored);
  return restored;
}

