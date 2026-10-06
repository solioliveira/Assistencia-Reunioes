import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle,
  Clock,
  Heart,
  HeartHandshake,
  MessageCircle,
  Phone,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { AbsenceStreakInfo, Meeting, Publisher } from '../types';

interface FraternalCareModalProps {
  isOpen: boolean;
  onClose: () => void;
  streakInfo?: AbsenceStreakInfo | null;
  streaks?: AbsenceStreakInfo[];
  selectedPublisherId?: string;
  onSaveNote?: (publisherId: string, note: string) => void;
  currentNote?: string;
  onScheduleVisit?: (publisherId: string) => void;
  congregationName?: string;
}

export const FraternalCareModal: React.FC<FraternalCareModalProps> = ({
  isOpen,
  onClose,
  streakInfo,
  streaks,
  selectedPublisherId,
  onSaveNote,
  currentNote = '',
  onScheduleVisit,
  congregationName = 'Congregação',
}) => {
  // Se receber lista de streaks, permite selecionar
  const effectiveStreaks = streaks || (streakInfo ? [streakInfo] : []);
  const [activePubId, setActivePubId] = useState<string>(() => {
    return selectedPublisherId || (streakInfo ? streakInfo.publisher.id : (effectiveStreaks[0]?.publisher.id || ''));
  });

  // Atualiza se selectedPublisherId mudar
  React.useEffect(() => {
    if (selectedPublisherId) {
      setActivePubId(selectedPublisherId);
    } else if (effectiveStreaks.length > 0 && !activePubId) {
      setActivePubId(effectiveStreaks[0].publisher.id);
    }
  }, [selectedPublisherId, effectiveStreaks]);

  const currentStreak = effectiveStreaks.find((s) => s.publisher.id === activePubId) || streakInfo || effectiveStreaks[0];

  const [noteInput, setNoteInput] = useState(currentNote);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Atualiza campo de notas se o irmão ativo mudar
  React.useEffect(() => {
    setNoteInput(currentNote);
  }, [activePubId, currentNote]);

  if (!isOpen || !currentStreak) return null;

  const { publisher, consecutiveAbsences, missedMeetings, lastAttendedMeeting } = currentStreak;

  const handleSaveNoteClick = () => {
    if (onSaveNote) {
      setIsSavingNote(true);
      onSaveNote(publisher.id, noteInput);
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        setIsSavingNote(false);
      }, 2000);
    }
  };

  const handleSendFraternalWhatsApp = () => {
    const firstName = publisher.name.split(' ')[0];
    const text = `Olá querido(a) irmão(ã) ${firstName}! Tudo bem? Sentimos muito a sua falta na nossa reunião congregacional recente. Esperamos de coração que você e sua família estejam bem! Se estiver precisando de algum apoio, oração ou visita de encorajamento, por favor nos avise. Estamos sempre aqui por você. Um forte abraço fraterno! ❤️`;
    const cleanPhone = publisher.phone ? publisher.phone.replace(/\D/g, '') : '';
    const url = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-100 flex flex-col space-y-4">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
              <Heart className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-slate-900 flex items-center gap-2">
                <span>Alerta Amoroso de Pastoreio</span>
              </h3>
              <p className="text-xs text-slate-500">
                Acompanhamento fraterno e cuidado espiritual
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Seletor de Irmãos se houver mais de um na lista */}
        {effectiveStreaks.length > 1 && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-2.5 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700 whitespace-nowrap flex items-center gap-1.5">
              <span>👥 Selecionar Irmão:</span>
            </span>
            <select
              value={activePubId}
              onChange={(e) => setActivePubId(e.target.value)}
              className="bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 max-w-[280px] truncate cursor-pointer shadow-2xs"
            >
              {effectiveStreaks.map((s) => (
                <option key={s.publisher.id} value={s.publisher.id}>
                  {s.publisher.name} ({s.consecutiveAbsences} faltas • G{s.publisher.group})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Card do Publicador com Indicador de Faltas */}
        <div className="bg-amber-50/70 border border-amber-200/90 rounded-2xl p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-bold text-base text-slate-900">{publisher.name}</span>
              <div className="flex items-center gap-2 text-xs text-slate-600 mt-0.5">
                <span>Grupo {publisher.group}</span>
                {publisher.familyName && (
                  <span>• {publisher.familyName}</span>
                )}
                {publisher.phone && (
                  <span>• Tel: {publisher.phone}</span>
                )}
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-black bg-rose-600 text-white shadow-2xs">
              {consecutiveAbsences}ª falta seguida
            </span>
          </div>

          {lastAttendedMeeting && (
            <p className="text-[11px] text-amber-900">
              Última presença:{' '}
              <strong>
                {lastAttendedMeeting.meeting.date} ({lastAttendedMeeting.status === 'presencial' ? 'Salão' : 'Zoom'})
              </strong>
            </p>
          )}
        </div>

        {/* Histórico das Últimas Reuniões com Falta */}
        <div>
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Reuniões Consecutivas sem Presença:
          </h4>
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {missedMeetings.slice(0, 5).map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2 text-slate-700"
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-semibold">{m.date} ({m.dayOfWeek.slice(0, 3)})</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-500 truncate max-w-[180px]">
                    {m.type === 'midweek' ? 'Meio de Semana' : 'Fim de Semana'}
                  </span>
                </div>
                <span className="text-rose-600 font-bold">Ausente</span>
              </div>
            ))}
          </div>
        </div>

        {/* Registro do Motivo / Observação */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700">
            Motivo / Situação Atual do Irmão:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Ex: Em recuperação de cirurgia, cuidando de parente enfermo..."
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            {onSaveNote && (
              <button
                type="button"
                onClick={handleSaveNoteClick}
                disabled={isSavingNote}
                className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 disabled:opacity-50"
              >
                {savedSuccess ? 'Salvo!' : 'Salvar'}
              </button>
            )}
          </div>
        </div>

        {/* Botões de Ação Fraterna */}
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row gap-2">
          {publisher.phone && (
            <a
              href={`tel:${publisher.phone.replace(/\D/g, '')}`}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 rounded-xl text-xs font-bold transition-all border border-slate-200"
            >
              <Phone className="w-3.5 h-3.5 text-blue-600" />
              <span>Telefonar</span>
            </a>
          )}

          <button
            type="button"
            onClick={handleSendFraternalWhatsApp}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-emerald-600/20 cursor-pointer"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>WhatsApp Fraterno</span>
          </button>

          {onScheduleVisit && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onScheduleVisit(publisher.id);
              }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-blue-600/20 cursor-pointer"
            >
              <HeartHandshake className="w-3.5 h-3.5" />
              <span>Agendar Pastoreio</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
