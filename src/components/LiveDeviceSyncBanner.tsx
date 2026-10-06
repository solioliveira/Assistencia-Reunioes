import React, { useEffect, useState } from 'react';
import {
  CheckCircle,
  Clock,
  Edit2,
  Laptop,
  RefreshCw,
  Smartphone,
  Tablet,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { getDeviceInfo, updateDeviceName } from '../services/device';
import { SyncMetadata } from '../types';

interface LiveDeviceSyncBannerProps {
  syncMetadata?: SyncMetadata;
  isFirebaseActive: boolean;
  isOnline: boolean;
  isLiveSyncActive?: boolean;
  connectedDevicesCount?: number;
  onRefreshData?: () => Promise<void> | void;
  isRefreshing?: boolean;
  autoPollSeconds?: number;
  isAutoPollActive?: boolean;
  onToggleAutoPoll?: () => void;
  onOpenSyncModal?: () => void;
}

export const LiveDeviceSyncBanner: React.FC<LiveDeviceSyncBannerProps> = ({
  syncMetadata,
  isFirebaseActive,
  isOnline,
  isLiveSyncActive = true,
  connectedDevicesCount = 1,
  onRefreshData,
  isRefreshing = false,
  autoPollSeconds = 15,
  isAutoPollActive = true,
  onToggleAutoPoll,
  onOpenSyncModal,
}) => {
  const [device, setDevice] = useState(() => getDeviceInfo());
  const [isEditingDeviceName, setIsEditingDeviceName] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState(device.deviceName);
  const [timeAgoText, setTimeAgoText] = useState<string>('');

  const isRealtimeActive = isOnline && (isLiveSyncActive || isFirebaseActive);

  // Atualiza tempo decorrido desde a última edição remota
  useEffect(() => {
    if (!syncMetadata?.lastEditedAt) {
      setTimeAgoText('');
      return;
    }

    const updateAgo = () => {
      try {
        const diffMs = Date.now() - new Date(syncMetadata.lastEditedAt).getTime();
        const diffSec = Math.floor(diffMs / 1000);
        if (diffSec < 5) {
          setTimeAgoText('agora mesmo');
        } else if (diffSec < 60) {
          setTimeAgoText(`há ${diffSec}s`);
        } else if (diffSec < 3600) {
          const min = Math.floor(diffSec / 60);
          setTimeAgoText(`há ${min} min`);
        } else {
          const hours = Math.floor(diffSec / 3600);
          setTimeAgoText(`há ${hours}h`);
        }
      } catch {
        setTimeAgoText('');
      }
    };

    updateAgo();
    const interval = setInterval(updateAgo, 5000);
    return () => clearInterval(interval);
  }, [syncMetadata?.lastEditedAt]);

  const handleSaveDeviceName = (e: React.FormEvent) => {
    e.preventDefault();
    if (newDeviceName.trim()) {
      const updated = updateDeviceName(newDeviceName.trim());
      setDevice(updated);
      setIsEditingDeviceName(false);
    }
  };

  const getDeviceIcon = () => {
    switch (device.deviceType) {
      case 'tablet':
        return <Tablet className="w-3.5 h-3.5 text-blue-600" />;
      case 'desktop':
        return <Laptop className="w-3.5 h-3.5 text-indigo-600" />;
      default:
        return <Smartphone className="w-3.5 h-3.5 text-blue-600" />;
    }
  };

  const isOtherDeviceEdit =
    Boolean(syncMetadata?.lastEditorDeviceId) &&
    syncMetadata?.lastEditorDeviceId !== device.deviceId;

  return (
    <div
      id="live-device-sync-banner"
      className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:px-4 sm:py-3 shadow-xs space-y-2 text-xs"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        
        {/* Lado Esquerdo: Identificação do Aparelho Atual */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg border border-slate-200/70 font-medium text-slate-800">
            {getDeviceIcon()}
            <span className="text-slate-500 font-normal">Este aparelho:</span>
            
            {isEditingDeviceName ? (
              <form onSubmit={handleSaveDeviceName} className="inline-flex items-center gap-1">
                <input
                  type="text"
                  value={newDeviceName}
                  onChange={(e) => setNewDeviceName(e.target.value)}
                  className="bg-white border border-blue-400 rounded px-1.5 py-0.5 text-xs font-bold text-slate-900 focus:outline-none w-32"
                  autoFocus
                />
                <button
                  type="submit"
                  className="px-1.5 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold"
                >
                  OK
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingDeviceName(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs px-0.5"
                >
                  ✕
                </button>
              </form>
            ) : (
              <span className="font-bold text-slate-900 flex items-center gap-1">
                {device.deviceName}
                <button
                  type="button"
                  onClick={() => {
                    setNewDeviceName(device.deviceName);
                    setIsEditingDeviceName(true);
                  }}
                  className="text-slate-400 hover:text-blue-600 p-0.5 rounded transition-colors"
                  title="Renomear este aparelho (ex: Tablet Indicador, Celular Irmão Silva)"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>

          {/* Status de Sincronização em Tempo Real */}
          <div className="flex items-center gap-1.5">
            {isRealtimeActive ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-semibold text-[11px]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>Tempo Real Ativo</span>
                {connectedDevicesCount > 1 && (
                  <span className="bg-emerald-200/80 text-emerald-900 px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                    {connectedDevicesCount} aparelhos
                  </span>
                )}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px]">
                {!isOnline ? 'Offline' : 'Reconectando...'}
              </span>
            )}

            {/* Auto-polling status */}
            {isOnline && (
              <button
                type="button"
                onClick={onToggleAutoPoll}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium transition-colors ${
                  isAutoPollActive
                    ? 'bg-blue-50/80 text-blue-700 border-blue-200 hover:bg-blue-100'
                    : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                }`}
                title="Alternar auto-atualização periódica em segundo plano"
              >
                <Clock className="w-3 h-3 text-blue-600" />
                <span>Auto-sinc {autoPollSeconds}s</span>
              </button>
            )}
          </div>
        </div>

        {/* Lado Direito: Ações rápidas */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {onRefreshData && (
            <button
              type="button"
              onClick={async () => {
                await onRefreshData();
              }}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium text-xs transition-colors border border-slate-200 active:scale-95 disabled:opacity-50"
              title="Sincronizar dados agora"
            >
              <RefreshCw className={`w-3 h-3 text-blue-600 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Atualizando...' : 'Verificar Agora'}</span>
            </button>
          )}

          {onOpenSyncModal && (
            <button
              type="button"
              onClick={onOpenSyncModal}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-semibold text-xs transition-colors border border-blue-200"
            >
              <span>Conectar Outros</span>
            </button>
          )}
        </div>
      </div>

      {/* Alerta Destacado Quando Outro Aparelho Fez Atualização Recente */}
      {isOtherDeviceEdit && syncMetadata && (
        <div className="flex items-center justify-between p-2.5 bg-blue-50/90 border border-blue-200 rounded-xl text-blue-950 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
              <RefreshCw className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-bold text-xs text-blue-900">
                {syncMetadata.lastEditorDeviceName || 'Outro aparelho'}
              </span>{' '}
              <span className="text-blue-800 text-xs">
                atualizou a chamada congregacional {timeAgoText ? `(${timeAgoText})` : ''}.
              </span>
            </div>
          </div>
          {onRefreshData && (
            <button
              type="button"
              onClick={() => onRefreshData()}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold rounded-lg text-xs transition-all shadow-2xs flex-shrink-0"
            >
              Recarregar
            </button>
          )}
        </div>
      )}
    </div>
  );
};
