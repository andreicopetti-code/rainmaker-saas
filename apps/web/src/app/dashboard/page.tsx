import { redirect } from 'next/navigation';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { getDashboardData } from './actions';
import './dashboard.css';

export default async function DashboardPage() {
  const data = await getDashboardData();
  if (!data) redirect('/login');

  return (
    <div className="dashboard-page">
      <DashboardView data={data} />
    </div>
  );
}
