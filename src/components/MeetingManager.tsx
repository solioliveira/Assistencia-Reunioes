import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle,
  Clock,
  Edit2,
  FileSpreadsheet,
  History,
  Plus,
  RotateCcw,
  Share2,
  Trash2,
  Tv,
  Users,
} from 'lucide-react';
import { AttendanceCounts, AttendanceStatus, Meeting, MeetingType } from '../types';
import { ConfirmModal } from './ConfirmModal';

interface MeetingManagerProps {
  meetings: Meeting[];
  attendance: Record<string, Record<string, AttendanceStatus>>;
  onSelectMeetingForAttendance: (meeting: Meeting) => void;
  onOpenReport: (meeting: Meeting) => void;
  onSaveMeeting: (meeting: Meeting) => void;
  onDeleteMeeting: (meetingId: string) => void;
  onRestoreTuesdaySaturday?: () => void;
  onOpenBackupHistory?: () => void;
}

export const MeetingManager: React.FC<MeetingManagerProps> = ({
  meetings,
  attendance,
  onSelectMeetingForAttendance,
  onOpenReport,
  onSaveMeeting,
  onDeleteMeeting,
  onRestoreTuesdaySaturday,
  onOpenBackupHistory,
}) => {
  const [filterType, setFilterType] = useState<'all' | MeetingType>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [meetingToDelete, setMeetingToDelete] = useState<Meeting | null>(null);

  // Form State
  const [formData, setFormData] = useState<{
    type: MeetingType;
    date: string;
    dayOfWeek: string;
    titleOrTheme: string;
    observations: string;
  }>({
    type: 'midweek',
    date: new Date().toISOString().slice(0, 10),
    dayOfWeek: getPortugueseDayOfWeek(new Date().toISOString().slice(0, 10)),
    titleOrTheme: 'Nossa Vida e Ministério Cristão',
    observations: '',
  });

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

  const handleOpenAddModal = (defaultType: MeetingType = 'midweek') => {
    const today = new Date().toISOString().slice(0, 10);
    setEditingMeeting(null);
    setFormData({
      type: defaultType,
      date: today,
      dayOfWeek: getPortugueseDayOfWeek(today),
      titleOrTheme:
        defaultType === 'midweek'
          ? 'Nossa Vida e Ministério Cristão'
          : 'Discurso Público e Estudo de A Sentinela',
      observations: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (meeting: Meeting) => {
    setEditingMeeting(meeting);
    setFormData({
      type: meeting.type,
      date: meeting.date,
      dayOfWeek: meeting.dayOfWeek,
      titleOrTheme: meeting.titleOrTheme,
      observations: meeting.observations || '',
    });
    setIsModalOpen(true);
  };

  const handleDateChange = (newDate: string) => {
    const day = getPortugueseDayOfWeek(newDate);
    setFormData((prev) => ({
      ...prev,
      date: newDate,
      dayOfWeek: day,
    }));
  };

  const handleTypeChange = (newType: MeetingType) => {
    setFormData((prev) => ({
      ...prev,
      type: newType,
      titleOrTheme:
        newType === 'midweek'
          ? 'Nossa Vida e Ministério Cristão'
          : 'Discurso Público e Estudo de A Sentinela',
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.titleOrTheme.trim() || !formData.date) return;

    const meetingToSave: Meeting = {
      id: editingMeeting ? editingMeeting.id : `meet-${Date.now()}`,
      type: formData.type,
      date: formData.date,
      dayOfWeek: formData.dayOfWeek,
      titleOrTheme: formData.titleOrTheme.trim(),
      observations: formData.observations.trim(),
      createdAt: editingMeeting ? editingMeeting.createdAt : new Date().toISOString(),
    };

    onSaveMeeting(meetingToSave);
    setIsModalOpen(false);
  };

  // Filtrar e ordenar por data decrescente
  const filteredMeetings = meetings
    .filter((m) => filterType === 'all' || m.type === filterType)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Calcular métricas rápidas de uma reunião
  const getMeetingAttendanceSummary = (meetingId: string) => {
    const att = attendance[meetingId] || {};
    let presencial = 0;
    let zoom = 0;
    let ausente = 0;

    Object.values(att).forEach((st) => {
      if (st === 'presencial') presencial++;
      else if (st === 'zoom') zoom++;
      else if (st === 'ausente') ausente++;
    });

    return {
      presencial,
      zoom,
      ausente,
      totalGeral: presencial + zoom,
      hasRecords: Object.keys(att).length > 0,
    };
  };

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 py-4 space-y-4">
      
      {/* Cabeçalho de Reuniões & Botão Criar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            Estrutura de Reuniões & Calendário
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Gerencie as reuniões do Meio de Semana e Fim de Semana da congregação.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onRestoreTuesdaySaturday && (
            <button
              onClick={onRestoreTuesdaySaturday}
              title="Restaura reuniões e chamadas de Terça-feira e Sábado passado"
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-semibold transition-colors shadow-xs"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
              Restaurar Terça & Sábado
            </button>
          )}

          {onOpenBackupHistory && (
            <button
              onClick={onOpenBackupHistory}
              title="Abrir histórico de versões e pontos de restauração"
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
            >
              <History className="w-3.5 h-3.5 text-slate-500" />
              Histórico / Backups
            </button>
          )}

          <button
            onClick={() => handleOpenAddModal('midweek')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl text-xs font-bold transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            + Meio de Semana
          </button>

          <button
            onClick={() => handleOpenAddModal('weekend')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs shadow-emerald-600/20"
          >
            <Plus className="w-4 h-4" />
            + Fim de Semana
          </button>
        </div>
      </div>

      {/* Filtros de Tipo */}
      <div className="flex items-center gap-2 text-xs font-semibold">
        <button
          onClick={() => setFilterType('all')}
          className={`px-3 py-1.5 rounded-xl border transition-all ${
            filterType === 'all'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          Todas ({meetings.length})
        </button>
        <button
          onClick={() => setFilterType('midweek')}
          className={`px-3 py-1.5 rounded-xl border transition-all ${
            filterType === 'midweek'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          Meio de Semana ("Nossa Vida e Ministério Cristão")
        </button>
        <button
          onClick={() => setFilterType('weekend')}
          className={`px-3 py-1.5 rounded-xl border transition-all ${
            filterType === 'weekend'
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          Fim de Semana ("Discurso Público e A Sentinela")
        </button>
      </div>

      {/* Lista de Reuniões */}
      <div className="space-y-3">
        {filteredMeetings.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-slate-200">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-700 font-semibold text-sm">Nenhuma reunião cadastrada neste filtro</p>
            <button
              onClick={() => handleOpenAddModal('midweek')}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5" /> Agendar Primeira Reunião
            </button>
          </div>
        ) : (
          filteredMeetings.map((meeting) => {
            const summary = getMeetingAttendanceSummary(meeting.id);

            return (
              <div
                key={meeting.id}
                className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Detalhes da Reunião */}
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                        meeting.type === 'midweek'
                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}
                    >
                      {meeting.type === 'midweek'
                        ? '1. Meio de Semana'
                        : '2. Fim de Semana'}
                    </span>

                    <span className="text-xs font-semibold text-slate-700 flex items-center gap-1 bg-slate-100 px-2.5 py-0.5 rounded-full">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      {meeting.date} • {meeting.dayOfWeek}
                    </span>
                  </div>

                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    {meeting.titleOrTheme}
                  </h2>

                  {meeting.observations && (
                    <p className="text-xs text-slate-500 italic bg-slate-50 p-2 rounded-lg border border-slate-100">
                      “{meeting.observations}”
                    </p>
                  )}
                </div>

                {/* Resumo de Frequência & Botões de Ação */}
                <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row items-stretch sm:items-center gap-3 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                  
                  {/* Badges de Contagem */}
                  <div className="flex items-center gap-2 text-xs font-bold bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <div className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-center" title="Presencial">
                      🏛️ {summary.presencial}
                    </div>
                    <div className="px-2 py-1 bg-purple-100 text-purple-800 rounded-lg text-center" title="Zoom">
                      📹 {summary.zoom}
                    </div>
                    <div className="px-2 py-1 bg-blue-900 text-white rounded-lg text-center" title="Assistência Geral (Salão + Zoom)">
                      👥 {summary.totalGeral} Geral
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onSelectMeetingForAttendance(meeting)}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
                      title="Realizar / Editar Chamada"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Fazer Chamada
                    </button>

                    <button
                      onClick={() => onOpenReport(meeting)}
                      className="p-2 text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded-xl transition-colors"
                      title="Ver Relatório Formatado"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleOpenEditModal(meeting)}
                      className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
                      title="Editar dados da Reunião"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => setMeetingToDelete(meeting)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                      title="Excluir Reunião"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                </div>

              </div>
            );
          })
        )}
      </div>

      {/* Modal Adicionar / Editar Reunião */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-400" />
                {editingMeeting ? 'Editar Reunião' : 'Agendar Nova Reunião'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold leading-none"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs sm:text-sm">
              
              {/* Tipo de Reunião */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Tipo de Reunião congregacional:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleTypeChange('midweek')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      formData.type === 'midweek'
                        ? 'border-blue-600 bg-blue-50/80 text-blue-900 ring-2 ring-blue-500/20 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-bold">1. Meio de Semana</div>
                    <div className="text-[11px] text-slate-500 font-normal">Nossa Vida e Ministério Cristão</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTypeChange('weekend')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      formData.type === 'weekend'
                        ? 'border-emerald-600 bg-emerald-50/80 text-emerald-900 ring-2 ring-emerald-500/20 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-bold">2. Fim de Semana</div>
                    <div className="text-[11px] text-slate-500 font-normal">Discurso Público & A Sentinela</div>
                  </button>
                </div>
              </div>

              {/* Data e Dia da Semana */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Data da Reunião:
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Dia da Semana:
                  </label>
                  <input
                    type="text"
                    value={formData.dayOfWeek}
                    onChange={(e) => setFormData({ ...formData, dayOfWeek: e.target.value })}
                    placeholder="Ex: Quarta-feira"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                </div>
              </div>

              {/* Tema / Título */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Tema da Reunião (Opcional):
                </label>
                <input
                  type="text"
                  required
                  value={formData.titleOrTheme}
                  onChange={(e) => setFormData({ ...formData, titleOrTheme: e.target.value })}
                  placeholder="Ex: Nossa Vida e Ministério Cristão ou Discurso Público"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              {/* Observações Gerais */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Observações Gerais (Opcional):
                </label>
                <textarea
                  rows={2}
                  value={formData.observations}
                  onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                  placeholder="Notas sobre visitas, discursos especiais ou avisos..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium resize-none"
                />
              </div>

              {/* Rodapé Botões */}
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                {editingMeeting ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMeetingToDelete(editingMeeting);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-rose-600 hover:bg-rose-50 text-xs sm:text-sm font-semibold rounded-xl transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Excluir
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm transition-colors"
                  >
                    {editingMeeting ? 'Salvar Alterações' : 'Criar Reunião'}
                  </button>
                </div>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão de Reunião */}
      <ConfirmModal
        isOpen={!!meetingToDelete}
        title="Excluir Reunião?"
        message={
          meetingToDelete ? (
            <div className="space-y-1.5">
              <p>
                Tem certeza que deseja excluir a reunião de{' '}
                <strong className="text-slate-900">{meetingToDelete.date}</strong> ({meetingToDelete.dayOfWeek})?
              </p>
              <p className="text-xs text-slate-500">
                Tema: <span className="font-medium text-slate-700">{meetingToDelete.titleOrTheme}</span>
              </p>
              <p className="text-xs text-rose-600 font-semibold mt-1">
                ⚠️ As presenças e notas registradas nesta reunião também serão removidas.
              </p>
            </div>
          ) : null
        }
        confirmText="Sim, Excluir Reunião"
        cancelText="Cancelar"
        variant="danger"
        onConfirm={() => {
          if (meetingToDelete) {
            onDeleteMeeting(meetingToDelete.id);
            setMeetingToDelete(null);
            setIsModalOpen(false);
          }
        }}
        onCancel={() => setMeetingToDelete(null)}
      />

    </div>
  );
};
