import React from 'react';
import {
  Calendar,
  CheckCircle2,
  Cloud,
  Database,
  Download,
  FileSpreadsheet,
  HeartHandshake,
  LayoutDashboard,
  RefreshCw,
  Settings,
  ShieldCheck,
  Smartphone,
  Users,
  Wifi,
  WifiOff
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

export type ActiveTab = 'dashboard' | 'attendance' | 'meetings' | 'publishers' | 'reports' | 'shepherding';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab?: (tab: ActiveTab) => void;
  onTabChange?: (tab: ActiveTab) => void;
  congregationName: string;
  isFirebaseActive: boolean;
  onOpenSettings: () => void;
  onOpenSyncModal?: () => void;
  pendingAbsenceCount?: number;
  absenceStreakCount?: number;
  isOnline?: boolean;
  pendingQueueCount?: number;
  isSyncingQueue?: boolean;
  onManualSyncQueue?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onTabChange,
  congregationName,
  isFirebaseActive,
  onOpenSettings,
  onOpenSyncModal,
  pendingAbsenceCount,
  absenceStreakCount,
  isOnline = true,
  pendingQueueCount = 0,
  isSyncingQueue = false,
  onManualSyncQueue,
}) => {
  const handleTabClick = (tab: ActiveTab) => {
    if (setActiveTab) setActiveTab(tab);
    if (onTabChange) onTabChange(tab);
  };

  const badgeCount = pendingAbsenceCount ?? absenceStreakCount ?? 0;
  return (
    <header className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800 text-white shadow-md">
      {/* Barra superior */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2">
          
          {/* Logo e Título */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white font-bold shadow-sm flex-shrink-0">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-base sm:text-lg tracking-tight leading-none text-slate-100">
                  Frequência Congregacional
                </span>
                <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700">
                  {congregationName}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">
                Controle de Reuniões Presenciais e Zoom
              </p>
            </div>
          </div>

          {/* Status de Conexão, Fila de Pendências, Nuvem, Sincronizar Aparelhos & Configurações */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            
            {/* Indicador de Status Online / Offline */}
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                isOnline
                  ? 'bg-emerald-950/70 border-emerald-700/70 text-emerald-300'
                  : 'bg-rose-950/80 border-rose-600/80 text-rose-200 animate-pulse'
              }`}
              title={
                isOnline
                  ? 'Aparelho conectado à internet (Online)'
                  : 'Aparelho sem conexão à internet (Offline). As alterações estão sendo salvas localmente.'
              }
            >
              <span className="relative flex h-2 w-2">
                {isOnline ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                )}
              </span>
              <span className="font-bold tracking-wide">{isOnline ? 'Online' : 'Offline'}</span>
            </div>

            {/* Fila de Pendências (aparece se houver itens aguardando sincronização) */}
            {pendingQueueCount > 0 && (
              <button
                type="button"
                onClick={onManualSyncQueue}
                disabled={isSyncingQueue || !isOnline}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border shadow-xs ${
                  isSyncingQueue
                    ? 'bg-blue-900/90 border-blue-500 text-blue-200'
                    : isOnline
                    ? 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/50 text-amber-300 active:scale-95 cursor-pointer'
                    : 'bg-amber-950/60 border-amber-800/80 text-amber-400 cursor-default'
                }`}
                title={
                  isOnline
                    ? `${pendingQueueCount} alteraç${pendingQueueCount > 1 ? 'ões pendentes' : 'ão pendente'}. Clique para sincronizar agora.`
                    : `${pendingQueueCount} alteraç${pendingQueueCount > 1 ? 'ões' : 'ão'} na fila local. Serão sincronizadas automaticamente quando a conexão voltar.`
                }
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    isSyncingQueue ? 'animate-spin text-blue-300' : 'text-amber-400'
                  }`}
                />
                <span>
                  {isSyncingQueue
                    ? 'Sincronizando...'
                    : `${pendingQueueCount} pendente${pendingQueueCount > 1 ? 's' : ''}`}
                </span>
              </button>
            )}

            {/* Botão de Instalar Aplicativo (PWA) */}
            <PWAInstallButton variant="navbar" className="hidden sm:inline-flex" />

            {onOpenSyncModal && (
              <button
                type="button"
                onClick={onOpenSyncModal}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600/90 hover:bg-blue-600 text-white transition-all shadow-xs border border-blue-500/50 active:scale-95"
                title="Sintonizar e conectar outros aparelhos"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sintonizar Aparelhos</span>
              </button>
            )}

            <button
              onClick={onOpenSettings}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                isFirebaseActive
                  ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/60'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
              title="Configurações de Sincronização e Backup"
            >
              <Cloud className={`w-3.5 h-3.5 ${isFirebaseActive ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span className="hidden md:inline">
                {isFirebaseActive ? 'Nuvem Conectada' : 'Nuvem / Backup'}
              </span>
            </button>

            <button
              onClick={onOpenSettings}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Opções de Backup e Sistema"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Abas de Navegação (Mobile scrollable, Desktop flex) */}
        <div className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto pb-2 scrollbar-none text-xs sm:text-sm font-medium">
          <button
            onClick={() => handleTabClick('dashboard')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'dashboard'
                ? 'bg-primary text-white shadow-sm font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => handleTabClick('attendance')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'attendance'
                ? 'bg-primary text-white shadow-sm font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Chamada da Reunião</span>
          </button>

          <button
            onClick={() => handleTabClick('meetings')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'meetings'
                ? 'bg-primary text-white shadow-sm font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Reuniões & Datas</span>
          </button>

          <button
            onClick={() => handleTabClick('publishers')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'publishers'
                ? 'bg-primary text-white shadow-sm font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Publicadores (Grupos 1-6)</span>
          </button>

          <button
            onClick={() => handleTabClick('reports')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'reports'
                ? 'bg-primary text-white shadow-sm font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Relatórios & Médias</span>
          </button>

          <button
            onClick={() => handleTabClick('shepherding')}
            className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'shepherding'
                ? 'bg-primary text-white shadow-sm font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Pastoreio & Faltas</span>
            {badgeCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold leading-none bg-rose-500 text-white rounded-full">
                {badgeCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
