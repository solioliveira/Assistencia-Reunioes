import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle,
  Cloud,
  Copy,
  Download,
  ExternalLink,
  Laptop,
  Lock,
  MessageCircle,
  QrCode,
  RefreshCw,
  Share2,
  ShieldCheck,
  Smartphone,
  Upload,
  Wifi,
  X,
} from 'lucide-react';
import {
  encodeFirebaseConfigToLink,
  getStoredFirebaseConfig,
  initFirebaseService,
  saveFirebaseConfig,
} from '../services/firebase';
import { exportDatabaseToJson, importDatabaseFromJson } from '../services/storage';
import { getDeviceInfo, updateDeviceName } from '../services/device';
import { PWAInstallButton } from './PWAInstallButton';
import { CongregationDatabase, FirebaseConnectionConfig } from '../types';

interface SyncDevicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  database: CongregationDatabase;
  onDatabaseUpdated: (newDb: CongregationDatabase) => void;
  isFirebaseActive: boolean;
  isServerConnected?: boolean;
  connectedDevicesCount?: number;
  onFirebaseStatusChanged: (active: boolean) => void;
  onOpenFullSettings: () => void;
}

export const SyncDevicesModal: React.FC<SyncDevicesModalProps> = ({
  isOpen,
  onClose,
  database,
  onDatabaseUpdated,
  isFirebaseActive,
  isServerConnected = true,
  connectedDevicesCount = 1,
  onFirebaseStatusChanged,
  onOpenFullSettings,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [deviceInfo, setDeviceInfo] = useState(() => getDeviceInfo());
  const [deviceNameInput, setDeviceNameInput] = useState(deviceInfo.deviceName);
  const [savedDeviceSuccess, setSavedDeviceSuccess] = useState(false);

  const handleSaveDeviceName = (e: React.FormEvent) => {
    e.preventDefault();
    if (deviceNameInput.trim()) {
      const updated = updateDeviceName(deviceNameInput.trim());
      setDeviceInfo(updated);
      setSavedDeviceSuccess(true);
      setTimeout(() => setSavedDeviceSuccess(false), 2500);
    }
  };

  const storedConfig = getStoredFirebaseConfig();

  if (!isOpen) return null;

  const getShareableAppUrl = () => {
    if (storedConfig && storedConfig.apiKey && storedConfig.projectId) {
      return encodeFirebaseConfigToLink(storedConfig);
    }
    if (typeof window !== 'undefined') {
      return window.location.href.split('#')[0];
    }
    return '';
  };

  const handleCopySyncLink = () => {
    const link = getShareableAppUrl();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).then(() => {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 3000);
      }).catch(() => {
        prompt('Copie o link do aplicativo:', link);
      });
    } else {
      prompt('Copie o link do aplicativo:', link);
    }
  };

  const handleOpenWhatsApp = () => {
    const link = getShareableAppUrl();
    const text = `Irmão, aqui está o link do aplicativo de chamada da nossa congregação:\n${link}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleCopyPairingCode = () => {
    if (!storedConfig || !storedConfig.apiKey || !storedConfig.projectId) {
      handleCopySyncLink();
      return;
    }
    const pairingCode = btoa(JSON.stringify(storedConfig));
    navigator.clipboard.writeText(pairingCode).then(() => {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 3000);
    }).catch(() => {
      prompt('Copie o código de sincronização:', pairingCode);
    });
  };

  const handleExportBackup = () => {
    exportDatabaseToJson(database);
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus(null);
    setImportError(null);

    try {
      const imported = await importDatabaseFromJson(file);
      onDatabaseUpdated(imported);
      setImportStatus('Sincronização por arquivo concluída com sucesso!');
      setTimeout(() => setImportStatus(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setImportError(msg);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        
        {/* Cabeçalho */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <Share2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Sincronizar Vários Aparelhos
              </h2>
              <p className="text-xs text-slate-400">
                Como manter celulares, tablets e computadores sintonizados
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo com rolagem */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs sm:text-sm">

          {/* Banner de Status da Sincronização Atual */}
          <div
            className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isServerConnected || isFirebaseActive
                ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
                : 'bg-amber-50/80 border-amber-300 text-amber-950'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  isServerConnected || isFirebaseActive
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-amber-500 text-white shadow-xs'
                }`}
              >
                {isServerConnected || isFirebaseActive ? <Wifi className="w-5 h-5" /> : <Cloud className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm sm:text-base">
                    {isServerConnected || isFirebaseActive
                      ? 'Sincronização em Tempo Real Ativa'
                      : 'Modo Offline (Aguardando conexão)'}
                  </span>
                  {connectedDevicesCount > 1 && (
                    <span className="bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full text-xs font-bold">
                      {connectedDevicesCount} aparelhos conectados
                    </span>
                  )}
                </div>
                <p className="text-xs mt-0.5 opacity-90">
                  Qualquer chamada marcada neste aparelho atualiza instantaneamente nos outros celulares e tablets que abrirem o aplicativo.
                </p>
              </div>
            </div>

            {!isFirebaseActive && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFullSettings();
                }}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs transition-all border border-slate-300 flex items-center justify-center gap-1.5 flex-shrink-0"
              >
                <Cloud className="w-4 h-4 text-blue-600" />
                <span>Nuvem Firebase (Opcional)</span>
              </button>
            )}
          </div>

          {/* APRESENTAÇÃO DOS RECURSOS DE DINAMISMO */}
          {/* RECURSO A: IDENTIFICAÇÃO DESTE APARELHO */}
          <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Laptop className="w-4 h-4 text-blue-600" />
                <span>Identificação deste Aparelho na Congregação</span>
              </div>
              <span className="text-[11px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                ID: {deviceInfo.deviceId.slice(0, 10)}...
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Dê um nome para este aparelho (ex: <em>"Tablet Indicador Salão"</em> ou <em>"Celular do Irmão Silva"</em>). Esse nome aparecerá para os outros irmãos quando você registrar ou atualizar a chamada.
            </p>

            <form onSubmit={handleSaveDeviceName} className="flex flex-col sm:flex-row gap-2 pt-1">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={deviceNameInput}
                  onChange={(e) => setDeviceNameInput(e.target.value)}
                  placeholder="Nome deste dispositivo"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold rounded-xl text-xs transition-all shadow-xs flex items-center justify-center gap-1.5"
              >
                {savedDeviceSuccess ? <Check className="w-4 h-4 text-emerald-300" /> : <Check className="w-4 h-4" />}
                <span>{savedDeviceSuccess ? 'Nome Salvo!' : 'Salvar Nome'}</span>
              </button>
            </form>
          </div>

          {/* RECURSO B: INSTALAR APLICATIVO (PWA) */}
          <div className="p-4 sm:p-5 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/70 to-indigo-50/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-950 font-bold text-sm">
                <Smartphone className="w-4 h-4 text-blue-600" />
                <span>Instalar Aplicativo nos Aparelhos (PWA)</span>
              </div>
              <span className="text-[11px] font-semibold text-blue-800 bg-blue-100/90 px-2 py-0.5 rounded-full border border-blue-200">
                Sem Loja de Apps
              </span>
            </div>
            <p className="text-xs text-blue-900 leading-relaxed">
              Você e os outros indicadores podem instalar o app diretamente na tela inicial do celular ou tablet. Funciona rápido, em tela cheia e mesmo com sinal fraco.
            </p>
            <div className="pt-1">
              <PWAInstallButton variant="card" />
            </div>
          </div>

          {/* RECURSO 1: LINK DE SINCRONIZAÇÃO RÁPIDA (PARA O OUTRO CELULAR) */}
          <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Smartphone className="w-4 h-4 text-blue-600" />
              <span>1. Compartilhar com Outro Celular em 1 Toque</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Envie o link do aplicativo para os outros irmãos e indicadores. Ao abrir o link no celular deles, o aplicativo <strong>conecta e sincroniza tudo automaticamente</strong> em tempo real!
            </p>

            <div className="space-y-2 pt-1">
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={handleCopySyncLink}
                  className="flex-1 p-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 text-xs sm:text-sm"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-emerald-300" /> : <Share2 className="w-4 h-4" />}
                  <span>{copiedLink ? 'Link Copiado para Área de Transferência!' : 'Copiar Link do Aplicativo'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenWhatsApp}
                  className="p-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-xs"
                  title="Enviar link diretamente pelo WhatsApp"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Enviar pelo WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyPairingCode}
                  className="p-3 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-xs"
                  title="Copiar link alternativo"
                >
                  {copiedKey ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedKey ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>

              <div className="p-2.5 rounded-xl bg-blue-50/80 border border-blue-200 text-blue-900 text-xs flex items-start gap-2">
                <MessageCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Dica prática:</strong> Clique em <strong>"Enviar pelo WhatsApp"</strong> para mandar diretamente na conversa do irmão encarregado ou do grupo de indicadores. Ele só precisa clicar no link para abrir o app conectado à congregação.
                </span>
              </div>
            </div>
          </div>

          {/* RECURSO 2: AVISO INTELIGENTE DE REUNIÃO JÁ MARCADA */}
          <div className="bg-emerald-50/70 p-4 sm:p-5 rounded-2xl border border-emerald-200/90 space-y-2.5">
            <div className="flex items-center gap-2 text-emerald-950 font-bold text-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>2. Proteção Anti-Conflito ("Essa reunião já foi realizada")</span>
            </div>
            <p className="text-xs text-emerald-900 leading-relaxed">
              O sistema possui detecção inteligente: quando um irmão <strong>já marcou a chamada daquele dia</strong> e outra pessoa em outro celular tentar marcar ou abrir os botões, o aplicativo exibe o alerta:
            </p>
            <div className="p-3 bg-white rounded-xl border border-emerald-200 text-xs font-semibold text-amber-900 flex items-center gap-2.5 shadow-2xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>"Essa reunião já foi realizada. Deseja atualizar a chamada?"</span>
            </div>
            <p className="text-[11px] text-emerald-800">
              Isso impede alterações indesejadas e garante que ninguém sobrescreva por engano a chamada que já foi feita no Salão ou no Zoom.
            </p>
          </div>

          {/* RECURSO 3: FILA INTELIGENTE DE SINCRONIZAÇÃO OFFLINE */}
          <div className="bg-sky-50/70 p-4 sm:p-5 rounded-2xl border border-sky-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sky-950 font-bold text-sm">
                <RefreshCw className="w-4 h-4 text-sky-600" />
                <span>3. Fila de Sincronização Offline Automática</span>
              </div>
              <span className="text-[11px] font-semibold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full border border-sky-200">
                100% Automático
              </span>
            </div>
            <p className="text-xs text-sky-900 leading-relaxed">
              Se a internet do celular oscilar ou cair no Salão do Reino, <strong>não se preocupe!</strong> Todas as presenças que você marcar offline são gravadas numa fila segura local.
            </p>
            <div className="p-2.5 rounded-xl bg-white border border-sky-200 text-sky-900 text-xs flex items-center gap-2">
              <Wifi className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>
                Assim que você se reconectar ao Wi-Fi ou dados móveis, a fila é enviada e sincronizada instantaneamente para a congregação.
              </span>
            </div>
          </div>

          {/* RECURSO 4: SINCRONIZAÇÃO OFFLINE VIA ARQUIVO DE BACKUP */}
          <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Download className="w-4 h-4 text-purple-600" />
                <span>4. Sincronização Manual (Arquivo Backup JSON)</span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">Sem internet</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Se preferir não usar internet, você pode exportar um arquivo com todos os dados da congregação neste aparelho e enviá-lo para abrir no outro aparelho:
            </p>

            {importStatus && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                {importStatus}
              </div>
            )}

            {importError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                {importError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={handleExportBackup}
                className="p-3 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-left flex items-center gap-3 transition-colors shadow-2xs"
              >
                <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center flex-shrink-0">
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-800 text-xs">Exportar Dados (.json)</div>
                  <div className="text-[11px] text-slate-500">Salva arquivo no aparelho atual</div>
                </div>
              </button>

              <label className="p-3 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-left flex items-center gap-3 transition-colors shadow-2xs cursor-pointer">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-800 text-xs">Importar no Outro Aparelho</div>
                  <div className="text-[11px] text-slate-500">Selecionar arquivo salvo</div>
                </div>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileImport}
                  className="hidden"
                />
              </label>
            </div>
          </div>

        </div>

        {/* Rodapé */}
        <div className="px-5 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenFullSettings();
            }}
            className="text-xs text-blue-600 hover:text-blue-800 font-bold transition-colors"
          >
            Abrir Configurações Gerais
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs sm:text-sm transition-colors"
          >
            Entendido / Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
