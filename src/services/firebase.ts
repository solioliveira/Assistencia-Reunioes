import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import {
  Firestore,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import {
  AttendanceStatus,
  CongregationDatabase,
  FirebaseConnectionConfig,
  Meeting,
  Publisher,
  ShepherdingVisit,
  SyncMetadata,
} from '../types';

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;

const FIREBASE_CONFIG_KEY = 'jw_attendance_firebase_config';

export function getStoredFirebaseConfig(): FirebaseConnectionConfig | null {
  try {
    const raw = localStorage.getItem(FIREBASE_CONFIG_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Falha ao ler configuração salva do Firebase:', e);
  }
  return null;
}

export function saveFirebaseConfig(config: FirebaseConnectionConfig): void {
  localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
}

export function clearStoredFirebaseConfig(): void {
  localStorage.removeItem(FIREBASE_CONFIG_KEY);
  appInstance = null;
  dbInstance = null;
}

export function initFirebaseService(config?: FirebaseConnectionConfig): {
  success: boolean;
  db: Firestore | null;
  error?: string;
} {
  try {
    const activeConfig = config || getStoredFirebaseConfig();
    if (!activeConfig || !activeConfig.apiKey || !activeConfig.projectId) {
      return { success: false, db: null };
    }

    if (!getApps().length) {
      appInstance = initializeApp(activeConfig);
    } else {
      appInstance = getApps()[0];
    }

    if (activeConfig.firestoreDatabaseId) {
      dbInstance = getFirestore(appInstance, activeConfig.firestoreDatabaseId);
    } else {
      dbInstance = getFirestore(appInstance);
    }

    return { success: true, db: dbInstance };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('Firebase init aviso/erro:', msg);
    return { success: false, db: null, error: msg };
  }
}

export function getFirestoreInstance(): Firestore | null {
  if (dbInstance) return dbInstance;
  const result = initFirebaseService();
  return result.db;
}

// Sincronização em segundo plano para Firestore
export async function syncPublisherToFirestore(publisher: Publisher): Promise<boolean> {
  const db = getFirestoreInstance();
  if (!db) return false;
  try {
    await setDoc(doc(db, 'publishers', publisher.id), publisher);
    return true;
  } catch (err) {
    console.warn('Erro ao salvar publicador no Firestore:', err);
    return false;
  }
}

export async function deletePublisherFromFirestore(publisherId: string): Promise<boolean> {
  const db = getFirestoreInstance();
  if (!db) return false;
  try {
    await deleteDoc(doc(db, 'publishers', publisherId));
    return true;
  } catch (err) {
    console.warn('Erro ao excluir publicador do Firestore:', err);
    return false;
  }
}

export async function syncMeetingToFirestore(meeting: Meeting): Promise<boolean> {
  const db = getFirestoreInstance();
  if (!db) return false;
  try {
    await setDoc(doc(db, 'meetings', meeting.id), meeting);
    return true;
  } catch (err) {
    console.warn('Erro ao salvar reunião no Firestore:', err);
    return false;
  }
}

export async function deleteMeetingFromFirestore(meetingId: string): Promise<boolean> {
  const db = getFirestoreInstance();
  if (!db) return false;
  try {
    await deleteDoc(doc(db, 'meetings', meetingId));
    return true;
  } catch (err) {
    console.warn('Erro ao excluir reunião do Firestore:', err);
    return false;
  }
}

export async function syncMetadataToFirestore(meta: SyncMetadata): Promise<boolean> {
  const db = getFirestoreInstance();
  if (!db) return false;
  try {
    await setDoc(doc(db, 'system', 'syncMetadata'), meta, { merge: true });
    return true;
  } catch (err) {
    console.warn('Erro ao salvar syncMetadata no Firestore:', err);
    return false;
  }
}

export async function syncAttendanceToFirestore(
  meetingId: string,
  attendanceMap: Record<string, AttendanceStatus>,
  notesMap?: Record<string, string>,
  editorInfo?: { deviceId: string; deviceName: string; description?: string }
): Promise<boolean> {
  const db = getFirestoreInstance();
  if (!db) return false;
  try {
    const nowIso = new Date().toISOString();
    const payload: any = {
      meetingId,
      attendance: attendanceMap,
      updatedAt: nowIso,
    };
    if (notesMap !== undefined) {
      payload.notes = notesMap;
    }
    if (editorInfo) {
      payload.lastEditorDeviceId = editorInfo.deviceId;
      payload.lastEditorDeviceName = editorInfo.deviceName;
      payload.lastEditedDescription = editorInfo.description || 'Chamada atualizada';
    }
    await setDoc(doc(db, 'attendance', meetingId), payload, { merge: true });

    if (editorInfo) {
      await syncMetadataToFirestore({
        lastEditorDeviceId: editorInfo.deviceId,
        lastEditorDeviceName: editorInfo.deviceName,
        lastEditedAt: nowIso,
        lastEditedMeetingId: meetingId,
        lastEditedDescription: editorInfo.description || 'Chamada atualizada',
      });
    }

    return true;
  } catch (err) {
    console.warn('Erro ao sincronizar chamada no Firestore:', err);
    return false;
  }
}

export async function syncShepherdingVisitToFirestore(visit: ShepherdingVisit): Promise<boolean> {
  const db = getFirestoreInstance();
  if (!db) return false;
  try {
    await setDoc(doc(db, 'shepherdingVisits', visit.id), visit);
    return true;
  } catch (err) {
    console.warn('Erro ao sincronizar visita no Firestore:', err);
    return false;
  }
}

export async function deleteShepherdingVisitFromFirestore(visitId: string): Promise<boolean> {
  const db = getFirestoreInstance();
  if (!db) return false;
  try {
    await deleteDoc(doc(db, 'shepherdingVisits', visitId));
    return true;
  } catch (err) {
    console.warn('Erro ao excluir visita do Firestore:', err);
    return false;
  }
}

export const syncVisitToFirestore = syncShepherdingVisitToFirestore;

// Listener unificado que alimenta o estado da congregação
export function listenToFirestore(
  onUpdate: (partialDb: Partial<CongregationDatabase>) => void
): (() => void) | null {
  return setupRealtimeSync({
    onPublishers: (publishers) => onUpdate({ publishers }),
    onMeetings: (meetings) => onUpdate({ meetings }),
    onAttendance: (meetingId, map, notes, meta) => {
      onUpdate({
        attendance: {
          [meetingId]: map,
        } as Record<string, Record<string, AttendanceStatus>>,
        attendanceNotes: notes
          ? ({
              [meetingId]: notes,
            } as Record<string, Record<string, string>>)
          : undefined,
        syncMetadata: meta,
      });
    },
    onShepherding: (shepherdingVisits) => onUpdate({ shepherdingVisits }),
    onSyncMetadata: (syncMetadata) => onUpdate({ syncMetadata }),
  });
}
export function setupRealtimeSync(onDataReceived: {
  onPublishers?: (publishers: Publisher[]) => void;
  onMeetings?: (meetings: Meeting[]) => void;
  onAttendance?: (
    meetingId: string,
    map: Record<string, AttendanceStatus>,
    notes?: Record<string, string>,
    metadata?: SyncMetadata
  ) => void;
  onShepherding?: (visits: ShepherdingVisit[]) => void;
  onSyncMetadata?: (meta: SyncMetadata) => void;
}): (() => void) | null {
  const db = getFirestoreInstance();
  if (!db) return null;

  const unsubscribes: (() => void)[] = [];

  try {
    if (onDataReceived.onPublishers) {
      const unsubPubs = onSnapshot(collection(db, 'publishers'), (snapshot) => {
        const pubs: Publisher[] = [];
        snapshot.forEach((d) => pubs.push(d.data() as Publisher));
        if (pubs.length > 0 && onDataReceived.onPublishers) {
          onDataReceived.onPublishers(pubs);
        }
      }, (err) => console.warn('Aviso no listener de publicadores:', err));
      unsubscribes.push(unsubPubs);
    }

    if (onDataReceived.onMeetings) {
      const unsubMeetings = onSnapshot(collection(db, 'meetings'), (snapshot) => {
        const meets: Meeting[] = [];
        snapshot.forEach((d) => meets.push(d.data() as Meeting));
        if (meets.length > 0 && onDataReceived.onMeetings) {
          onDataReceived.onMeetings(meets);
        }
      }, (err) => console.warn('Aviso no listener de reuniões:', err));
      unsubscribes.push(unsubMeetings);
    }

    if (onDataReceived.onAttendance) {
      const unsubAttendance = onSnapshot(collection(db, 'attendance'), (snapshot) => {
        snapshot.forEach((d) => {
          const data = d.data();
          if (data && data.meetingId && data.attendance && onDataReceived.onAttendance) {
            const meta: SyncMetadata | undefined = data.lastEditorDeviceId ? {
              lastEditorDeviceId: data.lastEditorDeviceId,
              lastEditorDeviceName: data.lastEditorDeviceName,
              lastEditedAt: data.updatedAt,
              lastEditedMeetingId: data.meetingId,
              lastEditedDescription: data.lastEditedDescription,
            } : undefined;
            onDataReceived.onAttendance(data.meetingId, data.attendance, data.notes, meta);
          }
        });
      }, (err) => console.warn('Aviso no listener de frequências:', err));
      unsubscribes.push(unsubAttendance);
    }

    if (onDataReceived.onShepherding) {
      const unsubShepherding = onSnapshot(collection(db, 'shepherdingVisits'), (snapshot) => {
        const visits: ShepherdingVisit[] = [];
        snapshot.forEach((d) => visits.push(d.data() as ShepherdingVisit));
        if (visits.length > 0 && onDataReceived.onShepherding) {
          onDataReceived.onShepherding(visits);
        }
      }, (err) => console.warn('Aviso no listener de pastoreio:', err));
      unsubscribes.push(unsubShepherding);
    }

    if (onDataReceived.onSyncMetadata) {
      const unsubMeta = onSnapshot(doc(db, 'system', 'syncMetadata'), (snapshot) => {
        const data = snapshot.data();
        if (data && onDataReceived.onSyncMetadata) {
          onDataReceived.onSyncMetadata(data as SyncMetadata);
        }
      }, (err) => console.warn('Aviso no listener de syncMetadata:', err));
      unsubscribes.push(unsubMeta);
    }

    return () => {
      unsubscribes.forEach(unsub => {
        try { unsub(); } catch (_) {}
      });
    };
  } catch (e) {
    console.warn('Erro ao configurar listener em tempo real do Firestore:', e);
    return null;
  }
}

// Busca direta e completa dos dados no Firestore para atualização sob demanda
export async function fetchRemoteFirestoreData(): Promise<Partial<CongregationDatabase> | null> {
  const db = getFirestoreInstance();
  if (!db) return null;

  try {
    const result: Partial<CongregationDatabase> = {};

    // 1. Reuniões
    try {
      const meetsSnap = await getDocs(collection(db, 'meetings'));
      if (!meetsSnap.empty) {
        const meets: Meeting[] = [];
        meetsSnap.forEach((d) => meets.push(d.data() as Meeting));
        result.meetings = meets;
      }
    } catch (e) {
      console.warn('Erro ao buscar meetings no Firestore:', e);
    }

    // 2. Frequências / Presenças
    try {
      const attSnap = await getDocs(collection(db, 'attendance'));
      if (!attSnap.empty) {
        const attMap: Record<string, Record<string, AttendanceStatus>> = {};
        const notesMap: Record<string, Record<string, string>> = {};
        attSnap.forEach((d) => {
          const data = d.data();
          if (data && data.meetingId && data.attendance) {
            attMap[data.meetingId] = data.attendance;
            if (data.notes) {
              notesMap[data.meetingId] = data.notes;
            }
          }
        });
        result.attendance = attMap;
        result.attendanceNotes = notesMap;
      }
    } catch (e) {
      console.warn('Erro ao buscar attendance no Firestore:', e);
    }

    // 3. Publicadores
    try {
      const pubsSnap = await getDocs(collection(db, 'publishers'));
      if (!pubsSnap.empty) {
        const pubs: Publisher[] = [];
        pubsSnap.forEach((d) => pubs.push(d.data() as Publisher));
        result.publishers = pubs;
      }
    } catch (e) {
      console.warn('Erro ao buscar publishers no Firestore:', e);
    }

    // 4. Pastoreio
    try {
      const visitsSnap = await getDocs(collection(db, 'shepherdingVisits'));
      if (!visitsSnap.empty) {
        const visits: ShepherdingVisit[] = [];
        visitsSnap.forEach((d) => visits.push(d.data() as ShepherdingVisit));
        result.shepherdingVisits = visits;
      }
    } catch (e) {
      console.warn('Erro ao buscar shepherdingVisits no Firestore:', e);
    }

    // 5. Metadados do sistema / dispositivo
    try {
      const metaSnap = await getDoc(doc(db, 'system', 'syncMetadata'));
      if (metaSnap.exists()) {
        result.syncMetadata = metaSnap.data() as SyncMetadata;
      }
    } catch (e) {
      // Opcional
    }

    return result;
  } catch (err) {
    console.warn('Erro ao buscar dados remotos do Firestore:', err);
    return null;
  }
}

// Codifica a configuração para um link direto de sincronização rápida
export function encodeFirebaseConfigToLink(config: FirebaseConnectionConfig): string {
  try {
    const json = JSON.stringify(config);
    const b64 = btoa(encodeURIComponent(json));
    const url = new URL(window.location.href);
    url.hash = `sync=${b64}`;
    return url.toString();
  } catch (e) {
    console.error('Erro ao codificar link de sync:', e);
    return window.location.href;
  }
}

// Decodifica a configuração se a página foi aberta com link de sincronização
export function decodeFirebaseConfigFromHash(): FirebaseConnectionConfig | null {
  try {
    if (typeof window === 'undefined') return null;
    const hash = window.location.hash;
    const match = hash.match(/sync=([^&]+)/);
    if (match && match[1]) {
      const decoded = decodeURIComponent(atob(match[1]));
      const parsed = JSON.parse(decoded);
      if (parsed && parsed.projectId && parsed.apiKey) {
        return parsed as FirebaseConnectionConfig;
      }
    }
  } catch (e) {
    console.error('Falha ao decodificar sync da URL:', e);
  }
  return null;
}
