import React, { useEffect, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Database,
  Download,
  History,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { CongregationDatabase } from '../types';
import { getServerBackups, restoreServerBackup, restoreTuesdaySaturdayOnServer } from '../services/apiSync';
import { getLocalSnapshots, LocalSnapshot, restoreTuesdayAndSaturdayData, saveDatabase } from '../services/storage';
import { ConfirmModal } from './ConfirmModal';

interface BackupHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDatabase: CongregationDatabase;
  onDatabaseRestored: (db: CongregationDatabase, message: string) => void;
}

export const BackupHistoryModal: React.FC<BackupHistoryModalProps> = ({
  isOpen,
  onClose,
  currentDatabase,
  onDatabaseRestored,
}) => {
  const [localSnapshots, setLocalSnapshots] = useState<LocalSnapshot[]>([]);
  const [serverBackups, setServerBackups] = useState<Array<{ filename: string; timestamp: number; isoDate: string; size: number }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLocalSnapshots(getLocalSnapshots());
    loadServerBackups();
  }, [isOpen]);

  const loadServerBackups = async () => {
    setIsLoading(true);
    try {
      const backups = await getServerBackups();
      setServerBackups(backups);
    } catch {
      // Falha silenciosa
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleRestoreTuesdaySaturday = async () => {
    setIsLoading(true);
    try {
      // 1. Restaura localmente garantindo todas as reuniões e chamadas
      const localRestored = restoreTuesdayAndSaturdayData(currentDatabase);
      // 2. Notifica o servidor
      await restoreTuesdaySaturdayOnServer();

      onDatabaseRestored(
        localRestored,
        'As reuniões e chamadas de Terça-feira e Sábado foram restauradas com sucesso!'
      );
      setActionSuccessMessage('Reuniões e cadastros restaurados com sucesso!');
      setTimeout(() => {
        setActionSuccessMessage(null);
        onClose();
      }, 1500);
    } catch (err: any) {
      setActionSuccessMessage('❌ Erro ao restaurar: ' + (err?.message || 'Falha inesperada'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreLocalSnapshot = (snapshot: LocalSnapshot) => {
    if (!snapshot?.database) return;
    setRestoreConfirmation({
      title: 'Restaurar Ponto no Histórico?',
      message: `Deseja restaurar a versão de ${new Date(snapshot.savedAt).toLocaleString('pt-BR')}? Seus dados atuais serão atualizados para este ponto de restauração.`,
      onConfirm: () => {
        saveDatabase(snapshot.database);
        onDatabaseRestored(
          snapshot.database,
          `Restauração concluída! Versão de ${new Date(snapshot.savedAt).toLocaleTimeString('pt-BR')} aplicada.`
        );
        setRestoreConfirmation(null);
        onClose();
      },
    });
  };

  const handleRestoreServerSnapshot = (filename: string, isoDate: string) => {
    setRestoreConfirmation({
      title: 'Restaurar Backup do Servidor?',
      message: `Deseja restaurar o backup do servidor gravado em ${new Date(isoDate).toLocaleString('pt-BR')}?`,
      onConfirm: async () => {
        setIsLoading(true);
        try {
          const restored = await restoreServerBackup(filename);
          if (restored) {
            saveDatabase(restored);
            onDatabaseRestored(
              restored,
              `Backup de ${new Date(isoDate).toLocaleString('pt-BR')} restaurado do servidor com sucesso!`
            );
            setRestoreConfirmation(null);
            onClose();
          } else {
            setActionSuccessMessage('❌ Não foi possível restaurar este backup.');
          }
        } catch (err: any) {
          setActionSuccessMessage('❌ Erro ao restaurar: ' + err?.message);
        } finally {
          setIsLoading(false);
        }
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cabeçalho */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Histórico de Versões & Restauração de Dados
              </h2>
              <p className="text-xs text-slate-500">
                Recupere reuniões anteriores, chamadas ou versões salvas do sistema.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensagem de sucesso rápida */}
        {actionSuccessMessage && (
          <div className="m-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccessMessage}</span>
          </div>
        )}

        {/* Conteúdo rolável */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* AÇÃO PRINCIPAL EM DESTAQUE: Restaurar Terça e Sábado Passado */}
          <div className="bg-linear-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-xl p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white uppercase tracking-wider">
                    Recuperação Rápida
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">
                    Restaurar Reuniões de Terça e Sábado
                  </h3>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Reinsere e assegura as reuniões de <strong>Terça-feira</strong> (Nossa Vida e Ministério) e <strong>Sábado</strong> (Discurso Público e A Sentinela), recuperando todas as chamadas e notas registradas.
                </p>
              </div>
              <button
                onClick={handleRestoreTuesdaySaturday}
                disabled={isLoading}
                className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors disabled:opacity-50"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                Restaurar Terça & Sábado
              </button>
            </div>
          </div>

          {/* Lista de Snapshots Locais (Navegador) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-slate-500" />
                Snapshots Recentes Salvos Neste Aparelho ({localSnapshots.length})
              </h4>
            </div>

            {localSnapshots.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl text-xs text-slate-500">
                Nenhum snapshot local arquivado ainda. O sistema salva snapshots automáticos a cada alteração.
              </div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {localSnapshots.map((snap) => (
                  <div
                    key={snap.id}
                    className="p-3 border border-slate-200 rounded-xl hover:border-slate-300 bg-white flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-600" />
                        {new Date(snap.savedAt).toLocaleDateString('pt-BR', {
                          weekday: 'short',
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}{' '}
                        às {new Date(snap.savedAt).toLocaleTimeString('pt-BR')}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {snap.meetingCount} reuniões registradas • {snap.publisherCount} publicadores
                      </div>
                    </div>
                    <button
                      onClick={() => handleRestoreLocalSnapshot(snap)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Restaurar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Backups Automáticos do Servidor */}
          {serverBackups.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Backups Automáticos no Servidor ({serverBackups.length})
                </h4>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {serverBackups.slice(0, 8).map((b) => (
                  <div
                    key={b.filename}
                    className="p-3 border border-slate-200 rounded-xl hover:border-slate-300 bg-white flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                        {new Date(b.isoDate).toLocaleString('pt-BR')}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Tamanho: {Math.round(b.size / 1024)} KB
                      </div>
                    </div>
                    <button
                      onClick={() => handleRestoreServerSnapshot(b.filename, b.isoDate)}
                      disabled={isLoading}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-medium rounded-lg transition-colors border border-emerald-200"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Restaurar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>O sistema realiza backups automáticos contínuos para evitar qualquer perda de dados.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Confirmação de Restauração */}
      <ConfirmModal
        isOpen={!!restoreConfirmation}
        title={restoreConfirmation?.title || 'Restaurar Versão?'}
        message={restoreConfirmation?.message || ''}
        confirmText="Sim, Restaurar"
        cancelText="Cancelar"
        variant="warning"
        isLoading={isLoading}
        onConfirm={() => {
          restoreConfirmation?.onConfirm();
        }}
        onCancel={() => setRestoreConfirmation(null)}
      />
    </div>
  );
};
