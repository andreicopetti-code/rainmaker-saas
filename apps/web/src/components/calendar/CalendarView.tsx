'use client';

import { useState, useMemo, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  toggleCalendarEventDone,
  deleteCalendarEvent,
} from '@/app/agenda/actions';
import { CalendarEventModal, type CalendarCreateSeed } from './CalendarEventModal';
import { APPOINTMENT_TIPOS } from '@/components/board/types';
import { AppointmentTipoIcon } from '@/components/board/AppointmentTipoIcon';
import { getApptDisplay, apptTipoStyle } from '@/lib/appointments/display';
import {
  appDateKey,
  buildScheduledAt,
  formatApptPipelineDate,
  formatApptTime,
  isScheduledToday,
  scheduledAtToDate,
  scheduledAtToTime,
  suggestNextApptDateKey,
  todayInAppTz,
} from '@/lib/appointments/datetime';
import { formatPhoneBr, phoneTelHref } from '@/lib/contacts/format-phone';
import { memberDisplayName } from '@/lib/org/member-display';
import type { CalendarEvent } from '@/app/agenda/actions';
import type { OrgMember } from '@/components/board/types';

type View = 'mes' | 'semana';
type SidePanel = 'none' | 'pipeline' | 'overdue';
type PersonFilter = 'all' | string;

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
  members: OrgMember[];
  currentUserId: string;
};

function daysOverdueLabel(iso: string): string {
  const today = todayInAppTz();
  const day = appDateKey(iso);
  const t0 = new Date(`${today}T12:00:00`);
  const t1 = new Date(`${day}T12:00:00`);
  const days = Math.max(0, Math.floor((t0.getTime() - t1.getTime()) / 86400000));
  if (days === 0) return 'hoje';
  if (days === 1) return '1 dia';
  return `${days} dias`;
}

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
  dragging,
  onDragStart,
  onDragEnd,
}: {
  ev: CalendarEvent;
  onClick: () => void;
  dragging?: boolean;
  onDragStart: (e: React.DragEvent, ev: CalendarEvent) => void;
  onDragEnd: () => void;
}) {
  const display = getApptDisplay(ev.tipo, ev.scheduled_at, ev.done);
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => onDragStart(e, ev)}
      onDragEnd={onDragEnd}
      onClick={(e) => { e.stopPropagation(); if (dragging) return; onClick(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }
      }}
      title={`${ev.title} · Arraste para outro dia`}
      className={`cal-event-chip ${display.statusClass} appt-chip--with-bar${dragging ? ' is-dragging' : ''}`}
      style={{
        ...apptTipoStyle(display.tipoAccent),
        cursor: 'grab',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <span
        className="appt-tipo-bar"
        style={{ background: display.tipoAccent }}
        aria-hidden="true"
      />
      {eventLabel(ev)}
    </div>
  );
}

