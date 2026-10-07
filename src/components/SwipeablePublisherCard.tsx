import React, { useRef, useState } from 'react';
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Hand,
  MessageSquare,
  Sparkles,
  User,
  Users,
  Video,
  X,
  XCircle,
} from 'lucide-react';
import { AttendanceStatus, Publisher } from '../types';

export const ZOOM_PRESETS = [
  'Sintomas gripais',
  'Idoso / Saúde',
  'Trabalho / Plantão',
  'Viagem',
  'Dificuldade locomoção',
  'Cuidando de familiar',
];

// Presets específicos para Ancião e Servo Ministerial
export const AUSENTE_PRESETS_ELDER_OR_SERVANT = [
  'Discurso fora',
  'Discurso fora (outra congregação)',
  'Acompanhando orador fora',
  'Enfermo / Doente',
  'Trabalho / Plantão',
  'Viagem',
  'Emergência familiar',
  'Cuidando de parente',
  'Sem contato',
];

// Presets específicos para quem NÃO é Ancião (esposas, pioneiros, publicadores em geral)
export const AUSENTE_PRESETS_NON_ELDER = [
  'Acompanhando orador em discurso fora',
  'Acompanhando orador fora',
  'Enfermo / Doente',
  'Trabalho / Plantão',
  'Viagem',
  'Emergência familiar',
  'Cuidando de parente',
  'Sem contato',
];

// Presets padrão para compatibilidade
export const AUSENTE_PRESETS = AUSENTE_PRESETS_NON_ELDER;



const SWIPE_THRESHOLD = 70; // pixels necessários para confirmar o gesto

export interface SwipeablePublisherCardProps {
  publisher: Publisher;
  currentStatus?: AttendanceStatus;
  isFocused: boolean;
  keyboardIndex: number;
  isSimplified?: boolean;
  onMark: (pubId: string, status: AttendanceStatus) => void;
  onClear: (pubId: string) => void;
  onCardClick: () => void;
  editingNote: boolean;
  onToggleNote: () => void;
  noteText?: string;
  onSaveNote: (note: string) => void;
  getRoleBadgeColor: (role: string) => string;
  absenceStreak?: number;
  onOpenStreakCare?: () => void;
  familyMembersCount?: number;
  onMarkFamily?: (status: AttendanceStatus) => void;
}
 
