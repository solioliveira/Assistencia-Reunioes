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
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Award,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  FileSpreadsheet,
  Info,
  Layers,
  LayoutDashboard,
  Percent,
  Sparkles,
  TrendingUp,
  Tv,
  Users,
  Video,
} from 'lucide-react';
import {
  AttendanceStatus,
  CONGREGATION_GROUPS,
  Meeting,
  Publisher,
} from '../types';

interface DashboardViewProps {
  meetings: Meeting[];
  publishers: Publisher[];
  attendance: Record<string, Record<string, AttendanceStatus>>;
  congregationName: string;
  onNavigateToAttendance?: (meetingId: string) => void;
  onNavigateToTab?: (tab: any) => void;
}

type PeriodFilter = '30days' | '60days' | 'all';

export const DashboardView: React.FC<DashboardViewProps> = ({
  meetings,
  publishers,
  attendance,
  congregationName,
  onNavigateToAttendance,
  onNavigateToTab,
}) => {
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('30days');

  // Total de publicadores ativos na congregação
  const activePublishers = useMemo(() => {
    return publishers.filter((p) => p.active);
  }, [publishers]);

  const totalActiveCount = activePublishers.length || 1;

  // Ordenar reuniões por data decrescente
  const sortedMeetings = useMemo(() => {
    return [...meetings].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [meetings]);

  // Determinar a data de corte do período
  const { filteredMeetings, periodLabel, startDateFormatted, endDateFormatted } = useMemo(() => {
    if (meetings.length === 0) {
      return {
        filteredMeetings: [],
        periodLabel: 'Nenhuma reunião cadastrada',
        startDateFormatted: '',
        endDateFormatted: '',
      };
    }

    // Data de referência: data da reunião mais recente ou data de hoje
    const today = new Date();
    const latestMeetingDate = new Date(sortedMeetings[0].date);
    const referenceDate = latestMeetingDate > today ? latestMeetingDate : today;

    let daysToSubtract = 30;
    if (periodFilter === '60days') daysToSubtract = 60;
    else if (periodFilter === 'all') daysToSubtract = 3650; // 10 anos

    const cutoffDate = new Date(referenceDate);
    cutoffDate.setDate(cutoffDate.getDate() - daysToSubtract);
    cutoffDate.setHours(0, 0, 0, 0);

    const refDateEnd = new Date(referenceDate);
    refDateEnd.setHours(23, 59, 59, 999);

    // Filtra reuniões que estão no intervalo
    let matches = sortedMeetings.filter((m) => {
      const d = new Date(m.date + 'T12:00:00');
      return d >= cutoffDate && d <= refDateEnd;
    });

    // Se por alguma razão de fuso ou datas testes nenhuma reunião cair nos 30 dias de hoje,
    // usamos as reuniões dos últimos 30 dias em relação à reunião mais recente
    if (matches.length === 0 && periodFilter === '30days' && sortedMeetings.length > 0) {
      const fallbackCutoff = new Date(latestMeetingDate);
      fallbackCutoff.setDate(fallbackCutoff.getDate() - 30);
      matches = sortedMeetings.filter((m) => {
        const d = new Date(m.date + 'T12:00:00');
        return d >= fallbackCutoff;
      });
    }

    const startD = matches.length > 0
      ? new Date(matches[matches.length - 1].date + 'T12:00:00')
      : cutoffDate;
    const endD = matches.length > 0
      ? new Date(matches[0].date + 'T12:00:00')
      : referenceDate;

    const formatPt = (d: Date) =>
      `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

    const label =
      periodFilter === '30days'
        ? 'Últimos 30 dias'
        : periodFilter === '60days'
        ? 'Últimos 60 dias'
        : 'Todo o histórico';

    return {
      filteredMeetings: matches,
      periodLabel: label,
      startDateFormatted: formatPt(startD),
      endDateFormatted: formatPt(endD),
    };
  }, [meetings, sortedMeetings, periodFilter]);

  // Reuniões separadas por tipo nos últimos 30 dias
  const midweekMeetings = useMemo(() => {
    return filteredMeetings.filter((m) => m.type === 'midweek');
  }, [filteredMeetings]);

  const weekendMeetings = useMemo(() => {
    return filteredMeetings.filter((m) => m.type === 'weekend');
  }, [filteredMeetings]);

  // Função auxiliar para calcular números de uma reunião
  const getMeetingStats = (m: Meeting) => {
    const att = attendance[m.id] || {};
    let presencial = 0;
    let zoom = 0;
    let ausente = 0;

    activePublishers.forEach((p) => {
      const st = att[p.id];
      if (st === 'presencial') presencial++;
      else if (st === 'zoom') zoom++;
      else if (st === 'ausente') ausente++;
    });

    const totalGeral = presencial + zoom;
    const attendanceRate = totalActiveCount > 0 ? (totalGeral / totalActiveCount) * 100 : 0;

    return {
      presencial,
      zoom,
      ausente,
      totalGeral,
      attendanceRate,
    };
  };

  // Estatísticas e Médias por Tipo de Reunião
  const statsSummary = useMemo(() => {
    const calcAverages = (list: Meeting[]) => {
      const count = list.length;
      if (count === 0) {
        return {
          count: 0,
          totalPresencial: 0,
          totalZoom: 0,
          totalGeral: 0,
          avgPresencial: 0,
          avgZoom: 0,
          avgTotal: 0,
          avgRate: 0,
          presencialPct: 0,
          zoomPct: 0,
        };
      }

      let sumP = 0;
      let sumZ = 0;
      let sumT = 0;

      list.forEach((m) => {
        const s = getMeetingStats(m);
        sumP += s.presencial;
        sumZ += s.zoom;
        sumT += s.totalGeral;
      });

      const avgP = Number((sumP / count).toFixed(1));
      const avgZ = Number((sumZ / count).toFixed(1));
      const avgT = Number((sumT / count).toFixed(1));
      const avgRate = Number(((avgT / totalActiveCount) * 100).toFixed(1));
      const presencialPct = avgT > 0 ? Math.round((avgP / avgT) * 100) : 0;
      const zoomPct = avgT > 0 ? Math.round((avgZ / avgT) * 100) : 0;

      return {
        count,
        totalPresencial: sumP,
        totalZoom: sumZ,
        totalGeral: sumT,
        avgPresencial: avgP,
        avgZoom: avgZ,
        avgTotal: avgT,
        avgRate,
        presencialPct,
        zoomPct,
      };
    };

    const midweek = calcAverages(midweekMeetings);
    const weekend = calcAverages(weekendMeetings);
    const overall = calcAverages(filteredMeetings);

    // Recorde / Reunião com maior assistência no período
    let highestMeeting: { meeting: Meeting; stats: ReturnType<typeof getMeetingStats> } | null = null;
    filteredMeetings.forEach((m) => {
      const s = getMeetingStats(m);
      if (!highestMeeting || s.totalGeral > highestMeeting.stats.totalGeral) {
        highestMeeting = { meeting: m, stats: s };
      }
    });

    return {
      midweek,
      weekend,
      overall,
      highestMeeting,
    };
  }, [midweekMeetings, weekendMeetings, filteredMeetings, totalActiveCount, attendance, activePublishers]);

  // Dados para o Gráfico 1: Comparativo de Médias por Tipo de Reunião (BarChart)
  const averageComparisonChartData = useMemo(() => {
    return [
      {
        tipo: 'Meio de Semana',
        subtitulo: 'Vida e Ministério',
        'Média Presencial (Salão)': statsSummary.midweek.avgPresencial,
        'Média Zoom (Remoto)': statsSummary.midweek.avgZoom,
        'Média Total': statsSummary.midweek.avgTotal,
        reunioes: statsSummary.midweek.count,
        taxaPresenca: statsSummary.midweek.avgRate,
      },
      {
        tipo: 'Fim de Semana',
        subtitulo: 'Discurso & Sentinela',
        'Média Presencial (Salão)': statsSummary.weekend.avgPresencial,
        'Média Zoom (Remoto)': statsSummary.weekend.avgZoom,
        'Média Total': statsSummary.weekend.avgTotal,
        reunioes: statsSummary.weekend.count,
        taxaPresenca: statsSummary.weekend.avgRate,
      },
      {
        tipo: 'Média Geral',
        subtitulo: 'Todas Reuniões',
        'Média Presencial (Salão)': statsSummary.overall.avgPresencial,
        'Média Zoom (Remoto)': statsSummary.overall.avgZoom,
        'Média Total': statsSummary.overall.avgTotal,
        reunioes: statsSummary.overall.count,
        taxaPresenca: statsSummary.overall.avgRate,
      },
    ];
  }, [statsSummary]);

  // Dados para o Gráfico 2: Evolução Cronológica Reunião a Reunião nos Últimos 30 Dias (AreaChart / LineChart)
  const timelineChartData = useMemo(() => {
    const chronological = [...filteredMeetings].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return chronological.map((m) => {
      const s = getMeetingStats(m);
      const [year, month, day] = m.date.split('-');
      const shortDay = m.dayOfWeek.slice(0, 3);
      const label = `${day}/${month} (${shortDay})`;

      return {
        id: m.id,
        date: m.date,
        label,
        tipo: m.type === 'midweek' ? 'Meio de Semana' : 'Fim de Semana',
        tipoCode: m.type,
        tema: m.titleOrTheme,
        'Salão (Presencial)': s.presencial,
        'Zoom (Remoto)': s.zoom,
        'Assistência Total': s.totalGeral,
        Ausentes: s.ausente,
        Taxa: Number(s.attendanceRate.toFixed(1)),
      };
    });
  }, [filteredMeetings, attendance, activePublishers, totalActiveCount]);

  // Dados para o Gráfico 3: Distribuição da Assistência Média por Modalidade (Presencial vs Zoom)
  const modalityDistributionData = useMemo(() => {
    return [
      {
        name: 'Presencial (Salão)',
        value: statsSummary.overall.avgPresencial,
        color: '#2563eb', // blue-600
        percent: statsSummary.overall.presencialPct,
      },
      {
        name: 'Zoom (Remoto)',
        value: statsSummary.overall.avgZoom,
        color: '#9333ea', // purple-600
        percent: statsSummary.overall.zoomPct,
      },
    ];
  }, [statsSummary]);

  // Dados para o Gráfico 4: Presença Média por Grupo de Serviço de Campo nos últimos 30 dias
  const groupPerformanceData = useMemo(() => {
    if (filteredMeetings.length === 0) return [];

    const groupSums: Record<
      number,
      { group: number; totalP: number; totalZ: number; totalPubs: number }
    > = {};

    for (let i = 1; i <= 6; i++) {
      const pubsInGroup = activePublishers.filter((p) => (p.group || 1) === i);
      groupSums[i] = {
        group: i,
        totalP: 0,
        totalZ: 0,
        totalPubs: pubsInGroup.length,
      };
    }

    filteredMeetings.forEach((m) => {
      const att = attendance[m.id] || {};
      activePublishers.forEach((p) => {
        const grp = p.group || 1;
        const st = att[p.id];
        if (st === 'presencial') groupSums[grp].totalP++;
        else if (st === 'zoom') groupSums[grp].totalZ++;
      });
    });

    const count = filteredMeetings.length;

    return Object.values(groupSums).map((g) => {
      const grpInfo = CONGREGATION_GROUPS.find((info) => info.number === g.group);
      const label = grpInfo ? `Grupo ${g.group}` : `G${g.group}`;
      const overseer = grpInfo ? grpInfo.overseer.split(' ')[0] : '';
      const avgP = Number((g.totalP / count).toFixed(1));
      const avgZ = Number((g.totalZ / count).toFixed(1));
      const avgTotal = Number((avgP + avgZ).toFixed(1));
      const rate = g.totalPubs > 0 ? Math.round((avgTotal / g.totalPubs) * 100) : 0;

      return {
        grupo: label,
        responsavel: overseer,
        'Média Presencial': avgP,
        'Média Zoom': avgZ,
        'Média Total': avgTotal,
        publicadores: g.totalPubs,
        taxaPresenca: rate,
      };
    });
  }, [filteredMeetings, activePublishers, attendance]);

  return (
    <div className="space-y-6 pb-16">
      {/* 1. CABEÇALHO DO DASHBOARD */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                <LayoutDashboard className="w-3.5 h-3.5" />
                Painel Visual
              </span>
              <span className="text-xs text-slate-500 font-medium">
                {congregationName}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
              Dashboard de Assistência
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>
                Resumo visual com foco na <strong>assistência média por tipo de reunião</strong>
                {startDateFormatted && endDateFormatted ? ` (${startDateFormatted} a ${endDateFormatted})` : ''}
              </span>
            </p>
          </div>

          {/* Filtro de Período */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 self-start lg:self-auto">
            <button
              type="button"
              onClick={() => setPeriodFilter('30days')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                periodFilter === '30days'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              Últimos 30 Dias
            </button>
            <button
              type="button"
              onClick={() => setPeriodFilter('60days')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                periodFilter === '60days'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              60 Dias
            </button>
            <button
              type="button"
              onClick={() => setPeriodFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                periodFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              Histórico Completo
            </button>
          </div>
        </div>
      </div>

      {/* AVISO SE NÃO HOUVER REUNIÕES NO PERÍODO */}
      {filteredMeetings.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 shadow-2xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto">
            <Info className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            Nenhuma reunião registrada nos últimos 30 dias
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Cadastre reuniões com data recente na aba "Reuniões & Datas" ou altere o filtro para "Histórico Completo" para visualizar as médias e gráficos.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setPeriodFilter('all')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
            >
              Ver Todo o Histórico
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* 2. CARDS DE DESTAQUE (KPIS DE ASSISTÊNCIA MÉDIA) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* CARD 1: MEIO DE SEMANA */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs space-y-3 hover:border-blue-300 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                  Meio de Semana
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  {statsSummary.midweek.count} {statsSummary.midweek.count === 1 ? 'reunião' : 'reuniões'}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 font-medium block">Assistência Média</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-slate-900">
                    {statsSummary.midweek.avgTotal}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">irmãos</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                <span className="inline-flex items-center gap-1 font-medium">
                  <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
                  Salão: <strong className="text-slate-900">{statsSummary.midweek.avgPresencial}</strong>
                </span>
                <span className="inline-flex items-center gap-1 font-medium">
                  <span className="w-2 h-2 rounded-full bg-purple-600 inline-block" />
                  Zoom: <strong className="text-slate-900">{statsSummary.midweek.avgZoom}</strong>
                </span>
              </div>
              <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg flex items-center justify-between">
                <span>Presença Média:</span>
                <strong className="text-blue-700 font-bold">{statsSummary.midweek.avgRate}% dos ativos</strong>
              </div>
            </div>

            {/* CARD 2: FIM DE SEMANA */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs space-y-3 hover:border-emerald-300 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                  Fim de Semana
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  {statsSummary.weekend.count} {statsSummary.weekend.count === 1 ? 'reunião' : 'reuniões'}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 font-medium block">Assistência Média</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-slate-900">
                    {statsSummary.weekend.avgTotal}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">irmãos</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                <span className="inline-flex items-center gap-1 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
                  Salão: <strong className="text-slate-900">{statsSummary.weekend.avgPresencial}</strong>
                </span>
                <span className="inline-flex items-center gap-1 font-medium">
                  <span className="w-2 h-2 rounded-full bg-purple-600 inline-block" />
                  Zoom: <strong className="text-slate-900">{statsSummary.weekend.avgZoom}</strong>
                </span>
              </div>
              <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg flex items-center justify-between">
                <span>Presença Média:</span>
                <strong className="text-emerald-700 font-bold">{statsSummary.weekend.avgRate}% dos ativos</strong>
              </div>
            </div>

            {/* CARD 3: MÉDIA GERAL COMBINADA */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs space-y-3 hover:border-indigo-300 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                  Média Geral
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  {statsSummary.overall.count} total
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 font-medium block">Todas as Reuniões</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-slate-900">
                    {statsSummary.overall.avgTotal}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">irmãos/reunião</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                <span>
                  🏛️ Salão: <strong>{statsSummary.overall.avgPresencial}</strong> ({statsSummary.overall.presencialPct}%)
                </span>
                <span>
                  📹 Zoom: <strong>{statsSummary.overall.avgZoom}</strong> ({statsSummary.overall.zoomPct}%)
                </span>
              </div>
              <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg flex items-center justify-between">
                <span>Aproveitamento:</span>
                <strong className="text-indigo-700 font-bold">{statsSummary.overall.avgRate}% presentes</strong>
              </div>
            </div>

            {/* CARD 4: RECORDE DE ASSISTÊNCIA NO PERÍODO */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-5 border border-slate-700 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-300 bg-amber-400/20 px-2 py-0.5 rounded-md border border-amber-300/30 flex items-center gap-1">
                  <Award className="w-3 h-3" />
                  Pico no Período
                </span>
                {statsSummary.highestMeeting && (
                  <span className="text-[11px] text-slate-400">
                    {statsSummary.highestMeeting.meeting.date.split('-').reverse().join('/')}
                  </span>
                )}
              </div>
              <div>
                <span className="text-xs text-slate-300 font-medium block">Maior Assistência</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-white">
                    {statsSummary.highestMeeting ? statsSummary.highestMeeting.stats.totalGeral : 0}
                  </span>
                  <span className="text-xs text-slate-300">presentes</span>
                </div>
              </div>
              {statsSummary.highestMeeting && (
                <div className="pt-1 text-xs text-slate-300 space-y-1">
                  <p className="truncate font-medium text-slate-200">
                    {statsSummary.highestMeeting.meeting.titleOrTheme}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    🏛️ {statsSummary.highestMeeting.stats.presencial} no Salão • 📹 {statsSummary.highestMeeting.stats.zoom} no Zoom
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 3. GRÁFICOS PRINCIPAIS */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* GRÁFICO 1: COMPARATIVO DE MÉDIAS (BAR CHART) - 7 colunas */}
            <div className="lg:col-span-7 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-blue-600" />
                    Assistência Média por Tipo de Reunião
                  </h2>
                  <p className="text-xs text-slate-500">
                    Comparação direta entre Meio de Semana, Fim de Semana e Média Geral ({periodLabel})
                  </p>
                </div>
                <span className="text-[11px] font-bold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg self-start sm:self-auto">
                  {filteredMeetings.length} reuniões analisadas
                </span>
              </div>

              {/* Área do Gráfico */}
              <div className="h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={averageComparisonChartData}
                    margin={{ top: 15, right: 10, left: -20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="tipo"
                      stroke="#64748b"
                      fontSize={12}
                      tickLine={false}
                      axisLine={{ stroke: '#cbd5e1' }}
                    />
                    <YAxis
                      stroke="#64748b"
                      fontSize={12}
                      tickLine={false}
                      axisLine={{ stroke: '#cbd5e1' }}
                      domain={[0, Math.ceil((totalActiveCount + 5) / 10) * 10]}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const item = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-white text-xs rounded-xl p-3.5 shadow-xl border border-slate-700 space-y-2 max-w-xs">
                              <div className="border-b border-slate-700 pb-1.5">
                                <p className="font-bold text-sm text-slate-100">{label}</p>
                                <p className="text-slate-400 text-[11px]">{item.subtitulo}</p>
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-blue-300 font-medium">🏛️ Média Salão:</span>
                                  <strong className="text-white">{item['Média Presencial (Salão)']}</strong>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-purple-300 font-medium">📹 Média Zoom:</span>
                                  <strong className="text-white">{item['Média Zoom (Remoto)']}</strong>
                                </div>
                                <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-800">
                                  <span className="text-emerald-400 font-bold">👥 Assistência Média:</span>
                                  <strong className="text-emerald-300 text-sm font-black">{item['Média Total']}</strong>
                                </div>
                                <div className="flex items-center justify-between gap-4 text-[10px] text-slate-400 pt-0.5">
                                  <span>Taxa de Presença:</span>
                                  <span className="text-slate-200 font-bold">{item.taxaPresenca}% dos publicadores</span>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend
                      wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }}
                      iconType="circle"
                    />
                    <Bar
                      dataKey="Média Presencial (Salão)"
                      fill="#2563eb"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={38}
                    />
                    <Bar
                      dataKey="Média Zoom (Remoto)"
                      fill="#9333ea"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={38}
                    />
                    <Bar
                      dataKey="Média Total"
                      fill="#059669"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={38}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Destaque analítico em texto */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600 flex items-start gap-2.5">
                <TrendingUp className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span>
                    No período, as reuniões de <strong>Fim de Semana</strong> registraram média de{' '}
                    <strong>{statsSummary.weekend.avgTotal}</strong> presentes, contra{' '}
                    <strong>{statsSummary.midweek.avgTotal}</strong> no <strong>Meio de Semana</strong>.
                    {statsSummary.weekend.avgTotal > statsSummary.midweek.avgTotal && (
                      <span className="text-emerald-700 font-semibold ml-1">
                        (Diferença de +{(statsSummary.weekend.avgTotal - statsSummary.midweek.avgTotal).toFixed(1)} irmãos no fim de semana)
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* GRÁFICO 2: PROPORÇÃO SALÃO VS ZOOM (PIE CHART / DONUT) - 5 colunas */}
            <div className="lg:col-span-5 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-2xs space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Tv className="w-4 h-4 text-purple-600" />
                  Modalidade da Assistência Média
                </h2>
                <p className="text-xs text-slate-500">
                  Divisão percentual entre Salão do Reino e videoconferência Zoom
                </p>
              </div>

              <div className="h-56 w-full flex items-center justify-center relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={modalityDistributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {modalityDistributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-white text-xs rounded-xl p-2.5 shadow-lg border border-slate-700">
                              <p className="font-bold">{data.name}</p>
                              <p className="text-slate-300">
                                Média: <strong>{data.value}</strong> irmãos ({data.percent}%)
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Texto Central do Donut */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-black text-slate-900">
                    {statsSummary.overall.avgTotal}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">Média Total</span>
                </div>
              </div>

              {/* Legenda com números exatos e porcentagens */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="p-2.5 bg-blue-50/60 rounded-xl border border-blue-100 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-xs text-blue-900 font-bold">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                    <span>Salão Presencial</span>
                  </div>
                  <span className="text-xl font-black text-blue-700 block mt-1">
                    {statsSummary.overall.presencialPct}%
                  </span>
                  <span className="text-[11px] text-slate-500">Média {statsSummary.overall.avgPresencial} irmãos</span>
                </div>

                <div className="p-2.5 bg-purple-50/60 rounded-xl border border-purple-100 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-xs text-purple-900 font-bold">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-600 inline-block" />
                    <span>Zoom Remoto</span>
                  </div>
                  <span className="text-xl font-black text-purple-700 block mt-1">
                    {statsSummary.overall.zoomPct}%
                  </span>
                  <span className="text-[11px] text-slate-500">Média {statsSummary.overall.avgZoom} irmãos</span>
                </div>
              </div>
            </div>
          </div>

          {/* 4. EVOLUÇÃO TEMPORAL REUNIÃO A REUNIÃO (AREA CHART) */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  Evolução Reunião a Reunião nos Últimos 30 Dias
                </h2>
                <p className="text-xs text-slate-500">
                  Acompanhe a assistência presencial, Zoom e total ao longo do tempo
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  Total
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  Salão
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                  Zoom
                </span>
              </div>
            </div>

            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={timelineChartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorPresencial" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorZoom" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#9333ea" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#9333ea" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="label"
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                    domain={[0, Math.ceil((totalActiveCount + 5) / 10) * 10]}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white text-xs rounded-xl p-3.5 shadow-xl border border-slate-700 space-y-2 max-w-xs">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                {d.tipo}
                              </span>
                              <p className="font-bold text-sm text-white">{d.label}</p>
                              <p className="text-[11px] text-slate-300 truncate mt-0.5">{d.tema}</p>
                            </div>
                            <div className="space-y-1 pt-1 border-t border-slate-700">
                              <div className="flex justify-between">
                                <span className="text-blue-300">🏛️ Salão:</span>
                                <strong>{d['Salão (Presencial)']}</strong>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-purple-300">📹 Zoom:</span>
                                <strong>{d['Zoom (Remoto)']}</strong>
                              </div>
                              <div className="flex justify-between pt-1 border-t border-slate-800 text-emerald-300 font-bold">
                                <span>👥 Total Presentes:</span>
                                <strong className="text-emerald-400 font-black">{d['Assistência Total']}</strong>
                              </div>
                              <div className="flex justify-between text-slate-400 text-[10px]">
                                <span>Taxa de Presença:</span>
                                <span className="text-slate-200">{d.Taxa}%</span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="Assistência Total"
                    stroke="#059669"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorTotal)"
                  />
                  <Area
                    type="monotone"
                    dataKey="Salão (Presencial)"
                    stroke="#2563eb"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorPresencial)"
                  />
                  <Area
                    type="monotone"
                    dataKey="Zoom (Remoto)"
                    stroke="#9333ea"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorZoom)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 5. DESEMPENHO MÉDIO POR GRUPO DE SERVIÇO NOS ÚLTIMOS 30 DIAS */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  Média de Assistência por Grupo de Serviço (Grupos 1 a 6)
                </h2>
                <p className="text-xs text-slate-500">
                  Média de presença registrada por grupo ao longo das reuniões dos últimos 30 dias
                </p>
              </div>
            </div>

            <div className="h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={groupPerformanceData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="grupo"
                    stroke="#64748b"
                    fontSize={12}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={12}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const g = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white text-xs rounded-xl p-3 shadow-xl border border-slate-700 space-y-1.5">
                            <p className="font-bold text-sm text-white">
                              {g.grupo} {g.responsavel ? `(${g.responsavel})` : ''}
                            </p>
                            <div className="space-y-1 text-slate-300">
                              <div className="flex justify-between gap-3">
                                <span>🏛️ Média Salão:</span>
                                <strong className="text-blue-300">{g['Média Presencial']}</strong>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span>📹 Média Zoom:</span>
                                <strong className="text-purple-300">{g['Média Zoom']}</strong>
                              </div>
                              <div className="flex justify-between gap-3 pt-1 border-t border-slate-800 text-emerald-300 font-bold">
                                <span>👥 Média Total:</span>
                                <strong className="text-emerald-400 font-black">{g['Média Total']} presentes</strong>
                              </div>
                              <div className="flex justify-between gap-3 text-[10px] text-slate-400">
                                <span>Taxa de Presença:</span>
                                <span className="text-white font-bold">{g.taxaPresenca}% ({g.publicadores} ativos)</span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                  <Bar dataKey="Média Presencial" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={30} />
                  <Bar dataKey="Média Zoom" fill="#9333ea" radius={[4, 4, 0, 0]} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 6. TABELA DETALHADA DAS REUNIÕES DOS ÚLTIMOS 30 DIAS */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  Reuniões Analisadas nos Últimos 30 Dias
                </h2>
                <p className="text-xs text-slate-500">
                  Total de {filteredMeetings.length} reuniões computadas no cálculo das médias
                </p>
              </div>
              {onNavigateToTab && (
                <button
                  type="button"
                  onClick={() => onNavigateToTab('reports')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all self-start sm:self-auto"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Ver Relatórios Completos</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200/80 font-bold">
                    <th className="py-3 px-4">Data & Reunião</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4 text-center">Salão (🏛️)</th>
                    <th className="py-3 px-4 text-center">Zoom (📹)</th>
                    <th className="py-3 px-4 text-center">Total Presentes</th>
                    <th className="py-3 px-4 text-center">Ausentes</th>
                    <th className="py-3 px-4 text-center">% Presença</th>
                    <th className="py-3 px-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMeetings.map((m) => {
                    const s = getMeetingStats(m);
                    const [year, month, day] = m.date.split('-');
                    const dateFormatted = `${day}/${month}/${year}`;
                    const isMidweek = m.type === 'midweek';

                    return (
                      <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">
                            {dateFormatted} ({m.dayOfWeek})
                          </div>
                          <div className="text-xs text-slate-500 truncate max-w-xs sm:max-w-md">
                            {m.titleOrTheme}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold ${
                              isMidweek
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {isMidweek ? 'Meio de Semana' : 'Fim de Semana'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-blue-700">
                          {s.presencial}
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-purple-700">
                          {s.zoom}
                        </td>
                        <td className="py-3.5 px-4 text-center font-black text-slate-900">
                          <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full bg-slate-100 font-black">
                            {s.totalGeral}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center text-rose-600 font-medium">
                          {s.ausente}
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold">
                          <span
                            className={`${
                              s.attendanceRate >= 80
                                ? 'text-emerald-600'
                                : s.attendanceRate >= 65
                                ? 'text-amber-600'
                                : 'text-rose-600'
                            }`}
                          >
                            {s.attendanceRate.toFixed(0)}%
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {onNavigateToAttendance && (
                            <button
                              type="button"
                              onClick={() => onNavigateToAttendance(m.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Abrir chamada desta reunião"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Chamada</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
