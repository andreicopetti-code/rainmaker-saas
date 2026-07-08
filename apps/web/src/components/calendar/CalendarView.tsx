'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  toggleCalendarEventDone,
  deleteCalendarEvent,
} from '@/app/agenda/actions';
import { CalendarEventModal } from './CalendarEventModal';
import { APPOINTMENT_TIPOS } from '@/components/board/types';
import { AppointmentTipoIcon } from '@/components/board/AppointmentTipoIcon';
import { getApptDisplay, apptTipoStyle } from '@/lib/appointments/display';
import {
  appDateKey,
  formatApptPipelineDate,
  formatApptTime,
  isScheduledToday,
  scheduledAtToDate,
} from '@/lib/appointments/datetime';
import { formatPhoneBr, phoneTelHref } from '@/lib/contacts/format-phone';
import type { CalendarEvent } from '@/app/agenda/actions';

type View = 'mes' | 'semana';

function fmtPipelineDate(iso: string) {
  return formatApptPipelineDate(iso);
}

function isToday2(iso: string) {
  return isScheduledToday(iso);
}

const WEEK_DAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const MONTH_NAMES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

type Props = {
  initialEvents: CalendarEvent[];
  opportunities: { id: string; label: string }[];
};

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmtTime(iso: string) {
  return formatApptTime(iso);
}

function eventDisplayName(ev: CalendarEvent) {
  return ev.contact_company || ev.contact_name || ev.opportunity_title || ev.title;
}

function eventLabel(ev: CalendarEvent) {
  const name = eventDisplayName(ev);
  const tipo = APPOINTMENT_TIPOS.find(t => t.id === ev.tipo);
  return `${fmtTime(ev.scheduled_at)} ${name} – ${tipo?.label ?? ev.tipo}`;
}

function EventChip({
  ev,
  onClick,
}: {
  ev: CalendarEvent;
  onClick: () => void;
}) {
  const display = getApptDisplay(ev.tipo, ev.scheduled_at, ev.done);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={ev.title}
      className={`cal-event-chip ${display.statusClass} appt-chip--with-bar`}
      style={apptTipoStyle(display.tipoAccent)}
    >
      <span
        className="appt-tipo-bar"
        style={{ background: display.tipoAccent }}
        aria-hidden="true"
      />
      {eventLabel(ev)}
    </button>
  );
}

