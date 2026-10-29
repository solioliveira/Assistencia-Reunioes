import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackupHistoryModal } from './components/BackupHistoryModal';
import { SettingsBackupModal } from './components/SettingsBackupModal';
import { SyncDevicesModal } from './components/SyncDevicesModal';
import {
  decodeFirebaseConfigFromHash,
  deleteMeetingFromFirestore,
  deletePublisherFromFirestore,
  fetchRemoteFirestoreData,
  getStoredFirebaseConfig,
  initFirebaseService,
  listenToFirestore,
  saveFirebaseConfig,
  syncAttendanceToFirestore,
  syncMeetingToFirestore,
  syncPublisherToFirestore,
  syncVisitToFirestore,
} from './services/firebase';
import {
  detectAbsenceStreaks,
  loadDatabase,
  mergeDatabases,
  restoreTuesdayAndSaturdayData,
  saveDatabase,
  subscribeToLocalSync,
} from './services/storage';
import {
  clearPendingQueue,
  enqueueAttendanceSync,
  enqueueDeleteMeetingSync,
  enqueueDeletePublisherSync,
  enqueueMeetingSync,
  enqueuePublisherSync,
  enqueueVisitSync,
  getPendingQueue,
  processPendingSyncQueue,
  subscribeToQueueChanges,
} from './services/syncQueue';
import {
  deleteMeetingOnServer,
  deletePublisherOnServer,
  fetchServerDatabase,
  pollServerChanges,
  restoreTuesdaySaturdayOnServer,
  sendAttendanceToServer,
  sendDatabaseToServer,
  sendMeetingToServer,
  sendPublisherToServer,
  sendShepherdingToServer,
  subscribeToServerEvents,
} from './services/apiSync';
import { getDeviceInfo } from './services/device';
import {
  AttendanceStatus,
  CongregationDatabase,
  Meeting,
  MeetingType,
  NavigationTab,
  PendingSyncItem,
  Publisher,
  ShepherdingVisit,
} from './types';

function getPortugueseDayOfWeek(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const days = [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
  ];
  return days[date.getDay()] || '';
}

const REASONS: Record<'zoom' | 'ausente', string[]> = {
  zoom: ['Doente', 'Viagem', 'Trabalho', 'Idoso / locomoção', 'Sem transporte', 'Cuidando de familiar'],
  ausente: ['Doente', 'Trabalho', 'Plantão', 'Viagem', 'Cuidando de familiar', 'Sem contato'],
};

const LBL: Record<AttendanceStatus, string> = {
  presencial: 'Presencial',
  zoom: 'Zoom',
  ausente: 'Ausente',
};

const NEXT_STATUS: Record<string, AttendanceStatus | null> = {
  null: 'presencial',
  presencial: 'zoom',
  zoom: 'ausente',
  ausente: null,
};

const TYPE_LABEL: Record<MeetingType, string> = {
  midweek: 'Meio de semana',
  weekend: 'Fim de semana',
};

const fmtDate = (d: string) => {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length < 3) return d;
  return `${parts[2]}/${parts[1]}`;
};

const todayISO = () => {
  const d = new Date();
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
};

const buzz = () => {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(15);
    }
  } catch (_) {}
};

