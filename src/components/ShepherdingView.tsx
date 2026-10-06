import React, { useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  Edit2,
  HeartHandshake,
  Lock,
  MessageCircle,
  Phone,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { AbsenceStreakInfo, Meeting, Publisher, ShepherdingVisit } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { FraternalCareModal } from './FraternalCareModal';

interface ShepherdingViewProps {
  absenceStreaks: AbsenceStreakInfo[];
  shepherdingVisits: ShepherdingVisit[];
  publishers: Publisher[];
  onSaveVisit: (visit: ShepherdingVisit) => void;
  onDeleteVisit: (visitId: string) => void;
  congregationName?: string;
}

export const ShepherdingView: React.FC<ShepherdingViewProps> = ({
  absenceStreaks,
  shepherdingVisits,
  publishers,
  onSaveVisit,
  onDeleteVisit,
  congregationName = 'Congregação Central',
}) => {
  const [filterStatus, setFilterStatus] = useState<'all' | 'planejada' | 'realizada'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVisit, setEditingVisit] = useState<ShepherdingVisit | null>(null);
  const [visitToDelete, setVisitToDelete] = useState<ShepherdingVisit | null>(null);

  // Estado para a Central de Apoio Fraternal
  const [isCareModalOpen, setIsCareModalOpen] = useState(false);
  const [selectedStreakPubId, setSelectedStreakPubId] = useState<string | null>(null);

  // Form State
  const [publisherId, setPublisherId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [eldersInvolved, setEldersInvolved] = useState('');
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'planejada' | 'realizada'>('planejada');

  const handleOpenAddModal = (targetPublisherId?: string) => {
    setEditingVisit(null);
    setPublisherId(targetPublisherId || (publishers.length > 0 ? publishers[0].id : ''));
    setDate(new Date().toISOString().slice(0, 10));
    setEldersInvolved('');
    setPurpose('Encorajamento espiritual e apoio fraternal');
    setNotes('');
    setStatus('planejada');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (visit: ShepherdingVisit) => {
    setEditingVisit(visit);
    setPublisherId(visit.publisherId);
    setDate(visit.date);
    setEldersInvolved(visit.eldersInvolved);
    setPurpose(visit.purpose);
    setNotes(visit.notes);
    setStatus(visit.status);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!publisherId || !date || !eldersInvolved.trim()) return;

    const visitToSave: ShepherdingVisit = {
      id: editingVisit ? editingVisit.id : `visit-${Date.now()}`,
      publisherId,
      date,
      eldersInvolved: eldersInvolved.trim(),
      purpose: purpose.trim(),
      notes: notes.trim(),
      status,
    };

    onSaveVisit(visitToSave);
    setIsModalOpen(false);
  };

  const filteredVisits = shepherdingVisits
    .filter((v) => filterStatus === 'all' || v.status === filterStatus)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const getPublisherById = (id: string) => publishers.find((p) => p.id === id);

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 py-4 space-y-5">
      
      {/* 1. CABEÇALHO COM AVISO DE CONFIDENCIALIDADE */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              Acompanhamento dos Anciãos & Pastoreio
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
              <Lock className="w-3 h-3 text-amber-600" />
              Confidencial
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Monitoramento preventivo de faltas consecutivas e registro de visitas pastorais de encorajamento.
          </p>
        </div>

        <button
          onClick={() => handleOpenAddModal()}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          Registrar Visita
        </button>
      </div>

      {/* 2. CARTÕES DE RESUMO */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        
        {/* Faltas Consecutivas */}
        <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-4 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-xs font-bold text-rose-800 uppercase tracking-wider block">
              2+ Faltas Consecutivas
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold text-rose-950 mt-1 block">
              {absenceStreaks.length} irmãos
            </span>
            <span className="text-xs text-rose-700">Necessitam de atenção pastoral</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center text-rose-700">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        {/* Visitas Realizadas */}
        <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">
              Visitas Realizadas
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold text-emerald-950 mt-1 block">
              {shepherdingVisits.filter((v) => v.status === 'realizada').length}
            </span>
            <span className="text-xs text-emerald-700">Irmãos encorajados</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
            <CheckCircle className="w-6 h-6" />
          </div>
        </div>

        {/* Visitas Planejadas */}
        <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-4 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-xs font-bold text-blue-800 uppercase tracking-wider block">
              Visitas Agendadas
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold text-blue-950 mt-1 block">
              {shepherdingVisits.filter((v) => v.status === 'planejada').length}
            </span>
            <span className="text-xs text-blue-700">Planejadas para breve</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700">
            <Clock className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* 3. SEÇÃO: ALERTAS DE PUBLICADORES COM 2+ FALTAS CONSECUTIVAS */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              Publicadores com 2 ou Mais Faltas Consecutivas
            </h2>
            <p className="text-xs text-slate-500">
              Identificados automaticamente através do histórico das reuniões recentes.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {absenceStreaks.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedStreakPubId(null);
                  setIsCareModalOpen(true);
                }}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                title="Abrir painel com mensagens de carinho prontas para WhatsApp"
              >
                <span>🛡️ Central de Apoio & WhatsApp</span>
              </button>
            )}
            <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full whitespace-nowrap">
              {absenceStreaks.length} em alerta
            </span>
          </div>
        </div>

        {absenceStreaks.length === 0 ? (
          <div className="py-6 text-center text-slate-500">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2 stroke-1" />
            <p className="font-semibold text-sm text-slate-700">Nenhum irmão com 2 ou mais faltas consecutivas</p>
            <p className="text-xs text-slate-400 mt-0.5">Excelente assistência da congregação!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {absenceStreaks.map((streak) => {
              const pub = streak.publisher;
              const hasPastVisit = shepherdingVisits.some((v) => v.publisherId === pub.id);

              return (
                <div
                  key={pub.id}
                  className="bg-slate-50/80 rounded-2xl p-4 border border-rose-200/80 shadow-xs flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm sm:text-base text-slate-900">
                            {pub.name}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800">
                            G{pub.group}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {pub.roles.map((r) => (
                            <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                              {r}
                            </span>
                          ))}
                        </div>
                      </div>

                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold bg-rose-600 text-white shadow-xs">
                        {streak.consecutiveAbsences} faltas seguidas
                      </span>
                    </div>

                    {/* Histórico das faltas recentes */}
                    <div className="mt-3 text-xs bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        Reuniões Ausente:
                      </span>
                      {streak.missedMeetings.map((m) => (
                        <div key={m.id} className="flex items-center justify-between text-slate-700 text-[11px]">
                          <span>• {m.date} ({m.type === 'midweek' ? 'Meio Sem.' : 'Fim Sem.'})</span>
                          <span className="text-slate-400 truncate max-w-[140px]">{m.titleOrTheme}</span>
                        </div>
                      ))}
                      {streak.lastAttendedMeeting && (
                        <div className="pt-1 mt-1 border-t border-slate-100 text-[11px] text-emerald-700 font-medium">
                          Última presença: {streak.lastAttendedMeeting.meeting.date} ({streak.lastAttendedMeeting.status === 'presencial' ? 'Salão' : 'Zoom'})
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Ações Rápidas */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                    <div>
                      {hasPastVisit ? (
                        <span className="text-[11px] font-semibold text-blue-700 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Visita já registrada
                        </span>
                      ) : (
                        <span className="text-[11px] text-amber-700 font-medium">
                          Sem visita registrada ainda
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStreakPubId(pub.id);
                          setIsCareModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                        title="Ver apoio fraternal e mensagens para WhatsApp"
                      >
                        <span>🛡️ Apoio</span>
                      </button>

                      {pub.phone && (
                        <a
                          href={`https://wa.me/55${pub.phone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-xs transition-colors"
                          title="Falar no WhatsApp"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                        </a>
                      )}

                      <button
                        onClick={() => handleOpenAddModal(pub.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
                      >
                        <HeartHandshake className="w-3.5 h-3.5" />
                        Registrar Visita
                      </button>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. SEÇÃO: HISTÓRICO DE VISITAS DE PASTOREIO */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <HeartHandshake className="w-4 h-4 text-blue-600" />
              Histórico de Visitas Pastorais ({filteredVisits.length})
            </h2>
            <p className="text-xs text-slate-500">
              Registros confidenciais de incentivo, oração e textos compartilhados.
            </p>
          </div>

          {/* Filtro Status */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                filterStatus === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Todas ({shepherdingVisits.length})
            </button>
            <button
              onClick={() => setFilterStatus('planejada')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                filterStatus === 'planejada' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              Planejadas ({shepherdingVisits.filter((v) => v.status === 'planejada').length})
            </button>
            <button
              onClick={() => setFilterStatus('realizada')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                filterStatus === 'realizada' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              Realizadas ({shepherdingVisits.filter((v) => v.status === 'realizada').length})
            </button>
          </div>
        </div>

        {filteredVisits.length === 0 ? (
          <div className="py-8 text-center text-slate-500">
            <HeartHandshake className="w-12 h-12 text-slate-300 mx-auto mb-2 stroke-1" />
            <p className="font-semibold text-sm text-slate-700">Nenhuma visita cadastrada neste filtro</p>
            <button
              onClick={() => handleOpenAddModal()}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5" /> Agendar Nova Visita
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredVisits.map((visit) => {
              const pub = getPublisherById(visit.publisherId);

              return (
                <div
                  key={visit.id}
                  className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm sm:text-base text-slate-900">
                            {pub ? pub.name : 'Publicador'}
                          </span>
                          {pub && (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                              Grupo {pub.group}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {visit.date}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            visit.status === 'realizada'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {visit.status === 'realizada' ? '✓ Realizada' : '⏳ Planejada'}
                        </span>

                        <button
                          onClick={() => handleOpenEditModal(visit)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Editar Visita"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => setVisitToDelete(visit)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Excluir Visita"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2.5 text-xs text-slate-700 space-y-1">
                      <div>
                        <span className="font-bold text-slate-800">Anciãos participantes:</span>{' '}
                        {visit.eldersInvolved}
                      </div>

                      {visit.purpose && (
                        <div>
                          <span className="font-bold text-slate-800">Objetivo:</span>{' '}
                          {visit.purpose}
                        </div>
                      )}

                      {visit.notes && (
                        <div className="mt-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs italic">
                          <span className="font-bold not-italic text-slate-700 block mb-0.5">
                            Notas Confidenciais:
                          </span>
                          “{visit.notes}”
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL ADICIONAR / EDITAR VISITA DE PASTOREIO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <HeartHandshake className="w-4 h-4 text-blue-400" />
                {editingVisit ? 'Editar Visita de Pastoreio' : 'Registrar Visita de Pastoreio'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold leading-none"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs sm:text-sm">
              
              {/* Selecionar Publicador */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Publicador a ser visitado:
                </label>
                <select
                  required
                  value={publisherId}
                  onChange={(e) => setPublisherId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                >
                  {publishers
                    .filter((p) => p.active)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Grupo {p.group})
                      </option>
                    ))}
                </select>
              </div>

              {/* Data e Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Data da Visita:
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Status da Visita:
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'planejada' | 'realizada')}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                  >
                    <option value="planejada">⏳ Visita Planejada / Agendada</option>
                    <option value="realizada">✓ Visita Realizada</option>
                  </select>
                </div>
              </div>

              {/* Anciãos Participantes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Anciãos Participantes:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Robson Mendes e Valdir de Souza"
                  value={eldersInvolved}
                  onChange={(e) => setEldersInvolved(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              {/* Objetivo da Visita */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Objetivo da Visita:
                </label>
                <input
                  type="text"
                  placeholder="Ex: Encorajamento devido a sobrecarga, saúde ou apoio familiar"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              {/* Notas Confidenciais */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700">
                    Notas Confidenciais de Encorajamento:
                  </label>
                  <span className="text-[11px] text-amber-700 flex items-center gap-1 font-semibold">
                    <Lock className="w-3 h-3" /> Privado dos Anciãos
                  </span>
                </div>
                <textarea
                  rows={3}
                  placeholder="Registre textos bíblicos considerados, pontos de encorajamento e desfecho da conversa..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium resize-none"
                />
              </div>

              {/* Rodapé Botões */}
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                {editingVisit ? (
                  <button
                    type="button"
                    onClick={() => {
                      setVisitToDelete(editingVisit);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-2 text-rose-600 hover:bg-rose-50 text-xs sm:text-sm font-semibold rounded-xl transition-colors"
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
                    {editingVisit ? 'Salvar Alterações' : 'Salvar Registro'}
                  </button>
                </div>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Modal de Apoio Fraternal para Sequências de Faltas */}
      <FraternalCareModal
        isOpen={isCareModalOpen}
        onClose={() => {
          setIsCareModalOpen(false);
          setSelectedStreakPubId(null);
        }}
        streaks={absenceStreaks}
        selectedPublisherId={selectedStreakPubId || undefined}
        congregationName={congregationName}
      />

      {/* Modal de Confirmação de Exclusão de Visita */}
      <ConfirmModal
        isOpen={!!visitToDelete}
        title="Excluir Visita de Pastoreio?"
        message={
          visitToDelete ? (
            <div className="space-y-1.5">
              <p>
                Tem certeza que deseja excluir o registro desta visita de pastoreio realizada para{' '}
                <strong className="text-slate-900">
                  {publishers.find((p) => p.id === visitToDelete.publisherId)?.name || 'o publicador'}
                </strong>?
              </p>
              <p className="text-xs text-slate-500">
                Data: <span className="font-medium text-slate-700">{visitToDelete.date}</span>
              </p>
            </div>
          ) : null
        }
        confirmText="Sim, Excluir Visita"
        cancelText="Cancelar"
        variant="danger"
        onConfirm={() => {
          if (visitToDelete) {
            onDeleteVisit(visitToDelete.id);
            setVisitToDelete(null);
            setIsModalOpen(false);
          }
        }}
        onCancel={() => setVisitToDelete(null)}
      />

    </div>
  );
};
