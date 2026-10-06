import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Layers,
  MessageSquare,
  Printer,
  Share2,
  TrendingUp,
  Tv,
  Users,
} from 'lucide-react';
import { AttendanceStatus, Meeting, Publisher } from '../types';

interface S88ReportFormProps {
  meetings: Meeting[];
  publishers: Publisher[];
  attendance: Record<string, Record<string, AttendanceStatus>>;
  congregationName: string;
}

export const S88ReportForm: React.FC<S88ReportFormProps> = ({
  meetings,
  publishers,
  attendance,
  congregationName,
}) => {
  // Lista de meses disponíveis nas reuniões
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    meetings.forEach((m) => {
      set.add(m.date.slice(0, 7)); // YYYY-MM
    });
    const arr = Array.from(set).sort().reverse();
    if (arr.length === 0) {
      arr.push(new Date().toISOString().slice(0, 7));
    }
    return arr;
  }, [meetings]);

  const [selectedMonth, setSelectedMonth] = useState<string>(
    availableMonths[0] || new Date().toISOString().slice(0, 7)
  );
  const [copied, setCopied] = useState(false);

  // Filtra reuniões do mês selecionado
  const monthMeetings = useMemo(() => {
    return meetings
      .filter((m) => m.date.startsWith(selectedMonth))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [meetings, selectedMonth]);

  // Separa reuniões de meio de semana e fim de semana
  const midweekMeetings = useMemo(
    () => monthMeetings.filter((m) => m.type === 'midweek'),
    [monthMeetings]
  );
  const weekendMeetings = useMemo(
    () => monthMeetings.filter((m) => m.type === 'weekend'),
    [monthMeetings]
  );

  // Calcula estatísticas para uma lista de reuniões
  const calculateMeetingGroupStats = (meetingList: Meeting[]) => {
    let totalPresencial = 0;
    let totalZoom = 0;
    const meetingDetails = meetingList.map((m) => {
      const attMap = attendance[m.id] || {};
      let pres = 0;
      let zoom = 0;
      Object.values(attMap).forEach((st) => {
        if (st === 'presencial') pres++;
        else if (st === 'zoom') zoom++;
      });
      totalPresencial += pres;
      totalZoom += zoom;
      return {
        meeting: m,
        presencial: pres,
        zoom,
        total: pres + zoom,
      };
    });

    const count = meetingList.length;
    const totalGeral = totalPresencial + totalZoom;
    const mediaPresencial = count > 0 ? Math.round(totalPresencial / count) : 0;
    const mediaZoom = count > 0 ? Math.round(totalZoom / count) : 0;
    const mediaGeral = count > 0 ? Math.round(totalGeral / count) : 0;

    return {
      count,
      totalPresencial,
      totalZoom,
      totalGeral,
      mediaPresencial,
      mediaZoom,
      mediaGeral,
      meetingDetails,
    };
  };

  const midweekStats = useMemo(
    () => calculateMeetingGroupStats(midweekMeetings),
    [midweekMeetings, attendance]
  );

  const weekendStats = useMemo(
    () => calculateMeetingGroupStats(weekendMeetings),
    [weekendMeetings, attendance]
  );

  const totalReunioes = midweekStats.count + weekendStats.count;
  const totalGeralMes = midweekStats.totalGeral + weekendStats.totalGeral;
  const mediaGeralMes =
    totalReunioes > 0 ? Math.round(totalGeralMes / totalReunioes) : 0;

  const totalPublicadoresAtivos = publishers.filter((p) => p.active).length;

  // Formatação do nome do mês
  const [yearStr, monthStr] = selectedMonth.split('-');
  const dateObj = new Date(Number(yearStr), Number(monthStr) - 1, 1);
  const monthName = dateObj.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
  const monthNameCapitalized =
    monthName.charAt(0).toUpperCase() + monthName.slice(1);

  // Gera texto para cópia oficial do secretário
  const generateS88SummaryText = () => {
    let t = `📋 *REGISTRO DE ASSISTÊNCIA ÀS REUNIÕES (FORMULÁRIO S-88)*\n`;
    t += `🏛️ *Congregação:* ${congregationName}\n`;
    t += `📅 *Mês de Referência:* ${monthNameCapitalized}\n`;
    t += `👥 *Total de Publicadores Ativos:* ${totalPublicadoresAtivos}\n\n`;

    t += `*1. REUNIÃO DE MEIO DE SEMANA (Vida e Ministério)*\n`;
    t += `• Reuniões realizadas: ${midweekStats.count}\n`;
    t += `• Total acumulado: ${midweekStats.totalGeral} (Salão: ${midweekStats.totalPresencial} | Zoom: ${midweekStats.totalZoom})\n`;
    t += `• *MÉDIA MENSAL: ${midweekStats.mediaGeral}* (Salão: ${midweekStats.mediaPresencial} | Zoom: ${midweekStats.mediaZoom})\n\n`;

    t += `*2. REUNIÃO DE FIM DE SEMANA (Discurso Público e A Sentinela)*\n`;
    t += `• Reuniões realizadas: ${weekendStats.count}\n`;
    t += `• Total acumulado: ${weekendStats.totalGeral} (Salão: ${weekendStats.totalPresencial} | Zoom: ${weekendStats.totalZoom})\n`;
    t += `• *MÉDIA MENSAL: ${weekendStats.mediaGeral}* (Salão: ${weekendStats.mediaPresencial} | Zoom: ${weekendStats.mediaZoom})\n\n`;

    t += `*3. RESUMO GERAL DO MÊS*\n`;
    t += `• Total de reuniões no mês: ${totalReunioes}\n`;
    t += `• Assistência geral acumulada: ${totalGeralMes}\n`;
    t += `• *Média Geral Combinada: ${mediaGeralMes} assistentes/reunião*\n\n`;

    t += `*DETALHAMENTO DAS REUNIÕES:*\n`;
    monthMeetings.forEach((m) => {
      const attMap = attendance[m.id] || {};
      let p = 0;
      let z = 0;
      Object.values(attMap).forEach((st) => {
        if (st === 'presencial') p++;
        else if (st === 'zoom') z++;
      });
      const tipo = m.type === 'midweek' ? 'Meio Sem.' : 'Fim Sem.';
      t += `• ${m.date} (${tipo}): ${p + z} presentes (Salão: ${p} | Zoom: ${z})\n`;
    });

    t += `\n_Gerado para prestação de contas da Congregação_`;
    return t;
  };

  const handleCopy = async () => {
    const text = generateS88SummaryText();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = () => {
    const text = generateS88SummaryText();
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Controles Superiores de Seleção de Mês e Ações */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg text-xs font-bold uppercase tracking-wider">
              Formulário S-88
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              Registro de Assistência às Reuniões
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Médias oficiais mensais para o secretário da congregação e relatório ao circuito
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Seletor de Mês */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <Calendar className="w-4 h-4 text-slate-500 ml-2" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-xs sm:text-sm font-bold text-slate-800 py-1.5 px-2 focus:outline-none cursor-pointer"
            >
              {availableMonths.map((m) => {
                const [y, mon] = m.split('-');
                const d = new Date(Number(y), Number(mon) - 1, 1);
                const label = d.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
                return (
                  <option key={m} value={m}>
                    {label.charAt(0).toUpperCase() + label.slice(1)}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Botão Copiar */}
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all border border-slate-200 cursor-pointer"
            title="Copiar dados formatados para colar no relatório"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700">Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-600" />
                <span>Copiar S-88</span>
              </>
            )}
          </button>

          {/* Botão WhatsApp */}
          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            title="Enviar resumo S-88 no WhatsApp para o secretário ou anciãos"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>WhatsApp</span>
          </button>

          {/* Botão Imprimir */}
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            title="Imprimir folha oficial S-88"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir Folha</span>
          </button>
        </div>
      </div>

      {/* DOCUMENTO DO FORMULÁRIO S-88 (FORMATADO PARA TELA E IMPRESSÃO) */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6 print:border-none print:shadow-none print:p-0">
        
        {/* Cabeçalho do Documento Oficial */}
        <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-widest text-slate-500">
              Formulário S-88-T • Registro Oficial de Assistência
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">
              {congregationName}
            </h1>
            <p className="text-sm font-semibold text-slate-700 mt-0.5">
              Mês de Referência: <span className="text-blue-700 underline underline-offset-4">{monthNameCapitalized}</span>
            </p>
          </div>

          <div className="text-right sm:border-l sm:border-slate-200 sm:pl-6">
            <div className="text-xs text-slate-500 font-medium">Publicadores Ativos</div>
            <div className="text-2xl font-black text-slate-900">{totalPublicadoresAtivos}</div>
            <div className="text-[11px] text-slate-500">Irmãos cadastrados</div>
          </div>
        </div>

        {/* CARDS COM AS DUAS MÉDIAS OFICIAIS S-88 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card Meio de Semana */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                  Meio de Semana
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  {midweekStats.count} reuniões no mês
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 mt-2">
                Nossa Vida e Ministério Cristão
              </h3>
            </div>

            <div className="my-4 pt-3 border-t border-slate-200/80">
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                Média de Assistência Mensal:
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-black text-blue-600">
                  {midweekStats.mediaGeral}
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  presentes por reunião
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs bg-white p-2.5 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-500">Média Salão:</span>
                <p className="font-bold text-slate-900 text-sm">
                  🏛️ {midweekStats.mediaPresencial}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Média Zoom:</span>
                <p className="font-bold text-slate-900 text-sm">
                  📹 {midweekStats.mediaZoom}
                </p>
              </div>
            </div>
          </div>

          {/* Card Fim de Semana */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
                  Fim de Semana
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  {weekendStats.count} reuniões no mês
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 mt-2">
                Discurso Público e A Sentinela
              </h3>
            </div>

            <div className="my-4 pt-3 border-t border-slate-200/80">
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                Média de Assistência Mensal:
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-black text-purple-600">
                  {weekendStats.mediaGeral}
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  presentes por reunião
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs bg-white p-2.5 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-500">Média Salão:</span>
                <p className="font-bold text-slate-900 text-sm">
                  🏛️ {weekendStats.mediaPresencial}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Média Zoom:</span>
                <p className="font-bold text-slate-900 text-sm">
                  📹 {weekendStats.mediaZoom}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Resumo Combinado */}
        <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black">
              %
            </div>
            <div>
              <div className="font-bold text-slate-900 text-sm">
                Média Geral Combinada do Mês: {mediaGeralMes} assistentes
              </div>
              <div className="text-xs text-slate-600">
                Total acumulado de {totalGeralMes} presenças em {totalReunioes} reuniões realizadas
              </div>
            </div>
          </div>
          {totalPublicadoresAtivos > 0 && (
            <div className="text-right">
              <span className="text-xs text-emerald-800 font-semibold">
                Índice de Comparecimento:
              </span>
              <p className="text-lg font-black text-emerald-700">
                {Math.round((mediaGeralMes / totalPublicadoresAtivos) * 100)}%
              </p>
            </div>
          )}
        </div>

        {/* TABELA DETALHADA DE CADA REUNIÃO REALIZADA NO MÊS */}
        <div className="space-y-3">
          <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-600" />
            <span>Detalhamento Individual das Reuniões do Mês</span>
          </h3>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200 uppercase text-[11px]">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-3 py-3">Tipo da Reunião</th>
                  <th className="px-3 py-3">Tema / Orador</th>
                  <th className="px-3 py-3 text-center">Salão</th>
                  <th className="px-3 py-3 text-center">Zoom</th>
                  <th className="px-4 py-3 text-center font-black text-slate-900">Total Geral</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthMeetings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400 italic">
                      Nenhuma reunião registrada neste mês ainda.
                    </td>
                  </tr>
                ) : (
                  monthMeetings.map((m) => {
                    const attMap = attendance[m.id] || {};
                    let pres = 0;
                    let zoom = 0;
                    Object.values(attMap).forEach((st) => {
                      if (st === 'presencial') pres++;
                      else if (st === 'zoom') zoom++;
                    });
                    const total = pres + zoom;
                    const isMidweek = m.type === 'midweek';

                    return (
                      <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                          {m.date} ({m.dayOfWeek.slice(0, 3)})
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isMidweek
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-purple-50 text-purple-700 border border-purple-200'
                            }`}
                          >
                            {isMidweek ? 'Meio de Semana' : 'Fim de Semana'}
                          </span>
                        </td>
                        <td className="px-3 py-3 max-w-[200px] truncate text-slate-600">
                          {m.titleOrTheme || 'Reunião Congregacional'}
                          {m.speakerOrLeader && (
                            <span className="text-slate-400 block text-[10px]">
                              {m.speakerOrLeader}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center font-semibold text-emerald-700">
                          {pres}
                        </td>
                        <td className="px-3 py-3 text-center font-semibold text-purple-700">
                          {zoom}
                        </td>
                        <td className="px-4 py-3 text-center font-black text-slate-900 text-sm">
                          {total}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Rodapé do Formulário para Assinatura do Secretário */}
        <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <div>
            <span>Documento gerado em: {new Date().toLocaleDateString('pt-BR')}</span>
          </div>
          <div className="border-t border-slate-300 pt-1 w-64 text-center">
            <span className="font-semibold text-slate-700">Secretário da Congregação</span>
          </div>
        </div>
      </div>
    </div>
  );
};