const csvEsc = (v: unknown) => {
  const s = String(v == null ? '' : v);
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

function downloadFile(name: string, text: string, mime: string) {
  const b = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function parseCSV(text: string): string[][] {
  const clean = text.replace(/^\ufeff/, '');
  const first = clean.split(/\r?\n/)[0] || '';
  const del = [';', ',', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let f = '';
  let q = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (q) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          f += '"';
          i++;
        } else {
          q = false;
        }
      } else {
        f += c;
      }
    } else if (c === '"') {
      q = true;
    } else if (c === del) {
      row.push(f);
      f = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(f);
      f = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else {
      f += c;
    }
  }
  row.push(f);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const normStr = (s: unknown) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

interface UndoEntry {
  pid: string;
  st: AttendanceStatus | null;
  note: string;
}

interface UndoItem {
  mid: string;
  entries: UndoEntry[];
}

interface ImportRowPreview {
  ex?: string;
  name: string;
  g: number;
  fam: string;
  active: boolean;
}

type SheetType =
  | null
  | { type: 'newMeeting' }
  | { type: 'delMeeting'; mid: string }
  | { type: 'manageMeetings' }
  | { type: 'reason'; pid: string }
  | { type: 'finish' }
  | { type: 'reopen' }
  | { type: 'managePubs' }
  | { type: 'editPub'; pid: string | null }
  | { type: 'delPub'; pid: string }
  | { type: 'editCong' }
  | { type: 'exportSheet' }
  | { type: 'importPreview'; add: number; upd: number; skip: number; rows: ImportRowPreview[] }
  | { type: 'summary'; text: string };

export function App() {
  // Estado principal da congregação
  const [database, setDatabase] = useState<CongregationDatabase>(() => loadDatabase());
  const [activeTab, setActiveTab] = useState<NavigationTab>('attendance');
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>(() => {
    const initialDb = loadDatabase();
    const sortedInitial = [...initialDb.meetings].sort((a, b) => b.date.localeCompare(a.date));
    return sortedInitial.length > 0 ? sortedInitial[0].id : '';
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);
  const [isBackupHistoryOpen, setIsBackupHistoryOpen] = useState<boolean>(false);
  const [showRestoreBanner, setShowRestoreBanner] = useState<boolean>(false);
  const [isFirebaseActive, setIsFirebaseActive] = useState<boolean>(false);
  const [isServerConnected, setIsServerConnected] = useState<boolean>(true);
  const [connectedDevicesCount, setConnectedDevicesCount] = useState<number>(1);
  const [syncToastMessage, setSyncToastMessage] = useState<string | null>(null);

  const handleRestoreTuesdaySaturday = async () => {
    try {
      const restored = restoreTuesdayAndSaturdayData(database);
      setDatabase(restored);
      saveDatabase(restored);
      const targetMeeting =
        restored.meetings.find((m) => m.id === 'meet-sabado-12' || m.id === 'meet-terca-08') ||
        restored.meetings[0];
      if (targetMeeting) {
        setSelectedMeetingId(targetMeeting.id);
      }
      setSyncToastMessage('✅ Reuniões e cadastros de Terça e Sábado restaurados com sucesso!');
      setTimeout(() => setSyncToastMessage(null), 5000);
      setShowRestoreBanner(false);
      await restoreTuesdaySaturdayOnServer();
    } catch (err: any) {
      setSyncToastMessage('❌ Erro ao restaurar: ' + (err?.message || 'Falha inesperada'));
      setTimeout(() => setSyncToastMessage(null), 6000);
    }
  };

  // Status de conexão e fila de sincronização offline
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [pendingQueue, setPendingQueue] = useState<PendingSyncItem[]>(() => getPendingQueue());
  const [isSyncingQueue, setIsSyncingQueue] = useState<boolean>(false);

  // Estados dos botões Salvar / Sincronizar e Atualizar da chamada
  const [isSyncingAttendance, setIsSyncingAttendance] = useState<boolean>(false);
  const [isRefreshingAttendance, setIsRefreshingAttendance] = useState<boolean>(false);
  const [lastSavedTimestamp, setLastSavedTimestamp] = useState<Record<string, string>>({});
  const [isAutoPollActive] = useState<boolean>(true);

  // Refs de controle para sincronização simultânea sem conflitos (evita que polling sobrescreva toque local em andamento)
  const databaseRef = useRef<CongregationDatabase>(database);
  useEffect(() => {
    databaseRef.current = database;
  }, [database]);
  const lastLocalMutationTimeRef = useRef<number>(0);
  const inFlightMutationsRef = useRef<number>(0);
  const lastServerUpdatedRef = useRef<string>('');
  const lastSyncedRemoteMeetingRef = useRef<string>('');

  // Monitora a fila de pendências salva localmente
  useEffect(() => {
    const unsub = subscribeToQueueChanges((q) => {
      setPendingQueue(q);
    });
    return () => unsub();
  }, []);

  // Função para processar a fila de pendências (servidor + Firebase)
  const flushPendingQueue = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const currentQueue = getPendingQueue();
    if (currentQueue.length === 0) return;

    setIsSyncingQueue(true);
    try {
      const result = await processPendingSyncQueue(isFirebaseActive);
      if (result.success > 0) {
        setSyncToastMessage(
          `🎉 Sincronização automática: ${result.success} alteraç${
            result.success > 1 ? 'ões foram sincronizadas' : 'ão foi sincronizada'
          }!`
        );
        setTimeout(() => setSyncToastMessage(null), 5000);
      }
    } catch (err) {
      console.warn('Erro ao processar fila offline:', err);
    } finally {
      setIsSyncingQueue(false);
    }
  }, [isFirebaseActive]);

  // Monitora alterações de rede (Online / Offline)
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      flushPendingQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [flushPendingQueue]);

  // Verifica se há pendências quando o Firebase se torna ativo
  useEffect(() => {
    if (isFirebaseActive && isOnline) {
      flushPendingQueue();
    }
  }, [isFirebaseActive, isOnline, flushPendingQueue]);

  // Inicialização do Firebase e detecção de link de sincronização rápida (#sync=...)
  useEffect(() => {
    const urlConfig = decodeFirebaseConfigFromHash();
    if (urlConfig) {
      saveFirebaseConfig(urlConfig);
      const res = initFirebaseService(urlConfig);
      if (res.success) {
        setIsFirebaseActive(true);
        setSyncToastMessage('🎉 Este aparelho foi sincronizado com sucesso com a congregação!');
        setTimeout(() => setSyncToastMessage(null), 6000);
      }
      try {
        window.history.replaceState(null, '', window.location.pathname);
      } catch (_) {}
      return;
    }

    const config = getStoredFirebaseConfig();
    if (config && config.apiKey && config.projectId) {
      const res = initFirebaseService(config);
      if (res.success) {
        setIsFirebaseActive(true);
      }
    }
  }, []);

  // Sincronização em tempo real entre abas no mesmo navegador (BroadcastChannel)
  useEffect(() => {
    const unsub = subscribeToLocalSync((newDb) => {
      setDatabase(newDb);
    });
    return () => unsub();
  }, []);

  // Sincronização em tempo real com o servidor central e outros aparelhos (SSE + REST)
  useEffect(() => {
    let isMounted = true;
    const myDeviceId = getDeviceInfo().deviceId;

    (async () => {
      // Primeiro descarrega qualquer pendência local (ex: 8ª reunião criada offline) antes de buscar do servidor
      try {
        await processPendingSyncQueue(false);
      } catch {}

      const serverDb = await fetchServerDatabase();
      if (!isMounted || !serverDb) return;
      setIsServerConnected(true);
      if (serverDb.lastUpdated) {
        lastServerUpdatedRef.current = serverDb.lastUpdated;
      }

      const localCurrent = databaseRef.current || loadDatabase();
      const mergedInitial = mergeDatabases(serverDb, localCurrent, { mode: 'union' });

      const srvMeetIds = new Set((serverDb.meetings || []).map((m) => m.id));
      const srvPubIds = new Set((serverDb.publishers || []).map((p) => p.id));
      const srvDelMeetIds = new Set(serverDb.deletedMeetingIds || []);
      const srvDelPubIds = new Set(serverDb.deletedPublisherIds || []);

      const hasLocalUnsyncedItems =
        mergedInitial.meetings.some((m) => !srvMeetIds.has(m.id)) ||
        mergedInitial.publishers.some((p) => !srvPubIds.has(p.id)) ||
        (mergedInitial.deletedMeetingIds || []).some((id) => !srvDelMeetIds.has(id)) ||
        (mergedInitial.deletedPublisherIds || []).some((id) => !srvDelPubIds.has(id));

      const pendingAutoSync =
        typeof window !== 'undefined' && sessionStorage.getItem('jw_pending_auto_sync') === '1';
      if (pendingAutoSync) {
        sessionStorage.removeItem('jw_pending_auto_sync');
      }

      setDatabase(mergedInitial);
      saveDatabase(mergedInitial);

      // Se este aparelho tinha uma chamada (ex: 8ª chamada) que ainda não estava no servidor, envia imediatamente!
      if (hasLocalUnsyncedItems || pendingAutoSync) {
        const pushedDb = await sendDatabaseToServer(mergedInitial);
        if (pushedDb && isMounted) {
          if (pushedDb.lastUpdated) {
            lastServerUpdatedRef.current = pushedDb.lastUpdated;
          }
          setDatabase(pushedDb);
          saveDatabase(pushedDb);
          clearPendingQueue();
          if (pendingAutoSync) {
            setSyncToastMessage('✓ Sincronizado em todos os aparelhos!');
            setTimeout(() => setSyncToastMessage(null), 3500);
          }
        }
      } else {
        clearPendingQueue();
      }

      // Sincroniza a reunião selecionada com a última reunião ativa ou mais recente
      if (Array.isArray(mergedInitial.meetings) && mergedInitial.meetings.length > 0) {
        const activeRemoteMid = mergedInitial.syncMetadata?.lastEditedMeetingId;
        if (activeRemoteMid && mergedInitial.meetings.some((m) => m.id === activeRemoteMid)) {
          lastSyncedRemoteMeetingRef.current = activeRemoteMid;
          setSelectedMeetingId(activeRemoteMid);
        } else {
          const sorted = [...mergedInitial.meetings].sort((a, b) => b.date.localeCompare(a.date));
          if (sorted[0]) {
            setSelectedMeetingId(sorted[0].id);
          }
        }
      }
    })();

    const unsubSse = subscribeToServerEvents({
      onConnectionStatusChange: (status) => {
        if (isMounted) setIsServerConnected(status);
      },
      onPresenceChanged: (count) => {
        if (isMounted) setConnectedDevicesCount(count);
      },
      onAttendanceUpdated: (data) => {
        if (!isMounted) return;
        if (data.lastUpdated) {
          lastServerUpdatedRef.current = data.lastUpdated;
        }
        setDatabase((prev) => {
          // Substitui integralmente o mapa de presença e notas daquela reunião (inclusive desmarcações e visitantes)
          const updatedMeetingAtt = { ...(data.attendance || {}) };
          const newNotes =
            data.notes !== undefined
              ? {
                  ...(prev.attendanceNotes || {}),
                  [data.meetingId]: { ...data.notes },
                }
              : prev.attendanceNotes;

          const nextDb: CongregationDatabase = {
            ...prev,
            attendance: {
              ...prev.attendance,
              [data.meetingId]: updatedMeetingAtt,
            },
            attendanceNotes: newNotes,
            syncMetadata: data.metadata || {
              lastEditorDeviceId: data.sourceDeviceId || 'outro-aparelho',
              lastEditorDeviceName: data.sourceDeviceName || 'Outro Aparelho',
              lastEditedAt: new Date().toISOString(),
              lastEditedMeetingId: data.meetingId,
              lastEditedDescription: 'Chamada atualizada em tempo real',
            },
            lastUpdated: data.lastUpdated || new Date().toISOString(),
          };
          saveDatabase(nextDb);
          return nextDb;
        });

        // Se outro aparelho está fazendo chamada em uma reunião, acompanha simultaneamente a mesma reunião
        if (
          data.meetingId &&
          data.sourceDeviceId !== myDeviceId &&
          Date.now() - lastLocalMutationTimeRef.current > 5000
        ) {
          lastSyncedRemoteMeetingRef.current = data.meetingId;
          setSelectedMeetingId(data.meetingId);
        }
      },
      onDatabaseUpdated: (data) => {
        if (!isMounted || !data.database) return;
        if (data.database.lastUpdated) {
          lastServerUpdatedRef.current = data.database.lastUpdated;
        }
        setDatabase((prev) => {
          const nextDb = mergeDatabases(data.database, prev, {
            preferIncoming: false,
            mode: 'pull_server',
          });
          saveDatabase(nextDb);
          return nextDb;
        });
        const remoteMid = data.database?.syncMetadata?.lastEditedMeetingId;
        if (
          remoteMid &&
          data.sourceDeviceId !== myDeviceId &&
          Array.isArray(data.database?.meetings) &&
          data.database.meetings.some((m) => m.id === remoteMid)
        ) {
          lastSyncedRemoteMeetingRef.current = remoteMid;
          setSelectedMeetingId(remoteMid);
        }
        if (data.sourceDeviceName && data.sourceDeviceId !== myDeviceId) {
          setSyncToastMessage(`🔄 Sincronizado com ${data.sourceDeviceName}`);
          setTimeout(() => setSyncToastMessage(null), 3000);
        }
      },
      onPublisherUpdated: (data) => {
        if (!isMounted) return;
        if (data.lastUpdated) {
          lastServerUpdatedRef.current = data.lastUpdated;
        }
        setDatabase((prev) => {
          const deletedPubs = Array.from(
            new Set([...(prev.deletedPublisherIds || []), ...(data.deletedPublisherIds || [])])
          );
          const delSet = new Set(deletedPubs);
          const nextDb: CongregationDatabase = {
            ...prev,
            publishers: (data.publishers || []).filter((p) => !delSet.has(p.id)),
            deletedPublisherIds: deletedPubs,
            lastUpdated: data.lastUpdated || prev.lastUpdated,
          };
          saveDatabase(nextDb);
          return nextDb;
        });
      },
      onMeetingUpdated: (data) => {
        if (!isMounted) return;
        if (data.lastUpdated) {
          lastServerUpdatedRef.current = data.lastUpdated;
        }
        setDatabase((prev) => {
          const deletedMeets = Array.from(
            new Set([...(prev.deletedMeetingIds || []), ...(data.deletedMeetingIds || [])])
          );
          if (data.meeting?.id) {
            const idx = deletedMeets.indexOf(data.meeting.id);
            if (idx >= 0) deletedMeets.splice(idx, 1);
          }
          const delSet = new Set(deletedMeets);

          // Une as reuniões recebidas com quaisquer reuniões locais não excluídas
          const meetingsMap = new Map<string, Meeting>();
          for (const m of prev.meetings || []) {
            if (m && m.id && !delSet.has(m.id) && m.id !== data.meetingId) {
              meetingsMap.set(m.id, m);
            }
          }
          for (const m of data.meetings || []) {
            if (m && m.id && !delSet.has(m.id)) {
              meetingsMap.set(m.id, m);
            }
          }
          const mergedMeetings = Array.from(meetingsMap.values()).sort((a, b) =>
            String(b.date || '').localeCompare(String(a.date || ''))
          );

          const validMeetingIds = new Set(mergedMeetings.map((m) => m.id));
          const sourceAtt = { ...(prev.attendance || {}), ...(data.attendance || {}) };
          const sourceNotes = { ...(prev.attendanceNotes || {}), ...(data.attendanceNotes || {}) };
          const nextAtt: Record<string, Record<string, AttendanceStatus>> = {};
          Object.entries(sourceAtt).forEach(([mid, att]) => {
            if (validMeetingIds.has(mid) && att) nextAtt[mid] = att;
          });
          const nextNotes: Record<string, Record<string, string>> = {};
          Object.entries(sourceNotes).forEach(([mid, notes]) => {
            if (validMeetingIds.has(mid) && notes) nextNotes[mid] = notes;
          });
          const nextDb: CongregationDatabase = {
            ...prev,
            meetings: mergedMeetings,
            deletedMeetingIds: deletedMeets,
            attendance: nextAtt,
            attendanceNotes: nextNotes,
            syncMetadata: data.metadata || prev.syncMetadata,
            lastUpdated: data.lastUpdated || prev.lastUpdated,
          };
          saveDatabase(nextDb);
          return nextDb;
        });

        // Se uma nova reunião foi criada em outro aparelho, seleciona ela automaticamente
        if (data.meeting?.id && data.sourceDeviceId !== myDeviceId) {
          lastSyncedRemoteMeetingRef.current = data.meeting.id;
          setSelectedMeetingId(data.meeting.id);
        }
      },
    });

    return () => {
      isMounted = false;
      unsubSse();
    };
  }, []);

  // Listener em tempo real do Firestore
  useEffect(() => {
    if (!isFirebaseActive) return;

    const unsubscribe = listenToFirestore((remoteDb) => {
      setDatabase((prev) => ({
        ...prev,
        ...remoteDb,
        congregationName: remoteDb.congregationName || prev.congregationName,
        publishers: remoteDb.publishers?.length ? remoteDb.publishers : prev.publishers,
        meetings: remoteDb.meetings?.length ? remoteDb.meetings : prev.meetings,
        attendance: { ...prev.attendance, ...(remoteDb.attendance || {}) },
        attendanceNotes: { ...(prev.attendanceNotes || {}), ...(remoteDb.attendanceNotes || {}) },
        shepherdingVisits: remoteDb.shepherdingVisits?.length
          ? remoteDb.shepherdingVisits
          : prev.shepherdingVisits,
        syncMetadata: remoteDb.syncMetadata || prev.syncMetadata,
      }));
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isFirebaseActive]);

  // Salvar no LocalStorage sempre que o banco for alterado
  useEffect(() => {
    saveDatabase(database);
  }, [database]);

  // Lista de reuniões ordenada por data decrescente
  const sortedMeetings = useMemo(() => {
    return [...database.meetings].sort((a, b) => b.date.localeCompare(a.date));
  }, [database.meetings]);

  // Se a reunião selecionada for excluída ou não existir, seleciona a mais recente
  useEffect(() => {
    if (sortedMeetings.length > 0) {
      const exists = sortedMeetings.some((m) => m.id === selectedMeetingId);
      if (!exists) {
        setSelectedMeetingId(sortedMeetings[0].id);
      }
    } else {
      setSelectedMeetingId('');
    }
  }, [sortedMeetings, selectedMeetingId]);

  // Reunião atualmente selecionada para chamada
  const currentMeeting = useMemo(() => {
    return database.meetings.find((m) => m.id === selectedMeetingId) || null;
  }, [database.meetings, selectedMeetingId]);

  // Cálculo de faltas consecutivas
  const absenceStreaks = useMemo(() => {
    return detectAbsenceStreaks(database.publishers, database.meetings, database.attendance);
  }, [database.publishers, database.meetings, database.attendance]);

  // Auxiliar para sincronizar presença + notas de uma reunião (com suporte a changes atômicos)
  const syncMeetingAttendanceAndNotes = useCallback(
    (
      meetingId: string,
      meetingAtt: Record<string, AttendanceStatus>,
      meetingNotes: Record<string, string>,
      description: string,
      changes?: Array<{ pid: string; st: AttendanceStatus | null; note?: string }>
    ) => {
      lastLocalMutationTimeRef.current = Date.now();
      const device = getDeviceInfo();
      const editorInfo = {
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        description,
      };

      if (isOnline) {
        inFlightMutationsRef.current += 1;
        sendAttendanceToServer(meetingId, meetingAtt, meetingNotes, editorInfo, changes)
          .then((ok) => {
            if (!ok) enqueueAttendanceSync(meetingId, meetingAtt, meetingNotes);
          })
          .catch(() => {
            enqueueAttendanceSync(meetingId, meetingAtt, meetingNotes);
          })
          .finally(() => {
            inFlightMutationsRef.current = Math.max(0, inFlightMutationsRef.current - 1);
          });

        if (isFirebaseActive) {
          syncAttendanceToFirestore(meetingId, meetingAtt, meetingNotes, editorInfo)
            .then((success) => {
              if (!success) enqueueAttendanceSync(meetingId, meetingAtt, meetingNotes);
            })
            .catch(() => enqueueAttendanceSync(meetingId, meetingAtt, meetingNotes));
        }
      } else {
        enqueueAttendanceSync(meetingId, meetingAtt, meetingNotes);
      }
    },
    [isOnline, isFirebaseActive]
  );

  // HANDLERS DE CHAMADA (ATTENDANCE)
  const handleAttendanceChange = (
    meetingId: string,
    publisherId: string,
    status: AttendanceStatus
  ) => {
    lastLocalMutationTimeRef.current = Date.now();
    setDatabase((prev) => {
      const meetingAtt = { ...(prev.attendance[meetingId] || {}) };
      meetingAtt[publisherId] = status;

      const newAttendance = {
        ...prev.attendance,
        [meetingId]: meetingAtt,
      };

      const device = getDeviceInfo();
      const nowIso = new Date().toISOString();
      const updatedDb = {
        ...prev,
        attendance: newAttendance,
        syncMetadata: {
          lastEditorDeviceId: device.deviceId,
          lastEditorDeviceName: device.deviceName,
          lastEditedAt: nowIso,
          lastEditedMeetingId: meetingId,
          lastEditedDescription: 'Chamada atualizada',
        },
        lastUpdated: nowIso,
      };

      syncMeetingAttendanceAndNotes(
        meetingId,
        meetingAtt,
        updatedDb.attendanceNotes?.[meetingId] || {},
        'Chamada atualizada',
        [{ pid: publisherId, st: status }]
      );

      return updatedDb;
    });
  };

  const handleBatchAttendanceChange = (
    meetingId: string,
    publisherIds: string[],
    status: AttendanceStatus
  ) => {
    lastLocalMutationTimeRef.current = Date.now();
    setDatabase((prev) => {
      const meetingAtt = { ...(prev.attendance[meetingId] || {}) };
      publisherIds.forEach((pid) => {
        meetingAtt[pid] = status;
      });

      const newAttendance = {
        ...prev.attendance,
        [meetingId]: meetingAtt,
      };

      const device = getDeviceInfo();
      const nowIso = new Date().toISOString();
      const updatedDb = {
        ...prev,
        attendance: newAttendance,
        syncMetadata: {
          lastEditorDeviceId: device.deviceId,
          lastEditorDeviceName: device.deviceName,
          lastEditedAt: nowIso,
          lastEditedMeetingId: meetingId,
          lastEditedDescription: 'Chamada em lote atualizada',
        },
        lastUpdated: nowIso,
      };

      syncMeetingAttendanceAndNotes(
        meetingId,
        meetingAtt,
        updatedDb.attendanceNotes?.[meetingId] || {},
        'Chamada em lote atualizada',
        publisherIds.map((pid) => ({ pid, st: status }))
      );

      return updatedDb;
    });
  };

  // HANDLER DE OBSERVAÇÃO / MOTIVO / VISITANTES / FINALIZADA
  const handleAttendanceNoteChange = (
    meetingId: string,
    publisherId: string,
    note: string
  ) => {
    lastLocalMutationTimeRef.current = Date.now();
    setDatabase((prev) => {
      const currentNotes = { ...(prev.attendanceNotes || {}) };
      const meetingNotes = { ...(currentNotes[meetingId] || {}) };

      if (note.trim()) {
        meetingNotes[publisherId] = note.trim();
      } else {
        delete meetingNotes[publisherId];
      }

      currentNotes[meetingId] = meetingNotes;

      const device = getDeviceInfo();
      const nowIso = new Date().toISOString();
      const updatedDb = {
        ...prev,
        attendanceNotes: currentNotes,
        syncMetadata: {
          lastEditorDeviceId: device.deviceId,
          lastEditorDeviceName: device.deviceName,
          lastEditedAt: nowIso,
          lastEditedMeetingId: meetingId,
          lastEditedDescription: 'Observação da reunião atualizada',
        },
        lastUpdated: nowIso,
      };

      const meetingAtt = prev.attendance[meetingId] || {};
      syncMeetingAttendanceAndNotes(
        meetingId,
        meetingAtt,
        meetingNotes,
        'Observação da reunião atualizada',
        [{ pid: publisherId, st: meetingAtt[publisherId] || undefined as any, note: note.trim() }]
      );

      return updatedDb;
    });
  };

  // COPIAR ASSISTÊNCIA DE REUNIÃO ANTERIOR COM SINCRONIZAÇÃO EM TEMPO REAL
  const handleCopyAttendanceFromMeeting = (
    sourceMeetingId: string,
    targetMeetingId: string,
    options: {
      onlyPresent: boolean;
      preserveExistingMarks: boolean;
    }
  ) => {
    lastLocalMutationTimeRef.current = Date.now();
    setDatabase((prev) => {
      const sourceAtt = prev.attendance[sourceMeetingId] || {};
      const currentAtt = { ...(prev.attendance[targetMeetingId] || {}) };
      const sourceNotes = prev.attendanceNotes?.[sourceMeetingId] || {};
      const currentNotes = { ...(prev.attendanceNotes?.[targetMeetingId] || {}) };

      prev.publishers.forEach((pub) => {
        if (!pub || pub.active === false) return;
        if (options.preserveExistingMarks && currentAtt[pub.id]) {
          return;
        }
        const st = sourceAtt[pub.id];
        if (!st) return;

        if (options.onlyPresent && st === 'ausente') {
          return;
        }

        currentAtt[pub.id] = st;
        if (sourceNotes[pub.id]) {
          currentNotes[pub.id] = sourceNotes[pub.id];
        }
      });

      const newAttendance = {
        ...prev.attendance,
        [targetMeetingId]: currentAtt,
      };

      const newNotes = {
        ...(prev.attendanceNotes || {}),
        [targetMeetingId]: currentNotes,
      };

      const device = getDeviceInfo();
      const nowIso = new Date().toISOString();
      const updatedDb = {
        ...prev,
        attendance: newAttendance,
        attendanceNotes: newNotes,
        syncMetadata: {
          lastEditorDeviceId: device.deviceId,
          lastEditorDeviceName: device.deviceName,
          lastEditedAt: nowIso,
          lastEditedMeetingId: targetMeetingId,
          lastEditedDescription: 'Assistência copiada da reunião anterior',
        },
        lastUpdated: nowIso,
      };

      syncMeetingAttendanceAndNotes(
        targetMeetingId,
        currentAtt,
        currentNotes,
        'Assistência copiada da reunião anterior'
      );

      saveDatabase(updatedDb);
      return updatedDb;
    });
  };

  // SALVAR E SINCRONIZAR CHAMADA DA REUNIÃO ATIVA
  const handleSaveAndSyncAttendance = async (meetingId: string) => {
    setIsSyncingAttendance(true);
    try {
      saveDatabase(database);

      const meetingAtt = database.attendance[meetingId] || {};
      const meetingNotes = database.attendanceNotes?.[meetingId] || {};
      const device = getDeviceInfo();
      const editorInfo = {
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        description: 'Chamada salva e sincronizada',
      };

      if (isOnline) {
        await sendAttendanceToServer(meetingId, meetingAtt, meetingNotes, editorInfo).catch(console.warn);

        if (isFirebaseActive) {
          await syncAttendanceToFirestore(meetingId, meetingAtt, meetingNotes, editorInfo).catch(console.warn);
        }

        await flushPendingQueue();
      } else {
        enqueueAttendanceSync(meetingId, meetingAtt, meetingNotes);
      }

      const now = new Date();
      const timeFormatted = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setLastSavedTimestamp((prev) => ({ ...prev, [meetingId]: timeFormatted }));
      return true;
    } catch (err) {
      console.error('Erro ao salvar e sincronizar chamada:', err);
      return false;
    } finally {
      setIsSyncingAttendance(false);
    }
  };

  // ATUALIZAR DADOS E RECARREGAR CHAMADA DO SERVIDOR
  const handleRefreshAttendanceData = async (silent: boolean = false) => {
    // Nunca sobrescreve mutações locais recentes ou em andamento durante atualizações silenciosas
    if (
      silent &&
      (inFlightMutationsRef.current > 0 || Date.now() - lastLocalMutationTimeRef.current < 2000)
    ) {
      return;
    }
    if (!silent) setIsRefreshingAttendance(true);
    try {
      if (isOnline) {
        const serverDb = await fetchServerDatabase();
        if (
          silent &&
          (inFlightMutationsRef.current > 0 || Date.now() - lastLocalMutationTimeRef.current < 2000)
        ) {
          return;
        }
        if (serverDb) {
          if (serverDb.lastUpdated) {
            lastServerUpdatedRef.current = serverDb.lastUpdated;
          }
          setDatabase((prev) => {
            const nextDb = mergeDatabases(serverDb, prev, {
              preferIncoming: false,
              mode: 'pull_server',
            });
            saveDatabase(nextDb);
            return nextDb;
          });
        }
      }
    } catch (err) {
      console.error('Erro ao atualizar dados:', err);
    } finally {
      if (!silent) setIsRefreshingAttendance(false);
    }
  };

  // BOTÃO ÚNICO DE SINCRONIZAÇÃO INTELIGENTE E SIMULTÂNEA (Une chamadas de todos os aparelhos sem nunca divergir!)
  const handleForcePushSyncAllDevices = async () => {
    setIsSyncingAttendance(true);
    buzz();
    try {
      await flushPendingQueue();
      const device = getDeviceInfo();
      const serverDb = await fetchServerDatabase();

      const serverTime = serverDb?.lastUpdated ? new Date(serverDb.lastUpdated).getTime() : 0;
      const localTime = database?.lastUpdated ? new Date(database.lastUpdated).getTime() : 0;
      const recentLocalEdit = Date.now() - lastLocalMutationTimeRef.current < 15000;
      const nowIso = new Date().toISOString();

      // SEMPRE une as chamadas (reuniões), publicadores e presenças do servidor e deste aparelho
      // (respeitando deletedMeetingIds / deletedPublisherIds) para que todos os aparelhos fiquem com exatamente o mesmo número de chamadas!
      const preferLocal = !(serverDb && serverTime > localTime && !recentLocalEdit);
      const mergedBase = mergeDatabases(serverDb, database, {
        preferIncoming: preferLocal,
        mode: 'union',
        activeMeetingId: preferLocal ? selectedMeetingId : undefined,
      });

      const unifiedDb: CongregationDatabase = {
        ...mergedBase,
        lastUpdated: nowIso,
        syncMetadata: preferLocal
          ? {
              lastEditorDeviceId: device.deviceId,
              lastEditorDeviceName: device.deviceName,
              lastEditedAt: nowIso,
              lastEditedMeetingId: selectedMeetingId,
              lastEditedDescription: 'Sincronização simultânea',
            }
          : mergedBase.syncMetadata || {
              lastEditorDeviceId: device.deviceId,
              lastEditorDeviceName: device.deviceName,
              lastEditedAt: nowIso,
              lastEditedMeetingId: selectedMeetingId,
              lastEditedDescription: 'Sincronização simultânea',
            },
      };

      setDatabase(unifiedDb);
      saveDatabase(unifiedDb);

      // Se houver alguma reunião local que ainda não estava no servidor, envia também individualmente por garantia
      const srvMeetIds = new Set((serverDb?.meetings || []).map((m) => m.id));
      for (const m of unifiedDb.meetings) {
        if (!srvMeetIds.has(m.id)) {
          await sendMeetingToServer(
            m,
            unifiedDb.attendance[m.id] || {},
            unifiedDb.attendanceNotes?.[m.id] || {}
          ).catch(() => {});
        }
      }

      // Envia o banco unificado para o servidor (que salva e transmite via SSE/Poll para todos os outros aparelhos)
      const serverSavedDb = await sendDatabaseToServer(unifiedDb);
      let ok = Boolean(serverSavedDb);

      if (serverSavedDb) {
        if (serverSavedDb.lastUpdated) {
          lastServerUpdatedRef.current = serverSavedDb.lastUpdated;
        }
        setDatabase(serverSavedDb);
        saveDatabase(serverSavedDb);
      } else if (selectedMeetingId) {
        // Fallback rápido caso POST do banco completo falhe: envia a chamada ativa diretamente
        ok = await sendAttendanceToServer(
          selectedMeetingId,
          unifiedDb.attendance[selectedMeetingId] || {},
          unifiedDb.attendanceNotes?.[selectedMeetingId] || {},
          {
            deviceId: device.deviceId,
            deviceName: device.deviceName,
            description: 'Sincronização simultânea',
          }
        );
      }

      if (isFirebaseActive) {
        let fbOk = false;
        for (const m of unifiedDb.meetings) {
          const mOk = await syncMeetingToFirestore(m).catch(() => false);
          if (mOk) fbOk = true;
          const mAtt = unifiedDb.attendance[m.id] || {};
          const mNotes = unifiedDb.attendanceNotes?.[m.id] || {};
          const aOk = await syncAttendanceToFirestore(m.id, mAtt, mNotes, {
            deviceId: device.deviceId,
            deviceName: device.deviceName,
            description: 'Sincronização simultânea',
          }).catch(() => false);
          if (aOk) fbOk = true;
        }
        for (const p of unifiedDb.publishers) {
          await syncPublisherToFirestore(p).catch(() => false);
        }
        if (fbOk) ok = true;
      }

      if (ok) {
        setIsServerConnected(true);
        clearPendingQueue();
        const finalDb = serverSavedDb || unifiedDb;
        showSnack(`✓ Sincronizado (${finalDb.meetings.length} chamadas)!`, false);
        return;
      }

      // Se o navegador está online mas o cookie de sessão do proxy expirou em segundo plano no iOS/Safari,
      // renova a sessão automaticamente recarregando com permissão de armazenamento
      if (typeof window !== 'undefined' && navigator.onLine) {
        const lastReload = Number(sessionStorage.getItem('jw_last_auth_reload') || '0');
        if (Date.now() - lastReload > 30000) {
          sessionStorage.setItem('jw_last_auth_reload', String(Date.now()));
          sessionStorage.setItem('jw_pending_auto_sync', '1');
          showSnack('🔄 Reconectando e sincronizando aparelhos…', false);
          const targetUrl = `${window.location.pathname}?__storage_access_granted=1`;
          window.location.replace(targetUrl);
          return;
        }
      }

      clearPendingQueue();
      showSnack('✓ Dados salvos e sincronizados!', false);
    } catch (err) {
      console.error('Erro ao sincronizar aparelhos:', err);
      showSnack('✓ Dados salvos no aparelho!', false);
    } finally {
      setIsSyncingAttendance(false);
    }
  };

  // Mantido para compatibilidade de props
  const handleForcePullSyncFromServer = async () => {
    await handleForcePushSyncAllDevices();
  };

  // Loop de sincronização simultânea ultra-rápida (a cada 1 segundo) para iPhone, iPad, Android e PC
  useEffect(() => {
    const myDeviceId = getDeviceInfo().deviceId;

    const runFastPoll = async () => {
      if (!isOnline || !isAutoPollActive) return;
      if (inFlightMutationsRef.current > 0 || Date.now() - lastLocalMutationTimeRef.current < 1800) {
        return;
      }

      const curDb = databaseRef.current;
      const pollRes = await pollServerChanges(
        lastServerUpdatedRef.current,
        curDb?.meetings?.length,
        curDb?.publishers?.length
      );
      if (!pollRes) return;

      if (inFlightMutationsRef.current > 0 || Date.now() - lastLocalMutationTimeRef.current < 1800) {
        return;
      }

      if (pollRes.connectedClients !== undefined) {
        setConnectedDevicesCount(pollRes.connectedClients);
        setIsServerConnected(true);
      }

      if (pollRes.changed && pollRes.database) {
        const srv = pollRes.database;
        lastServerUpdatedRef.current = pollRes.lastUpdated || srv.lastUpdated || '';

        const prev = databaseRef.current;
        const srvMeetIds = new Set((srv.meetings || []).map((m) => m.id));
        const srvDelMeetIds = new Set(srv.deletedMeetingIds || []);

        const nextDb = mergeDatabases(srv, prev, {
          preferIncoming: false,
          mode: 'pull_server',
        });

        const hasLocalOnlyMeetings = nextDb.meetings.some((m) => !srvMeetIds.has(m.id));
        const hasLocalOnlyDeletions = (nextDb.deletedMeetingIds || []).some(
          (id) => !srvDelMeetIds.has(id)
        );

        setDatabase(nextDb);
        saveDatabase(nextDb);

        // Se este aparelho tem chamadas que o servidor ainda não tem (ex: 8ª chamada local), envia automaticamente para o servidor!
        if (hasLocalOnlyMeetings || hasLocalOnlyDeletions) {
          sendDatabaseToServer(nextDb)
            .then((saved) => {
              if (saved?.lastUpdated) {
                lastServerUpdatedRef.current = saved.lastUpdated;
              }
            })
            .catch(() => {});
        }

        // Se outro aparelho selecionou/criou/editou uma reunião, acompanha simultaneamente
        const remoteMid = srv.syncMetadata?.lastEditedMeetingId;
        const remoteEditor = srv.syncMetadata?.lastEditorDeviceId;
        if (
          remoteMid &&
          remoteEditor &&
          remoteEditor !== myDeviceId &&
          remoteMid !== lastSyncedRemoteMeetingRef.current &&
          Date.now() - lastLocalMutationTimeRef.current > 5000 &&
          Array.isArray(nextDb.meetings) &&
          nextDb.meetings.some((m) => m.id === remoteMid)
        ) {
          lastSyncedRemoteMeetingRef.current = remoteMid;
          setSelectedMeetingId(remoteMid);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && isOnline) {
        runFastPoll();
      }
    };

    const handleWindowFocus = () => {
      if (isOnline) runFastPoll();
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    window.addEventListener('focus', handleWindowFocus);

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      runFastPoll();
    }, 1000);

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      window.removeEventListener('focus', handleWindowFocus);
      clearInterval(interval);
    };
  }, [isOnline, isAutoPollActive]);

  // ALTERAÇÃO DIRETA DA DATA DA REUNIÃO
  const handleUpdateMeetingDate = (meetingId: string, newDate: string) => {
    if (!newDate) return;
    const dayOfWeek = getPortugueseDayOfWeek(newDate);
    setDatabase((prev) => {
      const newMeetings = prev.meetings.map((m) =>
        m.id === meetingId ? { ...m, date: newDate, dayOfWeek } : m
      );
      const updatedMeeting = newMeetings.find((m) => m.id === meetingId);
      if (updatedMeeting) {
        if (isOnline) {
          sendMeetingToServer(updatedMeeting)
            .then((ok) => {
              if (!ok) enqueueMeetingSync(updatedMeeting);
            })
            .catch(() => enqueueMeetingSync(updatedMeeting));
          if (isFirebaseActive) {
            syncMeetingToFirestore(updatedMeeting)
              .then((success) => {
                if (!success) enqueueMeetingSync(updatedMeeting);
              })
              .catch(() => enqueueMeetingSync(updatedMeeting));
          }
        } else {
          enqueueMeetingSync(updatedMeeting);
        }
      }
      return {
        ...prev,
        meetings: newMeetings,
        lastUpdated: new Date().toISOString(),
      };
    });
  };

  // CRIAÇÃO RÁPIDA DE REUNIÃO PARA DATA SELECIONADA
  const handleQuickCreateMeetingForDate = (dateStr: string, type: MeetingType = 'midweek') => {
    const dayOfWeek = getPortugueseDayOfWeek(dateStr);
    const newMeeting: Meeting = {
      id: `meet-${Date.now()}`,
      type,
      date: dateStr,
      dayOfWeek,
      titleOrTheme:
        type === 'midweek'
          ? 'Nossa Vida e Ministério Cristão'
          : 'Discurso Público e Estudo de A Sentinela',
      createdAt: new Date().toISOString(),
    };
    handleSaveMeeting(newMeeting);
  };

  // HANDLERS DE REUNIÕES (MEETINGS)
  const handleSaveMeeting = (meeting: Meeting) => {
    lastLocalMutationTimeRef.current = Date.now();
    setDatabase((prev) => {
      const exists = prev.meetings.some((m) => m.id === meeting.id);
      const newMeetings = exists
        ? prev.meetings.map((m) => (m.id === meeting.id ? meeting : m))
        : [meeting, ...prev.meetings];
      const newDeletedMeetings = (prev.deletedMeetingIds || []).filter((id) => id !== meeting.id);

      const updatedDb: CongregationDatabase = {
        ...prev,
        meetings: newMeetings,
        deletedMeetingIds: newDeletedMeetings,
        lastUpdated: new Date().toISOString(),
      };

      if (isOnline) {
        sendMeetingToServer(meeting)
          .then((ok) => {
            if (!ok) enqueueMeetingSync(meeting);
          })
          .catch(() => enqueueMeetingSync(meeting));
        if (isFirebaseActive) {
          syncMeetingToFirestore(meeting)
            .then((success) => {
              if (!success) enqueueMeetingSync(meeting);
            })
            .catch(() => enqueueMeetingSync(meeting));
        }
      } else {
        enqueueMeetingSync(meeting);
      }

      saveDatabase(updatedDb);
      return updatedDb;
    });

    setSelectedMeetingId(meeting.id);
  };

  const handleDeleteMeeting = (meetingId: string) => {
    lastLocalMutationTimeRef.current = Date.now();
    setDatabase((prev) => {
      const newMeetings = prev.meetings.filter((m) => m.id !== meetingId);
      const newAttendance = { ...prev.attendance };
      delete newAttendance[meetingId];
      const newAttendanceNotes = { ...(prev.attendanceNotes || {}) };
      delete newAttendanceNotes[meetingId];
      const newDeletedMeetingIds = Array.from(
        new Set([...(prev.deletedMeetingIds || []), meetingId])
      );

      if (isOnline) {
        inFlightMutationsRef.current += 1;
        deleteMeetingOnServer(meetingId)
          .then((ok) => {
            if (!ok) enqueueDeleteMeetingSync(meetingId);
          })
          .catch(() => enqueueDeleteMeetingSync(meetingId))
          .finally(() => {
            inFlightMutationsRef.current = Math.max(0, inFlightMutationsRef.current - 1);
          });
        if (isFirebaseActive) {
          deleteMeetingFromFirestore(meetingId).catch(console.warn);
        }
      } else {
        enqueueDeleteMeetingSync(meetingId);
      }

      const updated: CongregationDatabase = {
        ...prev,
        meetings: newMeetings,
        deletedMeetingIds: newDeletedMeetingIds,
        attendance: newAttendance,
        attendanceNotes: newAttendanceNotes,
        lastUpdated: new Date().toISOString(),
      };
      saveDatabase(updated);
      return updated;
    });

    if (selectedMeetingId === meetingId) {
      const remaining = database.meetings.filter((m) => m.id !== meetingId);
      setSelectedMeetingId(remaining.length > 0 ? remaining[0].id : '');
    }
  };

  // HANDLERS DE PUBLICADORES (PUBLISHERS)
  const handleSavePublisher = (publisher: Publisher) => {
    lastLocalMutationTimeRef.current = Date.now();
    setDatabase((prev) => {
      const exists = prev.publishers.some((p) => p.id === publisher.id);
      const newPublishers = exists
        ? prev.publishers.map((p) => (p.id === publisher.id ? publisher : p))
        : [...prev.publishers, publisher];
      const newDeletedPubs = (prev.deletedPublisherIds || []).filter((id) => id !== publisher.id);

      const updatedDb: CongregationDatabase = {
        ...prev,
        publishers: newPublishers,
        deletedPublisherIds: newDeletedPubs,
        lastUpdated: new Date().toISOString(),
      };

      if (isOnline) {
        inFlightMutationsRef.current += 1;
        sendPublisherToServer(publisher)
          .then((ok) => {
            if (!ok) enqueuePublisherSync(publisher);
          })
          .catch(() => enqueuePublisherSync(publisher))
          .finally(() => {
            inFlightMutationsRef.current = Math.max(0, inFlightMutationsRef.current - 1);
          });
        if (isFirebaseActive) {
          syncPublisherToFirestore(publisher)
            .then((success) => {
              if (!success) enqueuePublisherSync(publisher);
            })
            .catch(() => enqueuePublisherSync(publisher));
        }
      } else {
        enqueuePublisherSync(publisher);
      }

      saveDatabase(updatedDb);
      return updatedDb;
    });
  };

  const handleDeletePublisher = (publisherId: string) => {
    lastLocalMutationTimeRef.current = Date.now();
    setDatabase((prev) => {
      const newPublishers = prev.publishers.filter((p) => p.id !== publisherId);
      const newAttendance = { ...prev.attendance };
      Object.keys(newAttendance).forEach((mid) => {
        if (newAttendance[mid] && publisherId in newAttendance[mid]) {
          newAttendance[mid] = { ...newAttendance[mid] };
          delete newAttendance[mid][publisherId];
        }
      });
      const newNotes = { ...(prev.attendanceNotes || {}) };
      Object.keys(newNotes).forEach((mid) => {
        if (newNotes[mid] && publisherId in newNotes[mid]) {
          newNotes[mid] = { ...newNotes[mid] };
          delete newNotes[mid][publisherId];
        }
      });
      const newDeletedPublisherIds = Array.from(
        new Set([...(prev.deletedPublisherIds || []), publisherId])
      );

      if (isOnline) {
        inFlightMutationsRef.current += 1;
        deletePublisherOnServer(publisherId)
          .then((ok) => {
            if (!ok) enqueueDeletePublisherSync(publisherId);
          })
          .catch(() => enqueueDeletePublisherSync(publisherId))
          .finally(() => {
            inFlightMutationsRef.current = Math.max(0, inFlightMutationsRef.current - 1);
          });
        if (isFirebaseActive) {
          deletePublisherFromFirestore(publisherId).catch(console.warn);
        }
      } else {
        enqueueDeletePublisherSync(publisherId);
      }
      const updated: CongregationDatabase = {
        ...prev,
        publishers: newPublishers,
        deletedPublisherIds: newDeletedPublisherIds,
        attendance: newAttendance,
        attendanceNotes: newNotes,
        lastUpdated: new Date().toISOString(),
      };
      saveDatabase(updated);
      return updated;
    });
  };

  // HANDLERS DE PASTOREIO (SHEPHERDING)
  const handleSaveVisit = (visit: ShepherdingVisit) => {
    setDatabase((prev) => {
      const exists = prev.shepherdingVisits.some((v) => v.id === visit.id);
      const newVisits = exists
        ? prev.shepherdingVisits.map((v) => (v.id === visit.id ? visit : v))
        : [visit, ...prev.shepherdingVisits];

      const updatedDb = {
        ...prev,
        shepherdingVisits: newVisits,
        lastUpdated: new Date().toISOString(),
      };

      if (isOnline) {
        sendShepherdingToServer(visit).catch(() => enqueueVisitSync(visit));
        if (isFirebaseActive) {
          syncVisitToFirestore(visit)
            .then((success) => {
              if (!success) enqueueVisitSync(visit);
            })
            .catch(() => enqueueVisitSync(visit));
        }
      } else {
        enqueueVisitSync(visit);
      }

      return updatedDb;
    });
  };

  const handleDeleteVisit = (visitId: string) => {
    setDatabase((prev) => {
      const newVisits = prev.shepherdingVisits.filter((v) => v.id !== visitId);
      return {
        ...prev,
        shepherdingVisits: newVisits,
        lastUpdated: new Date().toISOString(),
      };
    });
  };

  // ATUALIZAÇÃO DO BANCO COMPLETO (ex: Importar JSON ou Trocar Nome)
  const handleDatabaseUpdated = (newDb: CongregationDatabase) => {
    setDatabase(newDb);
    if (newDb.meetings.length > 0) {
      setSelectedMeetingId(newDb.meetings[0].id);
    }
    if (isOnline) {
      sendDatabaseToServer(newDb).catch(console.warn);
    }
  };

  const handleUpdateCongregationName = (name: string) => {
    setDatabase((prev) => {
      const updated = {
        ...prev,
        congregationName: name,
        lastUpdated: new Date().toISOString(),
      };
      if (isOnline) {
        sendDatabaseToServer(updated).catch(console.warn);
      }
      return updated;
    });
  };

  // ============================================================================
  // ESTADOS E HELPERS DA INTERFACE CLAUDE (CHAMADA + PAINEL + SHEETS + SNACKBAR)
  // ============================================================================
  const topRef = useRef<HTMLDivElement>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const snackTimerRef = useRef<number | null>(null);

  // Inicializa o tema claro/escuro salvo no aparelho
  useEffect(() => {
    try {
      const th = localStorage.getItem('chamada.theme');
      if (th === 'dark' || th === 'light') {
        document.documentElement.dataset.theme = th;
      }
    } catch (_) {}
  }, []);

  const toggleTheme = () => {
    const r = document.documentElement;
    const isDark =
      r.dataset.theme === 'dark' ||
      (!r.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const nextTheme = isDark ? 'light' : 'dark';
    r.dataset.theme = nextTheme;
    try {
      localStorage.setItem('chamada.theme', nextTheme);
    } catch (_) {}
  };

  // Estados locais de filtro da Chamada
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [onlyUnmarked, setOnlyUnmarked] = useState<boolean>(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<number, boolean>>({});

  // Estados locais de filtro do Painel
  const [dashType, setDashType] = useState<'all' | 'midweek' | 'weekend'>('all');
  const [dashGroup, setDashGroup] = useState<string>('all');
  const [dashLast, setDashLast] = useState<number>(0);
  const [dashSearch, setDashSearch] = useState<string>('');

  // Undo stack & Snackbar
  const [undoStack, setUndoStack] = useState<UndoItem[]>([]);
  const [snackState, setSnackState] = useState<{
    show: boolean;
    text: string;
    canUndo: boolean;
    fam: { pid: string; st: AttendanceStatus | null; n: number } | null;
  }>({ show: false, text: '', canUndo: false, fam: null });

  const showSnack = useCallback(
    (
      text: string,
      canUndo: boolean = false,
      fam: { pid: string; st: AttendanceStatus | null; n: number } | null = null
    ) => {
      if (snackTimerRef.current) {
        window.clearTimeout(snackTimerRef.current);
      }
      setSnackState({ show: true, text, canUndo, fam });
      snackTimerRef.current = window.setTimeout(() => {
        setSnackState((prev) => ({ ...prev, show: false }));
      }, 6000);
    },
    []
  );

  // Sheet modal ativa
  const [activeSheet, setActiveSheet] = useState<SheetType>(null);

  // Estados auxiliares dos formulários dentro das sheets
  const [newMeetingDate, setNewMeetingDate] = useState<string>(todayISO());
  const [newMeetingType, setNewMeetingType] = useState<MeetingType>(() => {
    const dow = new Date().getDay();
    return dow === 0 || dow === 6 ? 'weekend' : 'midweek';
  });
  const [newMeetingInitMode, setNewMeetingInitMode] = useState<'pres' | 'copy' | 'blank'>('pres');

  const [reasonCustomText, setReasonCustomText] = useState<string>('');
  const [managePubsSearch, setManagePubsSearch] = useState<string>('');

  const [editPubName, setEditPubName] = useState<string>('');
  const [editPubGroup, setEditPubGroup] = useState<string>('1');
  const [editPubNewGroup, setEditPubNewGroup] = useState<string>('');
  const [editPubFamily, setEditPubFamily] = useState<string>('');
  const [editPubActive, setEditPubActive] = useState<boolean>(true);
  const [editPubError, setEditPubError] = useState<string>('');

  const [editCongNameInput, setEditCongNameInput] = useState<string>('');
  const [editCongError, setEditCongError] = useState<string>('');

  // PWA install prompt
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Ajusta --hh para o cabeçalho sticky dos grupos
  useEffect(() => {
    const updateHeaderHeight = () => {
      if (topRef.current) {
        document.documentElement.style.setProperty('--hh', `${topRef.current.offsetHeight}px`);
      }
    };
    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    return () => window.removeEventListener('resize', updateHeaderHeight);
  }, [activeTab, selectedMeetingId, showRestoreBanner, onlyUnmarked]);

  // Publicadores ativos e lista de grupos
  const activePublishers = useMemo(() => {
    return database.publishers.filter((p) => p.active !== false);
  }, [database.publishers]);

  const groupsList = useMemo(() => {
    const set = new Set<number>(database.publishers.map((p) => p.group));
    return Array.from(set).sort((a, b) => a - b);
  }, [database.publishers]);

  const existingFamilies = useMemo(() => {
    const set = new Set<string>();
    database.publishers.forEach((p) => {
      if (p.familyName && p.familyName.trim()) {
        set.add(p.familyName.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [database.publishers]);

  // Mapas da reunião atual
  const currentAttMap = useMemo(() => {
    return selectedMeetingId ? database.attendance[selectedMeetingId] || {} : {};
  }, [database.attendance, selectedMeetingId]);

  const currentNotesMap = useMemo(() => {
    return selectedMeetingId ? database.attendanceNotes?.[selectedMeetingId] || {} : {};
  }, [database.attendanceNotes, selectedMeetingId]);

  // Visitantes e status Finalizada por reunião (sincronizados via attendanceNotes para funcionar em todos os aparelhos)
  const getVisitorsForMeeting = useCallback(
    (mid: string): number => {
      const raw = database.attendanceNotes?.[mid]?.['__visitors'];
      const n = raw ? parseInt(raw, 10) : 0;
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    [database.attendanceNotes]
  );

  const isMeetingFinalized = useCallback(
    (mid: string): boolean => {
      return database.attendanceNotes?.[mid]?.['__finalized'] === 'true';
    },
    [database.attendanceNotes]
  );

  const setVisitorsForCurrentMeeting = (nextVal: number) => {
    if (!selectedMeetingId) return;
    const clamped = Math.max(0, nextVal);
    buzz();
    handleAttendanceNoteChange(selectedMeetingId, '__visitors', clamped > 0 ? String(clamped) : '');
  };

  const setFinalizedForCurrentMeeting = (fin: boolean) => {
    if (!selectedMeetingId) return;
    handleAttendanceNoteChange(selectedMeetingId, '__finalized', fin ? 'true' : '');
  };

  // Guard quando a chamada já está finalizada
  const checkGuard = (): boolean => {
    if (!selectedMeetingId) return false;
    if (!isMeetingFinalized(selectedMeetingId)) return true;
    setActiveSheet({ type: 'reopen' });
    return false;
  };

  // Contadores em tempo real da reunião atual
  const counts = useMemo(() => {
    let p = 0;
    let z = 0;
    let au = 0;
    activePublishers.forEach((pub) => {
      const s = currentAttMap[pub.id];
      if (s === 'presencial') p++;
      else if (s === 'zoom') z++;
      else if (s === 'ausente') au++;
    });
    const vis = selectedMeetingId ? getVisitorsForMeeting(selectedMeetingId) : 0;
    const n = activePublishers.length - p - z - au;
    return {
      p,
      z,
      au,
      vis,
      n,
      total: activePublishers.length,
      assist: p + z + vis,
    };
  }, [activePublishers, currentAttMap, selectedMeetingId, getVisitorsForMeeting]);

  const getFamilyMembers = useCallback(
    (pub: Publisher): Publisher[] => {
      if (!pub.familyName || !pub.familyName.trim()) return [];
      const target = pub.familyName.trim().toLowerCase();
      return activePublishers.filter(
        (x) => x.id !== pub.id && x.familyName && x.familyName.trim().toLowerCase() === target
      );
    },
    [activePublishers]
  );

  // Aplica uma lista de alterações de presença/nota em lote (com suporte a Desfazer e sincronização imediata)
  const applyMarksList = useCallback(
    (
      meetingId: string,
      changes: { pid: string; st: AttendanceStatus | null; note?: string }[],
      recordUndo: boolean = true,
      description: string = 'Chamada atualizada'
    ): number => {
      if (!meetingId || changes.length === 0) return 0;

      const prevAtt = database.attendance[meetingId] || {};
      const prevNotes = database.attendanceNotes?.[meetingId] || {};

      const undoEntries: UndoEntry[] = [];
      const effectiveChanges: { pid: string; st: AttendanceStatus | null; note?: string }[] = [];

      changes.forEach((ch) => {
        const curSt = prevAtt[ch.pid] || null;
        const curNote = prevNotes[ch.pid] || '';
        const nextNote = ch.note !== undefined ? ch.note : curNote;
        if (curSt !== ch.st || (ch.note !== undefined && curNote !== nextNote)) {
          undoEntries.push({ pid: ch.pid, st: curSt, note: curNote });
          effectiveChanges.push(ch);
        }
      });

      if (effectiveChanges.length === 0) return 0;

      if (recordUndo) {
        setUndoStack((prev) => [...prev.slice(-29), { mid: meetingId, entries: undoEntries }]);
      }

      setDatabase((prev) => {
        const meetingAtt = { ...(prev.attendance[meetingId] || {}) };
        const meetingNotes = { ...(prev.attendanceNotes?.[meetingId] || {}) };

        effectiveChanges.forEach(({ pid, st, note }) => {
          if (st) {
            meetingAtt[pid] = st;
          } else {
            delete meetingAtt[pid];
          }
          if (note !== undefined) {
            if (note.trim()) {
              meetingNotes[pid] = note.trim();
            } else {
              delete meetingNotes[pid];
            }
          }
          if (st !== 'zoom' && st !== 'ausente') {
            delete meetingNotes[pid];
          }
        });

        const device = getDeviceInfo();
        const nowIso = new Date().toISOString();
        const updatedDb: CongregationDatabase = {
          ...prev,
          attendance: {
            ...prev.attendance,
            [meetingId]: meetingAtt,
          },
          attendanceNotes: {
            ...(prev.attendanceNotes || {}),
            [meetingId]: meetingNotes,
          },
          syncMetadata: {
            lastEditorDeviceId: device.deviceId,
            lastEditorDeviceName: device.deviceName,
            lastEditedAt: nowIso,
            lastEditedMeetingId: meetingId,
            lastEditedDescription: description,
          },
          lastUpdated: nowIso,
        };

        syncMeetingAttendanceAndNotes(
          meetingId,
          meetingAtt,
          meetingNotes,
          description,
          effectiveChanges
        );
        saveDatabase(updatedDb);
        return updatedDb;
      });

      return effectiveChanges.length;
    },
    [database.attendance, database.attendanceNotes, syncMeetingAttendanceAndNotes]
  );

  // Ciclar status de 1 irmão (Marcar -> Presencial -> Zoom -> Ausente -> Marcar)
  const handleCycleStatus = (pub: Publisher) => {
    if (!selectedMeetingId || !checkGuard()) return;
    const currentSt = currentAttMap[pub.id] || null;
    const nextSt = NEXT_STATUS[String(currentSt)];
    buzz();
    applyMarksList(selectedMeetingId, [{ pid: pub.id, st: nextSt }], true, 'Chamada atualizada');
    const fam = getFamilyMembers(pub);
    showSnack(
      `${pub.name}: ${nextSt ? LBL[nextSt] : 'sem marcação'}`,
      true,
      fam.length > 0 ? { pid: pub.id, st: nextSt, n: fam.length } : null
    );
  };

  // Aplicar mesmo status para toda a família (a partir do Snackbar ou botão de família)
  const handleApplyFamilyFromSnack = () => {
    if (!snackState.fam || !selectedMeetingId || !checkGuard()) return;
    const pub = activePublishers.find((x) => x.id === snackState.fam?.pid);
    if (!pub) return;
    const members = getFamilyMembers(pub);
    const targetSt = snackState.fam.st;
    const count = applyMarksList(
      selectedMeetingId,
      members.map((m) => ({ pid: m.id, st: targetSt })),
      true,
      'Família marcada em lote'
    );
    showSnack(
      `${count} da família marcado(s): ${targetSt ? LBL[targetSt] : 'sem marcação'}`,
      count > 0,
      null
    );
  };

  // Desfazer última alteração
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    if (last.mid !== selectedMeetingId) {
      setSelectedMeetingId(last.mid);
    }
    applyMarksList(
      last.mid,
      last.entries.map((e) => ({ pid: e.pid, st: e.st, note: e.note })),
      false,
      'Alteração desfeita'
    );
    setSnackState((prev) => ({ ...prev, show: false }));
  };

  // Marcar todos os não marcados de um grupo como Presencial
  const handleMarkGroupPresencial = (groupNum: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedMeetingId || !checkGuard()) return;
    const unmarkedInGroup = activePublishers.filter(
      (p) => p.group === groupNum && !currentAttMap[p.id]
    );
    const k = applyMarksList(
      selectedMeetingId,
      unmarkedInGroup.map((p) => ({ pid: p.id, st: 'presencial' })),
      true,
      `Grupo ${groupNum} marcado como presencial`
    );
    showSnack(`${k} do Grupo ${groupNum} marcados presencial`, k > 0);
  };

  // Marcar todos os não marcados da congregação como Presencial
  const handleMarkAllPresencial = () => {
    if (!selectedMeetingId || !checkGuard()) return;
    const unmarked = activePublishers.filter((p) => !currentAttMap[p.id]);
    const k = applyMarksList(
      selectedMeetingId,
      unmarked.map((p) => ({ pid: p.id, st: 'presencial' })),
      true,
      'Todos marcados como presencial'
    );
    showSnack(`${k} marcados como presencial`, k > 0);
  };

  // Copiar chamada da reunião anterior (para quem ainda está sem marcação)
  const handleQuickCopyPrevious = () => {
    if (!selectedMeetingId || !currentMeeting || !checkGuard()) return;
    const prev =
      sortedMeetings.find(
        (x) =>
          x.id !== currentMeeting.id &&
          x.date < currentMeeting.date &&
          x.type === currentMeeting.type &&
          Object.keys(database.attendance[x.id] || {}).length > 0
      ) ||
      sortedMeetings.find(
        (x) =>
          x.id !== currentMeeting.id &&
          x.date < currentMeeting.date &&
          Object.keys(database.attendance[x.id] || {}).length > 0
      ) ||
      sortedMeetings.find(
        (x) => x.id !== currentMeeting.id && Object.keys(database.attendance[x.id] || {}).length > 0
      );

    if (!prev) {
      showSnack('Não há reunião anterior', false);
      return;
    }

    const prevAtt = database.attendance[prev.id] || {};
    const prevNotes = database.attendanceNotes?.[prev.id] || {};
    const list: { pid: string; st: AttendanceStatus; note?: string }[] = [];

    activePublishers.forEach((p) => {
      const s = prevAtt[p.id];
      if (s && !currentAttMap[p.id]) {
        list.push({ pid: p.id, st: s, note: prevNotes[p.id] || '' });
      }
    });

    const k = applyMarksList(
      selectedMeetingId,
      list,
      true,
      `Assistência copiada de ${fmtDate(prev.date)}`
    );
    showSnack(`${k} copiados de ${fmtDate(prev.date)}`, k > 0);
  };

  // Copiar resumo para área de transferência
  const handleCopySummary = () => {
    if (!currentMeeting) return;
    const abs = activePublishers
      .filter((p) => currentAttMap[p.id] === 'ausente')
      .map((p) => p.name + (currentNotesMap[p.id] ? ` (${currentNotesMap[p.id]})` : ''));
    const tx =
      `Chamada ${fmtDate(currentMeeting.date)} – ${TYPE_LABEL[currentMeeting.type]}\n` +
      `Presenciais: ${counts.p}\n` +
      `Zoom: ${counts.z}\n` +
      `Visitantes: ${counts.vis}\n` +
      `Assistência total: ${counts.assist}\n` +
      `Ausentes: ${counts.au}` +
      (abs.length ? `\n${abs.join('\n')}` : '');

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(tx)
        .then(() => showSnack('Resumo copiado', false))
        .catch(() => setActiveSheet({ type: 'summary', text: tx }));
    } else {
      setActiveSheet({ type: 'summary', text: tx });
    }
  };

  // Abrir Sheet de Nova Reunião
  const openNewMeetingSheet = () => {
    const dow = new Date().getDay();
    setNewMeetingDate(todayISO());
    setNewMeetingType(dow === 0 || dow === 6 ? 'weekend' : 'midweek');
    setNewMeetingInitMode('pres');
    setActiveSheet({ type: 'newMeeting' });
  };

  // Criar Reunião a partir da Sheet
  const handleCreateMeetingFromSheet = () => {
    const date = newMeetingDate || todayISO();
    const type = newMeetingType;
    const mode = newMeetingInitMode;
    const dayOfWeek = getPortugueseDayOfWeek(date);

    const prev =
      sortedMeetings.find((m) => m.type === type && m.date < date) ||
      sortedMeetings.find((m) => m.date < date);

    const m: Meeting = {
      id: `meet-${Date.now()}`,
      type,
      date,
      dayOfWeek,
      titleOrTheme:
        type === 'midweek'
          ? 'Nossa Vida e Ministério Cristão'
          : 'Discurso Público e Estudo de A Sentinela',
      createdAt: new Date().toISOString(),
    };

    const initialAtt: Record<string, AttendanceStatus> = {};
    const initialNotes: Record<string, string> = {};

    if (mode === 'pres') {
      activePublishers.forEach((p) => {
        initialAtt[p.id] = 'presencial';
      });
    } else if (mode === 'copy' && prev) {
      const pAtt = database.attendance[prev.id] || {};
      const pNotes = database.attendanceNotes?.[prev.id] || {};
      activePublishers.forEach((p) => {
        const s = pAtt[p.id];
        if (s) {
          initialAtt[p.id] = s;
          if (pNotes[p.id]) initialNotes[p.id] = pNotes[p.id];
        }
      });
    }

    lastLocalMutationTimeRef.current = Date.now();
    const device = getDeviceInfo();
    const nowIso = new Date().toISOString();

    setDatabase((prevDb) => {
      const updatedDb: CongregationDatabase = {
        ...prevDb,
        meetings: [m, ...prevDb.meetings],
        attendance: {
          ...prevDb.attendance,
          [m.id]: initialAtt,
        },
        attendanceNotes: {
          ...(prevDb.attendanceNotes || {}),
          [m.id]: initialNotes,
        },
        syncMetadata: {
          lastEditorDeviceId: device.deviceId,
          lastEditorDeviceName: device.deviceName,
          lastEditedAt: nowIso,
          lastEditedMeetingId: m.id,
          lastEditedDescription: 'Nova reunião criada',
        },
        lastUpdated: nowIso,
      };
      saveDatabase(updatedDb);
      return updatedDb;
    });

    if (isOnline) {
      inFlightMutationsRef.current += 1;
      sendMeetingToServer(m, initialAtt, initialNotes)
        .then((ok) => {
          if (!ok) {
            enqueueMeetingSync(m);
            if (Object.keys(initialAtt).length > 0) {
              enqueueAttendanceSync(m.id, initialAtt, initialNotes);
            }
          }
        })
        .catch(() => {
          enqueueMeetingSync(m);
          if (Object.keys(initialAtt).length > 0) {
            enqueueAttendanceSync(m.id, initialAtt, initialNotes);
          }
        })
        .finally(() => {
          inFlightMutationsRef.current = Math.max(0, inFlightMutationsRef.current - 1);
        });

      if (isFirebaseActive) {
        syncMeetingToFirestore(m).catch(() => enqueueMeetingSync(m));
        if (Object.keys(initialAtt).length > 0) {
          syncAttendanceToFirestore(m.id, initialAtt, initialNotes, {
            deviceId: device.deviceId,
            deviceName: device.deviceName,
            description: 'Nova reunião criada',
          }).catch(() => {});
        }
      }
    } else {
      enqueueMeetingSync(m);
      if (Object.keys(initialAtt).length > 0) {
        enqueueAttendanceSync(m.id, initialAtt, initialNotes);
      }
    }

    setSelectedMeetingId(m.id);
    setActiveSheet(null);
    window.scrollTo(0, 0);
  };

  // Abrir Sheet de Motivo (Zoom / Ausente)
  const openReasonSheet = (pid: string) => {
    if (!checkGuard()) return;
    const curNote = currentNotesMap[pid] || '';
    const st = currentAttMap[pid];
    const presets = st === 'zoom' || st === 'ausente' ? REASONS[st] : [];
    setReasonCustomText(presets.includes(curNote) ? '' : curNote);
    setActiveSheet({ type: 'reason', pid });
  };

  // Abrir Sheet de Editar / Novo Irmão
  const openEditPubSheet = (pid: string | null) => {
    const p = pid ? database.publishers.find((x) => x.id === pid) : null;
    setEditPubName(p ? p.name : '');
    setEditPubGroup(String(p ? p.group : groupsList[0] || 1));
    setEditPubNewGroup('');
    setEditPubFamily(p?.familyName || '');
    setEditPubActive(p ? p.active !== false : true);
    setEditPubError('');
    setActiveSheet({ type: 'editPub', pid });
  };

  const handleSavePubFromSheet = (pid: string | null) => {
    const cleanName = editPubName.trim().replace(/\s+/g, ' ');
    if (!cleanName) {
      setEditPubError('Digite o nome.');
      return;
    }
    let grpNum = 1;
    if (editPubGroup === 'new') {
      grpNum = parseInt(editPubNewGroup, 10);
      if (!(grpNum > 0)) {
        setEditPubError('Digite o número do novo grupo.');
        return;
      }
    } else {
      grpNum = parseInt(editPubGroup, 10) || 1;
    }

    const duplicate = database.publishers.some(
      (x) => x.id !== pid && x.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (duplicate) {
      setEditPubError('Já existe um irmão com esse nome.');
      return;
    }

    const existing = pid ? database.publishers.find((x) => x.id === pid) : undefined;
    const pubToSave: Publisher = {
      id: existing ? existing.id : `pub-${Date.now().toString(36)}`,
      name: cleanName,
      group: grpNum,
      roles: existing?.roles?.length ? existing.roles : ['Publicador Batizado'],
      phone: existing?.phone,
      notes: existing?.notes,
      active: editPubActive,
      familyName: editPubFamily.trim() || undefined,
      isFamilyHead: existing?.isFamilyHead,
    };

    handleSavePublisher(pubToSave);
    setActiveSheet(null);
    showSnack(`${cleanName} salvo (Grupo ${grpNum})`, false);
  };

  // Exportações CSV / JSON
  const handleExportCsvAttendance = () => {
    const lines = ['data;tipo;grupo;nome;familia;status;motivo'];
    [...database.meetings]
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((m) => {
        const a = database.attendance[m.id] || {};
        const n = database.attendanceNotes?.[m.id] || {};
        [...database.publishers]
          .sort((x, y) => x.group - y.group || x.name.localeCompare(y.name, 'pt-BR'))
          .forEach((p) => {
            lines.push(
              [
                m.date,
                TYPE_LABEL[m.type],
                p.group,
                p.name,
                p.familyName || '',
                a[p.id] || 'nao_marcado',
                n[p.id] || '',
              ]
                .map(csvEsc)
                .join(';')
            );
          });
        lines.push(
          [m.date, TYPE_LABEL[m.type], '', '(visitantes)', '', getVisitorsForMeeting(m.id), '']
            .map(csvEsc)
            .join(';')
        );
      });
    downloadFile(
      `presencas-${todayISO()}.csv`,
      '\ufeff' + lines.join('\r\n'),
      'text/csv;charset=utf-8'
    );
    setActiveSheet(null);
  };

  const handleExportCsvPublishers = () => {
    const lines = ['nome;grupo;familia;ativo'].concat(
      [...database.publishers]
        .sort((a, b) => a.group - b.group || a.name.localeCompare(b.name, 'pt-BR'))
        .map((p) =>
          [p.name, p.group, p.familyName || '', p.active === false ? 'nao' : 'sim']
            .map(csvEsc)
            .join(';')
        )
    );
    downloadFile(
      `irmaos-${todayISO()}.csv`,
      '\ufeff' + lines.join('\r\n'),
      'text/csv;charset=utf-8'
    );
    setActiveSheet(null);
  };

  const handleExportJsonAll = () => {
    const visitorsObj: Record<string, number> = {};
    database.meetings.forEach((m) => {
      const v = getVisitorsForMeeting(m.id);
      if (v > 0) visitorsObj[m.id] = v;
    });
    downloadFile(
      `chamada-${todayISO()}.json`,
      JSON.stringify(
        {
          congregationName: database.congregationName,
          publishers: database.publishers,
          meetings: database.meetings,
          attendance: database.attendance,
          attendanceNotes: database.attendanceNotes || {},
          visitors: visitorsObj,
          exportDate: new Date().toISOString(),
        },
        null,
        2
      ),
      'application/json'
    );
    setActiveSheet(null);
  };

  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const rows = parseCSV(text);
      if (!rows.length) {
        setActiveSheet({ type: 'importPreview', add: 0, upd: 0, skip: 0, rows: [] });
        return;
      }
      const head = rows[0].map(normStr);
      const hasCol = (keys: string[]) => head.findIndex((h) => keys.includes(h));
      let iN = hasCol(['nome', 'name']);
      let iG = hasCol(['grupo', 'group']);
      let iF = hasCol(['familia', 'family']);
      let iA = hasCol(['ativo', 'active', 'situacao']);
      let body = rows;
      if (iN >= 0 || iG >= 0) {
        body = rows.slice(1);
      } else {
        iN = 0;
        iG = 1;
        iF = 2;
        iA = 3;
      }
      const isNo = (v: unknown) => ['nao', 'n', '0', 'false', 'inativo', 'no'].includes(normStr(v));
      const res: ImportRowPreview[] = [];
      let add = 0;
      let upd = 0;
      let skip = 0;

      body.forEach((r) => {
        const name = (r[iN] || '').trim().replace(/\s+/g, ' ');
        if (!name) {
          skip++;
          return;
        }
        const g = parseInt(r[iG], 10);
        const fam = (r[iF] || '').trim();
        const av = r[iA];
        const ex = database.publishers.find((p) => p.name.toLowerCase() === name.toLowerCase());
        if (ex) {
          res.push({
            ex: ex.id,
            name,
            g: g > 0 ? g : ex.group,
            fam: iF >= 0 ? fam : ex.familyName || '',
            active: av !== undefined && av !== '' ? !isNo(av) : ex.active !== false,
          });
          upd++;
        } else if (g > 0) {
          res.push({
            name,
            g,
            fam,
            active: av !== undefined && av !== '' ? !isNo(av) : true,
          });
          add++;
        } else {
          skip++;
        }
      });

      setActiveSheet({ type: 'importPreview', add, upd, skip, rows: res });
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const handleConfirmCsvImport = (rowsToImport: ImportRowPreview[]) => {
    rowsToImport.forEach((x) => {
      const existing = x.ex ? database.publishers.find((q) => q.id === x.ex) : undefined;
      const pub: Publisher = existing
        ? {
            ...existing,
            group: x.g,
            active: x.active,
            familyName: x.fam || undefined,
          }
        : {
            id: `pub-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
            name: x.name,
            group: x.g,
            roles: ['Publicador Batizado'],
            active: x.active,
            familyName: x.fam || undefined,
          };
      handleSavePublisher(pub);
    });
    setActiveSheet(null);
    showSnack(`${rowsToImport.length} irmão(s) importado(s)`, false);
  };

  // ============================================================================
  // CÁLCULOS DO PAINEL (DASHBOARD)
  // ============================================================================
  const dashData = useMemo(() => {
    let ms = [...database.meetings]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((m) => Object.keys(database.attendance[m.id] || {}).length > 0);
    if (dashType !== 'all') {
      ms = ms.filter((m) => m.type === dashType);
    }
    if (dashLast > 0) {
      ms = ms.slice(-dashLast);
    }

    const ps = activePublishers.filter(
      (p) => dashGroup === 'all' || p.group === Number(dashGroup)
    );

    const computeStats = (meetingsList: Meeting[], pubsList: Publisher[]) =>
      meetingsList.map((m) => {
        let pr = 0;
        let z = 0;
        let a = 0;
        let n = 0;
        const att = database.attendance[m.id] || {};
        pubsList.forEach((p) => {
          const s = att[p.id] || null;
          if (s === 'presencial') pr++;
          else if (s === 'zoom') z++;
          else if (s === 'ausente') a++;
          else n++;
        });
        const mk = pr + z + a;
        const vis = getVisitorsForMeeting(m.id);
        return {
          m,
          pr,
          z,
          a,
          n,
          total: pr + z,
          vis,
          pct: mk ? ((pr + z) / mk) * 100 : null,
        };
      });

    const ss = computeStats(ms, ps);
    const done = ss.filter((x) => x.pct !== null);
    const avg = done.length ? done.reduce((s, x) => s + x.total, 0) / done.length : 0;
    const pct = done.length ? done.reduce((s, x) => s + (x.pct || 0), 0) / done.length : 0;
    const avgVis = done.length ? done.reduce((s, x) => s + x.vis, 0) / done.length : 0;
    const tp = done.reduce((s, x) => s + x.pr, 0);
    const tz = done.reduce((s, x) => s + x.z, 0);
    const zs = tp + tz ? (tz / (tp + tz)) * 100 : 0;
    const last = done[done.length - 1] || null;

    // Ausências seguidas
    const streakForPub = (p: Publisher) => {
      let c = 0;
      for (let i = ms.length - 1; i >= 0; i--) {
        const s = (database.attendance[ms[i].id] || {})[p.id] || null;
        if (s === 'ausente') c++;
        else if (s === null) continue;
        else break;
      }
      return c;
    };

    const alerts = ps
      .map((p) => ({ p, c: streakForPub(p) }))
      .filter((x) => x.c >= 2)
      .sort((a, b) => b.c - a.c);

    // Por grupo
    const groupRows = groupsList
      .map((g) => {
        const gp = activePublishers.filter((p) => p.group === g);
        if (!gp.length) return null;
        const sg = computeStats(ms, gp).filter((x) => x.pct !== null);
        const pc = sg.length ? sg.reduce((s, x) => s + (x.pct || 0), 0) / sg.length : 0;
        return { g, count: gp.length, pct: pc };
      })
      .filter((x): x is { g: number; count: number; pct: number } => x !== null);

    // Quadro de presença (matriz)
    const q = dashSearch.trim().toLowerCase();
    const matrixRows = ps.filter((p) => !q || p.name.toLowerCase().includes(q));

    return {
      ms,
      ps,
      ss,
      avg,
      pct,
      avgVis,
      tz,
      zs,
      last,
      alerts,
      groupRows,
      matrixRows,
    };
  }, [
    database.meetings,
    database.attendance,
    dashType,
    dashGroup,
    dashLast,
    dashSearch,
    activePublishers,
    groupsList,
    getVisitorsForMeeting,
  ]);

  // Texto do indicador de sincronização no topo
  const syncBadgeText = useMemo(() => {
    const n = pendingQueue.length;
    if (!isOnline) {
      return `📴 Offline${n ? ` · ${n} pendente` : ''}`;
    }
    if (isSyncingAttendance || isSyncingQueue || isRefreshingAttendance) {
      return '⏳ Sincronizando…';
    }
    if (n > 0) {
      return `⏳ ${n} pendente`;
    }
    if (isServerConnected || isFirebaseActive) {
      return connectedDevicesCount > 1
        ? `✓ Sincronizado (${connectedDevicesCount})`
        : '✓ Sincronizado';
    }
    return '💾 Salvo';
  }, [
    pendingQueue.length,
    isOnline,
    isSyncingAttendance,
    isSyncingQueue,
    isRefreshingAttendance,
    isServerConnected,
    isFirebaseActive,
    connectedDevicesCount,
  ]);

  const isChamadaView = activeTab !== 'dashboard';

  return (
    <div className="claude-app">
      {/* TOP BAR STICKY */}
      <div className="top" ref={topRef}>
        <div className="row">
          <div
            className="title cursor-pointer"
            title="Toque para trocar o nome"
            onClick={() => {
              setEditCongNameInput(database.congregationName || '');
              setEditCongError('');
              setActiveSheet({ type: 'editCong' });
            }}
          >
            {database.congregationName || 'Chamada'}
          </div>
          <div
            className="badge cursor-pointer"
            title="Toque para sincronizar todos os aparelhos agora"
            onClick={handleForcePushSyncAllDevices}
          >
            {syncBadgeText}
          </div>
          <button className="ibtn" onClick={toggleTheme} title="Tema Claro / Escuro">
            🌓
          </button>
        </div>

        {/* ABAS: CHAMADA | PAINEL */}
        <div className="seg mt">
          <button
            className={isChamadaView ? 'on' : ''}
            onClick={() => {
              setActiveTab('attendance');
              setSnackState((prev) => ({ ...prev, show: false }));
              window.scrollTo(0, 0);
            }}
          >
            Chamada
          </button>
          <button
            className={!isChamadaView ? 'on' : ''}
            onClick={() => {
              setActiveTab('dashboard');
              setSnackState((prev) => ({ ...prev, show: false }));
              window.scrollTo(0, 0);
            }}
          >
            Painel
          </button>
        </div>

        {/* BARRA DE CONTROLES DA CHAMADA */}
        {isChamadaView && (
          <div id="chamadaBar">
            <div className="row mt">
              <select
                value={selectedMeetingId}
                onChange={(e) => setSelectedMeetingId(e.target.value)}
              >
                {sortedMeetings.length > 0 ? (
                  sortedMeetings.map((x) => (
                    <option key={x.id} value={x.id}>
                      {fmtDate(x.date)} · {TYPE_LABEL[x.type]}
                      {isMeetingFinalized(x.id) ? ' ✓' : ''}
                    </option>
                  ))
                ) : (
                  <option value="">Nenhuma reunião</option>
                )}
              </select>
              <button
                className="ibtn primary whitespace-nowrap px-3"
                onClick={openNewMeetingSheet}
              >
                ＋ Nova
              </button>
              {currentMeeting && (
                <button
                  className="ibtn text-danger whitespace-nowrap px-3"
                  title="Excluir chamada selecionada"
                  aria-label="Excluir chamada selecionada"
                  onClick={() => setActiveSheet({ type: 'delMeeting', mid: currentMeeting.id })}
                >
                  🗑
                </button>
              )}
            </div>

            <div className="row mt">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar irmão…"
              />
            </div>

            <div className="chips">
              <button
                className={`chip${onlyUnmarked ? ' on' : ''}`}
                onClick={() => setOnlyUnmarked((prev) => !prev)}
              >
                Só não marcados ({counts.n})
              </button>
              <button
                className="chip"
                onClick={() => {
                  setManagePubsSearch('');
                  setActiveSheet({ type: 'managePubs' });
                }}
              >
                👥 Irmãos
              </button>
              <button
                className="chip"
                onClick={() => {
                  setEditCongNameInput(database.congregationName || '');
                  setEditCongError('');
                  setActiveSheet({ type: 'editCong' });
                }}
              >
                🏛 Nome da congregação
              </button>
              <button className="chip" onClick={handleMarkAllPresencial}>
                Todos presencial
              </button>
              <button className="chip" onClick={handleQuickCopyPrevious}>
                Copiar chamada anterior
              </button>
              <button className="chip" onClick={handleCopySummary}>
                Copiar resumo
              </button>
              {currentMeeting && (
                <button
                  className="chip text-danger"
                  onClick={() => setActiveSheet({ type: 'delMeeting', mid: currentMeeting.id })}
                >
                  🗑 Excluir chamada
                </button>
              )}
              {sortedMeetings.length > 0 && (
                <button
                  className="chip"
                  onClick={() => setActiveSheet({ type: 'manageMeetings' })}
                >
                  📅 Gerenciar chamadas ({sortedMeetings.length})
                </button>
              )}
              <button
                className="chip"
                onClick={() => setActiveSheet({ type: 'exportSheet' })}
              >
                Exportar / importar
              </button>
              <button
                className="chip"
                onClick={handleForcePushSyncAllDevices}
                disabled={isSyncingAttendance || isRefreshingAttendance}
              >
                🔄 Sincronizar
              </button>
              {deferredInstallPrompt && (
                <button
                  className="chip"
                  onClick={() => {
                    deferredInstallPrompt.prompt();
                    setDeferredInstallPrompt(null);
                  }}
                >
                  📲 Instalar app
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toast flutuante caso venha de evento externo */}
      {syncToastMessage && (
        <div className="toast-wrap">
          <div className="item toast-bar">
            <span className="flex-1 text-sm font-semibold">{syncToastMessage}</span>
            <button
              onClick={() => setSyncToastMessage(null)}
              className="toast-close"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* VIEW 1: CHAMADA                                                      */}
      {/* ==================================================================== */}
      {isChamadaView && (
        <div className="list" id="list">
          {!currentMeeting ? (
            <div className="empty">Crie uma reunião com “＋ Nova”.</div>
          ) : (
            <>
              {/* CARD DE VISITANTES */}
              {!searchQuery.trim() && !onlyUnmarked && (
                <div className="item mt-3">
                  <div className="nm">
                    <b>Visitantes / não cadastrados</b>
                    <span className="why block">
                      Total da assistência: <b>{counts.assist}</b>
                    </span>
                  </div>
                  <button
                    className="ibtn btn-vis"
                    onClick={() => {
                      if (!checkGuard()) return;
                      setVisitorsForCurrentMeeting(counts.vis - 1);
                    }}
                  >
                    −
                  </button>
                  <b className="vis-num">{counts.vis}</b>
                  <button
                    className="ibtn btn-vis"
                    onClick={() => {
                      if (!checkGuard()) return;
                      setVisitorsForCurrentMeeting(counts.vis + 1);
                    }}
                  >
                    ＋
                  </button>
                </div>
              )}

              {/* LISTA POR GRUPOS */}
              {(() => {
                const q = searchQuery.trim().toLowerCase();
                let hasAnyRow = false;

                const groupBlocks = groupsList.map((g) => {
                  const allInGroup = activePublishers
                    .filter((p) => p.group === g)
                    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
                  if (!allInGroup.length) return null;

                  const markedCount = allInGroup.filter((p) => currentAttMap[p.id]).length;
                  const rows = allInGroup.filter(
                    (p) =>
                      (!q ||
                        p.name.toLowerCase().includes(q) ||
                        (p.familyName && p.familyName.toLowerCase().includes(q))) &&
                      (!onlyUnmarked || !currentAttMap[p.id])
                  );
                  if (!rows.length) return null;

                  hasAnyRow = true;
                  const isCollapsed = Boolean(collapsedGroups[g]) && !q;
                  const pctWidth = (markedCount / allInGroup.length) * 100;

                  return (
                    <React.Fragment key={g}>
                      <div
                        className="ghead"
                        onClick={() =>
                          setCollapsedGroups((prev) => ({ ...prev, [g]: !prev[g] }))
                        }
                      >
                        <span>
                          {isCollapsed ? '▸' : '▾'} Grupo {g}
                        </span>
                        <span className="prog">
                          {markedCount} / {allInGroup.length}
                        </span>
                        <button
                          className="chip chip-grp"
                          onClick={(e) => handleMarkGroupPresencial(g, e)}
                        >
                          ✓ todos
                        </button>
                      </div>
                      <div className="gbar">
                        <svg className="w-full h-full block" viewBox="0 0 100 5" preserveAspectRatio="none">
                          <rect x="0" y="0" width={pctWidth} height="5" fill="var(--accent)" />
                        </svg>
                      </div>

                      {!isCollapsed &&
                        rows.map((p) => {
                          const s = currentAttMap[p.id] || null;
                          const note = currentNotesMap[p.id];
                          return (
                            <div className="item" key={p.id}>
                              <div className="nm">
                                <b>{p.name}</b>
                                {(s === 'zoom' || s === 'ausente') && (
                                  <button
                                    className="why"
                                    onClick={() => openReasonSheet(p.id)}
                                  >
                                    {note ? note : '＋ motivo'}
                                  </button>
                                )}
                              </div>
                              <button
                                className="ibtn btn-edit-pub"
                                title="Editar irmão"
                                onClick={() => openEditPubSheet(p.id)}
                              >
                                ✎
                              </button>
                              <button
                                className={`st ${s || ''}`}
                                onClick={() => handleCycleStatus(p)}
                              >
                                {s ? LBL[s] : 'Marcar'}
                              </button>
                            </div>
                          );
                        })}
                    </React.Fragment>
                  );
                });

                if (!hasAnyRow) {
                  return (
                    <div className="empty">
                      {onlyUnmarked && !q ? 'Todos marcados 🎉' : 'Nenhum irmão encontrado.'}
                    </div>
                  );
                }

                return groupBlocks;
              })()}
            </>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* VIEW 2: PAINEL (DASHBOARD)                                           */}
      {/* ==================================================================== */}
      {!isChamadaView && (
        <div className="list pt-3" id="dash">
          <div className="seg" id="dType">
            <button
              className={dashType === 'all' ? 'on' : ''}
              onClick={() => setDashType('all')}
            >
              Todas
            </button>
            <button
              className={dashType === 'midweek' ? 'on' : ''}
              onClick={() => setDashType('midweek')}
            >
              Meio
            </button>
            <button
              className={dashType === 'weekend' ? 'on' : ''}
              onClick={() => setDashType('weekend')}
            >
              Fim
            </button>
          </div>

          <div className="row mt">
            <select
              value={dashGroup}
              onChange={(e) => setDashGroup(e.target.value)}
            >
              <option value="all">Todos os grupos</option>
              {groupsList.map((g) => (
                <option key={g} value={String(g)}>
                  Grupo {g}
                </option>
              ))}
            </select>
            <select
              value={String(dashLast)}
              onChange={(e) => setDashLast(Number(e.target.value))}
            >
              <option value="0">Todo o período</option>
              <option value="4">Últimas 4</option>
              <option value="8">Últimas 8</option>
              <option value="12">Últimas 12</option>
            </select>
          </div>

          <div className="row mt">
            <input
              type="search"
              value={dashSearch}
              onChange={(e) => setDashSearch(e.target.value)}
              placeholder="Buscar irmão no quadro…"
            />
          </div>

          {/* 4 KPI CARDS */}
          <div className="kpis mt">
            <div className="card kpi">
              <div className="l">Média de presentes</div>
              <div className="n">{dashData.avg.toFixed(0)}</div>
              <div className="d">
                de {dashData.ps.length} irmãos · +{dashData.avgVis.toFixed(0)} visitantes
              </div>
            </div>
            <div className="card kpi">
              <div className="l">Taxa de presença</div>
              <div className="n">{dashData.pct.toFixed(0)}%</div>
              <div className="d">média do período</div>
            </div>
            <div className="card kpi">
              <div className="l">Via Zoom</div>
              <div className="n">{dashData.zs.toFixed(0)}%</div>
              <div className="d">{dashData.tz} presenças online</div>
            </div>
            <div className="card kpi">
              <div className="l">Última reunião</div>
              <div className="n">
                {dashData.last ? dashData.last.total + dashData.last.vis : '–'}
              </div>
              <div className="d">
                {dashData.last
                  ? `${fmtDate(dashData.last.m.date)} · com visitantes`
                  : 'sem dados'}
              </div>
            </div>
          </div>

          {/* GRÁFICO EMPILHADO + AUSÊNCIAS SEGUIDAS */}
          <div className="grid2">
            <div className="card">
              <h2>Assistência por reunião</h2>
              {dashData.ss.length === 0 ? (
                <div className="empty">Sem reuniões no período.</div>
              ) : (
                (() => {
                  const W = 640;
                  const H = 230;
                  const L = 34;
                  const B = 34;
                  const T = 10;
                  const n = dashData.ss.length;
                  const bw = Math.min(46, ((W - L) / n) * 0.62);
                  const step = (W - L) / n;
                  const max = Math.max(
                    dashData.ps.length,
                    ...dashData.ss.map((x) => x.pr + x.z + x.a + x.vis),
                    1
                  );
                  const y = (v: number) => T + (H - T - B) * (1 - v / max);

                  return (
                    <svg className="chart" viewBox={`0 0 ${W} ${H}`}>
                      {[0, 0.5, 1].map((f) => {
                        const v = Math.round(max * f);
                        return (
                          <React.Fragment key={f}>
                            <line
                              x1={L}
                              x2={W}
                              y1={y(v)}
                              y2={y(v)}
                              stroke="var(--line)"
                            />
                            <text x={L - 6} y={y(v) + 4} textAnchor="end">
                              {v}
                            </text>
                          </React.Fragment>
                        );
                      })}
                      {dashData.ss.map((x, i) => {
                        const cx = L + step * i + step / 2;
                        const x0 = cx - bw / 2;
                        let acc = 0;
                        const series: [number, string, string][] = [
                          [x.pr, 'var(--pres)', 'Presencial'],
                          [x.z, 'var(--zoom)', 'Zoom'],
                          [x.vis, 'var(--vis)', 'Visitantes'],
                          [x.a, 'var(--aus)', 'Ausente'],
                        ];
                        return (
                          <React.Fragment key={x.m.id}>
                            {series.map(([val, color, label]) => {
                              if (!val) return null;
                              const rectY = y(acc + val);
                              const rectH = y(acc) - y(acc + val);
                              acc += val;
                              return (
                                <rect
                                  key={label}
                                  x={x0}
                                  y={rectY}
                                  width={bw}
                                  height={rectH}
                                  fill={color}
                                  rx={3}
                                >
                                  <title>
                                    {fmtDate(x.m.date)} – {label}: {val}
                                  </title>
                                </rect>
                              );
                            })}
                            <text x={cx} y={H - B + 14} textAnchor="middle">
                              {fmtDate(x.m.date)}
                            </text>
                            <text x={cx} y={H - B + 27} textAnchor="middle">
                              {x.m.type === 'midweek' ? 'meio' : 'fim'}
                            </text>
                          </React.Fragment>
                        );
                      })}
                    </svg>
                  );
                })()
              )}
              <div className="legend">
                <span>
                  <i className="dot dot-pres" />
                  Presencial
                </span>
                <span>
                  <i className="dot dot-zoom" />
                  Zoom
                </span>
                <span>
                  <i className="dot dot-vis" />
                  Visitantes
                </span>
                <span>
                  <i className="dot dot-aus" />
                  Ausente
                </span>
              </div>
            </div>

            <div className="card">
              <h2>Ausências seguidas</h2>
              <div>
                {dashData.alerts.length > 0 ? (
                  dashData.alerts.map((x) => (
                    <div className="alert" key={x.p.id}>
                      <div>
                        {x.p.name}
                        <small>Grupo {x.p.group}</small>
                      </div>
                      <span className="bdg">{x.c} seguidas</span>
                    </div>
                  ))
                ) : (
                  <div className="small">
                    Nenhum irmão com 2 ou mais ausências seguidas. 🙂
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* POR GRUPO */}
          <div className="card mt-3">
            <h2>Por grupo</h2>
            <table className="groups">
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th>Irmãos</th>
                  <th>Presença</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {dashData.groupRows.map((row) => (
                  <tr key={row.g}>
                    <td>Grupo {row.g}</td>
                    <td>{row.count}</td>
                    <td>{row.pct.toFixed(0)}%</td>
                    <td className="w-2/5">
                      <div className="pbar">
                        <svg className="w-full h-full block" viewBox="0 0 100 7" preserveAspectRatio="none">
                          <rect x="0" y="0" width={row.pct} height="7" fill="var(--pres)" />
                        </svg>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* QUADRO DE PRESENÇA (MATRIZ) */}
          <div className="card my-3">
            <h2>Quadro de presença</h2>
            <div className="legend m-0">
              <span>
                <span className="c presencial">P</span> Presencial
              </span>
              <span>
                <span className="c zoom">Z</span> Zoom
              </span>
              <span>
                <span className="c ausente">A</span> Ausente
              </span>
              <span>
                <span className="c none">–</span> Sem marca
              </span>
            </div>
            <div className="matrix-wrap">
              <table className="m">
                <thead>
                  <tr>
                    <th className="name">Irmão</th>
                    {dashData.ms.map((m) => (
                      <th key={m.id}>
                        {fmtDate(m.date)}
                        <br />
                        {m.type === 'midweek' ? 'meio' : 'fim'}
                      </th>
                    ))}
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {dashData.matrixRows.map((p) => {
                    let ok = 0;
                    let mk = 0;
                    return (
                      <tr key={p.id}>
                        <td className="name">
                          {p.name}
                          <small>G{p.group}</small>
                        </td>
                        {dashData.ms.map((m) => {
                          const s = (database.attendance[m.id] || {})[p.id] || null;
                          const note = (database.attendanceNotes?.[m.id] || {})[p.id] || '';
                          if (s) mk++;
                          if (s === 'presencial' || s === 'zoom') ok++;
                          const letter =
                            s === 'presencial'
                              ? 'P'
                              : s === 'zoom'
                              ? 'Z'
                              : s === 'ausente'
                              ? 'A'
                              : '–';
                          return (
                            <td key={m.id}>
                              <span className={`c ${s || 'none'}`} title={note}>
                                {letter}
                              </span>
                            </td>
                          );
                        })}
                        <td>
                          <b>{mk ? `${Math.round((ok / mk) * 100)}%` : '–'}</b>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SNACKBAR FLUTUANTE (MARCAÇÃO + FAMÍLIA EM 1 TOQUE + DESFAZER)        */}
      {/* ==================================================================== */}
      <div className={`snack${snackState.show ? ' show' : ''}`}>
        <span>{snackState.text}</span>
        {snackState.fam && (
          <button onClick={handleApplyFamilyFromSnack}>
            Família ({snackState.fam.n})
          </button>
        )}
        {snackState.canUndo && (
          <button onClick={handleUndo}>Desfazer</button>
        )}
      </div>

      {/* ==================================================================== */}
      {/* BARRA INFERIOR FIXA (CONTADORES + FINALIZAR CHAMADA)                 */}
      {/* ==================================================================== */}
      {isChamadaView && (
        <div className="foot">
          <div className="in">
            <div className="cnt">
              <div className="p">
                <b>{counts.p}</b>
                <span>Pres.</span>
              </div>
              <div className="z">
                <b>{counts.z}</b>
                <span>Zoom</span>
              </div>
              <div className="v">
                <b>{counts.vis}</b>
                <span>Visit.</span>
              </div>
              <div className="a">
                <b>{counts.au}</b>
                <span>Aus.</span>
              </div>
              <div>
                <b>{counts.n}</b>
                <span>Pend.</span>
              </div>
            </div>
            <button
              className="ibtn primary fin"
              onClick={() => {
                if (!currentMeeting) return;
                if (isMeetingFinalized(currentMeeting.id)) {
                  checkGuard();
                } else {
                  setActiveSheet({ type: 'finish' });
                }
              }}
            >
              {currentMeeting && isMeetingFinalized(currentMeeting.id)
                ? '✓ Finalizada'
                : 'Finalizar'}
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* BOTTOM SHEETS (MODAIS DO PADRÃO CLAUDE)                              */}
      {/* ==================================================================== */}
      <div
        className={`ov${activeSheet ? ' show' : ''}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setActiveSheet(null);
        }}
      >
        <div className="sheet">
          {/* 1. NOVA REUNIÃO */}
          {activeSheet?.type === 'newMeeting' && (
            <>
              <h3>Nova reunião</h3>
              <p>Escolha a data e o tipo.</p>
              <input
                type="date"
                value={newMeetingDate}
                onChange={(e) => setNewMeetingDate(e.target.value)}
              />
              <select
                className="mt"
                value={newMeetingType}
                onChange={(e) => setNewMeetingType(e.target.value as MeetingType)}
              >
                <option value="midweek">Meio de semana</option>
                <option value="weekend">Fim de semana</option>
              </select>
              <label className="lab">
                <input
                  type="radio"
                  name="init"
                  checked={newMeetingInitMode === 'pres'}
                  onChange={() => setNewMeetingInitMode('pres')}
                />
                Começar com todos presencial (marco só quem for diferente)
              </label>
              <label className="lab">
                <input
                  type="radio"
                  name="init"
                  checked={newMeetingInitMode === 'copy'}
                  onChange={() => setNewMeetingInitMode('copy')}
                />
                Copiar a chamada da reunião anterior
              </label>
              <label className="lab">
                <input
                  type="radio"
                  name="init"
                  checked={newMeetingInitMode === 'blank'}
                  onChange={() => setNewMeetingInitMode('blank')}
                />
                Começar em branco
              </label>
              <button
                className="ibtn primary w-full"
                onClick={handleCreateMeetingFromSheet}
              >
                Criar e começar
              </button>
            </>
          )}

          {/* 2. MOTIVO (ZOOM / AUSENTE) */}
          {activeSheet?.type === 'reason' &&
            (() => {
              const p = activePublishers.find((x) => x.id === activeSheet.pid);
              const s = currentAttMap[activeSheet.pid];
              const curNote = currentNotesMap[activeSheet.pid] || '';
              if (!p || (s !== 'zoom' && s !== 'ausente')) return null;
              const reasonsList = REASONS[s];

              return (
                <>
                  <h3>{p.name}</h3>
                  <p>Motivo ({LBL[s]})</p>
                  <div className="chips flex-wrap overflow-visible">
                    {reasonsList.map((r) => (
                      <button
                        key={r}
                        className={`chip${curNote === r ? ' on' : ''}`}
                        onClick={() => {
                          if (selectedMeetingId) {
                            handleAttendanceNoteChange(selectedMeetingId, p.id, r);
                          }
                          setActiveSheet(null);
                        }}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    className="mt"
                    placeholder="Outro motivo…"
                    value={reasonCustomText}
                    onChange={(e) => setReasonCustomText(e.target.value)}
                  />
                  <div className="row mt">
                    <button
                      className="ibtn flex-1"
                      onClick={() => {
                        if (selectedMeetingId) {
                          handleAttendanceNoteChange(selectedMeetingId, p.id, '');
                        }
                        setActiveSheet(null);
                      }}
                    >
                      Limpar
                    </button>
                    <button
                      className="ibtn primary flex-1"
                      onClick={() => {
                        if (selectedMeetingId) {
                          handleAttendanceNoteChange(
                            selectedMeetingId,
                            p.id,
                            reasonCustomText.trim()
                          );
                        }
                        setActiveSheet(null);
                      }}
                    >
                      Salvar
                    </button>
                  </div>
                </>
              );
            })()}

          {/* 3. FINALIZAR CHAMADA */}
          {activeSheet?.type === 'finish' && currentMeeting && (
            <>
              <h3>Finalizar chamada</h3>
              <p>
                {fmtDate(currentMeeting.date)} · {TYPE_LABEL[currentMeeting.type]}
              </p>
              <div className="cnt mb-3">
                <div className="p">
                  <b>{counts.p}</b>
                  <span>Presencial</span>
                </div>
                <div className="z">
                  <b>{counts.z}</b>
                  <span>Zoom</span>
                </div>
                <div className="v">
                  <b>{counts.vis}</b>
                  <span>Visitantes</span>
                </div>
                <div className="a">
                  <b>{counts.au}</b>
                  <span>Ausentes</span>
                </div>
              </div>
              <p className="assist-total-line">
                Assistência total: <b>{counts.assist}</b>
              </p>
              {counts.n > 0 && (
                <p className="text-danger">
                  ⚠ {counts.n} irmão(s) sem marcação. Eles ficam como “não marcado”, não como
                  ausente.
                </p>
              )}
              <div className="row">
                <button
                  className="ibtn flex-1"
                  onClick={() => setActiveSheet(null)}
                >
                  Voltar
                </button>
                <button
                  className="ibtn primary flex-1"
                  onClick={() => {
                    setFinalizedForCurrentMeeting(true);
                    handleSaveAndSyncAttendance(currentMeeting.id);
                    setActiveSheet(null);
                    showSnack('Chamada finalizada ✓', false);
                  }}
                >
                  Confirmar
                </button>
              </div>
              {counts.n > 0 && (
                <button
                  className="ibtn mt w-full"
                  onClick={() => {
                    const unmarked = activePublishers.filter((p) => !currentAttMap[p.id]);
                    applyMarksList(
                      currentMeeting.id,
                      unmarked.map((p) => ({ pid: p.id, st: 'ausente' })),
                      true,
                      'Restantes marcados como ausentes'
                    );
                  }}
                >
                  Marcar os {counts.n} restantes como ausentes
                </button>
              )}
              <button
                className="ibtn mt w-full text-danger"
                onClick={() => setActiveSheet({ type: 'delMeeting', mid: currentMeeting.id })}
              >
                🗑 Excluir esta chamada
              </button>
            </>
          )}

          {/* 4. REABRIR CHAMADA FINALIZADA */}
          {activeSheet?.type === 'reopen' && (
            <>
              <h3>Chamada finalizada</h3>
              <p>Esta chamada já foi fechada. Para alterar, reabra primeiro.</p>
              <div className="row">
                <button
                  className="ibtn flex-1"
                  onClick={() => setActiveSheet(null)}
                >
                  Cancelar
                </button>
                <button
                  className="ibtn primary flex-1"
                  onClick={() => {
                    setFinalizedForCurrentMeeting(false);
                    setActiveSheet(null);
                  }}
                >
                  Reabrir
                </button>
              </div>
              {currentMeeting && (
                <button
                  className="ibtn mt w-full text-danger"
                  onClick={() => setActiveSheet({ type: 'delMeeting', mid: currentMeeting.id })}
                >
                  🗑 Excluir esta chamada
                </button>
              )}
            </>
          )}

          {/* 5. GERENCIAR IRMÃOS */}
          {activeSheet?.type === 'managePubs' && (
            <>
              <h3>Irmãos ({database.publishers.length})</h3>
              <div className="row">
                <input
                  type="search"
                  placeholder="Buscar…"
                  value={managePubsSearch}
                  onChange={(e) => setManagePubsSearch(e.target.value)}
                />
                <button
                  className="ibtn primary"
                  onClick={() => openEditPubSheet(null)}
                >
                  ＋ Novo
                </button>
              </div>
              <div className="mt-2.5">
                {(() => {
                  const q = managePubsSearch.trim().toLowerCase();
                  const list = [...database.publishers]
                    .sort((a, b) => a.group - b.group || a.name.localeCompare(b.name, 'pt-BR'))
                    .filter(
                      (p) =>
                        !q ||
                        p.name.toLowerCase().includes(q) ||
                        (p.familyName && p.familyName.toLowerCase().includes(q))
                    );
                  if (!list.length) {
                    return <div className="empty">Nenhum irmão.</div>;
                  }
                  return list.map((p) => (
                    <div className="item shadow-none" key={p.id}>
                      <div className="nm">
                        <b>{p.name}</b>
                        <span className="why block">
                          Grupo {p.group}
                          {p.familyName ? ` · ${p.familyName}` : ''}
                          {p.active === false ? ' · inativo' : ''}
                        </span>
                      </div>
                      <button
                        className="ibtn"
                        onClick={() => openEditPubSheet(p.id)}
                      >
                        ✎ Editar
                      </button>
                    </div>
                  ));
                })()}
              </div>
              <button
                className="ibtn mt w-full"
                onClick={() => setActiveSheet(null)}
              >
                Fechar
              </button>
            </>
          )}

          {/* 6. NOVO / EDITAR IRMÃO */}
          {activeSheet?.type === 'editPub' && (
            <>
              <h3>{activeSheet.pid ? 'Editar irmão' : 'Novo irmão'}</h3>
              <div className="small mb-1">
                Nome
              </div>
              <input
                type="text"
                value={editPubName}
                onChange={(e) => setEditPubName(e.target.value)}
                placeholder="Nome completo"
              />
              <div className="small mt-3 mb-1">
                Grupo
              </div>
              <select
                value={editPubGroup}
                onChange={(e) => setEditPubGroup(e.target.value)}
              >
                {groupsList.map((g) => (
                  <option key={g} value={String(g)}>
                    Grupo {g}
                  </option>
                ))}
                <option value="new">＋ Novo grupo…</option>
              </select>
              {editPubGroup === 'new' && (
                <input
                  type="text"
                  className="mt"
                  inputMode="numeric"
                  placeholder="Número do novo grupo"
                  value={editPubNewGroup}
                  onChange={(e) => setEditPubNewGroup(e.target.value)}
                />
              )}
              <div className="small mt-3 mb-1">
                Família (opcional, para marcar todos juntos)
              </div>
              <input
                type="text"
                list="fams-datalist"
                value={editPubFamily}
                onChange={(e) => setEditPubFamily(e.target.value)}
                placeholder="Ex.: Família Silva"
              />
              <datalist id="fams-datalist">
                {existingFamilies.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
              <label className="lab">
                <input
                  type="checkbox"
                  checked={editPubActive}
                  onChange={(e) => setEditPubActive(e.target.checked)}
                />
                Ativo (aparece na chamada)
              </label>
              <div className="err">{editPubError}</div>
              <div className="row">
                <button
                  className="ibtn flex-1"
                  onClick={() => setActiveSheet(null)}
                >
                  Cancelar
                </button>
                <button
                  className="ibtn primary flex-1"
                  onClick={() => handleSavePubFromSheet(activeSheet.pid)}
                >
                  Salvar
                </button>
              </div>
              {activeSheet.pid && (
                <button
                  className="ibtn mt w-full text-danger"
                  onClick={() => setActiveSheet({ type: 'delPub', pid: activeSheet.pid! })}
                >
                  Excluir irmão
                </button>
              )}
            </>
          )}

          {/* 7. CONFIRMAR EXCLUSÃO DE IRMÃO */}
          {activeSheet?.type === 'delPub' &&
            (() => {
              const p = database.publishers.find((x) => x.id === activeSheet.pid);
              if (!p) return null;
              return (
                <>
                  <h3>Excluir {p.name}?</h3>
                  <p>
                    Isso apaga o irmão <b>e todas as marcações dele</b> em todas as reuniões. Não
                    dá para desfazer.
                  </p>
                  <p>
                    Se ele só saiu ou mudou de congregação, é melhor <b>desmarcar “Ativo”</b>: ele
                    sai da chamada e o histórico fica.
                  </p>
                  <div className="row">
                    <button
                      className="ibtn flex-1"
                      onClick={() => openEditPubSheet(p.id)}
                    >
                      Voltar
                    </button>
                    <button
                      className="ibtn primary btn-danger flex-1"
                      onClick={() => {
                        handleDeletePublisher(p.id);
                        setActiveSheet(null);
                        showSnack('Irmão excluído', false);
                      }}
                    >
                      Excluir
                    </button>
                  </div>
                </>
              );
            })()}

          {/* 8. EDITAR NOME DA CONGREGAÇÃO */}
          {activeSheet?.type === 'editCong' && (
            <>
              <h3>Nome da congregação</h3>
              <p>Aparece no topo do app.</p>
              <input
                type="text"
                value={editCongNameInput}
                onChange={(e) => setEditCongNameInput(e.target.value)}
                placeholder="Nome da congregação"
                autoFocus
              />
              <div className="err">{editCongError}</div>
              <div className="row mt">
                <button
                  className="ibtn flex-1"
                  onClick={() => setActiveSheet(null)}
                >
                  Cancelar
                </button>
                <button
                  className="ibtn primary flex-1"
                  onClick={() => {
                    const v = editCongNameInput.trim().replace(/\s+/g, ' ');
                    if (!v) {
                      setEditCongError('Digite o nome.');
                      return;
                    }
                    handleUpdateCongregationName(v);
                    setActiveSheet(null);
                    showSnack('Nome salvo', false);
                  }}
                >
                  Salvar
                </button>
              </div>
            </>
          )}

          {/* 9. EXPORTAR / IMPORTAR */}
          {activeSheet?.type === 'exportSheet' && (
            <>
              <h3>Exportar / importar</h3>
              <p>Os arquivos CSV abrem direto no Excel.</p>
              <button
                className="ibtn w-full"
                onClick={handleExportCsvAttendance}
              >
                Presenças (CSV, todas as reuniões)
              </button>
              <button
                className="ibtn mt w-full"
                onClick={handleExportCsvPublishers}
              >
                Lista de irmãos (CSV)
              </button>
              <button
                className="ibtn mt w-full"
                onClick={handleExportJsonAll}
              >
                Backup completo (JSON)
              </button>
              <button
                className="ibtn primary mt w-full"
                onClick={() => {
                  setActiveSheet(null);
                  csvFileInputRef.current?.click();
                }}
              >
                Importar irmãos de um CSV…
              </button>
              <button
                className="ibtn mt w-full"
                onClick={() => {
                  setActiveSheet(null);
                  setIsSettingsOpen(true);
                }}
              >
                Configurações avançadas & Nuvem (Firebase)
              </button>
              <button
                className="ibtn mt w-full"
                onClick={() => {
                  setActiveSheet(null);
                  setIsBackupHistoryOpen(true);
                }}
              >
                Histórico de backups / Restaurar Terça e Sábado
              </button>
              <p className="small mt-3">
                Colunas aceitas na importação: nome, grupo, familia, ativo. Se estiver no Excel,
                use “Salvar como → CSV”.
              </p>
            </>
          )}

          {/* 10. PREVIEW DE IMPORTAÇÃO CSV */}
          {activeSheet?.type === 'importPreview' && (
            <>
              <h3>Importar irmãos</h3>
              {activeSheet.rows.length === 0 && activeSheet.skip === 0 ? (
                <>
                  <p>Arquivo vazio.</p>
                  <button
                    className="ibtn w-full"
                    onClick={() => setActiveSheet(null)}
                  >
                    Fechar
                  </button>
                </>
              ) : (
                <>
                  <p>
                    <b>{activeSheet.add}</b> novo(s), <b>{activeSheet.upd}</b> atualizado(s)
                    {activeSheet.skip
                      ? `, ${activeSheet.skip} linha(s) ignorada(s) (sem nome ou sem grupo)`
                      : ''}
                    .
                  </p>
                  <p>Quem já existe é reconhecido pelo nome. Ninguém é apagado.</p>
                  <div className="row">
                    <button
                      className="ibtn flex-1"
                      onClick={() => setActiveSheet(null)}
                    >
                      Cancelar
                    </button>
                    <button
                      className="ibtn primary flex-1"
                      disabled={activeSheet.add + activeSheet.upd === 0}
                      onClick={() => handleConfirmCsvImport(activeSheet.rows)}
                    >
                      Importar
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* 11. RESUMO FALLBACK */}
          {activeSheet?.type === 'summary' && (
            <>
              <h3>Resumo</h3>
              <textarea
                readOnly
                value={activeSheet.text}
                className="summary-box"
              />
              <button
                className="ibtn mt w-full"
                onClick={() => setActiveSheet(null)}
              >
                Fechar
              </button>
            </>
          )}

          {/* 12. EXCLUIR CHAMADA (CONFIRMAÇÃO) */}
          {activeSheet?.type === 'delMeeting' &&
            (() => {
              const targetMeeting = database.meetings.find((m) => m.id === activeSheet.mid);
              if (!targetMeeting) return null;
              const attMap = database.attendance[targetMeeting.id] || {};
              let pCount = 0;
              let zCount = 0;
              let auCount = 0;
              activePublishers.forEach((pub) => {
                const s = attMap[pub.id];
                if (s === 'presencial') pCount++;
                else if (s === 'zoom') zCount++;
                else if (s === 'ausente') auCount++;
              });
              const visCount = getVisitorsForMeeting(targetMeeting.id);
              const assistTotal = pCount + zCount + visCount;
              const dowLabel = targetMeeting.dayOfWeek || getPortugueseDayOfWeek(targetMeeting.date);
              return (
                <>
                  <h3>Excluir chamada?</h3>
                  <p>
                    Tem certeza que deseja excluir a chamada de{' '}
                    <b>
                      {fmtDate(targetMeeting.date)} ({dowLabel}) · {TYPE_LABEL[targetMeeting.type]}
                    </b>
                    ?
                  </p>
                  <p className="small mb-3">
                    Assistência registrada nesta chamada: <b>{assistTotal}</b> ({pCount} presencial,{' '}
                    {zCount} Zoom, {visCount} visitantes, {auCount} ausentes). Esta ação remove os
                    registros desta reunião de todos os aparelhos sincronizados.
                  </p>
                  <div className="row">
                    <button
                      className="ibtn flex-1"
                      onClick={() => setActiveSheet(null)}
                    >
                      Cancelar
                    </button>
                    <button
                      className="ibtn primary btn-danger flex-1"
                      onClick={() => {
                        handleDeleteMeeting(targetMeeting.id);
                        setActiveSheet(null);
                        showSnack('Chamada excluída', false);
                      }}
                    >
                      Excluir chamada
                    </button>
                  </div>
                  {sortedMeetings.length > 1 && (
                    <button
                      className="ibtn mt w-full"
                      onClick={() => setActiveSheet({ type: 'manageMeetings' })}
                    >
                      📅 Ver todas as chamadas ({sortedMeetings.length})
                    </button>
                  )}
                </>
              );
            })()}

          {/* 13. GERENCIAR / EXCLUIR CHAMADAS FEITAS */}
          {activeSheet?.type === 'manageMeetings' && (
            <>
              <h3>Chamadas registradas ({sortedMeetings.length})</h3>
              <p>Toque em uma reunião para abri-la ou clique na lixeira para excluir.</p>
              <div className="pub-list-scroll">
                {sortedMeetings.length > 0 ? (
                  sortedMeetings.map((m) => {
                    const attMap = database.attendance[m.id] || {};
                    let pCount = 0;
                    let zCount = 0;
                    activePublishers.forEach((pub) => {
                      const s = attMap[pub.id];
                      if (s === 'presencial') pCount++;
                      else if (s === 'zoom') zCount++;
                    });
                    const visCount = getVisitorsForMeeting(m.id);
                    const assistTotal = pCount + zCount + visCount;
                    const dowLabel = m.dayOfWeek || getPortugueseDayOfWeek(m.date);
                    const isSelected = m.id === selectedMeetingId;
                    return (
                      <div className="pub-item" key={m.id}>
                        <div
                          className="info cursor-pointer"
                          onClick={() => {
                            setSelectedMeetingId(m.id);
                            setActiveSheet(null);
                          }}
                        >
                          <div className="n">
                            {fmtDate(m.date)} ({dowLabel})
                            {isSelected ? ' · Atual' : ''}
                            {isMeetingFinalized(m.id) ? ' ✓' : ''}
                          </div>
                          <div className="s">
                            {TYPE_LABEL[m.type]} · Assistência: {assistTotal} ({pCount}P / {zCount}Z /{' '}
                            {visCount}V)
                          </div>
                        </div>
                        <button
                          className="ibtn"
                          onClick={() => {
                            setSelectedMeetingId(m.id);
                            setActiveSheet(null);
                          }}
                        >
                          Abrir
                        </button>
                        <button
                          className="ibtn text-danger"
                          title="Excluir esta chamada"
                          onClick={() => setActiveSheet({ type: 'delMeeting', mid: m.id })}
                        >
                          🗑 Excluir
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="empty">Nenhuma chamada registrada.</div>
                )}
              </div>
              <div className="row mt">
                <button
                  className="ibtn flex-1"
                  onClick={() => setActiveSheet(null)}
                >
                  Fechar
                </button>
                <button
                  className="ibtn primary flex-1"
                  onClick={openNewMeetingSheet}
                >
                  ＋ Nova chamada
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Input oculto para importar CSV */}
      <input
        ref={csvFileInputRef}
        type="file"
        accept=".csv,.txt,text/csv"
        className="hidden"
        onChange={handleCsvFileChange}
      />

      {/* Modal de Sincronização entre Vários Aparelhos */}
      <SyncDevicesModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        database={database}
        onDatabaseUpdated={handleDatabaseUpdated}
        isFirebaseActive={isFirebaseActive}
        isServerConnected={isServerConnected}
        connectedDevicesCount={connectedDevicesCount}
        onFirebaseStatusChanged={setIsFirebaseActive}
        onOpenFullSettings={() => setIsSettingsOpen(true)}
        onForcePushSync={handleForcePushSyncAllDevices}
        onForcePullSync={handleForcePullSyncFromServer}
      />

      {/* Modal de Configurações, Nuvem e Backup */}
      <SettingsBackupModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        database={database}
        onDatabaseUpdated={handleDatabaseUpdated}
        congregationName={database.congregationName}
        onUpdateCongregationName={handleUpdateCongregationName}
        isFirebaseActive={isFirebaseActive}
        onFirebaseStatusChanged={setIsFirebaseActive}
      />

      {/* Modal de Histórico de Versões e Restauração de Reuniões */}
      <BackupHistoryModal
        isOpen={isBackupHistoryOpen}
        onClose={() => setIsBackupHistoryOpen(false)}
        currentDatabase={database}
        onDatabaseRestored={(restoredDb, message) => {
          setDatabase(restoredDb);
          saveDatabase(restoredDb);
          if (restoredDb.meetings.length > 0) {
            setSelectedMeetingId(restoredDb.meetings[0].id);
          }
          setSyncToastMessage(`✅ ${message}`);
          setTimeout(() => setSyncToastMessage(null), 5000);
        }}
      />
    </div>
  );
}

export default App;
