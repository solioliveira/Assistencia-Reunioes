import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle,
  Cloud,
  Download,
  FileCode,
  Info,
  Key,
  Palette,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  clearStoredFirebaseConfig,
  getStoredFirebaseConfig,
  initFirebaseService,
  saveFirebaseConfig,
} from '../services/firebase';
import { exportDatabaseToJson, importDatabaseFromJson, resetDatabaseToDefault } from '../services/storage';
import {
  DEFAULT_PRIMARY_COLOR,
  THEME_COLOR_PRESETS,
  applyPrimaryColor,
  calculateThemeVariants,
  getStoredPrimaryColor,
  resetPrimaryColor,
} from '../services/theme';
import { CongregationDatabase, FirebaseConnectionConfig } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  database: CongregationDatabase;
  onDatabaseUpdated: (newDb: CongregationDatabase) => void;
  congregationName: string;
  onUpdateCongregationName: (name: string) => void;
  isFirebaseActive: boolean;
  onFirebaseStatusChanged: (active: boolean) => void;
}

export const SettingsBackupModal: React.FC<SettingsBackupModalProps> = ({
  isOpen,
  onClose,
  database,
  onDatabaseUpdated,
  congregationName,
  onUpdateCongregationName,
  isFirebaseActive,
  onFirebaseStatusChanged,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  // Nome da Congregação
  const [nameInput, setNameInput] = useState(congregationName);

  // Config do Firebase
  const storedConfig = getStoredFirebaseConfig();
  const [fbConfig, setFbConfig] = useState<FirebaseConnectionConfig>({
    apiKey: storedConfig?.apiKey || '',
    authDomain: storedConfig?.authDomain || '',
    projectId: storedConfig?.projectId || '',
    storageBucket: storedConfig?.storageBucket || '',
    messagingSenderId: storedConfig?.messagingSenderId || '',
    appId: storedConfig?.appId || '',
    firestoreDatabaseId: storedConfig?.firestoreDatabaseId || '',
  });

  const [fbError, setFbError] = useState<string | null>(null);
  const [fbSuccess, setFbSuccess] = useState<string | null>(null);

  // Personalização da Cor Primária via Variáveis CSS do Tailwind
  const [primaryColor, setPrimaryColor] = useState<string>(() => getStoredPrimaryColor());
  const [customColorInput, setCustomColorInput] = useState<string>(() => getStoredPrimaryColor());
  const [colorToast, setColorToast] = useState<string | null>(null);

  const handleSelectColor = (hex: string, name?: string) => {
    setPrimaryColor(hex);
    setCustomColorInput(hex);
    applyPrimaryColor(hex);
    const label = name ? `"${name}" (${hex.toUpperCase()})` : hex.toUpperCase();
    setColorToast(`Cor primária definida como ${label}!`);
    setTimeout(() => setColorToast(null), 3500);
  };

  const handleCustomColorInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomColorInput(val);
    if (/^#?[0-9a-fA-F]{6}$/.test(val)) {
      const formatted = val.startsWith('#') ? val : `#${val}`;
      setPrimaryColor(formatted);
      applyPrimaryColor(formatted);
      setColorToast(`Cor personalizada aplicada: ${formatted.toUpperCase()}!`);
      setTimeout(() => setColorToast(null), 3500);
    }
  };

  const handleResetColor = () => {
    const def = resetPrimaryColor();
    setPrimaryColor(def);
    setCustomColorInput(def);
    setColorToast('Cor padrão restaurada (Azul Real #2563EB)!');
    setTimeout(() => setColorToast(null), 3500);
  };

  if (!isOpen) return null;

  const handleExportJson = () => {
    exportDatabaseToJson(database);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus(null);
    setImportError(null);

    try {
      const importedDb = await importDatabaseFromJson(file);
      onDatabaseUpdated(importedDb);
      setImportStatus('Backup importado e restaurado com sucesso!');
      setTimeout(() => setImportStatus(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setImportError(msg);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveCongregationName = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    onUpdateCongregationName(nameInput.trim());
  };

  const handleConnectFirebase = (e: React.FormEvent) => {
    e.preventDefault();
    setFbError(null);
    setFbSuccess(null);

    if (!fbConfig.apiKey.trim() || !fbConfig.projectId.trim()) {
      setFbError('Por favor, informe pelo menos a API Key e o Project ID do Firebase.');
      return;
    }

    saveFirebaseConfig(fbConfig);
    const res = initFirebaseService(fbConfig);

    if (res.success) {
      onFirebaseStatusChanged(true);
      setFbSuccess('Conectado com sucesso ao Firebase Firestore! Sincronização em tempo real ativa.');
    } else {
      setFbError(`Falha ao conectar: ${res.error || 'Verifique as credenciais digitadas'}`);
      onFirebaseStatusChanged(false);
    }
  };

  const handleDisconnectFirebase = () => {
    clearStoredFirebaseConfig();
    onFirebaseStatusChanged(false);
    setFbSuccess(null);
    setFbError(null);
    setFbConfig({
      apiKey: '',
      authDomain: '',
      projectId: '',
      storageBucket: '',
      messagingSenderId: '',
      appId: '',
      firestoreDatabaseId: '',
    });
  };

  const handleResetSampleData = () => {
    setIsResetConfirmOpen(true);
  };

  const handleConfirmResetSampleData = () => {
    const defaultDb = resetDatabaseToDefault();
    onDatabaseUpdated(defaultDb);
    setIsResetConfirmOpen(false);
    setImportStatus('Dados de exemplo restaurados com sucesso.');
    setTimeout(() => setImportStatus(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] shadow-xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        
        {/* Cabeçalho */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold">Configurações, Nuvem e Backup</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo com Scroll */}
        <div className="p-5 overflow-y-auto space-y-6 text-xs sm:text-sm">
          
          {/* SEÇÃO 1: NOME DA CONGREGAÇÃO */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              🏛️ Dados da Congregação
            </h3>
            <form onSubmit={handleSaveCongregationName} className="flex gap-2">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Ex: Congregação Central"
                className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-800"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
              >
                Salvar Nome
              </button>
            </form>
          </div>

          {/* SEÇÃO 2: PERSONALIZAÇÃO DE COR PRIMÁRIA VIA VARIÁVEIS CSS DO TAILWIND */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Palette className="w-4 h-4 text-blue-600" />
                  Cor Primária do Aplicativo (Tema Tailwind)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Personalize o tom dos botões, abas ativas, ícones e destaques usando variáveis CSS do Tailwind (<code className="font-mono text-[11px] bg-slate-200 px-1 py-0.5 rounded">--primary</code> / <code className="font-mono text-[11px] bg-slate-200 px-1 py-0.5 rounded">--color-primary</code>).
                </p>
              </div>

              <button
                type="button"
                onClick={handleResetColor}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors self-start sm:self-auto cursor-pointer"
                title="Restaurar cor padrão (Azul Real)"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Restaurar Padrão</span>
              </button>
            </div>

            {colorToast && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
                <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>{colorToast}</span>
              </div>
            )}

            {/* Grade de Cores Pré-definidas */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-2">
                Paleta de Cores Recomendadas:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {THEME_COLOR_PRESETS.map((preset) => {
                  const isSelected = primaryColor.toLowerCase() === preset.hex.toLowerCase();
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectColor(preset.hex, preset.name)}
                      className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 cursor-pointer ${
                        isSelected
                          ? 'bg-white border-slate-900 shadow-xs ring-2 ring-slate-900/10'
                          : 'bg-white hover:bg-slate-100/80 border-slate-200'
                      }`}
                    >
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white flex-shrink-0 shadow-2xs"
                        style={{ backgroundColor: preset.hex }}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-800 text-xs truncate flex items-center justify-between">
                          <span>{preset.name}</span>
                          {preset.hex.toLowerCase() === DEFAULT_PRIMARY_COLOR.toLowerCase() && (
                            <span className="text-[9px] font-medium text-slate-400">Padrão</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">{preset.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Seletor Livre de Cor (Input Color + HEX) */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Seletor de Cor Livre (Qualquer Tom):
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Use o conta-gotas interativo ou digite o código hexadecimal desejado.
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex items-center">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => handleSelectColor(e.target.value)}
                      className="w-9 h-9 p-0.5 rounded-lg border border-slate-300 cursor-pointer bg-white"
                      title="Escolher cor personalizada no conta-gotas"
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-xs font-mono text-slate-400">#</span>
                    <input
                      type="text"
                      maxLength={7}
                      value={customColorInput.replace('#', '')}
                      onChange={handleCustomColorInput}
                      placeholder="2563EB"
                      className="w-24 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono uppercase font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
                      title="Digitar código hexadecimal"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Pré-visualização ao Vivo dos Elementos com a Cor Primária Escolhida */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  Demonstração em Tempo Real dos Componentes:
                </span>
                <span className="font-mono text-slate-500 font-normal">
                  HEX: {primaryColor.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                {/* Botão Primário */}
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex flex-col items-center justify-center text-center">
                  <button
                    type="button"
                    className="w-full py-1.5 px-3 rounded-lg text-xs font-bold text-white shadow-xs transition-opacity cursor-default"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Botão Primário
                  </button>
                  <span className="text-[10px] text-slate-400 mt-1">bg-primary text-white</span>
                </div>

                {/* Badge Suave / Fundo Claro */}
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex flex-col items-center justify-center text-center">
                  <div
                    className="w-full py-1 px-2.5 rounded-lg text-xs font-bold border text-center"
                    style={{
                      backgroundColor: calculateThemeVariants(primaryColor).light,
                      borderColor: calculateThemeVariants(primaryColor).border,
                      color: calculateThemeVariants(primaryColor).text,
                    }}
                  >
                    Badge de Destaque
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1">bg-primary-light / text</span>
                </div>

                {/* Aba Ativa Simulada */}
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex flex-col items-center justify-center text-center">
                  <div
                    className="w-full py-1.5 px-3 rounded-lg text-xs font-bold text-white text-center shadow-xs"
                    style={{ backgroundColor: primaryColor }}
                  >
                    ✓ Aba Selecionada
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1">Aba ativa no topo</span>
                </div>
              </div>
            </div>
          </div>

          {/* SEÇÃO 3: BACKUP EM ARQUIVO JSON (REQUISITO 6) */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Download className="w-4 h-4 text-blue-600" />
                  Backup Local Completo (Arquivo JSON)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Exporte ou importe o banco completo com publicadores, reuniões, chamadas e visitas.
                </p>
              </div>
            </div>

            {importStatus && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                {importStatus}
              </div>
            )}

            {importError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                {importError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              
              {/* Botão Exportar */}
              <button
                type="button"
                onClick={handleExportJson}
                className="p-3 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-left flex items-center gap-3 transition-colors shadow-2xs"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 flex-shrink-0">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-slate-800 text-xs sm:text-sm">Exportar Backup JSON</div>
                  <div className="text-[11px] text-slate-500">Salvar cópia de segurança no computador ou celular</div>
                </div>
              </button>

              {/* Botão Importar */}
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json,application/json"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full p-3 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-left flex items-center gap-3 transition-colors shadow-2xs"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 flex-shrink-0">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-800 text-xs sm:text-sm">Importar Backup JSON</div>
                    <div className="text-[11px] text-slate-500">Restaurar banco a partir de arquivo salvo</div>
                  </div>
                </button>
              </div>

            </div>
          </div>

          {/* SEÇÃO 3: SINCRONIZAÇÃO EM NUVEM VIA FIREBASE FIRESTORE */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Cloud className="w-4 h-4 text-blue-600" />
                  Sincronização em Nuvem (Firebase Firestore)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Permite que vários indicadores e secretários atualizem a chamada simultaneamente.
                </p>
              </div>

              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                  isFirebaseActive
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isFirebaseActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                  }`}
                />
                {isFirebaseActive ? 'Nuvem Ativa' : 'Modo Offline / Local'}
              </span>
            </div>

            {fbSuccess && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                {fbSuccess}
              </div>
            )}

            {fbError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                {fbError}
              </div>
            )}

            <form onSubmit={handleConnectFirebase} className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                    Firebase Project ID:
                  </label>
                  <input
                    type="text"
                    placeholder="ex: congregacao-central-123"
                    value={fbConfig.projectId}
                    onChange={(e) => setFbConfig({ ...fbConfig, projectId: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                    API Key:
                  </label>
                  <input
                    type="text"
                    placeholder="AIzaSy..."
                    value={fbConfig.apiKey}
                    onChange={(e) => setFbConfig({ ...fbConfig, apiKey: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                    Auth Domain (Opcional):
                  </label>
                  <input
                    type="text"
                    placeholder="ex: congregacao-central-123.firebaseapp.com"
                    value={fbConfig.authDomain}
                    onChange={(e) => setFbConfig({ ...fbConfig, authDomain: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                    App ID (Opcional):
                  </label>
                  <input
                    type="text"
                    placeholder="1:123456789:web:abcdef"
                    value={fbConfig.appId}
                    onChange={(e) => setFbConfig({ ...fbConfig, appId: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
                <div className="text-[11px] text-slate-500">
                  {isFirebaseActive ? (
                    <span className="text-emerald-700 font-semibold">
                      Sincronização bidirecional ligada.
                    </span>
                  ) : (
                    <span>Os dados ficam salvos de forma segura no navegador.</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isFirebaseActive && (
                    <button
                      type="button"
                      onClick={handleDisconnectFirebase}
                      className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                    >
                      Desconectar
                    </button>
                  )}

                  <button
                    type="submit"
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
                  >
                    Salvar e Conectar Firestore
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* SEÇÃO: APLICATIVO INSTALÁVEL (PWA) */}
          <div>
            <PWAInstallButton variant="card" />
          </div>

          {/* SEÇÃO 4: DADOS DE EXEMPLO */}
          <div className="pt-2 flex items-center justify-between text-xs text-slate-500 border-t border-slate-200">
            <span>Deseja recarregar a congregação modelo padrão?</span>
            <button
              type="button"
              onClick={handleResetSampleData}
              className="inline-flex items-center gap-1 text-slate-600 hover:text-rose-600 font-bold px-2 py-1 rounded hover:bg-rose-50 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Restaurar Dados Exemplares
            </button>
          </div>

        </div>

        {/* Rodapé */}
        <div className="px-5 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs sm:text-sm transition-colors"
          >
            Fechar
          </button>
        </div>

      </div>

      {/* Modal de Confirmação para Redefinição de Dados Exemplares */}
      <ConfirmModal
        isOpen={isResetConfirmOpen}
        title="Restaurar Dados Exemplares?"
        message="Tem certeza que deseja restaurar os dados de exemplo padrão? Todas as reuniões e chamadas atuais serão substituídas."
        confirmText="Sim, Restaurar Padrão"
        cancelText="Cancelar"
        variant="danger"
        onConfirm={handleConfirmResetSampleData}
        onCancel={() => setIsResetConfirmOpen(false)}
      />
    </div>
  );
};
