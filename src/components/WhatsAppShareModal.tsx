import React, { useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Heart,
  MessageCircle,
  Phone,
  Send,
  Share2,
  Users,
  X,
} from 'lucide-react';
import { AttendanceStatus, CONGREGATION_GROUPS, Meeting, Publisher } from '../types';

interface WhatsAppShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  meeting: Meeting | null;
  publishers: Publisher[];
  attendanceMap: Record<string, AttendanceStatus>;
  notesMap: Record<string, string>;
  congregationName: string;
}

export const WhatsAppShareModal: React.FC<WhatsAppShareModalProps> = ({
  isOpen,
  onClose,
  meeting,
  publishers,
  attendanceMap,
  notesMap,
  congregationName,
}) => {
  const [copied, setCopied] = useState(false);
  const [secretaryPhone, setSecretaryPhone] = useState(() => {
    return localStorage.getItem('jw_secretary_phone') || '';
  });
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [activeTab, setActiveTab] = useState<'attendance' | 'shepherding'>('attendance');

  if (!isOpen || !meeting) return null;

  // Estatísticas da reunião
  const activePublishers = publishers.filter((p) => p.active);
  const presencialList: Publisher[] = [];
  const zoomList: Publisher[] = [];
  const ausenteList: Publisher[] = [];
  const naoMarcadosList: Publisher[] = [];

  activePublishers.forEach((p) => {
    const status = attendanceMap[p.id];
    if (status === 'presencial') presencialList.push(p);
    else if (status === 'zoom') zoomList.push(p);
    else if (status === 'ausente') ausenteList.push(p);
    else naoMarcadosList.push(p);
  });

  const totalPresentes = presencialList.length + zoomList.length;

  // Formatação de data
  const [year, month, day] = meeting.date.split('-');
  const dateFormatted = `${day}/${month}/${year}`;
  const typeLabel =
    meeting.type === 'midweek'
      ? 'Meio de Semana ("Vida e Ministério")'
      : 'Fim de Semana ("Discurso Público e A Sentinela")';

  // Mensagem Principal de Assistência
  const generateAttendanceMessage = () => {
    let msg = `📋 *ASSISTÊNCIA À REUNIÃO*\n`;
    msg += `🏛️ *Congregação:* ${congregationName}\n`;
    msg += `📅 *Data:* ${dateFormatted} (${meeting.dayOfWeek})\n`;
    msg += `📖 *Reunião:* ${typeLabel}\n`;
    if (meeting.titleOrTheme) {
      msg += `🎙️ *Tema/Tema Central:* ${meeting.titleOrTheme}\n`;
    }
    msg += `\n*─── RESUMO DA CHAMADA ───*\n`;
    msg += `🏛️ *Salão do Reino (Presencial):* ${presencialList.length}\n`;
    msg += `📹 *Zoom (Remoto):* ${zoomList.length}\n`;
    msg += `👥 *TOTAL GERAL:* ${totalPresentes} presentes\n`;
    msg += `✕ *Ausentes Registrados:* ${ausenteList.length}\n`;
    if (naoMarcadosList.length > 0) {
      msg += `⏳ *Pendentes de Marcação:* ${naoMarcadosList.length}\n`;
    }

    // Assistência por Grupo
    msg += `\n*─── ASSISTÊNCIA POR GRUPO ───*\n`;
    CONGREGATION_GROUPS.forEach((g) => {
      const gPubs = activePublishers.filter((p) => p.group === g.number);
      let gPres = 0;
      let gZoom = 0;
      let gAus = 0;
      gPubs.forEach((p) => {
        const st = attendanceMap[p.id];
        if (st === 'presencial') gPres++;
        else if (st === 'zoom') gZoom++;
        else if (st === 'ausente') gAus++;
      });
      msg += `• *Grupo ${g.number}:* ${gPres + gZoom}/${gPubs.length} (🏛️ ${gPres} | 📹 ${gZoom}${gAus > 0 ? ` | ✕ ${gAus}` : ''})\n`;
    });

    // Observações de Irmãos no Zoom
    if (zoomList.length > 0) {
      msg += `\n📹 *Conectados no Zoom (${zoomList.length}):*\n`;
      zoomList.forEach((p) => {
        const note = notesMap[p.id];
        msg += `• ${p.name}${note ? ` (_${note}_)` : ''}\n`;
      });
    }

    // Observações de Irmãos Ausentes
    if (ausenteList.length > 0) {
      msg += `\n✕ *Irmãos Ausentes (${ausenteList.length}):*\n`;
      ausenteList.forEach((p) => {
        const note = notesMap[p.id];
        msg += `• ${p.name}${note ? ` (_${note}_)` : ' _(sem motivo informado)_'}\n`;
      });
    }

    if (meeting.observations) {
      msg += `\n📝 *Observações Gerais:* ${meeting.observations}\n`;
    }

    msg += `\n_Registro de Frequência Congregacional_`;
    return msg;
  };

  // Mensagem Fraterna Amorosa de Pastoreio
  const generateFraternalMessage = () => {
    let msg = `🕊️ *MENSAGEM DE CARINHO E PASTOREIO FRATERNAL*\n\n`;
    msg += `Queridos irmãos e superintendentes de grupo,\n`;
    msg += `Na nossa reunião de hoje (${dateFormatted}), sentimos a falta dos seguintes queridos irmãos:\n\n`;

    if (ausenteList.length === 0) {
      msg += `🎉 *Que alegria! Não houve nenhuma falta registrada hoje.*\n`;
    } else {
      ausenteList.forEach((p) => {
        const note = notesMap[p.id];
        msg += `• *${p.name}* (Grupo ${p.group})${note ? ` - Motivo: ${note}` : ' - _Favor verificar se necessita de apoio_'}\n`;
      });
      msg += `\n_“Alegrai-vos com os que se alegram; chorai com os que choram.” — Romanos 12:15_\n`;
      msg += `Vamos entrar em contato amoroso para demonstrar nosso apoio e carinho cristão! ❤️`;
    }
    return msg;
  };

  const currentMessage =
    activeTab === 'attendance' ? generateAttendanceMessage() : generateFraternalMessage();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // fallback
    }
  };

  const handleOpenWhatsApp = () => {
    const encoded = encodeURIComponent(currentMessage);
    const cleanPhone = secretaryPhone.replace(/\D/g, '');
    const url = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(url, '_blank');
  };

  const handleSavePhone = () => {
    localStorage.setItem('jw_secretary_phone', secretaryPhone.trim());
    setIsEditingPhone(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-slate-100 flex flex-col max-h-[92vh]">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-sm">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-slate-900">
                Enviar Resumo no WhatsApp
              </h3>
              <p className="text-xs text-slate-500">
                {dateFormatted} • {typeLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas do Tipo de Mensagem */}
        <div className="flex items-center gap-2 mt-4 bg-slate-100 p-1 rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveTab('attendance')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'attendance'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-emerald-600" />
            <span>Assistência Geral</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('shepherding')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'shepherding'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Heart className="w-3.5 h-3.5 text-rose-500" />
            <span>Mensagem Fraterna (Pastoreio)</span>
          </button>
        </div>

        {/* Número do Secretário / Destinatário Salvo */}
        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-2xl p-2.5 sm:p-3 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
            {isEditingPhone ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="tel"
                  placeholder="Ex: 5511999998888 (com DDI e DDD)"
                  value={secretaryPhone}
                  onChange={(e) => setSecretaryPhone(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs w-full focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={handleSavePhone}
                  className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 cursor-pointer shrink-0"
                >
                  Salvar
                </button>
              </div>
            ) : (
              <div className="truncate">
                <span className="text-slate-500 font-medium">Destinatário preferencial: </span>
                <span className="font-bold text-slate-800">
                  {secretaryPhone ? secretaryPhone : 'Nenhum salvo (abrirá seletor de contatos)'}
                </span>
              </div>
            )}
          </div>
          {!isEditingPhone && (
            <button
              type="button"
              onClick={() => setIsEditingPhone(true)}
              className="text-blue-600 hover:text-blue-800 font-bold hover:underline shrink-0 cursor-pointer"
            >
              {secretaryPhone ? 'Alterar' : 'Configurar Número'}
            </button>
          )}
        </div>

        {/* Prévia da Mensagem Formatada */}
        <div className="mt-3 flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1 px-1">
            <span className="font-semibold">Prévia da mensagem pronta:</span>
            <span>{currentMessage.length} caracteres</span>
          </div>
          <div className="bg-slate-900 text-slate-100 font-mono text-[11px] sm:text-xs p-3.5 rounded-2xl overflow-y-auto max-h-60 sm:max-h-72 whitespace-pre-wrap leading-relaxed select-all border border-slate-800 shadow-inner">
            {currentMessage}
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 mt-4 pt-3 border-t border-slate-100">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Formatado com emojis e negritos para WhatsApp</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 rounded-2xl text-xs font-bold transition-all cursor-pointer border border-slate-200"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700 font-bold">Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-600" />
                  <span>Copiar Mensagem</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-2xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Abrir no WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
