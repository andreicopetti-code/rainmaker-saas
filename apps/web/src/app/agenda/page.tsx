import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CalendarView } from '@/components/calendar/CalendarView';
import { getCalendarEvents, getOpportunitiesForSelect } from './actions';

export default async function AgendaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Load 3 months around today for initial render
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 0, 23, 59, 59).toISOString();

  const [events, opportunities] = await Promise.all([
    getCalendarEvents(from, to),
    getOpportunitiesForSelect(),
  ]);

  return (
    <div className="board-page">
      <CalendarView initialEvents={events} opportunities={opportunities} />
    </div>
  );
}
