import React, { useState } from 'react';
import {
  Calendar,
  Check,
  CheckCheck,
  ChevronRight,
  Clock,
  Copy,
  Info,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { AttendanceStatus, Meeting } from '../types';

interface CopyPreviousAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeMeeting: Meeting;
  allMeetings: Meeting[];
  attendance: Record<string, Record<string, AttendanceStatus>>;
  onApplyAttendance: (
    sourceMeetingId: string,
    options: {
      onlyPresent: boolean;
      preserveExistingMarks: boolean;
    }
  ) => void;
}

export const CopyPreviousAttendanceModal: React.FC<CopyPreviousAttendanceModalProps> = ({
  isOpen,
  onClose,
  activeMeeting,
  allMeetings = [],
  attendance = {},
  onApplyAttendance,
}) => {
  if (!isOpen || !activeMeeting) return null;

  // Encontra reuniões anteriores que possuem registros de chamada
  const candidateMeetings = allMeetings
    .filter((m) => {
      if (m.id === activeMeeting.id) return false;
      const att = attendance[m.id];
      return att && Object.keys(att).length > 0;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  // Candidata ideal: mesma modalidade (fim de semana ou meio de semana)
  const sameTypeCandidate = candidateMeetings.find((m) => m.type === activeMeeting.type);

  // Primeira candidata mais recente caso não haja do mesmo tipo
  const defaultSelectedMeetingId =
    sameTypeCandidate?.id || (candidateMeetings.length > 0 ? candidateMeetings[0].id : '');

  const [selectedSourceId, setSelectedSourceId] = useState<string>(defaultSelectedMeetingId);
  const [onlyPresent, setOnlyPresent] = useState<boolean>(false);
  const [preserveExistingMarks, setPreserveExistingMarks] = useState<boolean>(true);

  const selectedSource = candidateMeetings.find((m) => m.id === selectedSourceId);

  // Estatísticas da reunião fonte selecionada
  const sourceStats = (() => {
    if (!selectedSource) return { presencial: 0, zoom: 0, ausente: 0, total: 0 };
    const att = attendance[selectedSource.id] || {};
    let p = 0;
    let z = 0;
    let a = 0;
    Object.values(att).forEach((status) => {
      if (status === 'presencial') p++;
      else if (status === 'zoom') z++;
      else if (status === 'ausente') a++;
    });
    return { presencial: p, zoom: z, ausente: a, total: p + z };
  })();

  const handleConfirm = () => {
    if (!selectedSourceId) return;
    onApplyAttendance(selectedSourceId, {
      onlyPresent,
      preserveExistingMarks,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 max-h-[92vh]">
        {/* Cabeçalho */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center text-white shrink-0 shadow-inner">
              <Copy className="w-6 h-6 text-blue-100" />
            </div>
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-200">
                Histórico Inteligente
              </span>
              <h3 className="text-base sm:text-lg font-black text-white leading-tight">
                Copiar Assistência Anterior
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white rounded-xl transition-colors hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo com rolagem se necessário */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Informações da Reunião de Destino (Atual) */}
          <div className="p-3 bg-blue-50/80 border border-blue-200/90 rounded-2xl flex items-center gap-2.5 text-xs">
            <span className="text-lg">🎯</span>
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-bold text-blue-900 uppercase">
                Reunião de Destino (Hoje):
              </span>
              <p className="font-bold text-slate-800 truncate">
                {activeMeeting.date} ({activeMeeting.dayOfWeek}) • {activeMeeting.titleOrTheme}
              </p>
            </div>
          </div>

          {candidateMeetings.length === 0 ? (
            <div className="p-6 text-center text-slate-500 bg-slate-50 rounded-2xl border border-slate-200">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="font-bold text-slate-700 text-sm">Nenhuma reunião anterior encontrada</p>
              <p className="text-xs text-slate-500 mt-1">
                Ainda não há registros de chamadas em reuniões passadas para copiar.
              </p>
            </div>
          ) : (
            <>
              {/* Seleção da Reunião Fonte */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Escolha a reunião base para copiar:
                </label>
                <div className="space-y-2">
                  {candidateMeetings.slice(0, 4).map((meeting) => {
                    const isSelected = selectedSourceId === meeting.id;
                    const isSameType = meeting.type === activeMeeting.type;
                    const att = attendance[meeting.id] || {};
                    let p = 0;
                    let z = 0;
                    Object.values(att).forEach((s) => {
                      if (s === 'presencial') p++;
                      if (s === 'zoom') z++;
                    });

                    return (
                      <button
                        key={meeting.id}
                        type="button"
                        onClick={() => setSelectedSourceId(meeting.id)}
                        className={`w-full text-left p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-blue-50/90 border-blue-500 shadow-xs ring-2 ring-blue-400/40'
                            : 'bg-white hover:bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                              isSelected
                                ? 'border-blue-600 bg-blue-600'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-xs sm:text-sm text-slate-900">
                                {meeting.date} ({meeting.dayOfWeek})
                              </span>
                              {isSameType && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200">
                                  Mesmo dia (Recomendado)
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              {meeting.titleOrTheme}
                            </p>
                          </div>
                        </div>

                        {/* Estatística rápida */}
                        <div className="flex items-center gap-1.5 text-[11px] font-bold shrink-0">
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            🏛️ {p}
                          </span>
                          <span className="text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                            📹 {z}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Resumo da Reunião Selecionada */}
              {selectedSource && (
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/90 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                      <span>Registros a serem importados:</span>
                    </span>
                    <strong className="text-slate-900">{sourceStats.total} presentes</strong>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2">
                      <span className="block text-emerald-700 font-extrabold">Presencial</span>
                      <strong className="text-base text-emerald-900 font-black">
                        {sourceStats.presencial}
                      </strong>
                    </div>
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-2">
                      <span className="block text-purple-700 font-extrabold">Zoom</span>
                      <strong className="text-base text-purple-900 font-black">
                        {sourceStats.zoom}
                      </strong>
                    </div>
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-2">
                      <span className="block text-rose-700 font-extrabold">Ausentes</span>
                      <strong className="text-base text-rose-900 font-black">
                        {sourceStats.ausente}
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Opções de Cópia */}
              <div className="space-y-2 pt-1">
                <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={preserveExistingMarks}
                    onChange={(e) => setPreserveExistingMarks(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800">
                      Preservar marcações já feitas hoje
                    </span>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Não altera irmãos que você já marcou nesta reunião hoje.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={onlyPresent}
                    onChange={(e) => setOnlyPresent(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800">
                      Copiar apenas presentes (Presencial e Zoom)
                    </span>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Deixa os ausentes em branco (Pendentes) para conferência ao vivo.
                    </p>
                  </div>
                </label>
              </div>

              {/* Dica de agilidade */}
              <div className="flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed bg-amber-50/70 p-2.5 rounded-xl border border-amber-200/80">
                <span className="text-amber-600 font-bold shrink-0">💡 Dica de Agilidade:</span>
                <span>
                  Após carregar a assistência anterior com 1 toque, use o <strong>Modo Foco (Pendentes)</strong> para ajustar rapidamente apenas as exceções e faltas do dia!
                </span>
              </div>
            </>
          )}
        </div>

        {/* Rodapé com botões de ação */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          {candidateMeetings.length > 0 && (
            <button
              type="button"
              disabled={!selectedSourceId}
              onClick={handleConfirm}
              className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <CheckCheck className="w-4 h-4 text-blue-100" />
              <span>Carregar e Preencher Chamada</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
