import { redirect } from 'next/navigation';
import { ContactsAgenda } from '@/components/contacts/ContactsAgenda';
import { getContactsAgenda } from './actions';
import './contatos.css';

export default async function ContatosPage() {
  const data = await getContactsAgenda();
  if (!data) redirect('/login');

  return (
    <div className="contacts-page">
      <ContactsAgenda items={data.items} stageConfig={data.stageConfig} />
    </div>
  );
}