export function CalendarView({
  initialEvents,
  opportunities,
  members,
  currentUserId,
}: Props) {
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
  const expandRef = useRef<HTMLDivElement>(null);
  const [sidePanel, setSidePanel] = useState<SidePanel>('none');
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [personFilter, setPersonFilter] = useState<PersonFilter>(
    () => (members.length > 1 ? currentUserId : 'all'),
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropDate, setDropDate] = useState<string | null>(null);
  const [focusTime, setFocusTime] = useState(false);
  const [createSeed, setCreateSeed] = useState<CalendarCreateSeed | null>(null);
  const [nextPrompt, setNextPrompt] = useState<{
    opportunityId: string;
    name: string;
  } | null>(null);
  const skipClickRef = useRef(false);
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    setEvents(initialEvents);
  }, [initialEvents]);

  useEffect(() => {
    if (!expandDay) return;
    function onPointerDown(e: MouseEvent) {
      if (expandRef.current && !expandRef.current.contains(e.target as Node)) {
        setExpandDay(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setExpandDay(null);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [expandDay]);

  function openCreate(date?: string) {
    setEditEvent(null);
    setCreateSeed(null);
    setDefaultDate(date ?? isoDate(today));
    setFocusTime(false);
    setModalOpen(true);
  }
  function openEdit(ev: CalendarEvent) {
    setCreateSeed(null);
    setEditEvent(ev);
    setDefaultDate(scheduledAtToDate(ev.scheduled_at));
    setFocusTime(false);
    setModalOpen(true);
  }

  function openReschedule(ev: CalendarEvent, newDate: string) {
    if (scheduledAtToDate(ev.scheduled_at) === newDate) return;
    setCreateSeed(null);
    setEditEvent({
      ...ev,
      scheduled_at: buildScheduledAt(newDate, scheduledAtToTime(ev.scheduled_at)),
    });
    setDefaultDate(newDate);
    setFocusTime(true);
    setModalOpen(true);
  }

  function openNextAppointment(prompt: {
    opportunityId: string;
    name: string;
  }) {
    setNextPrompt(null);
    setEditEvent(null);
    setCreateSeed({
      opportunityId: prompt.opportunityId,
      tipo: 'followup',
      title: '',
      date: suggestNextApptDateKey(),
      headline: 'Próximo compromisso',
    });
    setDefaultDate(suggestNextApptDateKey());
    setFocusTime(true);
    setModalOpen(true);
  }

  function handleChipDragStart(e: React.DragEvent, ev: CalendarEvent) {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/calendar-event-id', ev.id);
    e.dataTransfer.setData('text/plain', ev.id);
    // Transparent drag image keeps the chip readable; empty canvas avoids text-selection ghost.
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      e.dataTransfer.setDragImage(canvas, 0, 0);
    } catch {
      /* ignore */
    }
    skipClickRef.current = true;
    setDraggingId(ev.id);
  }

  function handleChipDragEnd() {
    setDraggingId(null);
    setDropDate(null);
    window.setTimeout(() => { skipClickRef.current = false; }, 0);
  }

  function handleDayDragOver(e: React.DragEvent, dateKey: string) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dropDate !== dateKey) setDropDate(dateKey);
  }

  function handleDayDragLeave(e: React.DragEvent, dateKey: string) {
    const next = e.relatedTarget;
    if (next instanceof Node && e.currentTarget.contains(next)) return;
    setDropDate((prev) => (prev === dateKey ? null : prev));
  }

  function handleDayDrop(e: React.DragEvent, dateKey: string) {
    e.preventDefault();
    e.stopPropagation();
    const id =
      e.dataTransfer.getData('text/calendar-event-id') ||
      e.dataTransfer.getData('text/plain') ||
      draggingId;
    setDraggingId(null);
    setDropDate(null);
    skipClickRef.current = true;
    window.setTimeout(() => { skipClickRef.current = false; }, 0);
    const current = eventsRef.current.find((x) => x.id === id);
    if (current) openReschedule(current, dateKey);
  }

  function handleDayClick(dateKey: string) {
    if (skipClickRef.current || draggingId) return;
    openCreate(dateKey);
  }

  function eventChipProps(ev: CalendarEvent) {
    return {
      ev,
      onClick: () => {
        if (skipClickRef.current) return;
        openEdit(ev);
      },
      dragging: draggingId === ev.id,
      onDragStart: handleChipDragStart,
      onDragEnd: handleChipDragEnd,
    };
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
    const ev = eventsRef.current.find((e) => e.id === id);
    if (!ev) return;
    const nextDone = !ev.done;
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, done: nextDone } : e)));
    startTransition(async () => {
      await toggleCalendarEventDone(id, nextDone);
    });

    if (nextDone && ev.opportunity_id) {
      setModalOpen(false);
      setEditEvent(null);
      setCreateSeed(null);
      setNextPrompt({
        opportunityId: ev.opportunity_id,
        name:
          ev.contact_company ||
          ev.contact_name ||
          ev.opportunity_title ||
          ev.title,
      });
    }
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

  const showPersonFilter = members.length > 1;

  const filteredEvents = useMemo(() => {
    if (personFilter === 'all') return events;
    return events.filter((ev) => ev.assignee_id === personFilter);
  }, [events, personFilter]);

  // Events by date key (respects person filter)
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of filteredEvents) {
      const key = appDateKey(ev.scheduled_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    map.forEach((list) => list.sort((a, b) =>
      new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    ));
    return map;
  }, [filteredEvents]);

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
    for (const ev of filteredEvents) {
      if (ev.opportunity_stage && !seen.has(ev.opportunity_stage)) {
        seen.add(ev.opportunity_stage);
        list.push(ev.opportunity_stage);
      }
    }
    return list;
  }, [filteredEvents]);

  // Pipeline: all events sorted chronologically, pending first then done
  const pipelineEvents = useMemo(() => {
    const filtered = stageFilter
      ? filteredEvents.filter(ev => ev.opportunity_stage === stageFilter)
      : filteredEvents;
    return [...filtered].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
    });
  }, [filteredEvents, stageFilter]);

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

  const overdueEvents = useMemo(() => {
    return filteredEvents
      .filter((ev) => !ev.done && getApptDisplay(ev.tipo, ev.scheduled_at, ev.done).status === 'overdue')
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [filteredEvents]);

  function toggleSidePanel(panel: Exclude<SidePanel, 'none'>) {
    setSidePanel((prev) => (prev === panel ? 'none' : panel));
  }

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
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
          {showPersonFilter && (
            <select
              className="cal-person-filter"
              value={personFilter}
              onChange={(e) => setPersonFilter(e.target.value as PersonFilter)}
              title="Filtrar por responsável"
              aria-label="Filtrar por responsável"
            >
              <option value="all">Todos</option>
              <option value={currentUserId}>Eu</option>
              {members
                .filter((m) => m.user_id !== currentUserId)
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {memberDisplayName(m)}
                  </option>
                ))}
            </select>
          )}
          <button
            className={`cal-view-btn${sidePanel === 'overdue' ? ' active' : ''}${overdueEvents.length > 0 ? ' cal-view-btn--warn' : ''}`}
            onClick={() => toggleSidePanel('overdue')}
            title="Compromissos atrasados"
          >
            Atrasados{overdueEvents.length > 0 ? ` (${overdueEvents.length})` : ''}
          </button>
          <button
            className={`cal-view-btn${sidePanel === 'pipeline' ? ' active' : ''}`}
            onClick={() => toggleSidePanel('pipeline')}
            title="Abrir painel pipeline"
          >
            Pipeline
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
            const visible = dayEvents.slice(0, MAX_VISIBLE);
            const overflow = dayEvents.length - MAX_VISIBLE;

            return (
              <div
                key={idx}
                ref={isExpanded ? expandRef : undefined}
                className={`cal-cell${isToday ? ' today' : ''}${!isCurrentMonth ? ' other-month' : ''}${isExpanded ? ' is-expanded' : ''}${dropDate === key ? ' drop-target' : ''}`}
                data-cal-date={key}
                onClick={() => handleDayClick(key)}
                onDragOver={(e) => handleDayDragOver(e, key)}
                onDragLeave={(e) => handleDayDragLeave(e, key)}
                onDrop={(e) => handleDayDrop(e, key)}
              >
                <div className={`cal-day-num${isToday ? ' today' : ''}`}>{date.getDate()}</div>
                <div className="cal-cell-events">
                  {visible.map((ev) => (
                    <EventChip key={ev.id} {...eventChipProps(ev)} />
                  ))}
                </div>
                {overflow > 0 && !isExpanded && (
                  <button
                    type="button"
                    className="cal-overflow-btn"
                    onClick={(e) => { e.stopPropagation(); setExpandDay(key); }}
                  >
                    +{overflow} mais
                  </button>
                )}
                {isExpanded && (
                  <div
                    className="cal-day-popover"
                    role="dialog"
                    aria-label={`Compromissos de ${date.getDate()}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="cal-day-popover-head">
                      <div className={`cal-day-num${isToday ? ' today' : ''}`}>{date.getDate()}</div>
                      <button
                        type="button"
                        className="cal-overflow-btn"
                        onClick={(e) => { e.stopPropagation(); setExpandDay(null); }}
                      >
                        Menos ▲
                      </button>
                    </div>
                    <div className="cal-day-popover-list">
                      {dayEvents.map((ev) => (
                        <EventChip key={ev.id} {...eventChipProps(ev)} />
                      ))}
                    </div>
                  </div>
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
                className={`cal-week-col${isToday ? ' today' : ''}${dropDate === key ? ' drop-target' : ''}`}
                data-cal-date={key}
                onClick={() => handleDayClick(key)}
                onDragOver={(e) => handleDayDragOver(e, key)}
                onDragLeave={(e) => handleDayDragLeave(e, key)}
                onDrop={(e) => handleDayDrop(e, key)}
              >
                <div className={`cal-week-day-header${isToday ? ' today' : ''}`}>
                  <span className="cal-week-day-name">{WEEK_DAYS[date.getDay()]}</span>
                  <span className={`cal-week-day-num${isToday ? ' today' : ''}`}>{date.getDate()}</span>
                </div>
                <div className="cal-week-events">
                  {dayEvents.map((ev) => (
                    <EventChip key={ev.id} {...eventChipProps(ev)} />
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
          key={`${editEvent?.id ?? 'new'}-${defaultDate}-${createSeed?.opportunityId ?? ''}`}
          event={editEvent}
          defaultDate={defaultDate}
          opportunities={opportunities}
          currentUserId={currentUserId}
          createSeed={createSeed}
          onClose={() => {
            setModalOpen(false);
            setCreateSeed(null);
          }}
          onSaved={(ev) => {
            handleSaved(ev);
            setCreateSeed(null);
          }}
          onDeleted={handleDeleted}
          onToggleDone={handleToggleDone}
          onOpenDeal={openDeal}
          autoFocusTime={focusTime}
        />
      )}

      {nextPrompt && (
        <div className="overlay open" onClick={() => setNextPrompt(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Compromisso concluído</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
                  Agendar o próximo com{' '}
                  <strong style={{ color: 'var(--text2)' }}>{nextPrompt.name}</strong>?
                </div>
              </div>
              <button type="button" className="btn-close" onClick={() => setNextPrompt(null)}>×</button>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn-ghost" onClick={() => setNextPrompt(null)}>
                Agora não
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => openNextAppointment(nextPrompt)}
              >
                Agendar próximo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>{/* end main column */}

    {/* ── Overdue side panel ── */}
    <div className={`cal-pipeline${sidePanel === 'overdue' ? ' open' : ''}`}>
      <div className="cal-pipeline-header">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="cal-pipeline-title">Atrasados</span>
          <span style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>
            {overdueEvents.length === 0
              ? 'Nada pendente'
              : `${overdueEvents.length} compromisso(s)`}
          </span>
        </div>
        <button
          type="button"
          className="cal-nav-btn"
          onClick={() => setSidePanel('none')}
          title="Fechar"
          style={{ fontSize: 16 }}
        >
          ›
        </button>
      </div>
      <div className="cal-pipeline-body">
        {overdueEvents.length === 0 && (
          <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>
            Nenhum compromisso atrasado
            {personFilter !== 'all' ? ' neste filtro' : ''}.
          </div>
        )}
        {overdueEvents.map((ev) => {
          const tipo = APPOINTMENT_TIPOS.find((t) => t.id === ev.tipo);
          const { date, time } = fmtPipelineDate(ev.scheduled_at);
          const display = getApptDisplay(ev.tipo, ev.scheduled_at, ev.done);
          const name = ev.contact_company || ev.contact_name || ev.opportunity_title || ev.title;
          return (
            <div
              key={ev.id}
              role="button"
              tabIndex={0}
              className="cal-pipeline-item overdue"
              onClick={() => openEdit(ev)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openEdit(ev);
                }
              }}
            >
              <div className="cal-pipeline-time">{time}</div>
              <div
                className="cal-pipeline-bar"
                style={{ background: display.tipoAccent }}
              />
              <div
                className="cal-pipeline-content cal-pipeline-content--overdue"
                style={apptTipoStyle(display.tipoAccent)}
              >
                <div className="cal-pipeline-name">{name}</div>
                <div className="cal-pipeline-meta">
                  <span className="cal-pipeline-tipo">
                    <AppointmentTipoIcon tipo={ev.tipo} badge size={9} />
                    {tipo?.label ?? ev.tipo}
                  </span>
                  <span className="cal-overdue-badge">
                    {date} · {daysOverdueLabel(ev.scheduled_at)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="cal-overdue-done"
                title="Marcar feito"
                aria-label="Marcar feito"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleDone(ev.id);
                }}
              >
                ✓
              </button>
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
            </div>
          );
        })}
      </div>
    </div>

    {/* ── Pipeline side panel ── */}
    <div className={`cal-pipeline${sidePanel === 'pipeline' ? ' open' : ''}`}>
      {/* Panel header */}
      <div className="cal-pipeline-header">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="cal-pipeline-title">Pipeline</span>
          <span style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>
            {pipelineEvents.filter(e => !e.done).length} pendente(s)
          </span>
        </div>
        <button
          type="button"
          className="cal-nav-btn"
          onClick={() => setSidePanel('none')}
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
