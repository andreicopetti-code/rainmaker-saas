import type { EmailListItem, EmailMessageRow } from './types';

export const DEFAULT_EMAIL_TEMPLATES = [
  {
    name: 'Apresentação inicial',
    subject: 'Proposta para {{empresa}}',
    body:
      'Olá {{responsavel}},\n\nFicamos felizes em apresentar nossa solução para {{empresa}}.\n\nSegue em anexo nossa proposta comercial. Estou à disposição para tirar dúvidas.\n\nAbraços,\nRainMaker',
  },
  {
    name: 'Follow-up pós-reunião',
    subject: 'Próximos passos — {{empresa}}',
    body:
      'Olá {{responsavel}},\n\nAgradecemos pela reunião de hoje. Conforme conversado, segue um resumo dos próximos passos.\n\nEstamos no aguardo do seu retorno.\n\nAbraços,\nRainMaker',
  },
  {
    name: 'Proposta enviada',
    subject: '[Proposta] {{empresa}} — RainMaker',
    body:
      'Olá {{responsavel}},\n\nSegue nossa proposta formal para {{empresa}} no valor estimado de {{valor}}.\n\nEtapa atual: {{etapa}}.\n\nQualquer dúvida, estou à disposição.\n\nAbraços,\nRainMaker',
  },
  {
    name: 'Reativação de negócio',
    subject: 'Ainda com interesse? — {{empresa}}',
    body:
      'Olá {{responsavel}},\n\nFaz um tempo que não nos falamos sobre o projeto em {{empresa}}.\n\nGostaria de entender se ainda faz sentido avançar. Posso ajudar de alguma forma?\n\nAbraços,\nRainMaker',
  },
] as const;

export function parseAddressList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string' && v.includes('@'));
}

export function rowToListItem(
  row: EmailMessageRow,
  dealLabels: Map<string, string>,
): EmailListItem {
  const toAddresses = parseAddressList(row.to_addresses);
  return {
    id: row.id,
    direction: row.direction,
    fromAddress: row.from_address,
    fromName: row.from_name,
    toAddresses,
    subject: row.subject,
    preview: (row.body_text || '').replace(/\s+/g, ' ').slice(0, 120),
    bodyText: row.body_text,
    isRead: row.is_read,
    sendStatus: row.send_status,
    realSend: row.real_send,
    tracking: (row.tracking as EmailListItem['tracking']) || {},
    opportunityId: row.opportunity_id,
    dealLabel: row.opportunity_id ? dealLabels.get(row.opportunity_id) ?? null : null,
    createdAt: row.created_at,
    sentAt: row.sent_at,
    receivedAt: row.received_at,
  };
}

export function getDisplayName(item: EmailListItem): string {
  if (item.direction === 'outbound') {
    return item.toAddresses[0] || '(sem destinatário)';
  }
  return item.fromName || item.fromAddress || '(desconhecido)';
}

export function getInitials(name: string): string {
  const clean = name.trim();
  if (!clean) return '?';
  if (clean.includes('@')) return clean.charAt(0).toUpperCase();
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.charAt(0).toUpperCase();
}

export function formatEmailTime(iso: string): string {
  const ts = new Date(iso);
  const now = new Date();
  const sameDay =
    ts.toLocaleDateString('pt-BR') === now.toLocaleDateString('pt-BR');
  if (sameDay) {
    return ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return ts.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function formatEmailDateTime(iso: string): string {
  const ts = new Date(iso);
  return (
    ts.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) +
    ' às ' +
    ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  );
}

export function applyTemplateVariables(
  text: string,
  vars: Record<string, string>,
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

export function buildReplySubject(subject: string): string {
  if (/^re:/i.test(subject.trim())) return subject;
  return `RE: ${subject}`;
}

export function buildForwardSubject(subject: string): string {
  if (/^fwd:/i.test(subject.trim())) return subject;
  return `FWD: ${subject}`;
}

export function statusLabel(item: EmailListItem): string {
  if (item.direction === 'inbound') return 'Recebido';
  const map: Record<string, string> = {
    sent: 'Enviado',
    delivered: 'Entregue',
    failed: 'Falhou',
    draft: 'Rascunho',
    received: 'Recebido',
  };
  const key = item.tracking?.status || item.sendStatus;
  return map[key] || key;
}

export function statusClass(item: EmailListItem): string {
  if (item.direction === 'inbound') return 'received';
  return item.tracking?.status || item.sendStatus || 'sent';
}
