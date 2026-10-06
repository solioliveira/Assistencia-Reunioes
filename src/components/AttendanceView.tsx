import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Calendar,
  CheckCheck,
  CheckCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit2,
  Eye,
  EyeOff,
  Filter,
  Hand,
  Keyboard,
  Layers,
  Lock,
  MapPin,
  Maximize2,
  MessageSquare,
  Minimize2,
  MoveHorizontal,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  ShieldAlert,
  Smartphone,
  Sparkles,
  TrendingUp,
  Tv,
  Unlock,
  UserCheck,
  Users,
  UserX,
  Video,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  AttendanceCounts,
  AttendanceStatus,
  CONGREGATION_GROUPS,
  Meeting,
  MeetingType,
  Publisher,
  PublisherRole,
  SyncMetadata,
} from '../types';
import { detectAbsenceStreaks } from '../services/storage';
import { LiveDeviceSyncBanner } from './LiveDeviceSyncBanner';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
import { SwipeablePublisherCard, ZOOM_PRESETS, AUSENTE_PRESETS } from './SwipeablePublisherCard';
import { FraternalCareModal } from './FraternalCareModal';
import { WhatsAppShareModal } from './WhatsAppShareModal';

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

interface AttendanceViewProps {
  currentMeeting?: Meeting | null;
  allMeetings?: Meeting[];
  meetings?: Meeting[];
  selectedMeetingId?: string;
  onSelectMeeting?: (meeting: Meeting | any) => void;
  publishers: Publisher[];
  attendanceMap?: Record<string, AttendanceStatus>;
  attendance?: Record<string, Record<string, AttendanceStatus>>;
  attendanceNotes?: Record<string, Record<string, string>>;
  notesMap?: Record<string, string>;
  onAttendanceNoteChange?: (publisherId: string, note: string) => void;
  onUpdateMeetingDate?: (meetingId: string, newDate: string) => void;
  onQuickCreateMeetingForDate?: (date: string, type: MeetingType) => void;
  onMarkAttendance?: (publisherId: string, status: AttendanceStatus) => void;
  onAttendanceChange?: (meetingId: string, publisherId: string, status: AttendanceStatus) => void;
  onBatchMark?: (publisherIds: string[], status: AttendanceStatus) => void;
  onBatchAttendanceChange?: (meetingId: string, publisherIds: string[], status: AttendanceStatus) => void;
  onClearAttendance?: (publisherIds: string[]) => void;
  onOpenNewMeetingModal?: () => void;
  onOpenReport?: (meeting: Meeting) => void;
  onNavigateToTab?: (tab: any) => void;
  onOpenSyncModal?: () => void;
  onSaveAndSyncAttendance?: (meetingId: string) => Promise<boolean | void> | void;
  onRefreshData?: () => Promise<void> | void;
  isSyncingAttendance?: boolean;
  isRefreshingAttendance?: boolean;
  lastSavedTimestamp?: Record<string, string>;
  isFirebaseActive?: boolean;
  isOnline?: boolean;
  isLiveSyncActive?: boolean;
  connectedDevicesCount?: number;
  syncMetadata?: SyncMetadata;
  autoPollSeconds?: number;
  isAutoPollActive?: boolean;
  onToggleAutoPoll?: () => void;
  congregationName?: string;
  onRestoreTuesdaySaturday?: () => void;
}

