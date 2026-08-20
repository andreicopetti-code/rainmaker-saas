import { redirect } from 'next/navigation';
import { CalendarView } from '@/components/calendar/CalendarView';
import { getAgendaPageData } from './actions';

export default async function AgendaPage() {
  const data = await getAgendaPageData();
  if (!data) redirect('/login');

  return (
    <div className="board-page">
      <CalendarView
        initialEvents={data.events}
        opportunities={data.opportunities}
        members={data.members}
        currentUserId={data.currentUserId}
      />
    </div>
  );
}
