export type PublisherRole =
  | 'Ancião'
  | 'Servo Ministerial'
  | 'Pioneiro Regular'
  | 'Pioneiro Auxiliar'
  | 'Publicador Batizado'
  | 'Publicador Não Batizado';

export const ALL_ROLES: PublisherRole[] = [
  'Ancião',
  'Servo Ministerial',
  'Pioneiro Regular',
  'Pioneiro Auxiliar',
  'Publicador Batizado',
  'Publicador Não Batizado',
];

export type AttendanceStatus = 'presencial' | 'zoom' | 'ausente';

export interface GroupInfo {
  number: number;
  label: string;
  overseer: string;
  assistant: string;
  description?: string;
}

export const CONGREGATION_GROUPS: GroupInfo[] = [
  {
    number: 1,
    label: 'Grupo 1',
    overseer: 'Geovane Maioto',
    assistant: 'Vagner Carvalho',
  },
  {
    number: 2,
    label: 'Grupo 2',
    overseer: 'Zilney Silva',
    assistant: 'Alex Antoniassi',
  },
  {
    number: 3,
    label: 'Grupo 3',
    overseer: 'Deivison Sangregorio',
    assistant: 'Adriano Ferreira',
  },
  {
    number: 4,
    label: 'Grupo 4 (Antigo 5)',
    overseer: 'Gilvanildo Miranda',
    assistant: 'Solimar Oliveira',
  },
  {
    number: 5,
    label: 'Grupo 5 (Antigo 6)',
    overseer: 'Juraci Rosa',
    assistant: 'Luiz Henrique V.',
  },
  {
    number: 6,
    label: 'Grupo 6 (Antigo 7)',
    overseer: 'Roberto Dornella (Tati)',
    assistant: 'Alvanir Almeida',
  },
];

export interface Publisher {
  id: string;
  name: string;
  group: number; // 1 to 6
  roles: PublisherRole[];
  phone?: string;
  active: boolean;
  notes?: string;
  familyName?: string; // Ex: "Família Maioto", "Família Carvalho"
  isFamilyHead?: boolean;
}

export interface FamilyGroup {
  name: string;
  memberIds: string[];
  members: Publisher[];
  group: number;
}

export type MeetingType = 'midweek' | 'weekend';

export interface Meeting {
  id: string;
  type: MeetingType; // midweek: "Nossa Vida e Ministério Cristão" | weekend: "Discurso Público e A Sentinela"
  date: string; // YYYY-MM-DD
  dayOfWeek: string;
  titleOrTheme: string;
  speakerOrLeader?: string;
  observations?: string;
  createdAt: string;
}

export type MeetingAttendanceMap = Record<string, AttendanceStatus>;
export type MeetingNotesMap = Record<string, string>; // publisherId -> motivo/observação (quando zoom ou ausente)

export interface ShepherdingVisit {
  id: string;
  publisherId: string;
  date: string;
  eldersInvolved: string;
  purpose: string;
  notes: string;
  status: 'planejada' | 'realizada';
}

export interface CongregationDatabase {
  version: number;
  congregationName: string;
  publishers: Publisher[];
  meetings: Meeting[];
  attendance: Record<string, MeetingAttendanceMap>; // meetingId -> { publisherId: status }
  attendanceNotes?: Record<string, MeetingNotesMap>; // meetingId -> { publisherId: observacao }
  shepherdingVisits: ShepherdingVisit[];
  exportDate?: string;
  lastUpdated?: string;
  syncMetadata?: SyncMetadata;
}

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType?: 'mobile' | 'tablet' | 'desktop';
}

export interface SyncMetadata {
  lastEditorDeviceId?: string;
  lastEditorDeviceName?: string;
  lastEditedAt?: string;
  lastEditedMeetingId?: string;
  lastEditedDescription?: string;
}

export interface FirebaseConnectionConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  firestoreDatabaseId?: string;
}

export interface AttendanceCounts {
  presencial: number;
  zoom: number;
  ausente: number;
  totalGeral: number; // presencial + zoom
  naoMarcados: number;
  totalPublicadores: number;
}

export type NavigationTab =
  | 'dashboard'
  | 'attendance'
  | 'meetings'
  | 'publishers'
  | 'reports'
  | 'shepherding';

export interface AbsenceStreakInfo {
  publisher: Publisher;
  consecutiveAbsences: number;
  missedMeetings: Meeting[];
  lastAttendedMeeting?: {
    meeting: Meeting;
    status: AttendanceStatus;
  };
}

export interface PendingSyncItem {
  id: string;
  type: 'attendance' | 'meeting' | 'publisher' | 'visit';
  timestamp: number;
  meetingId?: string;
  attendanceMap?: Record<string, AttendanceStatus>;
  notesMap?: Record<string, string>;
  meeting?: Meeting;
  publisher?: Publisher;
  visit?: ShepherdingVisit;
}