export function CalendarView({ initialEvents, opportunities }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const today = new Date();
  const [view, setView] = useState<View>('mes');
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - d.getDay()); // Sunday
    return d;
  });
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [modalOpen, setModalOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [defaultDate, setDefaultDate] = useState<string>('');
  const [expandDay, setExpandDay] = useState<string | null>(null);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState<string | null>(null);

  function openCreate(date?: string) {
    setEditEvent(null);
    setDefaultDate(date ?? isoDate(today));
    setModalOpen(true);
  }
  function openEdit(ev: CalendarEvent) {
    setEditEvent(ev);
    setDefaultDate(scheduledAtToDate(ev.scheduled_at));
    setModalOpen(true);
  }

  function openDeal(dealId: string) {
    router.push(`/funil?deal=${dealId}`);
  }

  function handleSaved(updated: CalendarEvent) {
    setEvents((prev) => {
      const exists = prev.find((e) => e.id === updated.id);
      return exists
        ? prev.map((e) => e.id === updated.id ? updated : e)
        : [...prev, updated];
    });
    setModalOpen(false);
    startTransition(() => router.refresh());
  }

  function handleDeleted(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setModalOpen(false);
    startTransition(async () => {
      await deleteCalendarEvent(id);
      router.refresh();
    });
  }

  function handleToggleDone(id: string) {
    setEvents((prev) => prev.map((e) => e.id === id ? { ...e, done: !e.done } : e));
    startTransition(async () => {
      const ev = events.find(e => e.id === id);
      if (ev) await toggleCalendarEventDone(id, !ev.done);
    });
  }

  // Month navigation
  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }
  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    const d = new Date(today);
    d.setDate(d.getDate() - d.getDay());
    setWeekStart(new Date(d));
  }

  // Week navigation
  function prevWeek() { setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; }); }
  function nextWeek() { setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; }); }

  // Events by date key
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = appDateKey(ev.scheduled_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    // sort each day by time
    map.forEach((list) => list.sort((a, b) =>
      new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    ));
    return map;
  }, [events]);

  /* ── MONTH VIEW ─────────────────────────────────────────────────────── */
  const monthGrid = useMemo(() => {
    const first = new Date(year, month, 1);
    const startDay = first.getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const cells: { date: Date; isCurrentMonth: boolean }[] = [];
    // prev month padding
    for (let i = startDay - 1; i >= 0; i--) {
      cells.push({ date: new Date(year, month - 1, prevMonthDays - i), isCurrentMonth: false });
    }
    // current month
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
    }
    // next month padding to fill 6 rows
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      cells.push({ date: new Date(year, month + 1, d), isCurrentMonth: false });
    }
    return cells;
  }, [year, month]);

  /* ── WEEK VIEW ──────────────────────────────────────────────────────── */
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const todayKey = isoDate(today);

  /* ── Header label ───────────────────────────────────────────────────── */
  const headerLabel = view === 'mes'
    ? `${MONTH_NAMES[month]} ${year}`
    : (() => {
        const end = new Date(weekStart); end.setDate(end.getDate() + 6);
        return `${weekStart.getDate()}/${weekStart.getMonth()+1} – ${end.getDate()}/${end.getMonth()+1}/${end.getFullYear()}`;
      })();

  const MAX_VISIBLE = 3;

  // Unique stages from linked events (preserving funnel order as encountered)
  const pipelineStages = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const ev of events) {
      if (ev.opportunity_stage && !seen.has(ev.opportunity_stage)) {
        seen.add(ev.opportunity_stage);
        list.push(ev.opportunity_stage);
      }
    }
    return list;
  }, [events]);

  // Pipeline: all events sorted chronologically, pending first then done
  const pipelineEvents = useMemo(() => {
    const filtered = stageFilter
      ? events.filter(ev => ev.opportunity_stage === stageFilter)
      : events;
    return [...filtered].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
    });
  }, [events, stageFilter]);

  // Group pipeline events by date label
  const pipelineGroups = useMemo(() => {
    const groups: { label: string; dateKey: string; items: CalendarEvent[] }[] = [];
    for (const ev of pipelineEvents) {
      const { date } = fmtPipelineDate(ev.scheduled_at);
      const dk = appDateKey(ev.scheduled_at);
      const last = groups[groups.length - 1];
      if (last && last.dateKey === dk) {
        last.items.push(ev);
      } else {
        groups.push({ label: date, dateKey: dk, items: [ev] });
      }
    }
    return groups;
  }, [pipelineEvents]);

  return (
    <div className="cal-wrap" style={{ flexDirection: 'row', padding: 0 }}>
    {/* ── Main calendar column ── */}
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 20px', minWidth: 0, overflow: 'hidden' }}>
      {/* ── Toolbar ── */}
      <div className="cal-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="cal-nav-btn" onClick={view === 'mes' ? prevMonth : prevWeek}>‹</button>
          <span className="cal-month-label">{headerLabel}</span>
          <button className="cal-nav-btn" onClick={view === 'mes' ? nextMonth : nextWeek}>›</button>
          <button className="btn-ghost" style={{ padding: '4px 12px', fontSize: 12 }} onClick={goToday}>Hoje</button>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['mes', 'semana'] as View[]).map((v) => (
            <button
              key={v}
              className={`cal-view-btn${view === v ? ' active' : ''}`}
              onClick={() => setView(v)}
            >
              {v === 'mes' ? 'Mês' : 'Semana'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button
            className={`cal-view-btn${pipelineOpen ? ' active' : ''}`}
            onClick={() => setPipelineOpen(o => !o)}
            title="Abrir painel pipeline"
          >
            ⚡ Pipeline
          </button>
          <button className="btn-primary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => openCreate()}>
            + Novo Evento
          </button>
        </div>
      </div>

      {/* ── Week-days header ── */}
      <div className="cal-weekdays">
        {WEEK_DAYS.map((d) => (
          <div key={d} className="cal-weekday">{d}</div>
        ))}
      </div>

      {/* ── Month Grid ── */}
      {view === 'mes' && (
        <div className="cal-grid">
          {monthGrid.map(({ date, isCurrentMonth }, idx) => {
            const key = isoDate(date);
            const isToday = key === todayKey;
            const dayEvents = eventsByDate.get(key) ?? [];
            const isExpanded = expandDay === key;
            const visible = isExpanded ? dayEvents : dayEvents.slice(0, MAX_VISIBLE);
            const overflow = dayEvents.length - MAX_VISIBLE;

            return (
              <div
                key={idx}
                className={`cal-cell${isToday ? ' today' : ''}${!isCurrentMonth ? ' other-month' : ''}`}
                onClick={() => openCreate(key)}
              >
                <div className={`cal-day-num${isToday ? ' today' : ''}`}>{date.getDate()}</div>
                {visible.map((ev) => (
                  <EventChip key={ev.id} ev={ev} onClick={() => openEdit(ev)} />
                ))}
                {!isExpanded && overflow > 0 && (
                  <button
                    type="button"
                    className="cal-overflow-btn"
                    onClick={(e) => { e.stopPropagation(); setExpandDay(key); }}
                  >
                    +{overflow} mais
                  </button>
                )}
                {isExpanded && (
                  <button
                    type="button"
                    className="cal-overflow-btn"
                    onClick={(e) => { e.stopPropagation(); setExpandDay(null); }}
                  >
                    Menos ▲
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Week Grid ── */}
      {view === 'semana' && (
        <div className="cal-week-grid">
          {weekDays.map((date) => {
            const key = isoDate(date);
            const isToday = key === todayKey;
            const dayEvents = eventsByDate.get(key) ?? [];

            return (
              <div
                key={key}
                className={`cal-week-col${isToday ? ' today' : ''}`}
                onClick={() => openCreate(key)}
              >
                <div className={`cal-week-day-header${isToday ? ' today' : ''}`}>
                  <span className="cal-week-day-name">{WEEK_DAYS[date.getDay()]}</span>
                  <span className={`cal-week-day-num${isToday ? ' today' : ''}`}>{date.getDate()}</span>
                </div>
                <div className="cal-week-events">
                  {dayEvents.map((ev) => (
                    <EventChip key={ev.id} ev={ev} onClick={() => openEdit(ev)} />
                  ))}
                  {dayEvents.length === 0 && (
                    <div style={{ fontSize: 10, color: 'var(--text3)', padding: '4px 2px' }}>—</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal ── */}
      {modalOpen && (
        <CalendarEventModal
          event={editEvent}
          defaultDate={defaultDate}
          opportunities={opportunities}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onToggleDone={handleToggleDone}
          onOpenDeal={openDeal}
        />
      )}
    </div>{/* end main column */}

    {/* ── Pipeline side panel ── */}
    <div className={`cal-pipeline${pipelineOpen ? ' open' : ''}`}>
      {/* Panel header */}
      <div className="cal-pipeline-header">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="cal-pipeline-title">⚡ Pipeline</span>
          <span style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>
            {pipelineEvents.filter(e => !e.done).length} pendente(s)
          </span>
        </div>
        <button
          type="button"
          className="cal-nav-btn"
          onClick={() => setPipelineOpen(false)}
          title="Fechar pipeline"
          style={{ fontSize: 16 }}
        >
          ›
        </button>
      </div>

      {/* Stage filter chips */}
      {pipelineStages.length > 0 && (
        <div className="cal-pipeline-filters">
          <button
            type="button"
            className={`cal-pipeline-filter-chip${stageFilter === null ? ' active' : ''}`}
            onClick={() => setStageFilter(null)}
          >
            Todas
          </button>
          {pipelineStages.map((stage) => (
            <button
              key={stage}
              type="button"
              className={`cal-pipeline-filter-chip${stageFilter === stage ? ' active' : ''}`}
              onClick={() => setStageFilter(s => s === stage ? null : stage)}
            >
              {stage}
            </button>
          ))}
        </div>
      )}

      {/* Event list */}
      <div className="cal-pipeline-body">
        {pipelineGroups.length === 0 && (
          <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>
            Nenhum compromisso encontrado.
          </div>
        )}

        {pipelineGroups.map((group) => {
          const isGroupToday = isToday2(group.items[0].scheduled_at);
          return (
            <div key={group.dateKey} className="cal-pipeline-group">
              {/* Date separator */}
              <div className={`cal-pipeline-date-sep${isGroupToday ? ' today' : ''}`}>
                {isGroupToday ? `Hoje — ${group.label}` : group.label}
              </div>

              {group.items.map((ev) => {
                const tipo = APPOINTMENT_TIPOS.find(t => t.id === ev.tipo);
                const { time } = fmtPipelineDate(ev.scheduled_at);
                const display = getApptDisplay(ev.tipo, ev.scheduled_at, ev.done);
                const name = ev.contact_company || ev.contact_name || ev.opportunity_title || ev.title;
                const phone = ev.contact_phone?.trim() || null;
                const phoneDisplay = phone ? formatPhoneBr(phone) : null;
                const phoneHref = phone ? phoneTelHref(phone) : '';

                return (
                  <div
                    key={ev.id}
                    role="button"
                    tabIndex={0}
                    className={`cal-pipeline-item${ev.done ? ' done' : ''}${display.status === 'overdue' ? ' overdue' : ''}`}
                    onClick={() => openEdit(ev)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openEdit(ev);
                      }
                    }}
                  >
                    {/* Time column */}
                    <div className="cal-pipeline-time">{time}</div>

                    {/* Barra = tipo */}
                    <div
                      className="cal-pipeline-bar"
                      style={{ background: ev.done ? '#C8CDD6' : display.tipoAccent }}
                    />

                    {/* Content — fundo sutil = situação */}
                    <div
                      className={`cal-pipeline-content cal-pipeline-content--${display.status}`}
                      style={apptTipoStyle(display.tipoAccent)}
                    >
                      <div className="cal-pipeline-name">{name}</div>
                      <div className="cal-pipeline-meta">
                        <div className="cal-pipeline-meta-col">
                          <span className="cal-pipeline-tipo">
                            <AppointmentTipoIcon tipo={ev.tipo} badge size={9} />
                            {tipo?.label ?? ev.tipo}
                          </span>
                          {phoneDisplay && phoneHref && (
                            <a
                              href={phoneHref}
                              className="cal-pipeline-phone"
                              onClick={(e) => e.stopPropagation()}
                              title="Ligar"
                            >
                              {phoneDisplay}
                            </a>
                          )}
                        </div>
                        {ev.opportunity_stage && !stageFilter && (
                          <span className="cal-pipeline-stage-tag">{ev.opportunity_stage}</span>
                        )}
                        {ev.location && <span>· 📍 {ev.location}</span>}
                      </div>
                    </div>

                    {/* Done indicator */}
                    {ev.opportunity_id && (
                      <button
                        type="button"
                        className="cal-pipeline-open-deal"
                        title="Abrir negócio no funil"
                        aria-label="Abrir negócio no funil"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeal(ev.opportunity_id!);
                        }}
                      >
                        ↗
                      </button>
                    )}
                    {ev.done && (
                      <div style={{ flexShrink: 0, fontSize: 12, color: '#9AA0B0' }}>✓</div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>

    </div>
  );
}