export const SwipeablePublisherCard: React.FC<SwipeablePublisherCardProps> = ({
  publisher,
  currentStatus,
  isFocused,
  keyboardIndex,
  isSimplified = false,
  onMark,
  onClear,
  onCardClick,
  editingNote,
  onToggleNote,
  noteText,
  onSaveNote,
  getRoleBadgeColor,
  absenceStreak,
  onOpenStreakCare,
  familyMembersCount,
  onMarkFamily,
}) => {
  const [dragOffset, setDragOffset] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [swipeFeedback, setSwipeFeedback] = useState<'presencial' | 'ausente' | null>(null);

  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);

  const safeRoles = Array.isArray(publisher.roles)
    ? publisher.roles
    : typeof (publisher as any).role === 'string'
    ? [(publisher as any).role]
    : [];

  const isElder = safeRoles.some((r: any) => {
    if (typeof r !== 'string') return false;
    const lower = r.toLowerCase();
    return lower.includes('anci') || lower === 'elder';
  });

  const isServant = safeRoles.some((r: any) => {
    if (typeof r !== 'string') return false;
    const lower = r.toLowerCase();
    return lower.includes('servo') || lower.includes('ministerial');
  });

  const isElderOrServant = isElder || isServant;

  const currentAusentePresets = isElderOrServant
    ? AUSENTE_PRESETS_ELDER_OR_SERVANT
    : AUSENTE_PRESETS_NON_ELDER;

  // Tratamento do início do toque
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isHorizontalSwipe.current = null;
    setIsDragging(true);
  };

  // Tratamento do movimento do toque
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - touchStartX.current;
    const diffY = currentY - touchStartY.current;

    // Detecta intenção: horizontal (deslizar) vs vertical (rolar página)
    if (isHorizontalSwipe.current === null) {
      if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) {
        isHorizontalSwipe.current = Math.abs(diffX) > Math.abs(diffY);
      }
    }

    if (isHorizontalSwipe.current) {
      // Limita o deslocamento com resistência elástica além do threshold
      const maxDrag = 140;
      let boundedOffset = diffX;
      if (Math.abs(diffX) > maxDrag) {
        boundedOffset =
          diffX > 0
            ? maxDrag + (diffX - maxDrag) * 0.2
            : -maxDrag + (diffX + maxDrag) * 0.2;
      }
      setDragOffset(boundedOffset);

      if (diffX >= SWIPE_THRESHOLD) {
        setSwipeFeedback('presencial');
      } else if (diffX <= -SWIPE_THRESHOLD) {
        setSwipeFeedback('ausente');
      } else {
        setSwipeFeedback(null);
      }
    }
  };

  // Finalização do toque
  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    if (isHorizontalSwipe.current) {
      if (dragOffset >= SWIPE_THRESHOLD) {
        // Gesto confirmado: Presencial
        try {
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate(35);
          }
        } catch {
          // ignora suporte a vibração
        }
        onMark(publisher.id, 'presencial');
      } else if (dragOffset <= -SWIPE_THRESHOLD) {
        // Gesto confirmado: Ausente
        try {
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate(35);
          }
        } catch {
          // ignora suporte a vibração
        }
        onMark(publisher.id, 'ausente');
      }
    }

    // Retorna o card à posição original com transição elástica
    setDragOffset(0);
    setSwipeFeedback(null);
    isHorizontalSwipe.current = null;
  };

  const handleTouchCancel = () => {
    setIsDragging(false);
    setDragOffset(0);
    setSwipeFeedback(null);
    isHorizontalSwipe.current = null;
  };

  return (
    <div
      id={`publisher-row-${publisher.id}`}
      onClick={onCardClick}
      className={`relative overflow-hidden rounded-2xl transition-all select-none ${
        isFocused
          ? 'ring-2 ring-blue-600 shadow-md border-blue-500 scale-[1.006]'
          : ''
      }`}
    >
      {/* CAMADA DE FUNDO REVELADA PELO GESTO (SWIPE BACKGROUND) */}
      <div className="absolute inset-0 flex items-center justify-between pointer-events-none rounded-2xl overflow-hidden">
        
        {/* Fundo Esquerdo (Revelado ao deslizar para a direita -> Presencial) */}
        <div
          className={`h-full flex items-center px-5 font-bold text-xs sm:text-sm text-white transition-colors duration-150 flex-1 justify-start gap-2 ${
            dragOffset > 0 ? (dragOffset >= SWIPE_THRESHOLD ? 'bg-emerald-600' : 'bg-emerald-500/80') : 'bg-transparent'
          }`}
          style={{ opacity: dragOffset > 10 ? Math.min(1, dragOffset / 50) : 0 }}
        >
          <span className="text-xl">🏛️</span>
          <span className="tracking-wide uppercase font-extrabold text-xs">
            {dragOffset >= SWIPE_THRESHOLD ? 'Solte para Presencial!' : 'Deslize p/ Presencial'}
          </span>
          <CheckCheck className={`w-4 h-4 transition-transform ${dragOffset >= SWIPE_THRESHOLD ? 'scale-125' : ''}`} />
        </div>

        {/* Fundo Direito (Revelado ao deslizar para a esquerda -> Ausente) */}
        <div
          className={`h-full flex items-center px-5 font-bold text-xs sm:text-sm text-white transition-colors duration-150 flex-1 justify-end gap-2 ${
            dragOffset < 0 ? (dragOffset <= -SWIPE_THRESHOLD ? 'bg-rose-600' : 'bg-rose-500/80') : 'bg-transparent'
          }`}
          style={{ opacity: dragOffset < -10 ? Math.min(1, Math.abs(dragOffset) / 50) : 0 }}
        >
          <XCircle className={`w-4 h-4 transition-transform ${dragOffset <= -SWIPE_THRESHOLD ? 'scale-125' : ''}`} />
          <span className="tracking-wide uppercase font-extrabold text-xs">
            {dragOffset <= -SWIPE_THRESHOLD ? 'Solte para Ausente!' : 'Deslize p/ Ausente'}
          </span>
          <span className="text-xl">✕</span>
        </div>
      </div>

      {/* CAMADA PRINCIPAL DO CARD (DESLOCÁVEL POR TOQUE OU MOUSE) */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        style={{
          transform: `translateX(${dragOffset}px)`,
          transition: isDragging ? 'none' : 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1)',
        }}
        className={`relative bg-white rounded-2xl border flex flex-col cursor-pointer ${
          isSimplified ? 'p-2.5 sm:p-3 gap-2' : 'p-3 sm:p-4 gap-2.5'
        } ${
          currentStatus === 'presencial'
            ? 'border-emerald-300 shadow-xs ring-1 ring-emerald-200/50 bg-emerald-50/20'
            : currentStatus === 'zoom'
            ? 'border-purple-300 shadow-xs ring-1 ring-purple-200/50 bg-purple-50/20'
            : currentStatus === 'ausente'
            ? 'border-rose-300 shadow-xs ring-1 ring-rose-200/50 bg-rose-50/20'
            : 'border-slate-200 shadow-xs hover:border-slate-300'
        }`}
      >
        {/* Indicador superior quando em Foco de Teclado */}
        {isFocused && (
          <div className="flex items-center justify-between pb-1.5 border-b border-blue-100 text-[11px] font-bold text-blue-800">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              ⌨️ Em foco via teclado:
            </span>
            <div className="flex items-center gap-1.5 font-mono text-[10px]">
              <span className="bg-emerald-100 text-emerald-900 px-1.5 py-0.5 rounded border border-emerald-300 font-bold">
                [1] Presencial
              </span>
              <span className="bg-purple-100 text-purple-900 px-1.5 py-0.5 rounded border border-purple-300 font-bold">
                [2] Zoom
              </span>
              <span className="bg-rose-100 text-rose-900 px-1.5 py-0.5 rounded border border-rose-300 font-bold">
                [3] Ausente
              </span>
              <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-300">
                [0] Limpar
              </span>
            </div>
          </div>
        )}

        {/* LAYOUT EM MODO SIMPLIFICADO */}
        {isSimplified ? (
          <div className="flex flex-col gap-2">
            {/* Linha de Nome e Identificação Rápida */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span className="font-bold text-sm sm:text-base text-slate-900 tracking-tight truncate">
                  {publisher.name}
                </span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                  G{publisher.group}
                </span>
                {publisher.familyName && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-50 text-amber-900 border border-amber-200 shrink-0 truncate max-w-[100px]">
                    👨‍👩‍👧‍👦 {publisher.familyName.replace('Família ', '')}
                  </span>
                )}
                {absenceStreak && absenceStreak >= 2 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenStreakCare?.();
                    }}
                    className="px-1.5 py-0.2 rounded text-[10px] font-black bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 shrink-0 flex items-center gap-0.5 animate-pulse cursor-pointer"
                    title={`${absenceStreak} faltas consecutivas - Toque para apoio fraternal`}
                  >
                    <span>🛡️ {absenceStreak} faltas</span>
                  </button>
                )}
                {safeRoles.slice(0, 1).map((role) => (
                  <span
                    key={role}
                    className={`hidden sm:inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold border shrink-0 ${getRoleBadgeColor(
                      role
                    )}`}
                  >
                    {role}
                  </span>
                ))}
              </div>

              {/* Botão sutil de desmarcar quando já há presença */}
              {currentStatus && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClear(publisher.id);
                  }}
                  className="text-[11px] text-slate-400 hover:text-rose-600 px-1.5 py-0.5 rounded hover:bg-slate-100 flex items-center gap-0.5 cursor-pointer shrink-0 transition-colors"
                  title="Desmarcar / Voltar a Pendente (Atalho: 0 ou Backspace)"
                >
                  <X className="w-3 h-3" />
                  <span className="text-[10px]">Limpar</span>
                </button>
              )}
            </div>

            {/* Os 3 Botões de Presença em Grid Otimizado para Toque Rápido */}
            <div
              className="grid grid-cols-3 gap-1.5 sm:gap-2 w-full"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Botão Presencial */}
              <button
                type="button"
                onClick={() => onMark(publisher.id, 'presencial')}
                className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 py-2.5 sm:py-2 rounded-xl font-bold text-xs sm:text-sm transition-all transform active:scale-95 border cursor-pointer select-none ${
                  currentStatus === 'presencial'
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm ring-2 ring-emerald-400/60'
                    : 'bg-emerald-50/70 hover:bg-emerald-100 text-emerald-900 border-emerald-300/80'
                }`}
                title="Presente fisicamente no Salão"
              >
                <span className="text-base sm:text-lg">🏛️</span>
                <span className="truncate">Presencial</span>
                {currentStatus === 'presencial' && (
                  <CheckCheck className="w-3.5 h-3.5 ml-0.5 text-emerald-100 shrink-0" />
                )}
              </button>

              {/* Botão Zoom */}
              <button
                type="button"
                onClick={() => onMark(publisher.id, 'zoom')}
                className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 py-2.5 sm:py-2 rounded-xl font-bold text-xs sm:text-sm transition-all transform active:scale-95 border cursor-pointer select-none ${
                  currentStatus === 'zoom'
                    ? 'bg-purple-600 text-white border-purple-700 shadow-sm ring-2 ring-purple-400/60'
                    : 'bg-purple-50/70 hover:bg-purple-100 text-purple-900 border-purple-300/80'
                }`}
                title="Assistindo pelo Zoom"
              >
                <span className="text-base sm:text-lg">📹</span>
                <span className="truncate">Zoom</span>
                {currentStatus === 'zoom' && (
                  <CheckCheck className="w-3.5 h-3.5 ml-0.5 text-purple-100 shrink-0" />
                )}
              </button>

              {/* Botão Ausente */}
              <button
                type="button"
                onClick={() => onMark(publisher.id, 'ausente')}
                className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 py-2.5 sm:py-2 rounded-xl font-bold text-xs sm:text-sm transition-all transform active:scale-95 border cursor-pointer select-none ${
                  currentStatus === 'ausente'
                    ? 'bg-rose-600 text-white border-rose-700 shadow-sm ring-2 ring-rose-400/60'
                    : 'bg-rose-50/70 hover:bg-rose-100 text-rose-900 border-rose-300/80'
                }`}
                title="Ausente da reunião"
              >
                <span className="text-base sm:text-lg">✕</span>
                <span className="truncate">Ausente</span>
                {currentStatus === 'ausente' && (
                  <XCircle className="w-3.5 h-3.5 ml-0.5 text-rose-100 shrink-0" />
                )}
              </button>
            </div>

            {/* Destaque para Chamada por Família em 1 Toque (Modo Simplificado) */}
            {publisher.familyName && familyMembersCount && familyMembersCount > 1 && onMarkFamily && (
              <div
                className="mt-1 p-2 sm:p-2.5 rounded-xl bg-gradient-to-r from-amber-50 via-orange-50/60 to-amber-50 border-2 border-amber-300/90 shadow-2xs space-y-2 select-none"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-base">👨‍👩‍👧‍👦</span>
                    <span className="font-black text-xs text-amber-950 truncate">
                      {publisher.familyName.startsWith('Família') ? publisher.familyName : `Família ${publisher.familyName}`}
                    </span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-amber-200/90 text-amber-900 border border-amber-300 shrink-0">
                      {familyMembersCount} pessoas
                    </span>
                  </div>
                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-300/80">
                    1 Toque p/ Todos
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      try { if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(25); } catch {}
                      onMarkFamily('presencial');
                    }}
                    className="min-h-[44px] py-2 px-2 rounded-xl font-black text-xs bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white shadow-xs border border-emerald-700 flex items-center justify-center gap-1 transition-all cursor-pointer"
                    title={`Marcar todos os ${familyMembersCount} membros da ${publisher.familyName} como Presencial`}
                  >
                    <span className="text-sm">🏛️</span>
                    <span className="truncate">Família Presencial</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      try { if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(25); } catch {}
                      onMarkFamily('zoom');
                    }}
                    className="min-h-[44px] py-2 px-2 rounded-xl font-black text-xs bg-purple-600 hover:bg-purple-700 active:scale-95 text-white shadow-xs border border-purple-700 flex items-center justify-center gap-1 transition-all cursor-pointer"
                    title={`Marcar todos os ${familyMembersCount} membros da ${publisher.familyName} como Zoom`}
                  >
                    <span className="text-sm">📹</span>
                    <span className="truncate">Família Zoom</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      try { if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(25); } catch {}
                      onMarkFamily('ausente');
                    }}
                    className="col-span-2 sm:col-span-1 min-h-[44px] py-2 px-2 rounded-xl font-bold text-xs bg-rose-100 hover:bg-rose-200 active:scale-95 text-rose-900 border border-rose-300 flex items-center justify-center gap-1 transition-all cursor-pointer"
                    title={`Marcar todos os ${familyMembersCount} membros da ${publisher.familyName} como Ausente`}
                  >
                    <span className="text-xs">✕</span>
                    <span className="truncate">Família Ausente</span>
                  </button>
                </div>
              </div>
            )}

            {/* Linha discreta de motivo quando marcado com Zoom ou Ausente */}
            {(currentStatus === 'zoom' || currentStatus === 'ausente') && !editingNote && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 text-slate-500"
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span className="font-semibold text-slate-600">
                    {currentStatus === 'zoom' ? 'Zoom:' : 'Falta:'}
                  </span>
                  {noteText ? (
                    <span className="font-bold text-slate-800 bg-slate-100 px-1.5 py-0.2 rounded truncate">
                      {noteText}
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">Sem motivo informado</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onToggleNote}
                  className="text-blue-600 hover:text-blue-800 hover:underline font-bold ml-2 cursor-pointer shrink-0"
                >
                  {noteText ? 'Alterar' : '+ Motivo'}
                </button>
              </div>
            )}
          </div>
        ) : (
          /* LAYOUT PADRÃO (COMPLETO) */
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Informações do Publicador */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm sm:text-base text-slate-900 tracking-tight flex items-center gap-1.5">
                  {publisher.name}
                </span>

                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  Grupo {publisher.group}
                </span>

                {publisher.familyName && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200 flex items-center gap-1">
                    <span>👨‍👩‍👧‍👦</span>
                    <span>{publisher.familyName}</span>
                    {familyMembersCount && familyMembersCount > 1 && (
                      <span className="text-[10px] text-amber-700 font-normal">({familyMembersCount})</span>
                    )}
                  </span>
                )}

                {absenceStreak && absenceStreak >= 2 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenStreakCare?.();
                    }}
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 flex items-center gap-1 cursor-pointer transition-colors animate-pulse"
                    title={`${absenceStreak} faltas consecutivas - Toque para apoio fraternal`}
                  >
                    <span>🛡️ {absenceStreak} faltas seguidas</span>
                  </button>
                )}

                {/* Dica sutil de gesto em telas pequenas */}
                <span className="sm:hidden text-[10px] text-slate-400 flex items-center gap-0.5">
                  <ChevronLeft className="w-3 h-3" />
                  <span>Deslize</span>
                  <ChevronRight className="w-3 h-3" />
                </span>
              </div>

              {/* Funções do Publicador e Botão Família */}
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {safeRoles.map((role) => (
                  <span
                    key={role}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border ${getRoleBadgeColor(
                      role
                    )}`}
                  >
                    {role}
                  </span>
                ))}

                {publisher.notes && (
                  <span className="text-[11px] text-slate-500 italic ml-1 truncate max-w-xs">
                    • {publisher.notes}
                  </span>
                )}
              </div>
            </div>

            {/* OS 3 BOTÕES DE MARCAÇÃO EXCLUSIVOS COM INDICADORES DE ATALHO */}
            <div
              className="flex items-center gap-1.5 sm:gap-2 self-stretch sm:self-auto flex-shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Botão 1: [ 🏛️ Presencial ] (Verde) */}
              <button
                type="button"
                onClick={() => onMark(publisher.id, 'presencial')}
                className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all transform active:scale-95 border cursor-pointer ${
                  currentStatus === 'presencial'
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm ring-2 ring-emerald-400/50'
                    : 'bg-emerald-50/60 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                }`}
                title="Presente fisicamente no Salão do Reino (Atalho: P ou 1)"
              >
                <span className="text-base">🏛️</span>
                <span>Presencial</span>
                <span
                  className={`hidden sm:inline-block font-mono text-[10px] px-1 py-0.2 rounded font-bold border ${
                    currentStatus === 'presencial'
                      ? 'bg-emerald-700/60 border-emerald-500 text-white'
                      : 'bg-emerald-100 border-emerald-300 text-emerald-800'
                  }`}
                >
                  1
                </span>
                {currentStatus === 'presencial' && (
                  <CheckCheck className="w-3.5 h-3.5 ml-0.5 text-emerald-100" />
                )}
              </button>

              {/* Botão 2: [ 📹 Zoom ] (Roxo) */}
              <button
                type="button"
                onClick={() => onMark(publisher.id, 'zoom')}
                className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all transform active:scale-95 border cursor-pointer ${
                  currentStatus === 'zoom'
                    ? 'bg-purple-600 text-white border-purple-700 shadow-sm ring-2 ring-purple-400/50'
                    : 'bg-purple-50/60 hover:bg-purple-100 text-purple-800 border-purple-300'
                }`}
                title="Assistindo remotamente pelo Zoom (Atalho: Z ou 2)"
              >
                <span className="text-base">📹</span>
                <span>Zoom</span>
                <span
                  className={`hidden sm:inline-block font-mono text-[10px] px-1 py-0.2 rounded font-bold border ${
                    currentStatus === 'zoom'
                      ? 'bg-purple-700/60 border-purple-500 text-white'
                      : 'bg-purple-100 border-purple-300 text-purple-800'
                  }`}
                >
                  2
                </span>
                {currentStatus === 'zoom' && (
                  <CheckCheck className="w-3.5 h-3.5 ml-0.5 text-purple-100" />
                )}
              </button>

              {/* Botão 3: [ ✕ Ausente ] (Vermelho) */}
              <button
                type="button"
                onClick={() => onMark(publisher.id, 'ausente')}
                className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all transform active:scale-95 border cursor-pointer ${
                  currentStatus === 'ausente'
                    ? 'bg-rose-600 text-white border-rose-700 shadow-sm ring-2 ring-rose-400/50'
                    : 'bg-rose-50/60 hover:bg-rose-100 text-rose-800 border-rose-300'
                }`}
                title="Ausente da reunião (Atalho: A ou 3)"
              >
                <span className="text-base">✕</span>
                <span>Ausente</span>
                <span
                  className={`hidden sm:inline-block font-mono text-[10px] px-1 py-0.2 rounded font-bold border ${
                    currentStatus === 'ausente'
                      ? 'bg-rose-700/60 border-rose-500 text-white'
                      : 'bg-rose-100 border-rose-300 text-rose-800'
                  }`}
                >
                  3
                </span>
                {currentStatus === 'ausente' && (
                  <XCircle className="w-3.5 h-3.5 ml-0.5 text-rose-100" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* DESTAQUE PARA CHAMADA POR FAMÍLIA EM 1 TOQUE (Modo Completo) */}
        {!isSimplified && publisher.familyName && familyMembersCount && familyMembersCount > 1 && onMarkFamily && (
          <div
            className="p-2.5 sm:p-3 rounded-xl bg-gradient-to-r from-amber-50 via-orange-50/70 to-amber-50 border-2 border-amber-300/90 shadow-2xs space-y-2 select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-lg">👨‍👩‍👧‍👦</span>
                <span className="font-black text-xs sm:text-sm text-amber-950 truncate">
                  Chamada da {publisher.familyName.startsWith('Família') ? publisher.familyName : `Família ${publisher.familyName}`}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-200/90 text-amber-900 border border-amber-300 shrink-0">
                  {familyMembersCount} pessoas
                </span>
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300/90 hidden sm:inline">
                ⚡ 1 Toque p/ Todos
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  try { if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(25); } catch {}
                  onMarkFamily('presencial');
                }}
                className="min-h-[46px] py-2 px-3 rounded-xl font-black text-xs sm:text-sm bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white shadow-xs border border-emerald-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                title={`Marcar todos os ${familyMembersCount} membros da ${publisher.familyName} como Presencial`}
              >
                <span className="text-base sm:text-lg">🏛️</span>
                <span className="truncate">Família Presencial</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  try { if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(25); } catch {}
                  onMarkFamily('zoom');
                }}
                className="min-h-[46px] py-2 px-3 rounded-xl font-black text-xs sm:text-sm bg-purple-600 hover:bg-purple-700 active:scale-95 text-white shadow-xs border border-purple-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                title={`Marcar todos os ${familyMembersCount} membros da ${publisher.familyName} como Zoom`}
              >
                <span className="text-base sm:text-lg">📹</span>
                <span className="truncate">Família Zoom</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  try { if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(25); } catch {}
                  onMarkFamily('ausente');
                }}
                className="col-span-2 sm:col-span-1 min-h-[46px] py-2 px-3 rounded-xl font-bold text-xs bg-rose-100 hover:bg-rose-200 active:scale-95 text-rose-900 border border-rose-300 flex items-center justify-center gap-1 transition-all cursor-pointer"
                title={`Marcar todos os ${familyMembersCount} membros da ${publisher.familyName} como Ausente`}
              >
                <span className="text-sm">✕</span>
                <span className="truncate">Família Ausente</span>
              </button>
            </div>
          </div>
        )}

        {/* SEÇÃO DE OBSERVAÇÃO / MOTIVO QUANDO ZOOM OU AUSENTE */}
        {(currentStatus === 'zoom' || currentStatus === 'ausente') && (
          <div
            onClick={(e) => e.stopPropagation()}
            className={`pt-2 border-t rounded-xl p-2.5 transition-all ${
              currentStatus === 'zoom'
                ? 'bg-purple-50/60 border-purple-100'
                : 'bg-rose-50/60 border-rose-100'
            }`}
          >
            {editingNote ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                    <span>
                      Motivo / Observação ({currentStatus === 'zoom' ? 'Zoom' : 'Falta'}):
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={onToggleNote}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-1.5 py-0.5 rounded hover:bg-white/80 cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>

                {/* Chips de 1 Toque */}
                <div className="flex flex-wrap gap-1.5">
                  {currentStatus === 'zoom'
                    ? ZOOM_PRESETS.map((reason) => (
                        <button
                          key={reason}
                          type="button"
                          onClick={() => {
                            onSaveNote(reason);
                            onToggleNote();
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-purple-600 hover:text-white text-slate-700 rounded-lg text-xs font-medium border border-purple-200 shadow-2xs transition-colors cursor-pointer"
                        >
                          {reason}
                        </button>
                      ))
                    : currentAusentePresets.map((reason) => {
                        const isSpeechOut = reason.startsWith('Discurso fora');
                        const isAccompanying = reason.startsWith('Acompanhando orador');

                        return (
                          <button
                            key={reason}
                            type="button"
                            onClick={() => {
                              onSaveNote(reason);
                              onToggleNote();
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium border shadow-2xs transition-all cursor-pointer ${
                              isSpeechOut
                                ? 'bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-900 border-blue-300 font-bold flex items-center gap-1 ring-1 ring-blue-400/40'
                                : isAccompanying
                                ? 'bg-amber-50 hover:bg-amber-600 hover:text-white text-amber-950 border-amber-300 font-bold flex items-center gap-1 ring-1 ring-amber-400/40'
                                : 'bg-white hover:bg-slate-700 hover:text-white text-slate-700 border-slate-200'
                            }`}
                          >
                            {isSpeechOut && <span>🎤</span>}
                            {isAccompanying && <span>🚗</span>}
                            <span>{reason}</span>
                          </button>
                        );
                      })}
                </div>

                {/* Campo de Texto Livre */}
                <div className="flex items-center gap-2 pt-0.5">
                  <input
                    type="text"
                    placeholder={
                      currentStatus === 'zoom'
                        ? 'Ou digite o motivo pelo Zoom (ex: Idoso, plantão, sintomas)...'
                        : isElderOrServant
                        ? 'Ex: Discurso fora na Cong. Jardim das Flores...'
                        : 'Ex: Acompanhando orador na Cong. Sul...'
                    }
                    defaultValue={noteText || ''}
                    id={`note-input-${publisher.id}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = (e.target as HTMLInputElement).value;
                        onSaveNote(val);
                        onToggleNote();
                      }
                    }}
                    className="flex-1 bg-white text-xs text-slate-800 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.getElementById(
                        `note-input-${publisher.id}`
                      ) as HTMLInputElement;
                      onSaveNote(input ? input.value : '');
                      onToggleNote();
                    }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs cursor-pointer"
                  >
                    Salvar
                  </button>
                  {noteText && (
                    <button
                      type="button"
                      onClick={() => {
                        onSaveNote('');
                        onToggleNote();
                      }}
                      className="px-2.5 py-1.5 bg-slate-200 hover:bg-rose-100 text-slate-600 hover:text-rose-700 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                      title="Remover motivo"
                    >
                      Limpar
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
                    <span className="font-semibold text-slate-600">
                      {currentStatus === 'zoom' ? 'Assistindo no Zoom:' : 'Motivo informado:'}
                    </span>
                    {noteText ? (
                      <span
                        className={`font-bold px-2 py-0.5 rounded border truncate ${
                          noteText.startsWith('Discurso fora')
                            ? 'bg-blue-100 text-blue-900 border-blue-300'
                            : noteText.startsWith('Acompanhando orador')
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : 'bg-white/80 text-slate-800 border-slate-200'
                        }`}
                      >
                        {noteText.startsWith('Discurso fora')
                          ? '🎤 '
                          : noteText.startsWith('Acompanhando orador')
                          ? '🚗 '
                          : ''}
                        {noteText}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">
                        Nenhum motivo anotado
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onToggleNote}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 ml-2 cursor-pointer flex-shrink-0"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>{noteText ? 'Alterar' : '+ Adicionar Motivo'}</span>
                  </button>
                </div>

                {/* Atalhos rápidos de 1 toque direto no card quando ausente */}
                {currentStatus === 'ausente' && !noteText && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-[11px] text-slate-500 font-medium">Toque rápido:</span>
                    {isElderOrServant ? (
                      <button
                        type="button"
                        onClick={() => onSaveNote('Discurso fora')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs shadow-2xs transition-all cursor-pointer active:scale-95"
                        title="Registrar ausência por estar dando discurso público fora"
                      >
                        <span>🎤 Discurso fora</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSaveNote('Acompanhando orador em discurso fora')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs shadow-2xs transition-all cursor-pointer active:scale-95"
                        title="Registrar ausência por acompanhar orador em discurso fora"
                      >
                        <span>🚗 Acompanhando orador fora</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onSaveNote('Enfermo / Doente')}
                      className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-medium rounded-md transition-colors cursor-pointer"
                    >
                      Enfermo
                    </button>
                    <button
                      type="button"
                      onClick={() => onSaveNote('Trabalho / Plantão')}
                      className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-medium rounded-md transition-colors cursor-pointer"
                    >
                      Trabalho
                    </button>
                    <button
                      type="button"
                      onClick={() => onSaveNote('Viagem')}
                      className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-medium rounded-md transition-colors cursor-pointer"
                    >
                      Viagem
                    </button>
                  </div>
                )}

                {/* Se for Ancião/Servo com Discurso fora e tiver família, opção rápida para marcar família toda */}
                {currentStatus === 'ausente' &&
                  isElderOrServant &&
                  noteText &&
                  noteText.includes('Discurso fora') &&
                  publisher.familyName &&
                  familyMembersCount &&
                  familyMembersCount > 1 &&
                  onMarkFamily && (
                    <div className="pt-1 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onMarkFamily('ausente')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold rounded-lg text-[11px] shadow-2xs transition-all cursor-pointer active:scale-95"
                        title="Marcar todos os membros da família como ausentes com o motivo 'Acompanhando orador em discurso fora'"
                      >
                        <span>👨‍👩‍👧‍👦 Marcar família ({familyMembersCount}) acompanhando orador</span>
                      </button>
                    </div>
                  )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
