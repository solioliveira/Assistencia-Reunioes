import {
  syncAttendanceToFirestore,
  syncMeetingToFirestore,
  syncPublisherToFirestore,
  syncShepherdingVisitToFirestore,
} from './firebase';
import {
  sendAttendanceToServer,
  sendMeetingToServer,
  sendPublisherToServer,
  sendShepherdingToServer,
} from './apiSync';
import { getDeviceInfo } from './device';
import { AttendanceStatus, Meeting, PendingSyncItem, Publisher, ShepherdingVisit } from '../types';

const QUEUE_STORAGE_KEY = 'jw_congregation_pending_queue_v1';
const QUEUE_EVENT_NAME = 'jw_sync_queue_updated';

// Recupera a fila salva no LocalStorage
export function getPendingQueue(): PendingSyncItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Erro ao ler fila de pendências:', err);
    return [];
  }
}

// Salva a fila no LocalStorage e notifica componentes
function saveQueue(queue: PendingSyncItem[]): void {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(QUEUE_EVENT_NAME, { detail: queue }));
    }
  } catch (err) {
    console.error('Erro ao salvar fila de pendências:', err);
  }
}

// Inscreve componentes para ouvir alterações na contagem da fila
export function subscribeToQueueChanges(callback: (queue: PendingSyncItem[]) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    const custom = event as CustomEvent<PendingSyncItem[]>;
    callback(custom.detail || getPendingQueue());
  };
  window.addEventListener(QUEUE_EVENT_NAME, handler);
  return () => {
    window.removeEventListener(QUEUE_EVENT_NAME, handler);
  };
}

// Enfileira sincronização de chamada com consolidação inteligente por reunião
export function enqueueAttendanceSync(
  meetingId: string,
  attendanceMap: Record<string, AttendanceStatus>,
  notesMap?: Record<string, string>
): void {
  const queue = getPendingQueue();
  // Se já houver um registro pendente para esta reunião, atualizamos com o mapa mais recente
  const existingIdx = queue.findIndex(
    (item) => item.type === 'attendance' && item.meetingId === meetingId
  );

  const updatedItem: PendingSyncItem = {
    id: existingIdx >= 0 ? queue[existingIdx].id : `sync-att-${meetingId}-${Date.now()}`,
    type: 'attendance',
    timestamp: Date.now(),
    meetingId,
    attendanceMap: { ...attendanceMap },
    notesMap: notesMap ? { ...notesMap } : (existingIdx >= 0 ? queue[existingIdx].notesMap : undefined),
  };

  if (existingIdx >= 0) {
    queue[existingIdx] = updatedItem;
  } else {
    queue.push(updatedItem);
  }

  saveQueue(queue);
}

// Enfileira sincronização de reunião
export function enqueueMeetingSync(meeting: Meeting): void {
  const queue = getPendingQueue();
  const existingIdx = queue.findIndex(
    (item) => item.type === 'meeting' && item.meeting?.id === meeting.id
  );

  const item: PendingSyncItem = {
    id: existingIdx >= 0 ? queue[existingIdx].id : `sync-meet-${meeting.id}-${Date.now()}`,
    type: 'meeting',
    timestamp: Date.now(),
    meeting,
  };

  if (existingIdx >= 0) {
    queue[existingIdx] = item;
  } else {
    queue.push(item);
  }

  saveQueue(queue);
}

// Enfileira sincronização de publicador
export function enqueuePublisherSync(publisher: Publisher): void {
  const queue = getPendingQueue();
  const existingIdx = queue.findIndex(
    (item) => item.type === 'publisher' && item.publisher?.id === publisher.id
  );

  const item: PendingSyncItem = {
    id: existingIdx >= 0 ? queue[existingIdx].id : `sync-pub-${publisher.id}-${Date.now()}`,
    type: 'publisher',
    timestamp: Date.now(),
    publisher,
  };

  if (existingIdx >= 0) {
    queue[existingIdx] = item;
  } else {
    queue.push(item);
  }

  saveQueue(queue);
}

