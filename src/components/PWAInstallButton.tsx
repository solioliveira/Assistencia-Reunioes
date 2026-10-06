import React, { useState } from 'react';
import { Download, Smartphone, Share, PlusSquare, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'navbar' | 'card' | 'badge';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'navbar',
  className = '',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Se já estiver rodando em modo aplicativo nativo (standalone), não precisa exibir o botão
  if (isInstalled) {
    return null;
  }

  // Fluxo para Android / Chrome / Edge / Desktop
  if (isInstallable) {
    if (variant === 'card') {
      return (
        <div className={`bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${className}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="text-sm font-bold">Instalar na Tela Inicial</h4>
              <p className="text-xs text-blue-100">
                Acesse mais rápido como um aplicativo nativo no celular, mesmo sem internet.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={install}
            className="px-4 py-2 bg-white text-blue-800 hover:bg-blue-50 font-bold text-xs rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 whitespace-nowrap self-start sm:self-auto cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Instalar App</span>
          </button>
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={install}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-xs transition-all cursor-pointer ${className}`}
        title="Instalar aplicativo na tela do seu aparelho"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Instalar App</span>
        <span className="sm:hidden">App</span>
      </button>
    );
  }

  // Fluxo para iPhone / iPad no Safari
  if (isIOS) {
    return (
      <>
        {variant === 'card' ? (
          <div className={`bg-slate-800 text-white rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-slate-700 ${className}`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-300 flex items-center justify-center flex-shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold">Instalar no iPhone / iPad</h4>
                <p className="text-xs text-slate-300">
                  Adicione o atalho oficial direto na tela de início do seu iOS.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowIOSGuide(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 whitespace-nowrap self-start sm:self-auto cursor-pointer"
            >
              <Share className="w-3.5 h-3.5" />
              <span>Como Instalar</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowIOSGuide(true)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition cursor-pointer ${className}`}
            title="Instalar no iPhone / iPad"
          >
            <Smartphone className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Instalar no iOS</span>
            <span className="sm:hidden">iOS</span>
          </button>
        )}

        {/* Modal Guia iOS */}
        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 text-slate-900 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-sm text-slate-900">Instalar no iPhone / iPad</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-slate-600">
                <div className="flex items-start gap-2.5 p-2.5 bg-slate-50 rounded-xl">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center flex-shrink-0 text-xs">
                    1
                  </div>
                  <p>
                    No Safari do iPhone, toque no botão <strong>Compartilhar</strong> (o ícone de quadrado com uma seta para cima <Share className="w-3 h-3 inline text-blue-600" />).
                  </p>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 bg-slate-50 rounded-xl">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center flex-shrink-0 text-xs">
                    2
                  </div>
                  <p>
                    Role a lista de opções para baixo e toque em <strong>"Adicionar à Tela de Início"</strong> (<PlusSquare className="w-3 h-3 inline text-blue-600" />).
                  </p>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 bg-slate-50 rounded-xl">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center flex-shrink-0 text-xs">
                    3
                  </div>
                  <p>
                    Toque em <strong>"Adicionar"</strong> no canto superior direito. Pronto! O app aparecerá como um ícone na sua tela inicial.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              >
                Entendi
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
