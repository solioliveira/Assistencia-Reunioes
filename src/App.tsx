import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { History, RefreshCw, RotateCcw, Wifi, WifiOff } from 'lucide-react';
import { AttendanceView } from './components/AttendanceView';
import { BackupHistoryModal } from './components/BackupHistoryModal';
import { DashboardView } from './components/DashboardView';
import { MeetingManager } from './components/MeetingManager';
import { Navbar } from './components/Navbar';
import { PublisherManager } from './components/PublisherManager';
import { ReportsView } from './components/ReportsView';
import { SettingsBackupModal } from './components/SettingsBackupModal';
import { ShepherdingView } from './components/ShepherdingView';
import { SyncDevicesModal } from './components/SyncDevicesModal';
import {
  decodeFirebaseConfigFromHash,
  fetchRemoteFirestoreData,
  getStoredFirebaseConfig,
  initFirebaseService,
  listenToFirestore,
  saveFirebaseConfig,
  syncAttendanceToFirestore,
  syncMeetingToFirestore,
  syncPublisherToFirestore,
  syncVisitToFirestore,
  deleteMeetingFromFirestore,
  deletePublisherFromFirestore,
} from './services/firebase';
import {
  detectAbsenceStreaks,
  loadDatabase,
  restoreTuesdayAndSaturdayData,
  saveDatabase,
  subscribeToLocalSync,
} from './services/storage';
import {
  clearPendingQueue,
  enqueueAttendanceSync,
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

export function App() {
  // Estado principal da congregação
  const [database, setDatabase] = useState<CongregationDatabase>(() => loadDatabase());
  const [activeTab, setActiveTab] = useState<NavigationTab>('attendance');
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>(() => {
    const initialDb = loadDatabase();
    return initialDb.meetings.length > 0 ? initialDb.meetings[0].id : '';
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);
  const [isBackupHistoryOpen, setIsBackupHistoryOpen] = useState<boolean>(false);
  const [showRestoreBanner, setShowRestoreBanner] = useState<boolean>(true);
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
  const [isAutoPollActive, setIsAutoPollActive] = useState<boolean>(true);

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
      setSyncToastMessage('🌐 Conexão à internet restabelecida! Verificando pendências...');
      setTimeout(() => setSyncToastMessage(null), 4000);
      // Tenta sincronizar a fila automaticamente ao reconectar
      flushPendingQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncToastMessage('⚠️ Você está sem internet. Modo offline ativado: alterações serão salvas localmente.');
      setTimeout(() => setSyncToastMessage(null), 4000);
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
    // 1. Verifica se foi aberto através de um link de sincronização
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

    // 2. Se já tinha configuração salva neste aparelho, inicializa
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

    // 1. Busca dados iniciais do servidor central ao iniciar
    fetchServerDatabase().then((serverDb) => {
      if (!isMounted || !serverDb) return;
      setDatabase((prev) => {
        const hasServerData =
          (serverDb.publishers && serverDb.publishers.length > 0) ||
          (serverDb.meetings && serverDb.meetings.length > 0) ||
          (serverDb.attendance && Object.keys(serverDb.attendance).length > 0);

        // Se o servidor estiver vazio e nós tivermos dados locais, enviamos para o servidor
        if (!hasServerData && prev.publishers && prev.publishers.length > 0) {
          sendDatabaseToServer(prev).catch((err) => {
            console.warn('[Sync] Falha ao enviar banco inicial ao servidor:', err);
          });
          return prev;
        }

        if (!hasServerData) return prev;

        // Mesclagem cuidadosa para NUNCA apagar dados locais ou alterações feitas pelo usuário
        const mergedAttendance: Record<string, Record<string, AttendanceStatus>> = {};
        if (serverDb.attendance) {
          for (const [mId, mAtt] of Object.entries(serverDb.attendance)) {
            mergedAttendance[mId] = { ...(mAtt || {}) };
          }
        }
        if (prev.attendance) {
          for (const [mId, mAtt] of Object.entries(prev.attendance)) {
            mergedAttendance[mId] = {
              ...(mergedAttendance[mId] || {}),
              ...(mAtt || {}), // Preserva com prioridade o que o usuário marcou localmente
            };
          }
        }

        const mergedNotes: Record<string, Record<string, string>> = {};
        if (serverDb.attendanceNotes) {
          for (const [mId, mNotes] of Object.entries(serverDb.attendanceNotes)) {
            mergedNotes[mId] = { ...(mNotes || {}) };
          }
        }
        if (prev.attendanceNotes) {
          for (const [mId, mNotes] of Object.entries(prev.attendanceNotes)) {
            mergedNotes[mId] = {
              ...(mergedNotes[mId] || {}),
              ...(mNotes || {}), // Preserva as anotações feitas pelo usuário
            };
          }
        }

        // Publicadores: preserva alterações e novos publicadores cadastrados localmente
        const localPubMap = new Map((prev.publishers || []).map((p) => [p.id, p]));
        const mergedPublishers = [...(serverDb.publishers || [])].map((sp) => {
          const lp = localPubMap.get(sp.id);
          return lp ? { ...sp, ...lp } : sp;
        });
        for (const lp of prev.publishers || []) {
          if (!mergedPublishers.some((p) => p.id === lp.id)) {
            mergedPublishers.push(lp);
          }
        }

        // Reuniões: preserva reuniões criadas localmente e no servidor
        const localMeetingMap = new Map((prev.meetings || []).map((m) => [m.id, m]));
        const mergedMeetings = [...(serverDb.meetings || [])].map((sm) => {
          const lm = localMeetingMap.get(sm.id);
          return lm ? { ...sm, ...lm } : sm;
        });
        for (const lm of prev.meetings || []) {
          if (!mergedMeetings.some((m) => m.id === lm.id)) {
            mergedMeetings.push(lm);
          }
        }

        const mergedDb: CongregationDatabase = {
          ...prev,
          ...serverDb,
          congregationName: prev.congregationName || serverDb.congregationName,
          publishers: mergedPublishers.length > 0 ? mergedPublishers : prev.publishers,
          meetings: mergedMeetings.length > 0 ? mergedMeetings : prev.meetings,
          attendance: mergedAttendance,
          attendanceNotes: mergedNotes,
          shepherdingVisits:
            prev.shepherdingVisits && prev.shepherdingVisits.length > 0
              ? prev.shepherdingVisits
              : serverDb.shepherdingVisits || [],
          syncMetadata: prev.syncMetadata || serverDb.syncMetadata,
        };

        saveDatabase(mergedDb);
        sendDatabaseToServer(mergedDb).catch(() => {});
        return mergedDb;
      });
    });

    // 2. Assina o fluxo SSE para atualizações em tempo real vindas de outros aparelhos
    const unsubSse = subscribeToServerEvents({
      onConnectionStatusChange: (status) => {
        if (isMounted) setIsServerConnected(status);
      },
      onPresenceChanged: (count) => {
        if (isMounted) setConnectedDevicesCount(count);
      },
      onAttendanceUpdated: (data) => {
        if (!isMounted) return;
        setDatabase((prev) => {
          const currentAtt = { ...(prev.attendance[data.meetingId] || {}) };
          const updatedMeetingAtt = { ...currentAtt, ...data.attendance };
          const newNotes = data.notes
            ? {
                ...(prev.attendanceNotes || {}),
                [data.meetingId]: {
                  ...(prev.attendanceNotes?.[data.meetingId] || {}),
                  ...data.notes,
                },
              }
            : prev.attendanceNotes;

          return {
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
          };
        });

        const currentDevice = getDeviceInfo();
        if (data.sourceDeviceId && data.sourceDeviceId !== currentDevice.deviceId) {
          setSyncToastMessage(
            `📱 ${data.sourceDeviceName || 'Outro aparelho'} atualizou a chamada!`
          );
          setTimeout(() => setSyncToastMessage(null), 4000);
        }
      },
      onDatabaseUpdated: (data) => {
        if (!isMounted) return;
        setDatabase((prev) => ({
          ...prev,
          ...data.database,
          attendance: { ...prev.attendance, ...(data.database.attendance || {}) },
          attendanceNotes: { ...(prev.attendanceNotes || {}), ...(data.database.attendanceNotes || {}) },
          syncMetadata: data.database.syncMetadata || prev.syncMetadata,
        }));
        const currentDevice = getDeviceInfo();
        if (data.sourceDeviceId && data.sourceDeviceId !== currentDevice.deviceId) {
          setSyncToastMessage(
            `🔄 Dados sincronizados com ${data.sourceDeviceName || 'outro aparelho'}`
          );
          setTimeout(() => setSyncToastMessage(null), 4000);
        }
      },
      onPublisherUpdated: (data) => {
        if (!isMounted) return;
        setDatabase((prev) => ({
          ...prev,
          publishers: data.publishers,
        }));
      },
      onMeetingUpdated: (data) => {
        if (!isMounted) return;
        setDatabase((prev) => ({
          ...prev,
          meetings: data.meetings,
        }));
      },
    });

    return () => {
      isMounted = false;
      unsubSse();
    };
  }, []);

  // Listener em tempo real do Firestore para colaboração em tempo real (caso o Firebase esteja ativo)
  useEffect(() => {
    if (!isFirebaseActive) return;

    const unsubscribe = listenToFirestore((remoteDb) => {
      setDatabase((prev) => {
        // Merge seguro evitando loops
        return {
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
        };
      });
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isFirebaseActive]);

  // Salvar no LocalStorage sempre que o banco for alterado
  useEffect(() => {
    saveDatabase(database);
  }, [database]);

  // Se a reunião selecionada for excluída ou não existir, seleciona a primeira
  useEffect(() => {
    if (database.meetings.length > 0) {
      const exists = database.meetings.some((m) => m.id === selectedMeetingId);
      if (!exists) {
        setSelectedMeetingId(database.meetings[0].id);
      }
    } else {
      setSelectedMeetingId('');
    }
  }, [database.meetings, selectedMeetingId]);

  // Reunião atualmente selecionada para chamada
  const currentMeeting = useMemo(() => {
    return database.meetings.find((m) => m.id === selectedMeetingId) || null;
  }, [database.meetings, selectedMeetingId]);

  // Cálculo de faltas consecutivas (para alerta nos Anciãos)
  const absenceStreaks = useMemo(() => {
    return detectAbsenceStreaks(database.publishers, database.meetings, database.attendance);
  }, [database.publishers, database.meetings, database.attendance]);

  // HANDLERS DE CHAMADA (ATTENDANCE)
  const handleAttendanceChange = (
    meetingId: string,
    publisherId: string,
    status: AttendanceStatus
  ) => {
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

      // Sincroniza em tempo real com o servidor central e Firebase (com fila offline)
      const editorInfo = {
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        description: 'Chamada atualizada',
      };

      if (isOnline) {
        sendAttendanceToServer(meetingId, meetingAtt, updatedDb.attendanceNotes?.[meetingId], editorInfo).catch(() => {
          enqueueAttendanceSync(meetingId, meetingAtt, updatedDb.attendanceNotes?.[meetingId]);
        });
        if (isFirebaseActive) {
          syncAttendanceToFirestore(meetingId, meetingAtt, updatedDb.attendanceNotes?.[meetingId], editorInfo)
            .then((success) => {
              if (!success) enqueueAttendanceSync(meetingId, meetingAtt, updatedDb.attendanceNotes?.[meetingId]);
            })
            .catch(() => enqueueAttendanceSync(meetingId, meetingAtt, updatedDb.attendanceNotes?.[meetingId]));
        }
      } else {
        enqueueAttendanceSync(meetingId, meetingAtt, updatedDb.attendanceNotes?.[meetingId]);
      }

      return updatedDb;
    });
  };

  const handleBatchAttendanceChange = (
    meetingId: string,
    publisherIds: string[],
    status: AttendanceStatus
  ) => {
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

      const editorInfo = {
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        description: 'Chamada em lote atualizada',
      };

      if (isOnline) {
        sendAttendanceToServer(meetingId, meetingAtt, updatedDb.attendanceNotes?.[meetingId], editorInfo).catch(() => {
          enqueueAttendanceSync(meetingId, meetingAtt, updatedDb.attendanceNotes?.[meetingId]);
        });
        if (isFirebaseActive) {
          syncAttendanceToFirestore(meetingId, meetingAtt, updatedDb.attendanceNotes?.[meetingId], editorInfo)
            .then((success) => {
              if (!success) enqueueAttendanceSync(meetingId, meetingAtt, updatedDb.attendanceNotes?.[meetingId]);
            })
            .catch(() => enqueueAttendanceSync(meetingId, meetingAtt, updatedDb.attendanceNotes?.[meetingId]));
        }
      } else {
        enqueueAttendanceSync(meetingId, meetingAtt, updatedDb.attendanceNotes?.[meetingId]);
      }

      return updatedDb;
    });
  };

  // HANDLER DE OBSERVAÇÃO / MOTIVO (QUANDO ZOOM OU AUSENTE)
  const handleAttendanceNoteChange = (
    meetingId: string,
    publisherId: string,
    note: string
  ) => {
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
      const editorInfo = {
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        description: 'Observação da reunião atualizada',
      };

      if (isOnline) {
        sendAttendanceToServer(meetingId, meetingAtt, meetingNotes, editorInfo).catch(() => {
          enqueueAttendanceSync(meetingId, meetingAtt, meetingNotes);
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
    setDatabase((prev) => {
      const sourceAtt = prev.attendance[sourceMeetingId] || {};
      const currentAtt = { ...(prev.attendance[targetMeetingId] || {}) };
      const sourceNotes = prev.attendanceNotes?.[sourceMeetingId] || {};
      const currentNotes = { ...(prev.attendanceNotes?.[targetMeetingId] || {}) };

      prev.publishers.forEach((pub) => {
        if (!pub || pub.active === false) return;
        if (options.preserveExistingMarks && currentAtt[pub.id]) {
          return; // Preserva o que já foi marcado
        }
        const st = sourceAtt[pub.id];
        if (!st) return;

        if (options.onlyPresent && st === 'ausente') {
          return; // Deixa ausente em branco (pendente)
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

      const editorInfo = {
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        description: 'Assistência copiada da reunião anterior',
      };

      if (isOnline) {
        sendAttendanceToServer(targetMeetingId, currentAtt, currentNotes, editorInfo).catch(() => {
          enqueueAttendanceSync(targetMeetingId, currentAtt, currentNotes);
        });
        if (isFirebaseActive) {
          syncAttendanceToFirestore(targetMeetingId, currentAtt, currentNotes, editorInfo)
            .then((success) => {
              if (!success) enqueueAttendanceSync(targetMeetingId, currentAtt, currentNotes);
            })
            .catch(() => enqueueAttendanceSync(targetMeetingId, currentAtt, currentNotes));
        }
      } else {
        enqueueAttendanceSync(targetMeetingId, currentAtt, currentNotes);
      }

      saveDatabase(updatedDb);
      return updatedDb;
    });

    setSyncToastMessage('📋 Assistência da reunião anterior copiada e sincronizada com sucesso!');
    setTimeout(() => setSyncToastMessage(null), 5000);
  };

  // SALVAR E SINCRONIZAR CHAMADA DA REUNIÃO ATIVA
  const handleSaveAndSyncAttendance = async (meetingId: string) => {
    setIsSyncingAttendance(true);
    try {
      // 1. Salva imediatamente o banco local completo
      saveDatabase(database);

      const meetingAtt = database.attendance[meetingId] || {};
      const meetingNotes = database.attendanceNotes?.[meetingId] || {};
      const device = getDeviceInfo();
      const editorInfo = {
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        description: 'Chamada salva e sincronizada',
      };

      // 2. Sincroniza em tempo real com o servidor central
      if (isOnline) {
        await sendAttendanceToServer(meetingId, meetingAtt, meetingNotes, editorInfo).catch(console.warn);

        // 3. Se o Firebase estiver ativo, sincroniza também no Firestore
        if (isFirebaseActive) {
          await syncAttendanceToFirestore(meetingId, meetingAtt, meetingNotes, editorInfo).catch(console.warn);
        }

        // Esvazia também qualquer pendência acumulada da fila offline
        await flushPendingQueue();
        setSyncToastMessage('✅ Chamada salva e sincronizada em todos os aparelhos!');
      } else {
        enqueueAttendanceSync(meetingId, meetingAtt, meetingNotes);
        setSyncToastMessage('💾 Chamada salva no aparelho! (Modo offline: será sincronizada ao reconectar)');
      }

      // Registra horário formatado do salvamento
      const now = new Date();
      const timeFormatted = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setLastSavedTimestamp((prev) => ({ ...prev, [meetingId]: timeFormatted }));
      setTimeout(() => setSyncToastMessage(null), 5000);
      return true;
    } catch (err) {
      console.error('Erro ao salvar e sincronizar chamada:', err);
      setSyncToastMessage('⚠️ Erro ao sincronizar chamada. Tente novamente.');
      setTimeout(() => setSyncToastMessage(null), 5000);
      return false;
    } finally {
      setIsSyncingAttendance(false);
    }
  };

  // ATUALIZAR DADOS E RECARREGAR CHAMADA (com suporte a silent em segundo plano)
  const handleRefreshAttendanceData = async (silent: boolean = false) => {
    if (!silent) setIsRefreshingAttendance(true);
    try {
      // 1. Recarrega do banco local
      let currentDb = loadDatabase();

      // 2. Sincroniza com servidor central se estiver online
      if (isOnline) {
        const serverDb = await fetchServerDatabase();
        if (serverDb) {
          currentDb = {
            ...currentDb,
            ...serverDb,
            publishers: serverDb.publishers?.length ? serverDb.publishers : currentDb.publishers,
            meetings: serverDb.meetings?.length ? serverDb.meetings : currentDb.meetings,
            attendance: { ...currentDb.attendance, ...(serverDb.attendance || {}) },
            attendanceNotes: { ...(currentDb.attendanceNotes || {}), ...(serverDb.attendanceNotes || {}) },
            shepherdingVisits: serverDb.shepherdingVisits?.length
              ? serverDb.shepherdingVisits
              : currentDb.shepherdingVisits,
            syncMetadata: serverDb.syncMetadata || currentDb.syncMetadata,
            lastUpdated: new Date().toISOString(),
          };
        }

        // 3. Se o Firebase estiver ativo, busca também dados remotos do Firestore
        if (isFirebaseActive) {
          const remoteData = await fetchRemoteFirestoreData();
          if (remoteData) {
            currentDb = {
              ...currentDb,
              ...remoteData,
              publishers: remoteData.publishers?.length ? remoteData.publishers : currentDb.publishers,
              meetings: remoteData.meetings?.length ? remoteData.meetings : currentDb.meetings,
              attendance: { ...currentDb.attendance, ...(remoteData.attendance || {}) },
              attendanceNotes: { ...(currentDb.attendanceNotes || {}), ...(remoteData.attendanceNotes || {}) },
              shepherdingVisits: remoteData.shepherdingVisits?.length
                ? remoteData.shepherdingVisits
                : currentDb.shepherdingVisits,
              syncMetadata: remoteData.syncMetadata || currentDb.syncMetadata,
              lastUpdated: new Date().toISOString(),
            };
          }
        }
      }

      setDatabase(currentDb);
      saveDatabase(currentDb);

      if (!silent) {
        setSyncToastMessage('🔄 Chamada e dados sincronizados com sucesso!');
        setTimeout(() => setSyncToastMessage(null), 4000);
      }
    } catch (err) {
      console.error('Erro ao atualizar dados:', err);
      if (!silent) {
        setSyncToastMessage('⚠️ Erro ao atualizar dados.');
        setTimeout(() => setSyncToastMessage(null), 4000);
      }
    } finally {
      if (!silent) setIsRefreshingAttendance(false);
    }
  };

  // Sincronização e reconexão ativa em segundo plano para iPhone e iPad
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && isOnline) {
        // Ao desbloquear o iPhone/iPad ou retornar para a aba, sincroniza em silêncio imediatamente
        handleRefreshAttendanceData(true);
      }
    };

    const handleWindowFocus = () => {
      if (isOnline) handleRefreshAttendanceData(true);
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    window.addEventListener('focus', handleWindowFocus);

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      if (isOnline && isAutoPollActive) {
        handleRefreshAttendanceData(true);
      }
    }, 12000);

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      window.removeEventListener('focus', handleWindowFocus);
      clearInterval(interval);
    };
  }, [isOnline, isAutoPollActive, isFirebaseActive]);

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
          sendMeetingToServer(updatedMeeting).catch(() => enqueueMeetingSync(updatedMeeting));
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
    setDatabase((prev) => {
      const exists = prev.meetings.some((m) => m.id === meeting.id);
      const newMeetings = exists
        ? prev.meetings.map((m) => (m.id === meeting.id ? meeting : m))
        : [meeting, ...prev.meetings];

      const updatedDb = {
        ...prev,
        meetings: newMeetings,
        lastUpdated: new Date().toISOString(),
      };

      if (isOnline) {
        sendMeetingToServer(meeting).catch(() => enqueueMeetingSync(meeting));
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

      return updatedDb;
    });

    setSelectedMeetingId(meeting.id);
  };

  const handleDeleteMeeting = (meetingId: string) => {
    const meetingToDelete = database.meetings.find((m) => m.id === meetingId);
    setDatabase((prev) => {
      const newMeetings = prev.meetings.filter((m) => m.id !== meetingId);
      const newAttendance = { ...prev.attendance };
      delete newAttendance[meetingId];
      const newAttendanceNotes = { ...(prev.attendanceNotes || {}) };
      delete newAttendanceNotes[meetingId];

      if (isOnline) {
        deleteMeetingOnServer(meetingId).catch(console.warn);
        if (isFirebaseActive) {
          deleteMeetingFromFirestore(meetingId).catch(console.warn);
        }
      }

      const updated = {
        ...prev,
        meetings: newMeetings,
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

    setSyncToastMessage(
      meetingToDelete
        ? `🗑️ Reunião de ${meetingToDelete.date} excluída com sucesso.`
        : '🗑️ Reunião excluída com sucesso.'
    );
    setTimeout(() => setSyncToastMessage(null), 3500);
  };

  // HANDLERS DE PUBLICADORES (PUBLISHERS)
  const handleSavePublisher = (publisher: Publisher) => {
    setDatabase((prev) => {
      const exists = prev.publishers.some((p) => p.id === publisher.id);
      const newPublishers = exists
        ? prev.publishers.map((p) => (p.id === publisher.id ? publisher : p))
        : [...prev.publishers, publisher];

      const updatedDb = {
        ...prev,
        publishers: newPublishers,
        lastUpdated: new Date().toISOString(),
      };

      if (isOnline) {
        sendPublisherToServer(publisher).catch(() => enqueuePublisherSync(publisher));
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

      return updatedDb;
    });
  };

  const handleDeletePublisher = (publisherId: string) => {
    const pubToDelete = database.publishers.find((p) => p.id === publisherId);
    setDatabase((prev) => {
      const newPublishers = prev.publishers.filter((p) => p.id !== publisherId);
      if (isOnline) {
        deletePublisherOnServer(publisherId).catch(console.warn);
        if (isFirebaseActive) {
          deletePublisherFromFirestore(publisherId).catch(console.warn);
        }
      }
      const updated = {
        ...prev,
        publishers: newPublishers,
        lastUpdated: new Date().toISOString(),
      };
      saveDatabase(updated);
      return updated;
    });

    setSyncToastMessage(
      pubToDelete
        ? `🗑️ Publicador "${pubToDelete.name}" removido.`
        : '🗑️ Publicador removido.'
    );
    setTimeout(() => setSyncToastMessage(null), 3500);
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
    setDatabase((prev) => ({
      ...prev,
      congregationName: name,
      lastUpdated: new Date().toISOString(),
    }));
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans antialiased selection:bg-blue-600 selection:text-white">
      
      {/* Barra de Navegação Superior */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onTabChange={setActiveTab}
        congregationName={database.congregationName}
        isFirebaseActive={isFirebaseActive}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenSyncModal={() => setIsSyncModalOpen(true)}
        pendingAbsenceCount={absenceStreaks.length}
        absenceStreakCount={absenceStreaks.length}
        isOnline={isOnline}
        pendingQueueCount={pendingQueue.length}
        isSyncingQueue={isSyncingQueue}
        onManualSyncQueue={flushPendingQueue}
        connectedDevicesCount={connectedDevicesCount}
      />

      {/* Banner de Aviso de Conexão Offline no Topo */}
      {!isOnline && (
        <div className="bg-amber-600 text-white px-4 py-2.5 text-xs sm:text-sm font-semibold shadow-md border-b border-amber-700 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
            <WifiOff className="w-4 h-4 flex-shrink-0 text-amber-100" />
            <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <span>
                <strong>Modo Offline Ativo:</strong> Você está sem internet. O aplicativo continua registrando normalmente e salvando tudo localmente.
              </span>
              {pendingQueue.length > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-800 text-amber-100 text-xs font-bold whitespace-nowrap self-start sm:self-auto">
                  <RefreshCw className="w-3 h-3 text-amber-300" />
                  <span>
                    {pendingQueue.length} alteraç{pendingQueue.length > 1 ? 'ões' : 'ão'} na fila para envio
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notificação Toast Flutuante de Sincronização */}
      {syncToastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-md w-full px-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-emerald-600 text-white font-bold p-3.5 rounded-2xl shadow-xl border border-emerald-400 flex items-center justify-between text-xs sm:text-sm">
            <span>{syncToastMessage}</span>
            <button
              onClick={() => setSyncToastMessage(null)}
              className="ml-2 text-white/80 hover:text-white p-1 rounded-lg"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Banner de Restauração de Reuniões Anteriores */}
      {showRestoreBanner && (
        <div className="bg-amber-500 text-white px-4 py-2.5 text-xs sm:text-sm font-medium shadow-sm transition-all border-b border-amber-600">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 max-w-7xl mx-auto w-full">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 shrink-0 text-amber-100" />
              <span>
                <strong>Recuperação de Reuniões:</strong> Deseja restaurar o cadastro e as chamadas de <strong>Terça-feira</strong> e <strong>Sábado</strong> passado?
              </span>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                onClick={handleRestoreTuesdaySaturday}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-white text-amber-900 font-bold rounded-lg hover:bg-amber-50 text-xs shadow-xs transition-colors active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                Restaurar Terça & Sábado
              </button>
              <button
                onClick={() => setIsBackupHistoryOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs transition-colors"
              >
                <History className="w-3.5 h-3.5" />
                Histórico
              </button>
              <button
                onClick={() => setShowRestoreBanner(false)}
                className="p-1 text-white/80 hover:text-white rounded-lg hover:bg-amber-600/50"
                title="Fechar aviso"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo Principal conforme a Aba Ativa */}
      <main className="flex-1 pb-16">
        {activeTab === 'dashboard' && (
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
            <DashboardView
              meetings={database.meetings}
              publishers={database.publishers}
              attendance={database.attendance}
              congregationName={database.congregationName}
              onNavigateToAttendance={(meetingId) => {
                setSelectedMeetingId(meetingId);
                setActiveTab('attendance');
              }}
              onNavigateToTab={setActiveTab}
            />
          </div>
        )}

        {activeTab === 'attendance' && (
          <AttendanceView
            currentMeeting={currentMeeting}
            allMeetings={database.meetings}
            meetings={database.meetings}
            publishers={database.publishers}
            attendance={database.attendance}
            attendanceMap={currentMeeting ? (database.attendance[currentMeeting.id] || {}) : {}}
            attendanceNotes={database.attendanceNotes || {}}
            notesMap={currentMeeting ? (database.attendanceNotes?.[currentMeeting.id] || {}) : {}}
            selectedMeetingId={selectedMeetingId}
            onSelectMeeting={(m) => {
              const meetingId = typeof m === 'string' ? m : m?.id;
              if (meetingId) setSelectedMeetingId(meetingId);
            }}
            onAttendanceChange={handleAttendanceChange}
            onAttendanceNoteChange={(pubId, note) => {
              if (selectedMeetingId) handleAttendanceNoteChange(selectedMeetingId, pubId, note);
            }}
            onUpdateMeetingDate={handleUpdateMeetingDate}
            onQuickCreateMeetingForDate={handleQuickCreateMeetingForDate}
            onBatchAttendanceChange={handleBatchAttendanceChange}
            onMarkAttendance={(pubId, status) => {
              if (selectedMeetingId) handleAttendanceChange(selectedMeetingId, pubId, status);
            }}
            onBatchMark={(pubIds, status) => {
              if (selectedMeetingId) handleBatchAttendanceChange(selectedMeetingId, pubIds, status);
            }}
            onClearAttendance={(pubIds) => {
              if (selectedMeetingId) {
                setDatabase((prev) => {
                  const meetingAtt = { ...(prev.attendance[selectedMeetingId] || {}) };
                  pubIds.forEach((pid) => delete meetingAtt[pid]);
                  const nowIso = new Date().toISOString();
                  const device = getDeviceInfo();
                  const updatedDb = {
                    ...prev,
                    attendance: { ...prev.attendance, [selectedMeetingId]: meetingAtt },
                    syncMetadata: {
                      lastEditorDeviceId: device.deviceId,
                      lastEditorDeviceName: device.deviceName,
                      lastEditedAt: nowIso,
                      lastEditedMeetingId: selectedMeetingId,
                      lastEditedDescription: 'Marcação limpa (pendente)',
                    },
                    lastUpdated: nowIso,
                  };

                  const editorInfo = {
                    deviceId: device.deviceId,
                    deviceName: device.deviceName,
                    description: 'Marcação limpa (pendente)',
                  };

                  if (isOnline) {
                    sendAttendanceToServer(selectedMeetingId, meetingAtt, updatedDb.attendanceNotes?.[selectedMeetingId], editorInfo).catch(() => {
                      enqueueAttendanceSync(selectedMeetingId, meetingAtt, updatedDb.attendanceNotes?.[selectedMeetingId]);
                    });
                    if (isFirebaseActive) {
                      syncAttendanceToFirestore(selectedMeetingId, meetingAtt, updatedDb.attendanceNotes?.[selectedMeetingId], editorInfo)
                        .then((success) => {
                          if (!success) enqueueAttendanceSync(selectedMeetingId, meetingAtt, updatedDb.attendanceNotes?.[selectedMeetingId]);
                        })
                        .catch(() => enqueueAttendanceSync(selectedMeetingId, meetingAtt, updatedDb.attendanceNotes?.[selectedMeetingId]));
                    }
                  } else {
                    enqueueAttendanceSync(selectedMeetingId, meetingAtt, updatedDb.attendanceNotes?.[selectedMeetingId]);
                  }

                  saveDatabase(updatedDb);
                  return updatedDb;
                });
              }
            }}
            onCopyAttendanceFromMeeting={handleCopyAttendanceFromMeeting}
            onOpenNewMeetingModal={() => setActiveTab('meetings')}
            onOpenReport={(meeting) => {
              setSelectedMeetingId(meeting.id);
              setActiveTab('reports');
            }}
            onNavigateToTab={setActiveTab}
            onOpenSyncModal={() => setIsSyncModalOpen(true)}
            onSaveAndSyncAttendance={handleSaveAndSyncAttendance}
            onRefreshData={handleRefreshAttendanceData}
            isSyncingAttendance={isSyncingAttendance}
            isRefreshingAttendance={isRefreshingAttendance}
            lastSavedTimestamp={lastSavedTimestamp}
            isFirebaseActive={isFirebaseActive}
            isOnline={isOnline}
            isLiveSyncActive={isServerConnected || isFirebaseActive}
            connectedDevicesCount={connectedDevicesCount}
            syncMetadata={database.syncMetadata}
            autoPollSeconds={15}
            isAutoPollActive={isAutoPollActive}
            onToggleAutoPoll={() => setIsAutoPollActive((prev) => !prev)}
            congregationName={database.congregationName}
            onRestoreTuesdaySaturday={handleRestoreTuesdaySaturday}
          />
        )}

        {activeTab === 'meetings' && (
          <MeetingManager
            meetings={database.meetings}
            attendance={database.attendance}
            onSelectMeetingForAttendance={(meeting) => {
              setSelectedMeetingId(meeting.id);
              setActiveTab('attendance');
            }}
            onOpenReport={(meeting) => {
              setSelectedMeetingId(meeting.id);
              setActiveTab('reports');
            }}
            onSaveMeeting={handleSaveMeeting}
            onDeleteMeeting={handleDeleteMeeting}
            onRestoreTuesdaySaturday={handleRestoreTuesdaySaturday}
            onOpenBackupHistory={() => setIsBackupHistoryOpen(true)}
          />
        )}

        {activeTab === 'publishers' && (
          <PublisherManager
            publishers={database.publishers}
            onSavePublisher={handleSavePublisher}
            onDeletePublisher={handleDeletePublisher}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsView
            meetings={database.meetings}
            publishers={database.publishers}
            attendance={database.attendance}
            attendanceNotes={database.attendanceNotes || {}}
            selectedMeetingId={selectedMeetingId}
            congregationName={database.congregationName}
          />
        )}

        {activeTab === 'shepherding' && (
          <ShepherdingView
            absenceStreaks={absenceStreaks}
            shepherdingVisits={database.shepherdingVisits}
            publishers={database.publishers}
            onSaveVisit={handleSaveVisit}
            onDeleteVisit={handleDeleteVisit}
            congregationName={database.congregationName}
          />
        )}
      </main>

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