// Enfileira sincronização de visita de pastoreio
export function enqueueVisitSync(visit: ShepherdingVisit): void {
  const queue = getPendingQueue();
  const existingIdx = queue.findIndex(
    (item) => item.type === 'visit' && item.visit?.id === visit.id
  );

  const item: PendingSyncItem = {
    id: existingIdx >= 0 ? queue[existingIdx].id : `sync-vis-${visit.id}-${Date.now()}`,
    type: 'visit',
    timestamp: Date.now(),
    visit,
  };

  if (existingIdx >= 0) {
    queue[existingIdx] = item;
  } else {
    queue.push(item);
  }

  saveQueue(queue);
}

// Limpa toda a fila
export function clearPendingQueue(): void {
  saveQueue([]);
}

// Processa e descarrega a fila de pendências para o Firestore
let isProcessingQueue = false;

export async function processPendingSyncQueue(
  isFirebaseActive: boolean
): Promise<{ success: number; failed: number; total: number }> {
  if (isProcessingQueue) {
    return { success: 0, failed: 0, total: getPendingQueue().length };
  }

  const queue = getPendingQueue();
  if (queue.length === 0) {
    return { success: 0, failed: 0, total: 0 };
  }

  // Se não estiver online, não processa
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: 0, failed: queue.length, total: queue.length };
  }

  isProcessingQueue = true;
  let successCount = 0;
  let failedCount = 0;
  const remainingQueue: PendingSyncItem[] = [];

  try {
    for (const item of queue) {
      let succeeded = false;
      try {
        if (item.type === 'attendance' && item.meetingId && item.attendanceMap) {
          const device = getDeviceInfo();
          // Tenta enviar para o servidor Express (sincronização multi-aparelho nativa)
          const serverSuccess = await sendAttendanceToServer(
            item.meetingId,
            item.attendanceMap,
            item.notesMap,
            {
              deviceId: device.deviceId,
              deviceName: device.deviceName,
              description: 'Chamada sincronizada',
            }
          );

          // Se Firebase estiver ativo, também salva lá
          let firestoreSuccess = true;
          if (isFirebaseActive) {
            firestoreSuccess = await syncAttendanceToFirestore(
              item.meetingId,
              item.attendanceMap,
              item.notesMap,
              {
                deviceId: device.deviceId,
                deviceName: device.deviceName,
                description: 'Chamada sincronizada',
              }
            );
          }

          succeeded = serverSuccess || firestoreSuccess;
        } else if (item.type === 'meeting' && item.meeting) {
          const serverSuccess = await sendMeetingToServer(item.meeting);
          let firestoreSuccess = true;
          if (isFirebaseActive) {
            firestoreSuccess = await syncMeetingToFirestore(item.meeting);
          }
          succeeded = serverSuccess || firestoreSuccess;
        } else if (item.type === 'publisher' && item.publisher) {
          const serverSuccess = await sendPublisherToServer(item.publisher);
          let firestoreSuccess = true;
          if (isFirebaseActive) {
            firestoreSuccess = await syncPublisherToFirestore(item.publisher);
          }
          succeeded = serverSuccess || firestoreSuccess;
        } else if (item.type === 'visit' && item.visit) {
          const serverSuccess = await sendShepherdingToServer(item.visit);
          let firestoreSuccess = true;
          if (isFirebaseActive) {
            firestoreSuccess = await syncShepherdingVisitToFirestore(item.visit);
          }
          succeeded = serverSuccess || firestoreSuccess;
        }
      } catch (err) {
        console.warn('Falha no item da fila:', item.id, err);
        succeeded = false;
      }

      if (succeeded) {
        successCount++;
      } else {
        failedCount++;
        remainingQueue.push(item);
      }
    }

    saveQueue(remainingQueue);
  } finally {
    isProcessingQueue = false;
  }

  return {
    success: successCount,
    failed: failedCount,
    total: queue.length,
  };
}