export const AttendanceView: React.FC<AttendanceViewProps> = ({
  currentMeeting,
  allMeetings,
  meetings,
  selectedMeetingId,
  onSelectMeeting,
  publishers = [],
  attendanceMap,
  attendance,
  attendanceNotes = {},
  notesMap,
  onAttendanceNoteChange,
  onUpdateMeetingDate,
  onQuickCreateMeetingForDate,
  onMarkAttendance,
  onAttendanceChange,
  onBatchMark,
  onBatchAttendanceChange,
  onClearAttendance,
  onOpenNewMeetingModal,
  onOpenReport,
  onNavigateToTab,
  onOpenSyncModal,
  onSaveAndSyncAttendance,
  onRefreshData,
  onRestoreTuesdaySaturday,
  isSyncingAttendance = false,
  isRefreshingAttendance = false,
  lastSavedTimestamp = {},
  isFirebaseActive = false,
  isOnline = true,
  isLiveSyncActive = true,
  connectedDevicesCount = 1,
  syncMetadata,
  autoPollSeconds = 15,
  isAutoPollActive = true,
  onToggleAutoPoll,
  congregationName = 'Congregação Central',
}) => {
  const meetingList = allMeetings || meetings || [];
  const activeMeeting =
    currentMeeting ||
    (selectedMeetingId ? meetingList.find((m) => m.id === selectedMeetingId) : null) ||
    (meetingList.length > 0 ? meetingList[0] : null);

  const activeAttendanceMap =
    attendanceMap ||
    (activeMeeting && attendance ? attendance[activeMeeting.id] : {}) ||
    {};

  const safePublishers = publishers || [];

  const [selectedGroup, setSelectedGroup] = useState<number | 'all'>('all');
  const [selectedFamilyFilter, setSelectedFamilyFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'presencial' | 'zoom' | 'ausente' | 'pendente'>('all');

  // Estados para Modais de Pastoreio e WhatsApp
  const [isCareModalOpen, setIsCareModalOpen] = useState<boolean>(false);
  const [selectedStreakPubId, setSelectedStreakPubId] = useState<string | null>(null);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState<boolean>(false);

  // Detecção de sequências de faltas (Apoio Fraternal - 2+ faltas)
  const streaks = useMemo(() => {
    return detectAbsenceStreaks(safePublishers, meetingList, attendance || {});
  }, [safePublishers, meetingList, attendance]);

  const streaksByPubId = useMemo(() => {
    const map = new Map<string, number>();
    streaks.forEach((s) => map.set(s.publisher.id, s.consecutiveAbsences));
    return map;
  }, [streaks]);

  // Agrupamento familiar para marcação conjunta com 1 toque
  const familyMembersMap = useMemo(() => {
    const map = new Map<string, Publisher[]>();
    safePublishers.forEach((p) => {
      if (p.active !== false && p.familyName?.trim()) {
        const fam = p.familyName.trim();
        const list = map.get(fam) || [];
        list.push(p);
        map.set(fam, list);
      }
    });
    return map;
  }, [safePublishers]);

  const availableFamilies = useMemo(() => {
    const familyCounts = new Map<string, number>();
    safePublishers.forEach((p) => {
      if (p.active !== false && p.familyName?.trim()) {
        const fam = p.familyName.trim();
        familyCounts.set(fam, (familyCounts.get(fam) || 0) + 1);
      }
    });
    return Array.from(familyCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [safePublishers]);

  // Estados para Atalhos de Teclado e Gestos
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('attendance_auto_advance');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState<boolean>(false);
  const [shortcutToast, setShortcutToast] = useState<{
    id: number;
    message: string;
    subtext?: string;
    type: 'presencial' | 'zoom' | 'ausente' | 'clear';
  } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const toastTimeoutRef = useRef<any>(null);

  // Filtragem de publicadores ativos
  const filteredPublishers = useMemo(() => {
    return safePublishers.filter((pub) => {
      if (!pub || pub.active === false) return false;
      if (selectedGroup !== 'all' && pub.group !== selectedGroup) return false;
      if (selectedFamilyFilter !== 'all' && pub.familyName !== selectedFamilyFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const pubName = pub.name || '';
        const pubFamily = pub.familyName || '';
        const pubRoles = Array.isArray(pub.roles) ? pub.roles : [];
        const matchesName = pubName.toLowerCase().includes(query);
        const matchesFamily = pubFamily.toLowerCase().includes(query);
        const matchesRole = pubRoles.some((r) => String(r).toLowerCase().includes(query));
        if (!matchesName && !matchesRole && !matchesFamily) return false;
      }
      if (statusFilter !== 'all') {
        const currentStatus = activeAttendanceMap[pub.id];
        if (statusFilter === 'pendente' && currentStatus) return false;
        if (statusFilter !== 'pendente' && currentStatus !== statusFilter) return false;
      }
      return true;
    });
  }, [safePublishers, selectedGroup, selectedFamilyFilter, searchQuery, statusFilter, activeAttendanceMap]);

  // Contadores em tempo real para o escopo selecionado e geral
  const counters: AttendanceCounts = useMemo(() => {
    let presencial = 0;
    let zoom = 0;
    let ausente = 0;
    let naoMarcados = 0;

    const activeList = safePublishers.filter((p) => p && p.active !== false);

    activeList.forEach((pub) => {
      const st = activeAttendanceMap[pub.id];
      if (st === 'presencial') presencial++;
      else if (st === 'zoom') zoom++;
      else if (st === 'ausente') ausente++;
      else naoMarcados++;
    });

    return {
      presencial,
      zoom,
      ausente,
      totalGeral: presencial + zoom,
      naoMarcados,
      totalPublicadores: activeList.length,
    };
  }, [safePublishers, activeAttendanceMap]);

  // Contadores específicos do grupo filtrado (para contextualizar)
  const filteredCounters = useMemo(() => {
    let p = 0;
    let z = 0;
    let a = 0;
    let n = 0;

    filteredPublishers.forEach((pub) => {
      const st = activeAttendanceMap[pub.id];
      if (st === 'presencial') p++;
      else if (st === 'zoom') z++;
      else if (st === 'ausente') a++;
      else n++;
    });

    return { presencial: p, zoom: z, ausente: a, naoMarcados: n, total: filteredPublishers.length };
  }, [filteredPublishers, activeAttendanceMap]);

  // Contadores ativos para exibição nos cards do topo (adaptáveis ao filtro de grupo selecionado)
  const displayCounters = useMemo(() => {
    if (selectedGroup !== 'all') {
      const groupPubs = safePublishers.filter(
        (p) => p && p.active !== false && p.group === Number(selectedGroup)
      );
      let p = 0;
      let z = 0;
      let a = 0;
      let n = 0;
      groupPubs.forEach((pub) => {
        const st = activeAttendanceMap[pub.id];
        if (st === 'presencial') p++;
        else if (st === 'zoom') z++;
        else if (st === 'ausente') a++;
        else n++;
      });
      return {
        presencial: p,
        zoom: z,
        ausente: a,
        totalGeral: p + z,
        naoMarcados: n,
        totalPublicadores: groupPubs.length,
        isGroup: true,
        groupNumber: selectedGroup,
      };
    }

    return {
      ...counters,
      isGroup: false,
      groupNumber: 'all',
    };
  }, [selectedGroup, safePublishers, activeAttendanceMap, counters]);

  // Mapa de notas/motivos da reunião atual
  const activeNotesMap = useMemo(() => {
    return (
      notesMap ||
      (activeMeeting && attendanceNotes ? attendanceNotes[activeMeeting.id] : {}) ||
      {}
    );
  }, [notesMap, activeMeeting, attendanceNotes]);

  // Estado do Modo de Visualização Simplificada (oculta controles extras e mantém a lista com foco total)
  const [isSimplifiedMode, setIsSimplifiedMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('attendance_simplified_mode');
      return saved !== null ? saved === 'true' : false;
    } catch {
      return false;
    }
  });

  const handleToggleSimplifiedMode = useCallback(() => {
    setIsSimplifiedMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('attendance_simplified_mode', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Estado de edição de notas e seleção de data
  const [editingNotePubId, setEditingNotePubId] = useState<string | null>(null);
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [pendingDate, setPendingDate] = useState('');
  const [isEditingMeetingDate, setIsEditingMeetingDate] = useState(false);
  const [editMeetingDateValue, setEditMeetingDateValue] = useState('');

  // Verifica se a reunião ativa já tem chamada registrada anteriormente
  const hasExistingAttendance = useMemo(() => {
    if (!activeAttendanceMap) return false;
    return Object.values(activeAttendanceMap).some(
      (st) => st === 'presencial' || st === 'zoom' || st === 'ausente'
    );
  }, [activeAttendanceMap]);

  // Controle de desbloqueio para edição por reunião
  const [unlockedMeetingIds, setUnlockedMeetingIds] = useState<Record<string, boolean>>({});
  const isEditingUnlocked = Boolean(activeMeeting && unlockedMeetingIds[activeMeeting.id]);

  // Estado do modal de aviso "Essa reunião já foi realizada, deseja atualizar?"
  const [showUpdateWarningModal, setShowUpdateWarningModal] = useState<boolean>(false);
  const [pendingTargetAction, setPendingTargetAction] = useState<{
    type: 'single';
    pubId: string;
    status: AttendanceStatus;
    pubName?: string;
  } | {
    type: 'batch';
    status: AttendanceStatus;
  } | null>(null);

  const handleSelectMeeting = (m: Meeting) => {
    if (onSelectMeeting) {
      onSelectMeeting(m);
    }
  };

  const handleDateSelect = (pickedDate: string) => {
    if (!pickedDate) return;
    const match = meetingList.find((m) => m.date === pickedDate);
    if (match) {
      handleSelectMeeting(match);
    } else {
      setPendingDate(pickedDate);
      setIsDateModalOpen(true);
    }
  };

  const handleSaveNote = (pubId: string, note: string) => {
    if (onAttendanceNoteChange) {
      onAttendanceNoteChange(pubId, note);
    }
  };

  // Executa a marcação de fato
  const executeMark = (pubId: string, status: AttendanceStatus) => {
    if (onMarkAttendance) {
      onMarkAttendance(pubId, status);
    }
    if (onAttendanceChange && activeMeeting) {
      onAttendanceChange(activeMeeting.id, pubId, status);
    }

    // Se marcou como zoom ou ausente e ainda não possui motivo preenchido, abre o seletor de observação
    if ((status === 'zoom' || status === 'ausente') && !activeNotesMap[pubId]) {
      setEditingNotePubId(pubId);
    } else if (status === 'presencial' && editingNotePubId === pubId) {
      setEditingNotePubId(null);
    }
  };

  // Intercepta marcação se a reunião já tiver chamada realizada e não estiver desbloqueada
  const handleMark = (pubId: string, status: AttendanceStatus) => {
    if (hasExistingAttendance && !isEditingUnlocked) {
      const pub = safePublishers.find((p) => p.id === pubId);
      setPendingTargetAction({
        type: 'single',
        pubId,
        status,
        pubName: pub?.name,
      });
      setShowUpdateWarningModal(true);
      return;
    }

    executeMark(pubId, status);
  };

  // Executa marcação em lote de fato
  const executeBatchAll = (status: AttendanceStatus) => {
    const idsToMark = filteredPublishers.map((p) => p.id);
    if (idsToMark.length === 0) return;
    if (onBatchMark) {
      onBatchMark(idsToMark, status);
    }
    if (onBatchAttendanceChange && activeMeeting) {
      onBatchAttendanceChange(activeMeeting.id, idsToMark, status);
    }
  };

  // Intercepta marcação em lote se a chamada já tiver sido feita
  const handleBatchAll = (status: AttendanceStatus) => {
    if (hasExistingAttendance && !isEditingUnlocked) {
      setPendingTargetAction({
        type: 'batch',
        status,
      });
      setShowUpdateWarningModal(true);
      return;
    }

    executeBatchAll(status);
  };

  // Confirmação no modal "Essa reunião já foi realizada, deseja atualizar?"
  const handleConfirmUnlockAndUpdate = () => {
    if (activeMeeting) {
      setUnlockedMeetingIds((prev) => ({ ...prev, [activeMeeting.id]: true }));
    }
    setShowUpdateWarningModal(false);

    // Se havia uma ação que disparou o modal, executa imediatamente
    if (pendingTargetAction) {
      if (pendingTargetAction.type === 'single') {
        executeMark(pendingTargetAction.pubId, pendingTargetAction.status);
      } else if (pendingTargetAction.type === 'batch') {
        executeBatchAll(pendingTargetAction.status);
      }
      setPendingTargetAction(null);
    }
  };

  const handleCancelUnlock = () => {
    setShowUpdateWarningModal(false);
    setPendingTargetAction(null);
  };

  const handleLockMeeting = () => {
    if (activeMeeting) {
      setUnlockedMeetingIds((prev) => ({ ...prev, [activeMeeting.id]: false }));
    }
  };

  const handleMarkFamily = (famName: string, status: AttendanceStatus) => {
    const members = familyMembersMap.get(famName) || [];
    const ids = members.map((m) => m.id);
    if (ids.length === 0) return;
    if (onBatchAttendanceChange && activeMeeting) {
      onBatchAttendanceChange(activeMeeting.id, ids, status);
    } else if (onBatchMark) {
      onBatchMark(ids, status);
    } else {
      ids.forEach((id) => executeMark(id, status));
    }

    // Se a família for marcada como ausente, atribui automaticamente os motivos de discurso fora conforme o papel
    if (status === 'ausente' && onAttendanceNoteChange) {
      members.forEach((m) => {
        const mRoles = Array.isArray(m.roles)
          ? m.roles
          : typeof (m as any).role === 'string'
          ? [(m as any).role]
          : [];
        const isLeader = mRoles.some((r: any) => {
          if (typeof r !== 'string') return false;
          const lower = r.toLowerCase();
          return lower.includes('anci') || lower.includes('servo') || lower === 'elder';
        });
        const reason = isLeader
          ? 'Discurso fora'
          : 'Acompanhando orador em discurso fora';
        onAttendanceNoteChange(m.id, reason);
      });
    }

    const label = status === 'presencial' ? 'Presencial' : status === 'zoom' ? 'Zoom' : 'Ausente';
    const subtext =
      status === 'ausente'
        ? `${members.length} membro(s) marcados (Ancião: Discurso fora • Família: Acompanhando orador)`
        : `${members.length} membro(s) marcados como ${label}`;
    showToast(`Família ${famName}`, status, subtext);
  };

  const handleClearBatch = () => {
    const idsToClear = filteredPublishers.map((p) => p.id);
    if (idsToClear.length === 0) return;
    if (onClearAttendance) {
      onClearAttendance(idsToClear);
    } else if (onBatchAttendanceChange && activeMeeting) {
      // Limpar marcando com ausente ou removendo
      idsToClear.forEach((pid) => {
        if (onAttendanceChange) onAttendanceChange(activeMeeting.id, pid, undefined as any);
      });
    }
  };

  const handleToggleAutoAdvance = (val: boolean) => {
    setAutoAdvance(val);
    try {
      localStorage.setItem('attendance_auto_advance', String(val));
    } catch {}
  };

  const showToast = useCallback((message: string, type: 'presencial' | 'zoom' | 'ausente' | 'clear', subtext?: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setShortcutToast({
      id: Date.now(),
      message,
      subtext,
      type,
    });
    toastTimeoutRef.current = setTimeout(() => {
      setShortcutToast(null);
    }, 2800);
  }, []);

  const handleClearSingle = useCallback((pubId: string) => {
    if (onClearAttendance) {
      onClearAttendance([pubId]);
    } else if (onAttendanceChange && activeMeeting) {
      onAttendanceChange(activeMeeting.id, pubId, undefined as any);
    }
    const pub = safePublishers.find((p) => p.id === pubId);
    showToast(pub?.name || 'Publicador', 'clear', 'Marcação removida (Pendente)');
  }, [onClearAttendance, onAttendanceChange, activeMeeting, safePublishers, showToast]);

  const handleKeyboardMark = useCallback((status: AttendanceStatus) => {
    if (focusedIndex < 0 || focusedIndex >= filteredPublishers.length) return;
    const pub = filteredPublishers[focusedIndex];
    if (!pub) return;

    handleMark(pub.id, status);

    const statusLabel =
      status === 'presencial'
        ? '🏛️ Presencial'
        : status === 'zoom'
        ? '📹 Zoom'
        : '✕ Ausente';

    const shortcutUsed =
      status === 'presencial' ? '[1 / P]' : status === 'zoom' ? '[2 / Z]' : '[3 / A]';

    showToast(
      pub.name,
      status,
      `Marcado como ${statusLabel} (${shortcutUsed})`
    );

    if (autoAdvance) {
      setFocusedIndex((prev) => Math.min(filteredPublishers.length - 1, prev + 1));
    }
  }, [focusedIndex, filteredPublishers, handleMark, autoAdvance, showToast]);

  // Reseta o foco quando filtros mudam
  useEffect(() => {
    setFocusedIndex(-1);
  }, [searchQuery, selectedGroup, statusFilter]);

  // Auto-scroll para manter o publicador focado visível
  useEffect(() => {
    if (focusedIndex >= 0 && focusedIndex < filteredPublishers.length) {
      const pub = filteredPublishers[focusedIndex];
      const el = document.getElementById(`publisher-row-${pub.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [focusedIndex, filteredPublishers]);

  // Listener global de atalhos de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isInputActive =
        tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable;

      // Se estiver digitando em campo de texto
      if (isInputActive) {
        if (e.key === 'Escape') {
          (document.activeElement as HTMLElement)?.blur();
        }
        return;
      }

      // Se modal de atualização de chamada anterior estiver aberto
      if (showUpdateWarningModal) return;

      // Modal de atalhos
      if (isShortcutsModalOpen) {
        if (e.key === 'Escape') {
          setIsShortcutsModalOpen(false);
        }
        return;
      }

      // Atalho de ajuda (? ou Shift+/)
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setIsShortcutsModalOpen((prev) => !prev);
        return;
      }

      // Atalho de busca (/)
      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Atalho para Alternar Modo Simplificado (V)
      if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        handleToggleSimplifiedMode();
        showToast(
          isSimplifiedMode ? 'Modo Completo' : 'Modo Simplificado',
          'presencial',
          isSimplifiedMode
            ? 'Exibindo estatísticas e controles completos'
            : 'Visualização simplificada ativada (foco na lista)'
        );
        return;
      }

      // Escape cancela seleção/foco
      if (e.key === 'Escape') {
        setFocusedIndex(-1);
        setShortcutToast(null);
        return;
      }

      // Navegação para baixo (Seta Abaixo ou J)
      if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          if (filteredPublishers.length === 0) return -1;
          return prev < 0 ? 0 : Math.min(filteredPublishers.length - 1, prev + 1);
        });
        return;
      }

      // Navegação para cima (Seta Acima ou K)
      if (e.key === 'ArrowUp' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          if (filteredPublishers.length === 0) return -1;
          return prev <= 0 ? 0 : prev - 1;
        });
        return;
      }

      // Ações sobre o publicador atualmente em foco
      if (focusedIndex >= 0 && focusedIndex < filteredPublishers.length) {
        const pub = filteredPublishers[focusedIndex];

        // 1 ou P: Presencial
        if (e.key === '1' || e.key === 'p' || e.key === 'P') {
          e.preventDefault();
          handleKeyboardMark('presencial');
          return;
        }

        // 2 ou Z: Zoom
        if (e.key === '2' || e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          handleKeyboardMark('zoom');
          return;
        }

        // 3 ou A: Ausente
        if (e.key === '3' || e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          handleKeyboardMark('ausente');
          return;
        }

        // 0 ou Backspace: Limpar
        if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault();
          handleClearSingle(pub.id);
          return;
        }

        // N ou O: Abrir/fechar anotação de motivo
        if (e.key === 'n' || e.key === 'N' || e.key === 'o' || e.key === 'O') {
          e.preventDefault();
          setEditingNotePubId((prev) => (prev === pub.id ? null : pub.id));
          return;
        }
      } else {
        // Se nenhum estiver em foco e pressionar tecla de ação, foca o primeiro
        if (
          ['1', '2', '3', 'p', 'P', 'z', 'Z', 'a', 'A'].includes(e.key) &&
          filteredPublishers.length > 0
        ) {
          e.preventDefault();
          setFocusedIndex(0);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    filteredPublishers,
    focusedIndex,
    handleKeyboardMark,
    handleClearSingle,
    showUpdateWarningModal,
    isShortcutsModalOpen,
    handleToggleSimplifiedMode,
    isSimplifiedMode,
    showToast,
  ]);

  const handleOpenReportClick = () => {
    if (activeMeeting) {
      if (onOpenReport) {
        onOpenReport(activeMeeting);
      } else if (onNavigateToTab) {
        onNavigateToTab('reports');
      }
    }
  };

  const handleCreateMeetingClick = () => {
    if (onOpenNewMeetingModal) {
      onOpenNewMeetingModal();
    } else if (onNavigateToTab) {
      onNavigateToTab('meetings');
    }
  };

  if (!activeMeeting) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm">
          <Calendar className="w-16 h-16 text-blue-500 mx-auto mb-4 stroke-1" />
          <h2 className="text-xl font-semibold text-slate-800">Nenhuma Reunião Encontrada</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto mt-2 mb-6">
            Cadastre a primeira reunião da congregação para iniciar a lista de presença e chamada.
          </p>
          <button
            onClick={handleCreateMeetingClick}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-sm transition-all text-sm"
          >
            <Calendar className="w-4 h-4" />
            Criar Nova Reunião
          </button>
        </div>
      </div>
    );
  }

  const getRoleBadgeColor = (role: PublisherRole) => {
    switch (role) {
      case 'Ancião':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Servo Ministerial':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'Pioneiro Regular':
        return 'bg-amber-100 text-amber-800 border-amber-200 font-semibold';
      case 'Pioneiro Auxiliar':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Publicador Batizado':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'Publicador Não Batizado':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 py-4 space-y-4">
      {isSimplifiedMode ? (
        /* =======================================================================
           MODO DE VISUALIZAÇÃO SIMPLIFICADA
           Oculta controles extras, cards pesados e gráficos, mantendo o foco total
           na lista de nomes com botões táteis de presença para telas pequenas.
           ======================================================================= */
        <div className="space-y-3 pb-20">
          {/* CABEÇALHO FIXO / COMPACTO COM INDICADORES AO VIVO */}
          <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl p-2.5 sm:p-3.5 shadow-sm space-y-2.5">
            {/* Linha 1: Identificação da Reunião + Ações Rápidas */}
            <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 ${
                    activeMeeting.type === 'midweek'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {activeMeeting.type === 'midweek' ? 'Meio de Semana' : 'Fim de Semana'}
                </span>
                <span className="font-bold text-xs sm:text-sm text-slate-800 truncate">
                  {activeMeeting.date} ({activeMeeting.dayOfWeek.slice(0, 3)})
                </span>
                <span className="hidden sm:inline text-xs text-slate-400 truncate max-w-xs">
                  • {activeMeeting.titleOrTheme}
                </span>
              </div>

              {/* Botões do Topo */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Atalhos de Teclado e Gestos */}
                <button
                  type="button"
                  onClick={() => setIsShortcutsModalOpen(true)}
                  className="p-1.5 sm:px-2.5 sm:py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold transition-all border border-blue-200 cursor-pointer flex items-center gap-1 shadow-2xs"
                  title="Ver atalhos de teclado e gestos touch (Atalho: ?)"
                >
                  <Keyboard className="w-3.5 h-3.5 text-blue-600" />
                  <span className="hidden md:inline">Atalhos</span>
                  <kbd className="hidden md:inline-block font-mono text-[10px] bg-white text-blue-800 px-1 rounded border border-blue-300">?</kbd>
                </button>

                {/* Botão Salvar e Sincronizar Rápido */}
                {onSaveAndSyncAttendance && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (activeMeeting) await onSaveAndSyncAttendance(activeMeeting.id);
                    }}
                    disabled={isSyncingAttendance}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                    title="Salvar e sincronizar a chamada no banco agora"
                  >
                    {isSyncingAttendance ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCheck className="w-3.5 h-3.5" />
                    )}
                    <span>Salvar</span>
                  </button>
                )}

                {/* Botão Sair / Alternar para Modo Completo */}
                <button
                  type="button"
                  onClick={handleToggleSimplifiedMode}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-xl text-xs font-bold border border-slate-300 shadow-2xs transition-all cursor-pointer"
                  title="Sair do modo simplificado e visualizar gráficos e estatísticas completas (Atalho: V)"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-slate-600" />
                  <span className="hidden sm:inline">Modo Completo</span>
                  <span className="sm:hidden">Completo</span>
                  <kbd className="hidden md:inline-block font-mono text-[10px] bg-white text-slate-600 px-1 rounded border border-slate-300">V</kbd>
                </button>
              </div>
            </div>

            {/* Linha 2: Resumo em Tempo Real dos 4 Indicadores da Reunião */}
            <div className="grid grid-cols-4 gap-1.5 text-center">
              <div className="bg-emerald-50/90 border border-emerald-300/80 rounded-xl py-1.5 px-1 text-emerald-950 flex flex-col items-center justify-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">🏛️ Salão</span>
                <span className="text-base sm:text-lg font-black font-mono leading-none mt-0.5">{displayCounters.presencial}</span>
              </div>
              <div className="bg-purple-50/90 border border-purple-300/80 rounded-xl py-1.5 px-1 text-purple-950 flex flex-col items-center justify-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800">📹 Zoom</span>
                <span className="text-base sm:text-lg font-black font-mono leading-none mt-0.5">{displayCounters.zoom}</span>
              </div>
              <div className="bg-rose-50/90 border border-rose-300/80 rounded-xl py-1.5 px-1 text-rose-950 flex flex-col items-center justify-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800">✕ Ausente</span>
                <span className="text-base sm:text-lg font-black font-mono leading-none mt-0.5">{displayCounters.ausente}</span>
              </div>
              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === 'pendente' ? 'all' : 'pendente')}
                className={`rounded-xl py-1.5 px-1 flex flex-col items-center justify-center border transition-all cursor-pointer ${
                  statusFilter === 'pendente'
                    ? 'bg-amber-500 text-white border-amber-600 ring-2 ring-amber-300 shadow-xs'
                    : 'bg-amber-50/90 border-amber-300/80 text-amber-950 hover:bg-amber-100'
                }`}
                title="Clique para filtrar apenas publicadores pendentes"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider">⏳ Falta</span>
                <span className="text-base sm:text-lg font-black font-mono leading-none mt-0.5">{displayCounters.naoMarcados}</span>
              </button>
            </div>

            {/* Linha 3: Barra de Busca Rápida + Filtro por Grupo */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por nome... (Pressione /)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>

              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="text-xs font-bold bg-slate-50 text-slate-800 border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0 cursor-pointer"
              >
                <option value="all">Todos os Grupos</option>
                {CONGREGATION_GROUPS.map((g) => (
                  <option key={g.number} value={g.number}>
                    Grupo {g.number}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* LISTA DE PUBLICADORES EM MODO SIMPLIFICADO */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 px-1 font-medium">
              <span>
                Mostrando <strong>{filteredPublishers.length}</strong> publicador(es)
                {selectedGroup !== 'all' ? ` • Grupo ${selectedGroup}` : ''}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-0.5 rounded text-xs transition-colors cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-slate-800 text-white font-bold'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('pendente')}
                  className={`px-2.5 py-0.5 rounded text-xs transition-colors cursor-pointer ${
                    statusFilter === 'pendente'
                      ? 'bg-amber-600 text-white font-bold'
                      : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200'
                  }`}
                >
                  Pendentes ({displayCounters.naoMarcados})
                </button>
              </div>
            </div>

            {filteredPublishers.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 shadow-2xs">
                {statusFilter === 'pendente' ? (
                  <div>
                    <div className="text-3xl mb-2">🎉</div>
                    <p className="text-slate-800 font-bold text-sm">Todos os publicadores foram marcados!</p>
                    <p className="text-xs text-slate-500 mt-1">Não há nenhuma chamada pendente neste filtro.</p>
                    <button
                      type="button"
                      onClick={() => setStatusFilter('all')}
                      className="mt-3 px-3.5 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 cursor-pointer"
                    >
                      Ver Todos os Publicadores
                    </button>
                  </div>
                ) : (
                  <div>
                    <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-slate-700 font-semibold text-sm">Nenhum publicador encontrado</p>
                    <p className="text-xs text-slate-400 mt-1">Ajuste o termo pesquisado ou o grupo selecionado.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {filteredPublishers.map((pub, index) => {
                  const currentStatus = activeAttendanceMap[pub.id];
                  const isFocused = focusedIndex === index;

                  return (
                    <SwipeablePublisherCard
                      key={pub.id}
                      publisher={pub}
                      currentStatus={currentStatus}
                      isFocused={isFocused}
                      keyboardIndex={index}
                      isSimplified={true}
                      onMark={(pubId, status) => handleMark(pubId, status)}
                      onClear={(pubId) => handleClearSingle(pubId)}
                      onCardClick={() => setFocusedIndex(index)}
                      editingNote={editingNotePubId === pub.id}
                      onToggleNote={() => setEditingNotePubId(editingNotePubId === pub.id ? null : pub.id)}
                      noteText={activeNotesMap[pub.id]}
                      onSaveNote={(note) => handleSaveNote(pub.id, note)}
                      getRoleBadgeColor={getRoleBadgeColor}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* BARRA INFERIOR DE RESUMO E FINALIZAÇÃO EM MODO SIMPLIFICADO */}
          <div className="bg-slate-900 text-white rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3 text-xs w-full sm:w-auto justify-between sm:justify-start">
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-400" />
                <span>
                  Presentes: <strong className="text-emerald-400 font-bold text-sm">{displayCounters.totalGeral}</strong>
                  <span className="text-slate-400 text-[11px] ml-1">
                    ({displayCounters.presencial} Salão + {displayCounters.zoom} Zoom)
                  </span>
                </span>
              </div>
              {displayCounters.naoMarcados > 0 && (
                <span className="text-amber-400 text-xs font-semibold">
                  {displayCounters.naoMarcados} pendentes
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {onSaveAndSyncAttendance && (
                <button
                  type="button"
                  onClick={async () => {
                    if (activeMeeting) await onSaveAndSyncAttendance(activeMeeting.id);
                  }}
                  disabled={isSyncingAttendance}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Salvar Chamada</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleToggleSimplifiedMode}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer border border-slate-700"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Modo Completo</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* BANNER DINÂMICO DE SINCRONIZAÇÃO EM TEMPO REAL & APARELHO */}
          <LiveDeviceSyncBanner
            syncMetadata={syncMetadata}
            isFirebaseActive={isFirebaseActive}
            isOnline={isOnline}
            isLiveSyncActive={isLiveSyncActive}
            connectedDevicesCount={connectedDevicesCount}
            onRefreshData={onRefreshData}
            isRefreshing={isRefreshingAttendance}
            autoPollSeconds={autoPollSeconds}
            isAutoPollActive={isAutoPollActive}
            onToggleAutoPoll={onToggleAutoPoll}
            onOpenSyncModal={onOpenSyncModal}
          />

      {/* 1. SELETOR DE REUNIÃO ATIVA & RESUMO */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                activeMeeting.type === 'midweek'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}>
                {activeMeeting.type === 'midweek' ? 'Meio de Semana' : 'Fim de Semana'}
              </span>

              {/* Data da Reunião com Edição Direta */}
              {isEditingMeetingDate ? (
                <div className="inline-flex items-center gap-1.5 bg-slate-50 p-1 rounded-lg border border-slate-300">
                  <input
                    type="date"
                    value={editMeetingDateValue}
                    onChange={(e) => setEditMeetingDateValue(e.target.value)}
                    className="bg-white text-xs font-bold text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (editMeetingDateValue && onUpdateMeetingDate) {
                        onUpdateMeetingDate(activeMeeting.id, editMeetingDateValue);
                      }
                      setIsEditingMeetingDate(false);
                    }}
                    className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingMeetingDate(false)}
                    className="text-slate-400 hover:text-slate-600 text-xs px-1"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 bg-slate-50 px-2.5 py-0.5 rounded-lg border border-slate-200">
                  <Calendar className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                  <span className="text-xs text-slate-800 font-bold">
                    {activeMeeting.date} ({activeMeeting.dayOfWeek})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditMeetingDateValue(activeMeeting.date);
                      setIsEditingMeetingDate(true);
                    }}
                    className="text-slate-400 hover:text-blue-600 p-0.5 rounded hover:bg-slate-200/60 ml-0.5"
                    title="Alterar data desta reunião"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">
              {activeMeeting.titleOrTheme}
            </h1>
          </div>

          {/* Trocar Reunião, Selecionar Data & Ações */}
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Seletor Direto de Data */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
              <Calendar className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <span className="text-xs font-bold text-slate-600">Data:</span>
              <input
                type="date"
                value={activeMeeting.date}
                onChange={(e) => handleDateSelect(e.target.value)}
                className="bg-white text-xs sm:text-sm font-semibold text-slate-800 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
                title="Selecione uma data para a reunião"
              />
            </div>

            {/* Dropdown de Reuniões */}
            <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200">
              <select
                value={activeMeeting.id}
                onChange={(e) => {
                  const m = meetingList.find((item) => item.id === e.target.value);
                  if (m) handleSelectMeeting(m);
                }}
                className="bg-white text-xs sm:text-sm font-medium text-slate-800 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {meetingList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.date} ({m.dayOfWeek.slice(0, 3)}) - {m.type === 'midweek' ? 'Meio Semana' : 'Fim Semana'}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleOpenReportClick}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
              title="Visualizar Relatório Formatado"
            >
              <Share2 className="w-3.5 h-3.5 text-blue-600" />
              <span>Relatório</span>
            </button>

            {/* BOTÃO RESTAURAR TERÇA E SÁBADO */}
            {onRestoreTuesdaySaturday && (
              <button
                type="button"
                onClick={onRestoreTuesdaySaturday}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-semibold transition-colors shadow-2xs"
                title="Restaurar reuniões e chamadas de Terça-feira e Sábado passado"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                <span>Restaurar Terça/Sáb</span>
              </button>
            )}

            {/* BOTÃO ATUALIZAR */}
            {onRefreshData && (
              <button
                type="button"
                onClick={async () => {
                  await onRefreshData();
                }}
                disabled={isRefreshingAttendance}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all border border-slate-200 shadow-2xs disabled:opacity-50 active:scale-95"
                title="Atualizar chamada e recarregar dados mais recentes da congregação"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isRefreshingAttendance ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>
            )}

            {/* BOTÃO SALVAR E SINCRONIZAR */}
            {onSaveAndSyncAttendance && (
              <button
                type="button"
                onClick={async () => {
                  if (activeMeeting) {
                    await onSaveAndSyncAttendance(activeMeeting.id);
                  }
                }}
                disabled={isSyncingAttendance}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50"
                title="Salvar e sincronizar a chamada desta reunião agora"
              >
                {isSyncingAttendance ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-100" />
                ) : (
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-100" />
                )}
                <span>{isSyncingAttendance ? 'Sincronizando...' : 'Salvar e Sincronizar'}</span>
              </button>
            )}

            {onOpenSyncModal && (
              <button
                type="button"
                onClick={onOpenSyncModal}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-semibold transition-colors border border-blue-200"
                title="Sincronizar com outros celulares e tablets"
              >
                <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden sm:inline">Sincronizar Aparelhos</span>
                <span className="sm:hidden">Aparelhos</span>
              </button>
            )}

            {/* BOTÃO VISUALIZAÇÃO SIMPLIFICADA */}
            <button
              type="button"
              onClick={handleToggleSimplifiedMode}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 active:scale-95 rounded-xl text-xs font-bold transition-all border border-indigo-200 shadow-2xs cursor-pointer"
              title="Alternar para visualização simplificada sem controles extras (Atalho: V)"
            >
              <Minimize2 className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">Modo Simplificado</span>
              <span className="sm:hidden">Simplificado</span>
              <kbd className="hidden md:inline-block font-mono text-[10px] bg-white text-indigo-800 px-1 py-0.2 rounded border border-indigo-300">
                V
              </kbd>
            </button>
          </div>
        </div>
      </div>

      {/* CARD RESUMO EM TEMPO REAL: TOTAL DE PRESENTES (PRESENCIAL + ZOOM) */}
      {activeMeeting && (
        <div
          id="active-meeting-attendance-summary-card"
          className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-sm relative overflow-hidden transition-all"
        >
          {/* Faixa decorativa superior com cor primária e indicador ao vivo */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold tracking-wide">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600" />
                </span>
                <span>Tempo Real</span>
              </div>

              <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                <span>Reunião Ativa:</span>
                <span className="font-bold text-slate-800 truncate max-w-[200px] sm:max-w-md">
                  {activeMeeting.titleOrTheme}
                </span>
                <span className="text-slate-400">•</span>
                <span className="font-semibold text-slate-700 whitespace-nowrap">
                  {activeMeeting.date} ({activeMeeting.dayOfWeek})
                </span>
              </div>
            </div>

            <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg self-start sm:self-auto whitespace-nowrap">
              {counters.totalPublicadores} publicadores no rol
            </span>
          </div>

          {/* Destaque Principal da Contagem */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center pt-4">
            
            {/* Bloco 1: Total Geral de Presentes (Presencial + Zoom) */}
            <div className="md:col-span-5 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-xl p-4 sm:p-4.5 shadow-md flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  <Users className="w-4 h-4 text-emerald-400" />
                  <span>Total de Presentes</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl sm:text-5xl font-black tracking-tight text-white font-mono">
                    {counters.totalGeral}
                  </span>
                  <span className="text-sm font-semibold text-slate-300">
                    presentes
                  </span>
                </div>
                <div className="text-xs text-slate-300 mt-1 flex items-center gap-1.5">
                  <span className="font-bold text-emerald-400">
                    {counters.totalPublicadores > 0
                      ? `${Math.round((counters.totalGeral / counters.totalPublicadores) * 100)}%`
                      : '0%'}
                  </span>
                  <span className="text-slate-400">de assistência congregacional</span>
                </div>
              </div>

              <div className="hidden sm:flex flex-col items-end justify-center bg-white/10 rounded-xl px-3 py-2 border border-white/10 text-right">
                <span className="text-[10px] uppercase font-bold text-slate-300">Fórmula</span>
                <span className="text-xs font-bold text-white mt-0.5 whitespace-nowrap font-mono">
                  {counters.presencial} + {counters.zoom}
                </span>
                <span className="text-[10px] text-slate-400">Salão + Zoom</span>
              </div>
            </div>

            {/* Bloco 2: Decomposição Presencial vs Zoom */}
            <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-2 gap-3">
              
              {/* Presencial no Salão */}
              <div className="bg-emerald-50/80 border-2 border-emerald-200 rounded-xl p-3.5 flex flex-col justify-between transition-colors hover:bg-emerald-50">
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                    <Building2 className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                    <span>Presencial</span>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/90 px-1.5 py-0.5 rounded">
                    {counters.totalGeral > 0
                      ? `${Math.round((counters.presencial / counters.totalGeral) * 100)}%`
                      : '0%'}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl sm:text-3xl font-black text-emerald-950 font-mono">
                    {counters.presencial}
                  </span>
                  <span className="text-[11px] font-medium text-emerald-800">
                    no Salão do Reino
                  </span>
                </div>
              </div>

              {/* Remoto via Zoom */}
              <div className="bg-purple-50/80 border-2 border-purple-200 rounded-xl p-3.5 flex flex-col justify-between transition-colors hover:bg-purple-50">
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900">
                    <Video className="w-4 h-4 text-purple-700 flex-shrink-0" />
                    <span>Zoom</span>
                  </div>
                  <span className="text-[10px] font-bold text-purple-700 bg-purple-100/90 px-1.5 py-0.5 rounded">
                    {counters.totalGeral > 0
                      ? `${Math.round((counters.zoom / counters.totalGeral) * 100)}%`
                      : '0%'}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl sm:text-3xl font-black text-purple-950 font-mono">
                    {counters.zoom}
                  </span>
                  <span className="text-[11px] font-medium text-purple-800">
                    assistência remota
                  </span>
                </div>
              </div>

            </div>
          </div>

          {/* Barra Visual Proporcional Bicolor e Rodapé Resumo */}
          <div className="mt-4 pt-3.5 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span className="font-semibold text-slate-700 text-[11px]">
                Distribuição da Assistência:
              </span>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1 font-medium text-emerald-800">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  Salão: {counters.presencial}
                </span>
                <span className="flex items-center gap-1 font-medium text-purple-800">
                  <span className="w-2 h-2 rounded-full bg-purple-600" />
                  Zoom: {counters.zoom}
                </span>
                <span className="flex items-center gap-1 font-medium text-rose-700">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  Ausentes: {counters.ausente}
                </span>
                {counters.naoMarcados > 0 && (
                  <span className="flex items-center gap-1 font-medium text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-slate-300" />
                    Pendentes: {counters.naoMarcados}
                  </span>
                )}
              </div>
            </div>

            {/* Barra de Progresso Segmentada */}
            <div className="w-full bg-slate-100 rounded-full h-2.5 flex overflow-hidden">
              <div
                className="bg-emerald-600 h-full transition-all duration-300"
                style={{
                  width: `${
                    counters.totalPublicadores > 0
                      ? (counters.presencial / counters.totalPublicadores) * 100
                      : 0
                  }%`,
                }}
                title={`Presencial no Salão: ${counters.presencial}`}
              />
              <div
                className="bg-purple-600 h-full transition-all duration-300"
                style={{
                  width: `${
                    counters.totalPublicadores > 0
                      ? (counters.zoom / counters.totalPublicadores) * 100
                      : 0
                  }%`,
                }}
                title={`Zoom Remoto: ${counters.zoom}`}
              />
              <div
                className="bg-rose-400 h-full transition-all duration-300"
                style={{
                  width: `${
                    counters.totalPublicadores > 0
                      ? (counters.ausente / counters.totalPublicadores) * 100
                      : 0
                  }%`,
                }}
                title={`Ausentes: ${counters.ausente}`}
              />
            </div>
          </div>
        </div>
      )}

      {/* 2. CARDS VISUAIS DE TOTAIS EM DESTAQUE */}
      <div className="space-y-2.5">
        {/* Banner informativo quando filtrado por grupo específico */}
        {selectedGroup !== 'all' && (
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 px-3.5 py-1.5 rounded-xl text-xs">
            <span className="text-blue-800 font-semibold flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-blue-600" />
              Exibindo totais do <strong>Grupo {selectedGroup}</strong> ({displayCounters.totalPublicadores} publicadores)
            </span>
            <button
              onClick={() => setSelectedGroup('all')}
              className="text-[11px] font-bold text-blue-700 hover:text-blue-900 underline"
            >
              Ver Congregação Toda ({counters.totalPublicadores})
            </button>
          </div>
        )}

        {/* Grade dos 4 Cards Principais */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          
          {/* Card 1: Assistência Geral (Salão + Zoom) */}
          <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-4 sm:p-4.5 border border-slate-700/80 shadow-md shadow-slate-950/15 flex flex-col justify-between group transition-all">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300 shadow-inner">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-[11px] font-black uppercase tracking-wider text-blue-300">
                    Assistência Geral
                  </span>
                  <span className="text-xs text-slate-300 font-medium">
                    Salão + Zoom
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-200 border border-blue-400/30">
                {displayCounters.totalPublicadores > 0
                  ? `${Math.round((displayCounters.totalGeral / displayCounters.totalPublicadores) * 100)}%`
                  : '0%'}
              </span>
            </div>

            <div className="mt-3">
              <div className="flex items-baseline justify-between">
                <span className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
                  {displayCounters.totalGeral}
                </span>
                <span className="text-xs text-slate-300 font-medium">
                  de {displayCounters.totalPublicadores} presentes
                </span>
              </div>
              {/* Barra de progresso interna */}
              <div className="w-full bg-slate-700/60 rounded-full h-1.5 mt-2.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-400 to-emerald-400 h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      displayCounters.totalPublicadores > 0
                        ? Math.min(100, Math.round((displayCounters.totalGeral / displayCounters.totalPublicadores) * 100))
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Card 2: Presencial (Salão do Reino) */}
          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-50 via-emerald-50/70 to-emerald-100/50 rounded-2xl p-4 sm:p-4.5 border-2 border-emerald-300/90 shadow-sm flex flex-col justify-between group transition-all">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-[11px] font-black uppercase tracking-wider text-emerald-950">
                    Presencial
                  </span>
                  <span className="text-xs text-emerald-700 font-medium">
                    Salão do Reino
                  </span>
                </div>
              </div>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {displayCounters.totalGeral > 0
                  ? `${Math.round((displayCounters.presencial / displayCounters.totalGeral) * 100)}%`
                  : '0%'}
              </span>
            </div>

            <div className="mt-3">
              <div className="flex items-baseline justify-between">
                <span className="text-3xl sm:text-4xl lg:text-5xl font-black text-emerald-900 tracking-tight">
                  {displayCounters.presencial}
                </span>
                <span className="text-xs text-emerald-700 font-medium">
                  {displayCounters.totalPublicadores > 0
                    ? `${Math.round((displayCounters.presencial / displayCounters.totalPublicadores) * 100)}% do rol`
                    : ''}
                </span>
              </div>
              {/* Barra de progresso interna */}
              <div className="w-full bg-emerald-200/80 rounded-full h-1.5 mt-2.5 overflow-hidden">
                <div
                  className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      displayCounters.totalPublicadores > 0
                        ? Math.min(100, Math.round((displayCounters.presencial / displayCounters.totalPublicadores) * 100))
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Card 3: Zoom (Remoto) */}
          <div className="relative overflow-hidden bg-gradient-to-br from-purple-50 via-purple-50/70 to-purple-100/50 rounded-2xl p-4 sm:p-4.5 border-2 border-purple-300/90 shadow-sm flex flex-col justify-between group transition-all">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
                  <Video className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-[11px] font-black uppercase tracking-wider text-purple-950">
                    Zoom
                  </span>
                  <span className="text-xs text-purple-700 font-medium">
                    Assistência Remota
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
                {displayCounters.totalGeral > 0
                  ? `${Math.round((displayCounters.zoom / displayCounters.totalGeral) * 100)}%`
                  : '0%'}
              </span>
            </div>

            <div className="mt-3">
              <div className="flex items-baseline justify-between">
                <span className="text-3xl sm:text-4xl lg:text-5xl font-black text-purple-900 tracking-tight">
                  {displayCounters.zoom}
                </span>
                <span className="text-xs text-purple-700 font-medium">
                  {displayCounters.totalPublicadores > 0
                    ? `${Math.round((displayCounters.zoom / displayCounters.totalPublicadores) * 100)}% do rol`
                    : ''}
                </span>
              </div>
              {/* Barra de progresso interna */}
              <div className="w-full bg-purple-200/80 rounded-full h-1.5 mt-2.5 overflow-hidden">
                <div
                  className="bg-purple-600 h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      displayCounters.totalPublicadores > 0
                        ? Math.min(100, Math.round((displayCounters.zoom / displayCounters.totalPublicadores) * 100))
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Card 4: Ausentes */}
          <div className="relative overflow-hidden bg-gradient-to-br from-rose-50 via-rose-50/70 to-rose-100/50 rounded-2xl p-4 sm:p-4.5 border-2 border-rose-300/90 shadow-sm flex flex-col justify-between group transition-all">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-xs">
                  <UserX className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-[11px] font-black uppercase tracking-wider text-rose-950">
                    Ausentes
                  </span>
                  <span className="text-xs text-rose-700 font-medium">
                    Faltas Registradas
                  </span>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                displayCounters.naoMarcados > 0
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-300'
              }`}>
                {displayCounters.naoMarcados > 0
                  ? `${displayCounters.naoMarcados} a verificar`
                  : 'Chamada 100%'}
              </span>
            </div>

            <div className="mt-3">
              <div className="flex items-baseline justify-between">
                <span className="text-3xl sm:text-4xl lg:text-5xl font-black text-rose-900 tracking-tight">
                  {displayCounters.ausente}
                </span>
                <span className="text-xs text-rose-700 font-medium">
                  {displayCounters.totalPublicadores > 0
                    ? `${Math.round((displayCounters.ausente / displayCounters.totalPublicadores) * 100)}% do rol`
                    : ''}
                </span>
              </div>
              {/* Barra de progresso interna */}
              <div className="w-full bg-rose-200/80 rounded-full h-1.5 mt-2.5 overflow-hidden">
                <div
                  className="bg-rose-600 h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      displayCounters.totalPublicadores > 0
                        ? Math.min(100, Math.round((displayCounters.ausente / displayCounters.totalPublicadores) * 100))
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>

        </div>

        {/* Barra de Distribuição Visual da Chamada */}
        <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-200/90 shadow-2xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
            <span className="text-slate-700 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
              <span>Progresso da Chamada:</span>
              <strong className="text-slate-900">
                {displayCounters.totalPublicadores - displayCounters.naoMarcados} de {displayCounters.totalPublicadores}
              </strong>
              <span className="text-slate-500 font-normal">
                ({displayCounters.totalPublicadores > 0
                  ? Math.round(((displayCounters.totalPublicadores - displayCounters.naoMarcados) / displayCounters.totalPublicadores) * 100)
                  : 0}% concluído)
              </span>
            </span>

            {/* Legenda com números rápidos */}
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap text-[11px] font-bold">
              <span className="flex items-center gap-1 text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                🏛️ {displayCounters.presencial} Presencial
              </span>
              <span className="flex items-center gap-1 text-purple-800 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                📹 {displayCounters.zoom} Zoom
              </span>
              <span className="flex items-center gap-1 text-rose-800 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                ✕ {displayCounters.ausente} Ausente
              </span>
              {displayCounters.naoMarcados > 0 && (
                <span className="flex items-center gap-1 text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  ⏳ {displayCounters.naoMarcados} Pendente
                </span>
              )}
            </div>
          </div>

          {/* Barra multi-segmentada */}
          <div className="w-full bg-slate-100 rounded-full h-3 flex overflow-hidden border border-slate-200/80">
            {displayCounters.totalPublicadores > 0 && (
              <>
                <div
                  title={`Presencial: ${displayCounters.presencial}`}
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{
                    width: `${(displayCounters.presencial / displayCounters.totalPublicadores) * 100}%`,
                  }}
                />
                <div
                  title={`Zoom: ${displayCounters.zoom}`}
                  className="bg-purple-500 h-full transition-all duration-300"
                  style={{
                    width: `${(displayCounters.zoom / displayCounters.totalPublicadores) * 100}%`,
                  }}
                />
                <div
                  title={`Ausentes: ${displayCounters.ausente}`}
                  className="bg-rose-500 h-full transition-all duration-300"
                  style={{
                    width: `${(displayCounters.ausente / displayCounters.totalPublicadores) * 100}%`,
                  }}
                />
                <div
                  title={`Pendentes: ${displayCounters.naoMarcados}`}
                  className="bg-amber-300 h-full transition-all duration-300"
                  style={{
                    width: `${(displayCounters.naoMarcados / displayCounters.totalPublicadores) * 100}%`,
                  }}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* BANNER DE STATUS E PROTEÇÃO CONTRA CONFLITOS ("Essa reunião já foi realizada") */}
      {hasExistingAttendance && (
        <div
          className={`rounded-2xl p-3.5 sm:p-4 border-2 transition-all shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isEditingUnlocked
              ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
              : 'bg-amber-50/95 border-amber-300 text-amber-950'
          }`}
        >
          <div className="flex items-start sm:items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-2xs ${
                isEditingUnlocked
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-500 text-white'
              }`}
            >
              {isEditingUnlocked ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm sm:text-base">
                  {isEditingUnlocked
                    ? 'Modo de Edição / Atualização Ativo'
                    : 'Atenção: Chamada desta reunião já realizada'}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                    isEditingUnlocked
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-amber-200/90 text-amber-900 border-amber-300'
                  }`}
                >
                  {isEditingUnlocked ? '🔓 Desbloqueado' : '🔒 Modo Protegido'}
                </span>
              </div>
              <p className="text-xs mt-0.5 opacity-90">
                {isEditingUnlocked
                  ? 'Você pode alterar ou corrigir a presença dos publicadores. Ao terminar, clique em Concluir para proteger a chamada.'
                  : `Esta reunião já possui registros salvos (${displayCounters.totalGeral} presentes, ${displayCounters.ausente} ausentes). Os botões estão protegidos para evitar alterações por engano.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
            {isEditingUnlocked ? (
              <button
                type="button"
                onClick={handleLockMeeting}
                className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs sm:text-sm transition-all shadow-xs flex items-center gap-1.5"
                title="Bloquear alterações para evitar toques acidentais"
              >
                <Lock className="w-4 h-4" />
                <span>Concluir e Proteger</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPendingTargetAction(null);
                  setShowUpdateWarningModal(true);
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold rounded-xl text-xs sm:text-sm transition-all shadow-xs flex items-center gap-1.5"
                title="Desbloquear para atualizar a chamada"
              >
                <Unlock className="w-4 h-4" />
                <span>Atualizar Chamada</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Alerta Fraternal de Sequências de Faltas (2+) */}
      {streaks.length > 0 && (
        <div className="bg-rose-50 border border-rose-200/90 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs animate-in fade-in">
          <div className="flex items-start sm:items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-100 border border-rose-300 flex items-center justify-center text-rose-700 text-lg shrink-0">
              🛡️
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm text-rose-950">
                  Alerta Fraternal: {streaks.length} publicador{streaks.length > 1 ? 'es' : ''} com 2 ou mais faltas seguidas
                </span>
                <span className="px-2 py-0.2 rounded-full text-[10px] font-extrabold bg-rose-600 text-white animate-pulse">
                  Apoio Necessário
                </span>
              </div>
              <p className="text-xs text-rose-800 mt-0.5">
                Identifique irmãos que necessitam de carinho ou visita de pastoreio com mensagens prontas no WhatsApp.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedStreakPubId(null);
              setIsCareModalOpen(true);
            }}
            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl text-xs font-bold shrink-0 transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
          >
            <span>Ver Lista de Apoio</span>
            <span className="px-1.5 py-0.2 bg-rose-800 text-rose-100 rounded-full text-[10px] font-bold">
              {streaks.length}
            </span>
          </button>
        </div>
      )}

      {/* 3. BARRA DE CONTROLE: FILTROS E MARCAÇÃO EM LOTE */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200 shadow-sm space-y-3">
        
        {/* Filtro por Grupos 1 a 6 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-blue-600" /> Grupos de Serviço de Campo:
            </span>
            {selectedGroup !== 'all' && (
              <span className="text-xs text-slate-500 font-medium">
                Visualizando Grupo {selectedGroup} ({filteredCounters.total} publicadores)
              </span>
            )}
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 text-xs font-semibold">
            <button
              onClick={() => setSelectedGroup('all')}
              className={`py-2 px-2 rounded-xl transition-all text-center border ${
                selectedGroup === 'all'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              Todos ({publishers.filter((p) => p.active).length})
            </button>

            {[1, 2, 3, 4, 5, 6].map((grpNum) => {
              const grpInfo = CONGREGATION_GROUPS.find((g) => g.number === grpNum);
              const countInGroup = safePublishers.filter((p) => p.active && p.group === grpNum).length;
              const isSelected = selectedGroup === grpNum;
              return (
                <button
                  key={grpNum}
                  onClick={() => setSelectedGroup(grpNum)}
                  className={`py-2 px-2 rounded-xl transition-all text-center border ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs font-bold'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                  title={grpInfo ? `${grpInfo.label} • Superint.: ${grpInfo.overseer} • Ajudante: ${grpInfo.assistant}` : undefined}
                >
                  <span className="block truncate">
                    {grpNum === 4 ? 'G4 (Ant. 5)' : grpNum === 5 ? 'G5 (Ant. 6)' : grpNum === 6 ? 'G6 (Ant. 7)' : `Grupo ${grpNum}`}
                  </span>
                  <span className="text-[11px] opacity-80 font-normal">({countInGroup})</span>
                </button>
              );
            })}
          </div>

          {/* Banner com Superintendente e Ajudante do Grupo Selecionado */}
          {selectedGroup !== 'all' && (() => {
            const currentGrpInfo = CONGREGATION_GROUPS.find((g) => g.number === selectedGroup);
            if (!currentGrpInfo) return null;
            return (
              <div className="mt-2.5 px-3 py-2 bg-blue-50/70 border border-blue-200/80 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-blue-900">{currentGrpInfo.label}:</span>
                  <span className="text-slate-700">
                    <strong className="text-blue-800 font-semibold">Superintendente:</strong> {currentGrpInfo.overseer}
                  </span>
                  <span className="text-slate-300 hidden sm:inline">•</span>
                  <span className="text-slate-700">
                    <strong className="text-blue-800 font-semibold">Ajudante:</strong> {currentGrpInfo.assistant}
                  </span>
                </div>
                <span className="text-blue-700 font-medium">
                  {filteredCounters.total} publicadores
                </span>
              </div>
            );
          })()}
        </div>

          {/* Linha de Busca & Ações em Lote */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
            {/* Busca por Nome */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar por nome, família ou função... (Pressione /)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
              {searchQuery ? (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold"
                >
                  ✕
                </button>
              ) : (
                <kbd className="hidden sm:inline-block absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono">
                  /
                </kbd>
              )}
            </div>

            {/* Filtro por Família */}
            {availableFamilies.length > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
                <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">👨‍👩‍👧‍👦 Família:</span>
                <select
                  value={selectedFamilyFilter}
                  onChange={(e) => setSelectedFamilyFilter(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer max-w-[140px] truncate"
                >
                  <option value="all">Todas ({availableFamilies.length})</option>
                  {availableFamilies.map((fam) => (
                    <option key={fam.name} value={fam.name}>
                      {fam.name} ({fam.count})
                    </option>
                  ))}
                </select>
                {selectedFamilyFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setSelectedFamilyFilter('all')}
                    className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                    title="Limpar filtro de família"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Botões de Ação em Lote e Atalhos */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Botão de Resumo WhatsApp */}
            {activeMeeting && (
              <button
                type="button"
                onClick={() => setIsWhatsAppModalOpen(true)}
                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                title="Gerar e compartilhar resumo formatado da reunião no WhatsApp"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>WhatsApp Resumo</span>
              </button>
            )}

            {/* Botão de Ajuda de Atalhos & Gestos */}
            <button
              type="button"
              onClick={() => setIsShortcutsModalOpen(true)}
              className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
              title="Ver atalhos de teclado e gestos de deslizamento (Pressione ?)"
            >
              <Keyboard className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">Atalhos & Gestos</span>
              <span className="sm:hidden">Atalhos</span>
              <kbd className="hidden md:inline-block text-[10px] bg-white text-blue-800 px-1 py-0.2 rounded border border-blue-300 font-mono">
                ?
              </kbd>
            </button>

            {/* Botão de Alternar Modo Simplificado */}
            <button
              type="button"
              onClick={handleToggleSimplifiedMode}
              className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
              title="Ocultar painéis extras e focar apenas na lista de chamada (Atalho: V)"
            >
              <Minimize2 className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">Modo Simplificado</span>
              <span className="sm:hidden">Simplificado</span>
              <kbd className="hidden md:inline-block text-[10px] bg-white text-indigo-800 px-1 py-0.2 rounded border border-indigo-300 font-mono">
                V
              </kbd>
            </button>

            <span className="text-xs font-semibold text-slate-500 mr-1 hidden lg:inline">
              Lote ({filteredPublishers.length}):
            </span>

            <button
              onClick={() => handleBatchAll('presencial')}
              className="px-2.5 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
              title="Marcar todos os publicadores filtrados como Presencial"
            >
              <span>🏛️ Todos Presenciais</span>
            </button>

            <button
              onClick={() => handleBatchAll('zoom')}
              className="px-2.5 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
              title="Marcar todos os publicadores filtrados como Zoom"
            >
              <span>📹 Todos Zoom</span>
            </button>

            <button
              onClick={() => handleBatchAll('ausente')}
              className="px-2.5 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
              title="Marcar todos os publicadores filtrados como Ausente"
            >
              <span>✕ Todos Ausentes</span>
            </button>

            <button
              onClick={handleClearBatch}
              className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-medium transition-colors"
              title="Limpar marcações deste filtro"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

        </div>

        {/* Barra de Ajuda Rápida de Agilidade & Gestos */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 bg-slate-50/80 px-3 py-1.5 rounded-xl border border-slate-200/80 mt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-700 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-500" /> Agilidade:
            </span>
            <span className="hidden sm:inline text-slate-600">
              Teclas <kbd className="font-mono bg-white px-1 rounded border border-slate-300 text-slate-700">↑</kbd><kbd className="font-mono bg-white px-1 rounded border border-slate-300 text-slate-700">↓</kbd> para navegar e <kbd className="font-mono bg-white px-1 rounded border border-slate-300 text-emerald-800 font-bold">1</kbd> Presencial, <kbd className="font-mono bg-white px-1 rounded border border-slate-300 text-purple-800 font-bold">2</kbd> Zoom, <kbd className="font-mono bg-white px-1 rounded border border-slate-300 text-rose-800 font-bold">3</kbd> Ausente.
            </span>
            <span className="sm:hidden text-slate-600 flex items-center gap-1">
              <Hand className="w-3 h-3 text-blue-600" />
              Deslize p/ direita 🏛️ Presencial ou p/ esquerda ✕ Ausente.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsShortcutsModalOpen(true)}
            className="text-blue-600 font-bold hover:underline ml-2 flex items-center gap-0.5 cursor-pointer whitespace-nowrap"
          >
            <span>Ver atalhos</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

      </div>

      {/* 4. LISTA DE PUBLICADORES COM OS 3 BOTÕES DE MARCAÇÃO EXCLUSIVOS */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
          <span>Mostrando {filteredPublishers.length} publicador(es)</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2 py-0.5 rounded ${statusFilter === 'all' ? 'bg-slate-800 text-white font-bold' : 'hover:bg-slate-100'}`}
            >
              Todos
            </button>
            <button
              onClick={() => setStatusFilter('pendente')}
              className={`px-2 py-0.5 rounded ${statusFilter === 'pendente' ? 'bg-amber-600 text-white font-bold' : 'hover:bg-slate-100'}`}
            >
              Pendentes ({counters.naoMarcados})
            </button>
          </div>
        </div>

        {filteredPublishers.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-slate-200">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-700 font-semibold text-sm">Nenhum publicador encontrado</p>
            <p className="text-xs text-slate-400 mt-1">
              Verifique o termo pesquisado ou ajuste os filtros de grupo.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {filteredPublishers.map((pub, index) => {
              const currentStatus = activeAttendanceMap[pub.id];
              const isFocused = focusedIndex === index;

              return (
                <SwipeablePublisherCard
                  key={pub.id}
                  publisher={pub}
                  currentStatus={currentStatus}
                  isFocused={isFocused}
                  keyboardIndex={index}
                  isSimplified={isSimplifiedMode}
                  onMark={(pubId, status) => handleMark(pubId, status)}
                  onClear={(pubId) => handleClearSingle(pubId)}
                  onCardClick={() => setFocusedIndex(index)}
                  editingNote={editingNotePubId === pub.id}
                  onToggleNote={() => setEditingNotePubId(editingNotePubId === pub.id ? null : pub.id)}
                  noteText={activeNotesMap[pub.id]}
                  onSaveNote={(note) => handleSaveNote(pub.id, note)}
                  getRoleBadgeColor={getRoleBadgeColor}
                  absenceStreak={streaksByPubId.get(pub.id)}
                  onOpenStreakCare={() => {
                    setSelectedStreakPubId(pub.id);
                    setIsCareModalOpen(true);
                  }}
                  familyMembersCount={pub.familyName ? (familyMembersMap.get(pub.familyName)?.length || 0) : undefined}
                  onMarkFamily={(status) => {
                    if (pub.familyName) {
                      handleMarkFamily(pub.familyName, status);
                    }
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* 4. PAINEL DE CONCLUSÃO DA CHAMADA ("TERMINOU A CHAMADA?") */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-3xl p-5 sm:p-7 border border-slate-700/80 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shadow-inner">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-300">
                  {displayCounters.naoMarcados === 0 ? '✓ Chamada Completa' : 'Chamada da Reunião'}
                </span>
                <h2 className="text-base sm:text-xl font-black text-white leading-tight">
                  Terminou a chamada desta reunião?
                </h2>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 pl-0.5">
              {activeMeeting.date} ({activeMeeting.dayOfWeek}) • {activeMeeting.titleOrTheme}
            </p>
          </div>

          {/* Horário de salvamento se disponível */}
          {lastSavedTimestamp[activeMeeting.id] ? (
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-xs font-bold self-start md:self-auto">
              <Clock className="w-4 h-4 text-emerald-300" />
              <span>Chamada sincronizada às {lastSavedTimestamp[activeMeeting.id]}</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 text-xs font-medium self-start md:self-auto">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>Lembre-se de salvar ao terminar</span>
            </div>
          )}
        </div>

        {/* Resumo visual dos números da chamada */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-3.5 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-xs" />
              <span className="text-xs font-bold text-slate-300">Presenciais</span>
            </div>
            <span className="text-xl font-black text-emerald-300">{displayCounters.presencial}</span>
          </div>
          <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-3.5 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-400 shadow-xs" />
              <span className="text-xs font-bold text-slate-300">Zoom</span>
            </div>
            <span className="text-xl font-black text-purple-300">{displayCounters.zoom}</span>
          </div>
          <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-3.5 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-rose-400 shadow-xs" />
              <span className="text-xs font-bold text-slate-300">Ausentes</span>
            </div>
            <span className="text-xl font-black text-rose-300">{displayCounters.ausente}</span>
          </div>
          <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-3.5 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${displayCounters.naoMarcados > 0 ? 'bg-amber-400 animate-pulse' : 'bg-slate-500'}`} />
              <span className="text-xs font-bold text-slate-300">Pendentes</span>
            </div>
            <span className={`text-xl font-black ${displayCounters.naoMarcados > 0 ? 'text-amber-300' : 'text-slate-400'}`}>
              {displayCounters.naoMarcados}
            </span>
          </div>
        </div>

        {/* Alerta de Status */}
        {displayCounters.naoMarcados > 0 ? (
          <div className="p-3.5 bg-amber-500/20 border border-amber-400/30 rounded-2xl text-xs sm:text-sm text-amber-200 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-300 flex-shrink-0" />
            <span>
              Ainda há <strong>{displayCounters.naoMarcados} publicadores pendentes</strong> (sem presença ou falta registrada). Você pode salvar agora e continuar depois se desejar.
            </span>
          </div>
        ) : (
          <div className="p-3.5 bg-emerald-500/20 border border-emerald-400/30 rounded-2xl text-xs sm:text-sm text-emerald-200 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-300 flex-shrink-0" />
            <span>
              Perfeito! Todos os <strong>{displayCounters.totalPublicadores} publicadores</strong> foram verificados. Total de presentes (Salão + Zoom): <strong>{displayCounters.totalGeral}</strong>.
            </span>
          </div>
        )}

        {/* OS DOIS BOTÕES SOLICITADOS: SALVAR E ATUALIZAR */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
          {/* Botão 1: Salvar e Sincronizar */}
          {onSaveAndSyncAttendance && (
            <button
              type="button"
              onClick={async () => {
                if (activeMeeting) {
                  await onSaveAndSyncAttendance(activeMeeting.id);
                  if (isEditingUnlocked) {
                    handleLockMeeting();
                  }
                }
              }}
              disabled={isSyncingAttendance}
              className="flex-1 py-3.5 px-6 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-98 text-white font-black text-sm sm:text-base rounded-2xl shadow-lg shadow-emerald-950/40 transition-all flex items-center justify-center gap-2.5 disabled:opacity-50"
            >
              {isSyncingAttendance ? (
                <RefreshCw className="w-5 h-5 animate-spin text-emerald-100" />
              ) : (
                <CheckCheck className="w-5 h-5 text-emerald-200" />
              )}
              <span>{isSyncingAttendance ? 'Salvando e Sincronizando...' : 'Salvar e Sincronizar Chamada'}</span>
            </button>
          )}

          {/* Botão 2: Atualizar */}
          {onRefreshData && (
            <button
              type="button"
              onClick={async () => {
                await onRefreshData();
              }}
              disabled={isRefreshingAttendance}
              className="py-3.5 px-6 bg-white/10 hover:bg-white/20 active:scale-98 text-white font-bold text-sm sm:text-base rounded-2xl border border-white/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 text-blue-300 ${isRefreshingAttendance ? 'animate-spin' : ''}`} />
              <span>{isRefreshingAttendance ? 'Atualizando...' : 'Atualizar Chamada'}</span>
            </button>
          )}
        </div>

        <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-300 leading-relaxed">
          <span className="text-amber-400 font-bold">💡 Informação:</span>
          <span>
            Ao clicar em <strong>Salvar e Sincronizar</strong>, a chamada fica gravada de forma permanente no banco de dados. Quando qualquer irmão recarregar a página (F5) ou clicar em <strong>Atualizar</strong>, os dados estarão completos e sincronizados.
          </span>
        </div>
      </div>

      {/* BARRA FIXA INFERIOR PARA MOBILE COM OS DOIS BOTÕES */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-700/80 p-2.5 px-4 shadow-2xl">
        <div className="flex items-center justify-between gap-3 max-w-md mx-auto">
          <div className="flex flex-col">
            <span className="text-xs font-black text-white">
              {displayCounters.totalGeral} presentes
            </span>
            <span className="text-[10px] text-slate-400">
              {displayCounters.naoMarcados > 0 ? `${displayCounters.naoMarcados} pendentes` : '100% chamados'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onRefreshData && (
              <button
                type="button"
                onClick={async () => {
                  await onRefreshData();
                }}
                disabled={isRefreshingAttendance}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs border border-slate-600 flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                title="Atualizar chamada"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isRefreshingAttendance ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>
            )}

            {onSaveAndSyncAttendance && (
              <button
                type="button"
                onClick={async () => {
                  if (activeMeeting) {
                    await onSaveAndSyncAttendance(activeMeeting.id);
                    if (isEditingUnlocked) {
                      handleLockMeeting();
                    }
                  }
                }}
                disabled={isSyncingAttendance}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-50"
                title="Salvar e sincronizar agora"
              >
                {isSyncingAttendance ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-100" />
                )}
                <span>Salvar</span>
              </button>
            )}
          </div>
        </div>
      </div>
        </>
      )}

      {/* MODAL DE DATA SELECIONADA (SE AINDA NÃO EXISTE REUNIÃO NESSA DATA) */}
      {isDateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-lg">
                📅
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Data: {pendingDate}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {getPortugueseDayOfWeek(pendingDate)}
                </p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600">
              Não existe nenhuma reunião cadastrada nesta data ({pendingDate}). O que você gostaria de fazer?
            </p>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (onQuickCreateMeetingForDate) {
                    onQuickCreateMeetingForDate(pendingDate, 'midweek');
                  }
                  setIsDateModalOpen(false);
                }}
                className="w-full py-2.5 px-3.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-between transition-colors"
              >
                <span>🏛️ Iniciar Reunião de Meio de Semana</span>
                <span className="text-[10px] bg-blue-200/60 px-2 py-0.5 rounded">Vida e Ministério</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onQuickCreateMeetingForDate) {
                    onQuickCreateMeetingForDate(pendingDate, 'weekend');
                  }
                  setIsDateModalOpen(false);
                }}
                className="w-full py-2.5 px-3.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-between transition-colors"
              >
                <span>📖 Iniciar Reunião de Fim de Semana</span>
                <span className="text-[10px] bg-emerald-200/60 px-2 py-0.5 rounded">Discurso e Sentinela</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onUpdateMeetingDate && activeMeeting) {
                    onUpdateMeetingDate(activeMeeting.id, pendingDate);
                  }
                  setIsDateModalOpen(false);
                }}
                className="w-full py-2.5 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between transition-colors"
              >
                <span>✏️ Mudar a data da reunião atual para este dia</span>
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsDateModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO: "Essa reunião já foi realizada, deseja atualizar?" */}
      {showUpdateWarningModal && activeMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border-2 border-amber-300 overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
            {/* Cabeçalho */}
            <div className="p-5 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center text-white flex-shrink-0 shadow-xs">
                  <ShieldAlert className="w-7 h-7" />
                </div>
                <div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-amber-100">
                    Aviso • Chamada Existente
                  </span>
                  <h3 className="text-lg sm:text-xl font-black text-white leading-tight">
                    Essa reunião já foi realizada!
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelUnlock}
                className="p-1.5 text-white/80 hover:text-white rounded-lg transition-colors hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corpo */}
            <div className="p-5 space-y-4 text-xs sm:text-sm text-slate-700">
              <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 space-y-2">
                <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <span>📅 {activeMeeting.titleOrTheme || 'Reunião Congregacional'}</span>
                </div>
                <div className="text-xs text-slate-600">
                  Data: <strong className="text-slate-800">{activeMeeting.date}</strong> ({activeMeeting.dayOfWeek})
                </div>

                {/* Resumo atual */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-amber-200/80 text-center">
                  <div className="bg-white/90 p-2 rounded-xl border border-amber-200 shadow-2xs">
                    <span className="block text-[10px] uppercase font-bold text-emerald-800">Presencial</span>
                    <span className="text-lg font-black text-emerald-700">{displayCounters.presencial}</span>
                  </div>
                  <div className="bg-white/90 p-2 rounded-xl border border-amber-200 shadow-2xs">
                    <span className="block text-[10px] uppercase font-bold text-purple-800">Zoom</span>
                    <span className="text-lg font-black text-purple-700">{displayCounters.zoom}</span>
                  </div>
                  <div className="bg-white/90 p-2 rounded-xl border border-amber-200 shadow-2xs">
                    <span className="block text-[10px] uppercase font-bold text-rose-800">Ausentes</span>
                    <span className="text-lg font-black text-rose-700">{displayCounters.ausente}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-semibold text-slate-900 text-sm">
                  {pendingTargetAction && pendingTargetAction.type === 'single'
                    ? `Você clicou para marcar presença de ${pendingTargetAction.pubName ? `"${pendingTargetAction.pubName}"` : 'um publicador'}.`
                    : 'A lista de presença desta reunião já foi registrada anteriormente por outro aparelho ou indicador.'}
                </p>
                <p className="text-slate-600 leading-relaxed text-xs sm:text-sm">
                  Deseja <strong>atualizar os registros da chamada</strong>? Ao confirmar, o modo de edição será desbloqueado para que você possa efetuar as correções necessárias.
                </p>
              </div>

              {/* Botões */}
              <div className="pt-3 border-t border-slate-200 flex flex-col-reverse sm:flex-row items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCancelUnlock}
                  className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors text-center text-xs sm:text-sm"
                >
                  Não, Apenas Visualizar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmUnlockAndUpdate}
                  className="w-full sm:w-auto px-5 py-2.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm text-xs sm:text-sm"
                >
                  <Unlock className="w-4 h-4" />
                  <span>Sim, Desejo Atualizar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Flutuante de Confirmação Rápida */}
      {shortcutToast && (
        <div
          className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-200"
          style={{ maxWidth: 'calc(100vw - 2rem)' }}
        >
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border text-sm font-medium ${
              shortcutToast.type === 'presencial'
                ? 'bg-emerald-950 text-emerald-100 border-emerald-700/60'
                : shortcutToast.type === 'zoom'
                ? 'bg-purple-950 text-purple-100 border-purple-700/60'
                : shortcutToast.type === 'ausente'
                ? 'bg-rose-950 text-rose-100 border-rose-700/60'
                : 'bg-slate-900 text-slate-100 border-slate-700/60'
            }`}
          >
            <span className="text-xl">
              {shortcutToast.type === 'presencial'
                ? '🏛️'
                : shortcutToast.type === 'zoom'
                ? '📹'
                : shortcutToast.type === 'ausente'
                ? '✕'
                : '↺'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white text-xs sm:text-sm truncate">
                {shortcutToast.message}
              </p>
              {shortcutToast.subtext && (
                <p className="text-[11px] opacity-80 truncate">
                  {shortcutToast.subtext}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShortcutToast(null)}
              className="text-white/60 hover:text-white ml-2 text-xs p-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Modal de Atalhos de Teclado e Gestos */}
      <KeyboardShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
        autoAdvance={autoAdvance}
        onToggleAutoAdvance={handleToggleAutoAdvance}
      />

      {/* Modal de Apoio Fraternal para Sequências de Faltas (2+) */}
      <FraternalCareModal
        isOpen={isCareModalOpen}
        onClose={() => {
          setIsCareModalOpen(false);
          setSelectedStreakPubId(null);
        }}
        streaks={streaks}
        selectedPublisherId={selectedStreakPubId || undefined}
        congregationName={congregationName}
      />

      {/* Modal de Resumo Formatado para WhatsApp */}
      {activeMeeting && (
        <WhatsAppShareModal
          isOpen={isWhatsAppModalOpen}
          onClose={() => setIsWhatsAppModalOpen(false)}
          meeting={activeMeeting}
          attendanceMap={activeAttendanceMap}
          notesMap={activeNotesMap}
          publishers={safePublishers}
          congregationName={congregationName}
        />
      )}

    </div>
  );
};
