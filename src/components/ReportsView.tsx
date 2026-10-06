import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Calendar,
  CheckCheck,
  ChevronDown,
  Copy,
  Download,
  FileSpreadsheet,
  Layers,
  MessageSquare,
  Printer,
  Share2,
  TrendingUp,
  Tv,
  Users,
} from 'lucide-react';
import {
  AttendanceStatus,
  CONGREGATION_GROUPS,
  CongregationDatabase,
  Meeting,
  Publisher,
} from '../types';
import { S88ReportForm } from './S88ReportForm';

interface ReportsViewProps {
  meetings: Meeting[];
  publishers: Publisher[];
  attendance: Record<string, Record<string, AttendanceStatus>>;
  attendanceNotes?: Record<string, Record<string, string>>;
  selectedMeetingId?: string;
  congregationName: string;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  meetings,
  publishers,
  attendance,
  attendanceNotes = {},
  selectedMeetingId,
  congregationName,
}) => {
  const [reportTab, setReportTab] = useState<'daily' | 'monthly' | 's88'>('daily');
  const [activeMeetingId, setActiveMeetingId] = useState<string>(
    selectedMeetingId || (meetings.length > 0 ? meetings[0].id : '')
  );
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Ordenar reuniões
  const sortedMeetings = useMemo(() => {
    return [...meetings].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [meetings]);

  // Reunião selecionada para o relatório diário
  const currentMeeting = useMemo(() => {
    return meetings.find((m) => m.id === activeMeetingId) || sortedMeetings[0] || null;
  }, [meetings, activeMeetingId, sortedMeetings]);

  // Observações registradas para a reunião ativa (motivos de Zoom ou Falta)
  const currentMeetingNotes = useMemo(() => {
    if (!currentMeeting || !attendanceNotes) return {};
    return attendanceNotes[currentMeeting.id] || {};
  }, [currentMeeting, attendanceNotes]);

  // Dados da chamada da reunião ativa
  const meetingAttendanceMap = useMemo(() => {
    if (!currentMeeting) return {};
    return attendance[currentMeeting.id] || {};
  }, [currentMeeting, attendance]);

  // Detalhamento dos publicadores da reunião ativa
  const dailyBreakdown = useMemo(() => {
    const presencialList: Publisher[] = [];
    const zoomList: Publisher[] = [];
    const ausenteList: Publisher[] = [];
    const naoMarcadosList: Publisher[] = [];

    const activePubs = publishers.filter((p) => p.active);

    activePubs.forEach((pub) => {
      const st = meetingAttendanceMap[pub.id];
      if (st === 'presencial') presencialList.push(pub);
      else if (st === 'zoom') zoomList.push(pub);
      else if (st === 'ausente') ausenteList.push(pub);
      else naoMarcadosList.push(pub);
    });

    return {
      presencial: presencialList,
      zoom: zoomList,
      ausente: ausenteList,
      naoMarcados: naoMarcadosList,
      totalGeral: presencialList.length + zoomList.length,
      totalAtivos: activePubs.length,
    };
  }, [publishers, meetingAttendanceMap]);

  // Agrupamento por Grupo de Serviço na reunião ativa
  const groupStats = useMemo(() => {
    const stats: Record<
      number,
      { group: number; presencial: number; zoom: number; ausente: number; total: number }
    > = {};

    for (let i = 1; i <= 6; i++) {
      stats[i] = { group: i, presencial: 0, zoom: 0, ausente: 0, total: 0 };
    }

    publishers
      .filter((p) => p.active)
      .forEach((pub) => {
        const grp = pub.group || 1;
        if (!stats[grp]) stats[grp] = { group: grp, presencial: 0, zoom: 0, ausente: 0, total: 0 };
        stats[grp].total++;

        const st = meetingAttendanceMap[pub.id];
        if (st === 'presencial') stats[grp].presencial++;
        else if (st === 'zoom') stats[grp].zoom++;
        else if (st === 'ausente') stats[grp].ausente++;
      });

    return Object.values(stats);
  }, [publishers, meetingAttendanceMap]);

  // Mensagem formatada para WhatsApp
  const generateWhatsAppMessage = () => {
    if (!currentMeeting) return '';

    const dateFormatted = currentMeeting.date.split('-').reverse().join('/');
    const typeLabel =
      currentMeeting.type === 'midweek'
        ? 'Meio de Semana ("Nossa Vida e Ministério Cristão")'
        : 'Fim de Semana ("Discurso Público e A Sentinela")';

    let text = `📊 *RELATÓRIO DE ASSISTÊNCIA DA REUNIÃO*\n`;
    text += `🏛️ *Congregação:* ${congregationName}\n`;
    text += `📅 *Data:* ${dateFormatted} (${currentMeeting.dayOfWeek})\n`;
    text += `📖 *Reunião:* ${typeLabel}\n`;
    text += `🎙️ *Tema:* ${currentMeeting.titleOrTheme}\n`;
    text += `\n*─── ASSISTÊNCIA GERAL ───*\n`;
    text += `🏛️ *Salão do Reino (Presencial):* ${dailyBreakdown.presencial.length}\n`;
    text += `📹 *Zoom (Remoto):* ${dailyBreakdown.zoom.length}\n`;
    text += `👥 *ASSISTÊNCIA TOTAL:* ${dailyBreakdown.totalGeral} presentes\n`;
    text += `✕ *Ausentes:* ${dailyBreakdown.ausente.length}\n`;

    text += `\n*─── DETALHE POR GRUPOS ───*\n`;
    groupStats.forEach((g) => {
      const grpInfo = CONGREGATION_GROUPS.find((info) => info.number === g.group);
      const grpLabel = grpInfo ? grpInfo.label : `Grupo ${g.group}`;
      text += `• *${grpLabel}:* ${g.presencial + g.zoom}/${g.total} presentes (🏛️ ${g.presencial} | 📹 ${g.zoom} | ✕ ${g.ausente})\n`;
    });

    if (dailyBreakdown.zoom.length > 0) {
      const zoomList = dailyBreakdown.zoom.map((p) => {
        const note = currentMeetingNotes[p.id];
        return note ? `${p.name} (_${note}_)` : p.name;
      });
      text += `\n📹 *Irmãos no Zoom:* ${zoomList.join(', ')}\n`;
    }

    if (dailyBreakdown.ausente.length > 0) {
      const ausenteList = dailyBreakdown.ausente.map((p) => {
        const note = currentMeetingNotes[p.id];
        return note ? `${p.name} (_${note}_)` : p.name;
      });
      text += `\n✕ *Ausentes na Reunião:* ${ausenteList.join(', ')}\n`;
    }

    if (currentMeeting.observations) {
      text += `\n📝 *Observações:* ${currentMeeting.observations}\n`;
    }

    text += `\n_Relatório gerado via Frequência Congregacional_`;
    return text;
  };

  const handleCopyWhatsApp = () => {
    const text = generateWhatsAppMessage();
    navigator.clipboard.writeText(text);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 3000);
  };

  const handleOpenWhatsAppDirectly = () => {
    const text = generateWhatsAppMessage();
    const encoded = encodeURIComponent(text);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  // -------------------------------------------------------------
  // DADOS MENSAIS & ESTATÍSTICAS COMPARATIVAS
  // -------------------------------------------------------------
  const monthlyData = useMemo(() => {
    // Agrupa reuniões por Mês (YYYY-MM)
    const monthGroups: Record<
      string,
      {
        monthKey: string;
        monthLabel: string;
        midweekMeetings: Meeting[];
        weekendMeetings: Meeting[];
        allMeetings: Meeting[];
        totalPresencial: number;
        totalZoom: number;
        totalAttendance: number;
      }
    > = {};

    meetings.forEach((m) => {
      const monthKey = m.date.slice(0, 7); // YYYY-MM
      if (!monthGroups[monthKey]) {
        const [year, month] = monthKey.split('-');
        const dateObj = new Date(Number(year), Number(month) - 1, 1);
        const monthName = dateObj.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);

        monthGroups[monthKey] = {
          monthKey,
          monthLabel: capitalized,
          midweekMeetings: [],
          weekendMeetings: [],
          allMeetings: [],
          totalPresencial: 0,
          totalZoom: 0,
          totalAttendance: 0,
        };
      }

      const grp = monthGroups[monthKey];
      grp.allMeetings.push(m);
      if (m.type === 'midweek') grp.midweekMeetings.push(m);
      else grp.weekendMeetings.push(m);

      const att = attendance[m.id] || {};
      let p = 0;
      let z = 0;
      Object.values(att).forEach((st) => {
        if (st === 'presencial') p++;
        else if (st === 'zoom') z++;
      });
      grp.totalPresencial += p;
      grp.totalZoom += z;
      grp.totalAttendance += p + z;
    });

    // Calcula médias
    return Object.values(monthGroups)
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
      .map((g) => {
        const count = g.allMeetings.length || 1;
        const mediaPresencial = Math.round(g.totalPresencial / count);
        const mediaZoom = Math.round(g.totalZoom / count);
        const mediaGeral = Math.round(g.totalAttendance / count);

        return {
          ...g,
          count,
          mediaPresencial,
          mediaZoom,
          mediaGeral,
        };
      });
  }, [meetings, attendance]);

  // Dados para o Gráfico de Evolução ao longo do tempo (por Reunião)
  const timelineChartData = useMemo(() => {
    return [...meetings]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((m) => {
        const att = attendance[m.id] || {};
        let presencial = 0;
        let zoom = 0;
        Object.values(att).forEach((st) => {
          if (st === 'presencial') presencial++;
          else if (st === 'zoom') zoom++;
        });
        const dateShort = m.date.slice(5).replace('-', '/');
        return {
          data: dateShort,
          fullName: `${m.date} (${m.type === 'midweek' ? 'Meio Sem.' : 'Fim Sem.'})`,
          presencial,
          zoom,
          totalGeral: presencial + zoom,
        };
      });
  }, [meetings, attendance]);

  // Dados para o Gráfico de Pizza (Presencial vs Zoom)
  const pieData = useMemo(() => {
    let totalP = 0;
    let totalZ = 0;
    Object.values(attendance).forEach((map) => {
      Object.values(map).forEach((st) => {
        if (st === 'presencial') totalP++;
        else if (st === 'zoom') totalZ++;
      });
    });
    return [
      { name: 'Salão (Presencial)', value: totalP, color: '#10b981' },
      { name: 'Zoom (Remoto)', value: totalZ, color: '#8b5cf6' },
    ];
  }, [attendance]);

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 py-4 space-y-4">
      
      {/* 1. SELETOR DE RELATÓRIO: DIÁRIO OU MENSAL */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            Relatórios & Estatísticas da Frequência
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Visualize o resumo diário formatado para envio ou as médias mensais com gráficos.
          </p>
        </div>

        {/* Abas Diário / Mensal */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setReportTab('daily')}
            className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${
              reportTab === 'daily'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📋 Relatório Diário
          </button>
          <button
            onClick={() => setReportTab('monthly')}
            className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${
              reportTab === 'monthly'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📊 Relatório Mensal & Médias
          </button>
          <button
            onClick={() => setReportTab('s88')}
            className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${
              reportTab === 's88'
                ? 'bg-white text-blue-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📑 Formulário S-88 (Secretário)
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* RELATÓRIO DIÁRIO (DETALHAMENTO DE UMA REUNIÃO) */}
      {/* ======================================================== */}
      {reportTab === 'daily' && (
        <div className="space-y-4">
          
          {/* Seletor de Reunião & Botões de Exportação */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
                <Calendar className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span className="text-xs font-bold text-slate-600">Data:</span>
                <input
                  type="date"
                  value={currentMeeting ? currentMeeting.date : ''}
                  onChange={(e) => {
                    const match = sortedMeetings.find((m) => m.date === e.target.value);
                    if (match) setActiveMeetingId(match.id);
                  }}
                  className="bg-white text-xs sm:text-sm font-semibold text-slate-800 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  title="Selecionar reunião por data"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <select
                  value={currentMeeting ? currentMeeting.id : ''}
                  onChange={(e) => setActiveMeetingId(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {sortedMeetings.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.date} ({m.dayOfWeek.slice(0, 3)}) - {m.type === 'midweek' ? 'Meio de Semana' : 'Fim de Semana'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Ações: WhatsApp e Impressão */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleCopyWhatsApp}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                title="Copiar texto formatado para área de transferência"
              >
                {copiedNotification ? (
                  <>
                    <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-600" />
                    <span>Copiar Resumo</span>
                  </>
                )}
              </button>

              <button
                onClick={handleOpenWhatsAppDirectly}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs shadow-emerald-600/20"
                title="Compartilhar diretamente via WhatsApp"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Enviar no WhatsApp</span>
              </button>

              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors"
                title="Imprimir Folha de Frequência"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir</span>
              </button>
            </div>
          </div>

          {currentMeeting && (
            <div className="space-y-4 print:p-0">
              
              {/* Cartão de Resumo Oficial */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                <div className="border-b border-slate-100 pb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                      {congregationName} • Relatório de Presença
                    </span>
                    <span className="text-xs text-slate-500 font-semibold">
                      {currentMeeting.date} ({currentMeeting.dayOfWeek})
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 mt-1">
                    {currentMeeting.titleOrTheme}
                  </h2>
                </div>

                {/* Grid dos 4 Contadores Oficiais */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                    <div className="text-xs font-bold uppercase text-emerald-800 flex items-center gap-1">
                      🏛️ Salão (Presencial)
                    </div>
                    <div className="text-2xl font-extrabold text-emerald-950 mt-1">
                      {dailyBreakdown.presencial.length}
                    </div>
                    <div className="text-[11px] text-emerald-700 font-medium">
                      {Math.round(
                        (dailyBreakdown.presencial.length / (dailyBreakdown.totalAtivos || 1)) * 100
                      )}
                      % do total
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200">
                    <div className="text-xs font-bold uppercase text-purple-800 flex items-center gap-1">
                      📹 Zoom (Remoto)
                    </div>
                    <div className="text-2xl font-extrabold text-purple-950 mt-1">
                      {dailyBreakdown.zoom.length}
                    </div>
                    <div className="text-[11px] text-purple-700 font-medium">
                      {Math.round(
                        (dailyBreakdown.zoom.length / (dailyBreakdown.totalAtivos || 1)) * 100
                      )}
                      % do total
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-blue-900 text-white border border-blue-950 shadow-xs">
                    <div className="text-xs font-bold uppercase text-blue-200 flex items-center gap-1">
                      👥 Assistência Geral
                    </div>
                    <div className="text-2xl font-extrabold text-white mt-1">
                      {dailyBreakdown.totalGeral}
                    </div>
                    <div className="text-[11px] text-blue-200 font-medium">
                      Salão + Zoom
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200">
                    <div className="text-xs font-bold uppercase text-rose-800 flex items-center gap-1">
                      ✕ Ausentes
                    </div>
                    <div className="text-2xl font-extrabold text-rose-950 mt-1">
                      {dailyBreakdown.ausente.length}
                    </div>
                    <div className="text-[11px] text-rose-700 font-medium">
                      {dailyBreakdown.naoMarcados.length > 0 && (
                        <span>+{dailyBreakdown.naoMarcados.length} pendentes</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tabela de Grupos 1 a 6 */}
                <div>
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Detalhamento por Grupo de Serviço de Campo:
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                          <th className="py-2 px-3 font-bold">Grupo</th>
                          <th className="py-2 px-3 font-bold text-center">🏛️ Presencial</th>
                          <th className="py-2 px-3 font-bold text-center">📹 Zoom</th>
                          <th className="py-2 px-3 font-bold text-center">✕ Ausentes</th>
                          <th className="py-2 px-3 font-bold text-center">Assistência Total</th>
                          <th className="py-2 px-3 font-bold text-right">% Presença</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {groupStats.map((g) => {
                          const grpInfo = CONGREGATION_GROUPS.find((info) => info.number === g.group);
                          const assisted = g.presencial + g.zoom;
                          const perc = g.total > 0 ? Math.round((assisted / g.total) * 100) : 0;
                          return (
                            <tr key={g.group} className="hover:bg-slate-50/80">
                              <td className="py-2 px-3 text-slate-800">
                                <div className="font-bold text-slate-900">
                                  {grpInfo ? grpInfo.label : `Grupo ${g.group}`}
                                </div>
                                {grpInfo && (
                                  <div className="text-[10px] text-slate-500 font-normal leading-tight">
                                    Sup: {grpInfo.overseer} • Ajud: {grpInfo.assistant}
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-3 text-center text-emerald-800 font-semibold">
                                {g.presencial}
                              </td>
                              <td className="py-2 px-3 text-center text-purple-800 font-semibold">
                                {g.zoom}
                              </td>
                              <td className="py-2 px-3 text-center text-rose-800 font-semibold">
                                {g.ausente}
                              </td>
                              <td className="py-2 px-3 text-center font-bold text-slate-900">
                                {assisted} / {g.total}
                              </td>
                              <td className="py-2 px-3 text-right font-bold text-blue-600">
                                {perc}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Listas Nominais (Salão, Zoom, Ausentes) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                  
                  {/* Lista Presencial */}
                  <div className="p-3 bg-emerald-50/40 rounded-xl border border-emerald-200/80">
                    <h4 className="text-xs font-bold text-emerald-900 flex items-center justify-between mb-2">
                      <span>🏛️ No Salão ({dailyBreakdown.presencial.length})</span>
                    </h4>
                    <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                      {dailyBreakdown.presencial.map((p) => (
                        <div key={p.id} className="text-xs text-slate-700 flex items-center justify-between py-0.5 border-b border-emerald-100/50">
                          <span>{p.name}</span>
                          <span className="text-[10px] text-slate-400 font-medium">G{p.group}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Lista Zoom */}
                  <div className="p-3 bg-purple-50/40 rounded-xl border border-purple-200/80">
                    <h4 className="text-xs font-bold text-purple-900 flex items-center justify-between mb-2">
                      <span>📹 No Zoom ({dailyBreakdown.zoom.length})</span>
                    </h4>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                      {dailyBreakdown.zoom.map((p) => (
                        <div key={p.id} className="text-xs text-slate-700 flex flex-col py-1 border-b border-purple-100/50">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-slate-800">{p.name}</span>
                            <span className="text-[10px] text-purple-600 font-bold bg-purple-100/70 px-1.5 py-0.2 rounded">G{p.group}</span>
                          </div>
                          {currentMeetingNotes[p.id] && (
                            <span className="text-[11px] text-purple-800 font-medium italic mt-0.5 bg-purple-100/40 px-1.5 py-0.5 rounded">
                              💬 {currentMeetingNotes[p.id]}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Lista Ausentes */}
                  <div className="p-3 bg-rose-50/40 rounded-xl border border-rose-200/80">
                    <h4 className="text-xs font-bold text-rose-900 flex items-center justify-between mb-2">
                      <span>✕ Ausentes ({dailyBreakdown.ausente.length})</span>
                    </h4>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                      {dailyBreakdown.ausente.map((p) => (
                        <div key={p.id} className="text-xs text-slate-700 flex flex-col py-1 border-b border-rose-100/50">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-slate-800">{p.name}</span>
                            <span className="text-[10px] text-rose-600 font-bold bg-rose-100/70 px-1.5 py-0.2 rounded">G{p.group}</span>
                          </div>
                          {currentMeetingNotes[p.id] && (
                            <span className="text-[11px] text-rose-800 font-medium italic mt-0.5 bg-rose-100/40 px-1.5 py-0.5 rounded">
                              💬 {currentMeetingNotes[p.id]}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

              </div>

            </div>
          )}

        </div>
      )}

      {/* ======================================================== */}
      {/* RELATÓRIO MENSAL & ESTATÍSTICAS COMPARATIVAS */}
      {/* ======================================================== */}
      {reportTab === 'monthly' && (
        <div className="space-y-4">
          
          {/* Cartões de Médias Mensais */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {monthlyData.map((m) => {
              return (
                <div
                  key={m.monthKey}
                  className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="font-bold text-sm text-slate-900">
                      {m.monthLabel}
                    </span>
                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                      {m.count} reuniões
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-emerald-50 p-2 rounded-xl border border-emerald-100">
                      <div className="text-[11px] font-bold text-emerald-800">Salão</div>
                      <div className="text-lg font-extrabold text-emerald-950">{m.mediaPresencial}</div>
                      <div className="text-[10px] text-emerald-600">média</div>
                    </div>

                    <div className="bg-purple-50 p-2 rounded-xl border border-purple-100">
                      <div className="text-[11px] font-bold text-purple-800">Zoom</div>
                      <div className="text-lg font-extrabold text-purple-950">{m.mediaZoom}</div>
                      <div className="text-[10px] text-purple-600">média</div>
                    </div>

                    <div className="bg-blue-900 text-white p-2 rounded-xl shadow-xs">
                      <div className="text-[11px] font-bold text-blue-200">Geral</div>
                      <div className="text-lg font-extrabold text-white">{m.mediaGeral}</div>
                      <div className="text-[10px] text-blue-200">média</div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-500 flex items-center justify-between pt-1">
                    <span>Meio de Semana: {m.midweekMeetings.length}</span>
                    <span>Fim de Semana: {m.weekendMeetings.length}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Gráfico 1: Evolução da Assistência Reunião a Reunião (Recharts) */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  Evolução da Assistência (Salão vs Zoom vs Total Geral)
                </h3>
                <p className="text-xs text-slate-500">
                  Acompanhamento cronológico de assistência nas reuniões.
                </p>
              </div>
            </div>

            <div className="h-64 sm:h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorPresencial" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px',
                      border: 'none',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Area
                    type="monotone"
                    dataKey="totalGeral"
                    name="Assistência Geral"
                    stroke="#2563eb"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorTotal)"
                  />
                  <Area
                    type="monotone"
                    dataKey="presencial"
                    name="Presencial (Salão)"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorPresencial)"
                  />
                  <Line
                    type="monotone"
                    dataKey="zoom"
                    name="Zoom (Remoto)"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gráfico 2: Comparativo por Grupos e Proporção Presencial/Zoom */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            
            {/* Gráfico de Barras por Grupo de Serviço */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                Assistência Média por Grupo de Serviço de Campo
              </h3>
              <div className="h-60 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={groupStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="group" tickFormatter={(v) => `G${v}`} tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        borderRadius: '12px',
                        color: '#fff',
                        fontSize: '12px',
                        border: 'none',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="presencial" name="Salão" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="zoom" name="Zoom" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gráfico de Distribuição Proporcional (Salão vs Zoom) */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                Proporção Geral: Salão do Reino vs Zoom
              </h3>
              <div className="h-60 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        borderRadius: '12px',
                        color: '#fff',
                        fontSize: '12px',
                        border: 'none',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ======================================================== */}
      {/* FORMULÁRIO S-88 (SECRETÁRIO DA CONGREGAÇÃO) */}
      {/* ======================================================== */}
      {reportTab === 's88' && (
        <S88ReportForm
          meetings={meetings}
          publishers={publishers}
          attendance={attendance}
          congregationName={congregationName}
        />
      )}

    </div>
  );
};
