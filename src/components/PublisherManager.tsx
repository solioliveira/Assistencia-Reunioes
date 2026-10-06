import React, { useState } from 'react';
import {
  Check,
  Edit2,
  Filter,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Tag,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { ALL_ROLES, CONGREGATION_GROUPS, Publisher, PublisherRole } from '../types';
import { ConfirmModal } from './ConfirmModal';

interface PublisherManagerProps {
  publishers: Publisher[];
  onSavePublisher: (publisher: Publisher) => void;
  onDeletePublisher: (publisherId: string) => void;
}

export const PublisherManager: React.FC<PublisherManagerProps> = ({
  publishers,
  onSavePublisher,
  onDeletePublisher,
}) => {
  const [selectedGroup, setSelectedGroup] = useState<number | 'all'>('all');
  const [selectedFamilyFilter, setSelectedFamilyFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPublisher, setEditingPublisher] = useState<Publisher | null>(null);
  const [publisherToDelete, setPublisherToDelete] = useState<Publisher | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [group, setGroup] = useState<number>(1);
  const [familyName, setFamilyName] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<PublisherRole[]>(['Publicador Batizado']);
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(true);

  // Lista de famílias existentes para autocompletar e filtrar
  const availableFamilies = React.useMemo(() => {
    const familyCounts = new Map<string, number>();
    publishers.forEach((p) => {
      const fam = p.familyName?.trim();
      if (fam) {
        familyCounts.set(fam, (familyCounts.get(fam) || 0) + 1);
      }
    });
    return Array.from(familyCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [publishers]);

  const handleOpenAddModal = (defaultGroup: number = 1) => {
    setEditingPublisher(null);
    setName('');
    setGroup(selectedGroup === 'all' ? defaultGroup : selectedGroup);
    setFamilyName(selectedFamilyFilter !== 'all' ? selectedFamilyFilter : '');
    setSelectedRoles(['Publicador Batizado']);
    setPhone('');
    setNotes('');
    setActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (pub: Publisher) => {
    setEditingPublisher(pub);
    setName(pub.name);
    setGroup(pub.group);
    setFamilyName(pub.familyName || '');
    setSelectedRoles([...pub.roles]);
    setPhone(pub.phone || '');
    setNotes(pub.notes || '');
    setActive(pub.active);
    setIsModalOpen(true);
  };

  const toggleRole = (role: PublisherRole) => {
    if (selectedRoles.includes(role)) {
      // Não remove se for a única tag para garantir ao menos uma
      if (selectedRoles.length > 1) {
        setSelectedRoles(selectedRoles.filter((r) => r !== role));
      }
    } else {
      // Regras de bom senso para congregação:
      // Se selecionou "Publicador Não Batizado", remove "Batizado", "Ancião", "Servo"
      if (role === 'Publicador Não Batizado') {
        setSelectedRoles(['Publicador Não Batizado']);
      } else {
        const withoutNonBaptized = selectedRoles.filter((r) => r !== 'Publicador Não Batizado');
        setSelectedRoles([...withoutNonBaptized, role]);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const pubToSave: Publisher = {
      id: editingPublisher ? editingPublisher.id : `pub-${Date.now()}`,
      name: name.trim(),
      group: Number(group),
      familyName: familyName.trim() || undefined,
      roles: selectedRoles.length > 0 ? selectedRoles : ['Publicador Batizado'],
      phone: phone.trim() || undefined,
      notes: notes.trim() || undefined,
      active,
    };

    onSavePublisher(pubToSave);
    setIsModalOpen(false);
  };

  // Filtragem dos publicadores
  const filteredPublishers = publishers.filter((pub) => {
    if (selectedGroup !== 'all' && pub.group !== selectedGroup) return false;
    if (selectedFamilyFilter !== 'all' && pub.familyName !== selectedFamilyFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = pub.name.toLowerCase().includes(q);
      const matchFamily = pub.familyName ? pub.familyName.toLowerCase().includes(q) : false;
      const matchRole = pub.roles.some((r) => r.toLowerCase().includes(q));
      const matchPhone = pub.phone ? pub.phone.includes(q) : false;
      if (!matchName && !matchFamily && !matchRole && !matchPhone) return false;
    }
    return true;
  });

  const getRoleBadgeStyle = (role: PublisherRole) => {
    switch (role) {
      case 'Ancião':
        return 'bg-blue-100 text-blue-800 border-blue-200 font-bold';
      case 'Servo Ministerial':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200 font-bold';
      case 'Pioneiro Regular':
        return 'bg-amber-100 text-amber-900 border-amber-300 font-extrabold';
      case 'Pioneiro Auxiliar':
        return 'bg-orange-100 text-orange-800 border-orange-200 font-semibold';
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
      
      {/* Topo: Título & Botão Adicionar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Gestão de Publicadores ({publishers.length} irmãos)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Organização pelos 6 Grupos de Serviço de Campo com suporte a múltiplas funções por irmão.
          </p>
        </div>

        <button
          onClick={() => handleOpenAddModal(selectedGroup === 'all' ? 1 : selectedGroup)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          + Novo Publicador
        </button>
      </div>

      {/* Filtro por Grupos 1 a 6 */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200 shadow-sm space-y-3">
        
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-blue-600" /> Filtrar por Grupo de Serviço:
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Mostrando {filteredPublishers.length} de {publishers.length}
            </span>
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
              Todos ({publishers.length})
            </button>

            {[1, 2, 3, 4, 5, 6].map((grpNum) => {
              const grpInfo = CONGREGATION_GROUPS.find((g) => g.number === grpNum);
              const count = publishers.filter((p) => p.group === grpNum).length;
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
                  <span className="text-[11px] opacity-80 font-normal">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Banner de Liderança do Grupo */}
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
                  {filteredPublishers.length} publicadores
                </span>
              </div>
            );
          })()}
        </div>

        {/* Busca por Nome, Telefone, Função ou Família */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Pesquisar por nome, família, telefone ou função (ex: Família Silva, Ancião)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white font-medium"
            />
          </div>

          {availableFamilies.length > 0 && (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shrink-0">
              <span className="text-xs font-semibold text-slate-500">👨‍👩‍👧‍👦 Família:</span>
              <select
                value={selectedFamilyFilter}
                onChange={(e) => setSelectedFamilyFilter(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="all">Todas as Famílias ({publishers.length})</option>
                {availableFamilies.map((fam) => (
                  <option key={fam.name} value={fam.name}>
                    {fam.name} ({fam.count})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

      </div>

      {/* Lista em Cards / Grid de Publicadores */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredPublishers.map((pub) => {
          return (
            <div
              key={pub.id}
              className={`bg-white rounded-2xl p-4 border transition-all flex flex-col justify-between shadow-xs hover:border-slate-300 ${
                !pub.active ? 'opacity-60 bg-slate-50' : ''
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-sm sm:text-base text-slate-900 leading-tight">
                      {pub.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        {CONGREGATION_GROUPS.find((g) => g.number === pub.group)?.label || `Grupo ${pub.group}`}
                      </span>
                      {pub.familyName && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                          <span>👨‍👩‍👧‍👦</span>
                          <span>{pub.familyName}</span>
                        </span>
                      )}
                      {!pub.active && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                          Inativo
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ações de Edição e Exclusão */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEditModal(pub)}
                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                      title="Editar Publicador"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setPublisherToDelete(pub)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Excluir Publicador"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Tags de Funções (Múltiplas funções selecionadas) */}
                <div className="flex flex-wrap gap-1 mt-2.5">
                  {pub.roles.map((role) => (
                    <span
                      key={role}
                      className={`px-2 py-0.5 rounded text-[11px] border ${getRoleBadgeStyle(
                        role
                      )}`}
                    >
                      {role}
                    </span>
                  ))}
                </div>

                {pub.notes && (
                  <p className="text-xs text-slate-500 mt-2 italic bg-slate-50 p-2 rounded-lg border border-slate-100">
                    {pub.notes}
                  </p>
                )}
              </div>

              {/* Contato Telefone / WhatsApp */}
              {pub.phone && (
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3 text-slate-400" />
                    {pub.phone}
                  </span>
                  <a
                    href={`https://wa.me/55${pub.phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                  >
                    <MessageCircle className="w-3 h-3 text-emerald-600" />
                    WhatsApp
                  </a>
                </div>
              )}

            </div>
          );
        })}
      </div>

      {/* Modal Adicionar / Editar Publicador */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                {editingPublisher ? 'Editar Publicador' : 'Adicionar Novo Publicador'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold leading-none"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs sm:text-sm">
              
              {/* Nome Completo */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nome Completo do Irmão / Irmã:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Carlos Alberto Ferreira"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              {/* Família / Residência (Para marcação agrupada) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700">
                    👨‍👩‍👧‍👦 Família / Residência (Opcional):
                  </label>
                  <span className="text-[11px] text-slate-500">
                    Permite marcar todos juntos com 1 clique
                  </span>
                </div>
                <input
                  type="text"
                  list="family-suggestions"
                  placeholder="Ex: Família Carvalho, Família Maioto..."
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
                <datalist id="family-suggestions">
                  {availableFamilies.map((fam) => (
                    <option key={fam.name} value={fam.name} />
                  ))}
                </datalist>
                {availableFamilies.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <span className="text-[10px] text-slate-400 self-center">Sugestões:</span>
                    {availableFamilies.slice(0, 5).map((fam) => (
                      <button
                        key={fam.name}
                        type="button"
                        onClick={() => setFamilyName(fam.name)}
                        className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                          familyName === fam.name
                            ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
                            : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {fam.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Grupo de Serviço */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Grupo de Serviço de Campo (1 a 6):
                </label>
                <div className="grid grid-cols-6 gap-1.5">
                  {[1, 2, 3, 4, 5, 6].map((grpNum) => (
                    <button
                      key={grpNum}
                      type="button"
                      onClick={() => setGroup(grpNum)}
                      className={`py-2 rounded-xl text-center font-bold border transition-all ${
                        group === grpNum
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      G{grpNum}
                    </button>
                  ))}
                </div>
              </div>

              {/* SELEÇÃO DE MÚLTIPLAS FUNÇÕES (Tags Selecionáveis) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block font-bold text-slate-700">
                    Funções e Designações (Selecione uma ou mais):
                  </label>
                  <span className="text-[11px] text-slate-500">
                    Ex: Ancião + Pioneiro Regular
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {ALL_ROLES.map((role) => {
                    const isSelected = selectedRoles.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => toggleRole(role)}
                        className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                          isSelected
                            ? 'bg-blue-50 border-blue-600 text-blue-950 font-bold ring-1 ring-blue-500/30'
                            : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                        }`}
                      >
                        <span className="text-xs">{role}</span>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Telefone */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Telefone / WhatsApp (Opcional):
                </label>
                <input
                  type="text"
                  placeholder="(11) 98765-4321"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              {/* Observações / Notas */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Observações / Designações Especiais (Opcional):
                </label>
                <input
                  type="text"
                  placeholder="Ex: Superintendente de Grupo, Cuida do Som, etc."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              {/* Ativo no Cadastro */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="activePub"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <label htmlFor="activePub" className="font-semibold text-slate-700 cursor-pointer">
                  Publicador ativo na congregação (participa das chamadas)
                </label>
              </div>

              {/* Rodapé Botões */}
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                {editingPublisher ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPublisherToDelete(editingPublisher);
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
                    {editingPublisher ? 'Salvar Alterações' : 'Cadastrar Publicador'}
                  </button>
                </div>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão de Publicador */}
      <ConfirmModal
        isOpen={!!publisherToDelete}
        title="Excluir Publicador?"
        message={
          publisherToDelete ? (
            <div className="space-y-1.5">
              <p>
                Tem certeza que deseja excluir o cadastro de{' '}
                <strong className="text-slate-900">{publisherToDelete.name}</strong>?
              </p>
              {publisherToDelete.familyName && (
                <p className="text-xs text-slate-500">
                  Família: <span className="font-medium text-slate-700">{publisherToDelete.familyName}</span>
                </p>
              )}
            </div>
          ) : null
        }
        confirmText="Sim, Excluir Publicador"
        cancelText="Cancelar"
        variant="danger"
        onConfirm={() => {
          if (publisherToDelete) {
            onDeletePublisher(publisherToDelete.id);
            setPublisherToDelete(null);
            setIsModalOpen(false);
          }
        }}
        onCancel={() => setPublisherToDelete(null)}
      />

    </div>
  );
};
