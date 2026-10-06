import React from 'react';
import {
  Check,
  CheckCircle2,
  Hand,
  Keyboard,
  MoveHorizontal,
  Sparkles,
  Tv,
  Users,
  Video,
  X,
  XCircle,
  Zap,
} from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  autoAdvance: boolean;
  onToggleAutoAdvance: (val: boolean) => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
  autoAdvance,
  onToggleAutoAdvance,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="keyboard-shortcuts-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base leading-tight flex items-center gap-1.5">
                Atalhos Rápidos & Gestos
              </h3>
              <p className="text-xs text-slate-500">
                Agilidade instantânea durante a chamada congregacional
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Fechar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo rolável */}
        <div className="p-5 space-y-5 overflow-y-auto">
          
          {/* SEÇÃO 1: GESTOS NA TELA (CELULAR & TABLET) */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 uppercase tracking-wider">
              <Hand className="w-4 h-4 text-blue-600" />
              <span>Gestos no Touch (Celular / Tablet)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Deslizar para Direita */}
              <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200 flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-2xs flex-shrink-0">
                  ➡️
                </div>
                <div>
                  <div className="text-xs font-bold text-emerald-950 flex items-center gap-1">
                    <span>Deslizar para a Direita</span>
                  </div>
                  <div className="text-[11px] text-emerald-800 font-medium mt-0.5">
                    Marca como <strong>🏛️ Presencial</strong> no Salão com vibração de confirmação.
                  </div>
                </div>
              </div>

              {/* Deslizar para Esquerda */}
              <div className="p-3 bg-rose-50/70 rounded-xl border border-rose-200 flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-rose-600 text-white flex items-center justify-center font-bold text-sm shadow-2xs flex-shrink-0">
                  ⬅️
                </div>
                <div>
                  <div className="text-xs font-bold text-rose-950 flex items-center gap-1">
                    <span>Deslizar para a Esquerda</span>
                  </div>
                  <div className="text-[11px] text-rose-800 font-medium mt-0.5">
                    Marca como <strong>✕ Ausente</strong> instantaneamente.
                  </div>
                </div>
              </div>
            </div>
            
            <p className="text-[11px] text-slate-500 italic">
              * Dica: Basta puxar o card do irmão e soltar. O botão [📹 Zoom] permanece com 1 toque no card.
            </p>
          </div>

          {/* SEÇÃO 2: ATALHOS DE TECLADO (NOTEBOOK / COMPUTADOR) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 uppercase tracking-wider">
                <Keyboard className="w-4 h-4 text-blue-600" />
                <span>Atalhos de Teclado</span>
              </div>
              <span className="text-[11px] text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                Pressione [ ? ] a qualquer momento
              </span>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100 text-xs">
              
              {/* 1 / P */}
              <div className="p-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="font-semibold text-slate-800">Marcar Presencial</span>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded font-mono font-bold text-slate-700 shadow-2xs">1</kbd>
                  <span className="text-slate-400 font-normal text-[11px]">ou</span>
                  <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded font-mono font-bold text-slate-700 shadow-2xs">P</kbd>
                </div>
              </div>

              {/* 2 / Z */}
              <div className="p-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                  <span className="font-semibold text-slate-800">Marcar Zoom</span>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded font-mono font-bold text-slate-700 shadow-2xs">2</kbd>
                  <span className="text-slate-400 font-normal text-[11px]">ou</span>
                  <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded font-mono font-bold text-slate-700 shadow-2xs">Z</kbd>
                </div>
              </div>

              {/* 3 / A */}
              <div className="p-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span className="font-semibold text-slate-800">Marcar Ausente</span>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded font-mono font-bold text-slate-700 shadow-2xs">3</kbd>
                  <span className="text-slate-400 font-normal text-[11px]">ou</span>
                  <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded font-mono font-bold text-slate-700 shadow-2xs">A</kbd>
                </div>
              </div>

              {/* Navegação */}
              <div className="p-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">↕️</span>
                  <span className="font-semibold text-slate-800">Navegar entre publicadores</span>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded font-mono font-bold text-slate-700 shadow-2xs">↑</kbd>
                  <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded font-mono font-bold text-slate-700 shadow-2xs">↓</kbd>
                  <span className="text-slate-400 font-normal text-[11px]">ou</span>
                  <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded font-mono font-bold text-slate-700 shadow-2xs">J</kbd>
                  <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded font-mono font-bold text-slate-700 shadow-2xs">K</kbd>
                </div>
              </div>

              {/* 0 / Backspace */}
              <div className="p-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">↺</span>
                  <span className="font-semibold text-slate-800">Limpar marcação (Pendente)</span>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded font-mono font-bold text-slate-700 shadow-2xs">0</kbd>
                  <span className="text-slate-400 font-normal text-[11px]">ou</span>
                  <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded font-mono font-bold text-slate-700 shadow-2xs">Backspace</kbd>
                </div>
              </div>

              {/* N / O */}
              <div className="p-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">📝</span>
                  <span className="font-semibold text-slate-800">Abrir campo de motivo / nota</span>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded font-mono font-bold text-slate-700 shadow-2xs">N</kbd>
                  <span className="text-slate-400 font-normal text-[11px]">ou</span>
                  <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded font-mono font-bold text-slate-700 shadow-2xs">O</kbd>
                </div>
              </div>

              {/* / */}
              <div className="p-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">🔍</span>
                  <span className="font-semibold text-slate-800">Focar na busca de publicadores</span>
                </div>
                <kbd className="px-2.5 py-1 bg-slate-100 border border-slate-300 rounded font-mono font-bold text-slate-700 shadow-2xs">/</kbd>
              </div>

              {/* V */}
              <div className="p-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">📱</span>
                  <div>
                    <span className="font-semibold text-slate-800 block">Modo Simplificado / Completo</span>
                    <span className="text-[10px] text-slate-400">Oculta controles extras para telas pequenas</span>
                  </div>
                </div>
                <kbd className="px-2.5 py-1 bg-slate-100 border border-slate-300 rounded font-mono font-bold text-slate-700 shadow-2xs">V</kbd>
              </div>

              {/* Esc */}
              <div className="p-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">✕</span>
                  <span className="font-semibold text-slate-800">Desfocar seleção ou fechar modal</span>
                </div>
                <kbd className="px-2.5 py-1 bg-slate-100 border border-slate-300 rounded font-mono font-bold text-slate-700 shadow-2xs">Esc</kbd>
              </div>

            </div>
          </div>

          {/* CONFIGURAÇÃO: AUTO-AVANÇO */}
          <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-blue-900 block">
                Avançar automaticamente para o próximo
              </span>
              <span className="text-[11px] text-blue-700">
                Ao pressionar 1, 2 ou 3, foca imediatamente o publicador de baixo.
              </span>
            </div>

            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(e) => onToggleAutoAdvance(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

        </div>

        {/* Rodapé */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors shadow-xs"
          >
            Entendido, começar!
          </button>
        </div>
      </div>
    </div>
  );
};
