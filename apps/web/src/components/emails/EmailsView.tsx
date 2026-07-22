'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { EmailsPageData, EmailFolder, EmailListItem, EmailTemplateRow } from '@/lib/email/types';
import {
  buildForwardSubject,
  buildReplySubject,
  formatEmailDateTime,
  formatEmailTime,
  getDisplayName,
  getInitials,
  statusClass,
  statusLabel,
} from '@/lib/email/utils';
import {
  deleteEmail,
  deleteEmailTemplate,
  disconnectEmailAccount,
  markEmailRead,
  refreshInbox,
  saveEmailJsSettings,
  saveEmailTemplate,
  sendEmail,
} from '@/app/emails/actions';

type Props = { data: EmailsPageData };

const FOLDER_TITLES: Record<EmailFolder, string> = {
  inbox: '📥 Caixa de entrada',
  sent: '📤 Enviados',
  all: '📬 Todos os e-mails',
  templates: '📄 Templates',
};

type ComposeState = {
  title: string;
  to: string;
  subject: string;
  body: string;
  opportunityId: string;
  inReplyTo: string | null;
};

export function EmailsView({ data: initialData }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [folder, setFolder] = useState<EmailFolder>('inbox');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState(initialData.messages);
  const [templates, setTemplates] = useState(initialData.templates);
  const [settings, setSettings] = useState(initialData.settings);
  const [unreadCount, setUnreadCount] = useState(initialData.unreadCount);

  const [composeOpen, setComposeOpen] = useState(false);
  const [compose, setCompose] = useState<ComposeState>({
    title: '✉️ Novo e-mail',
    to: '',
    subject: '',
    body: '',
    opportunityId: '',
    inReplyTo: null,
  });

  const [setupOpen, setSetupOpen] = useState(false);
  const [setupTab, setSetupTab] = useState<'gmail' | 'emailjs'>('gmail');
  const [emailjsForm, setEmailjsForm] = useState({
    fromEmail: '',
    serviceId: '',
    templateId: '',
    publicKey: '',
  });

  const [tplEditorOpen, setTplEditorOpen] = useState(false);
  const [tplEditing, setTplEditing] = useState<EmailTemplateRow | null>(null);
  const [tplForm, setTplForm] = useState({ name: '', subject: '', body: '' });
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    const setupParam = searchParams.get('setup');
    if (setupParam === 'connected') {
      showToast('✅ Gmail conectado com sucesso!');
    } else if (setupParam === 'error') {
      const msg = searchParams.get('msg') || 'Erro na conexão';
      showToast(`❌ ${msg}`);
    }
  }, [searchParams, showToast]);

  const selected = useMemo(
    () => messages.find((m) => m.id === selectedId) ?? null,
    [messages, selectedId],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return messages
      .filter((e) => {
        if (folder === 'inbox') return e.direction === 'inbound';
        if (folder === 'sent') return e.direction === 'outbound';
        return true;
      })
      .filter((e) => {
        if (!q) return true;
        return (
          e.subject.toLowerCase().includes(q) ||
          e.fromAddress.toLowerCase().includes(q) ||
          e.toAddresses.some((t) => t.toLowerCase().includes(q)) ||
          e.bodyText.toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          new Date(b.sentAt || b.receivedAt || b.createdAt).getTime() -
          new Date(a.sentAt || a.receivedAt || a.createdAt).getTime(),
      );
  }, [messages, folder, search]);

  const openCompose = useCallback(
    (opts?: Partial<ComposeState>) => {
      setCompose({
        title: opts?.title ?? '✉️ Novo e-mail',
        to: opts?.to ?? '',
        subject: opts?.subject ?? '',
        body: opts?.body ?? '',
        opportunityId: opts?.opportunityId ?? '',
        inReplyTo: opts?.inReplyTo ?? null,
      });
      setComposeOpen(true);
    },
    [],
  );

  const openEmail = useCallback(
    (item: EmailListItem) => {
      setSelectedId(item.id);
      if (!item.isRead && item.direction === 'inbound') {
        startTransition(async () => {
          await markEmailRead(item.id, true);
          setMessages((prev) =>
            prev.map((m) => (m.id === item.id ? { ...m, isRead: true } : m)),
          );
          setUnreadCount((c) => Math.max(0, c - 1));
        });
      }
    },
    [],
  );

  const handleSend = () => {
    if (!settings.connected) {
      setComposeOpen(false);
      setSetupOpen(true);
      return;
    }

    startTransition(async () => {
      const result = await sendEmail({
        to: compose.to,
        subject: compose.subject,
        body: compose.body,
        opportunityId: compose.opportunityId || null,
        inReplyTo: compose.inReplyTo,
      });

      if (!result.ok) {
        showToast(`❌ ${result.error}`);
        return;
      }

      showToast(`✅ E-mail enviado para ${compose.to}`);
      setComposeOpen(false);
      router.refresh();
    });
  };

  const handleReply = () => {
    if (!selected) return;
    openCompose({
      title: '↩ Responder',
      to:
        selected.direction === 'outbound'
          ? selected.toAddresses[0] || ''
          : selected.fromAddress,
      subject: buildReplySubject(selected.subject),
      body: `\n\n--- Mensagem original ---\n${selected.bodyText}`,
      opportunityId: selected.opportunityId || '',
      inReplyTo: selected.id,
    });
  };

  const handleForward = () => {
    if (!selected) return;
    openCompose({
      title: '→ Encaminhar',
      to: '',
      subject: buildForwardSubject(selected.subject),
      body: `\n\n--- Mensagem encaminhada ---\nDe: ${selected.fromAddress}\n\n${selected.bodyText}`,
      opportunityId: selected.opportunityId || '',
      inReplyTo: null,
    });
  };

  const handleToggleRead = () => {
    if (!selected) return;
    startTransition(async () => {
      const next = !selected.isRead;
      await markEmailRead(selected.id, next);
      setMessages((prev) =>
        prev.map((m) => (m.id === selected.id ? { ...m, isRead: next } : m)),
      );
      if (selected.direction === 'inbound') {
        setUnreadCount((c) => (next ? Math.max(0, c - 1) : c + 1));
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm('Deletar este e-mail? Esta ação não pode ser desfeita.')) return;
    startTransition(async () => {
      await deleteEmail(id);
      if (selectedId === id) setSelectedId(null);
      setMessages((prev) => prev.filter((m) => m.id !== id));
      showToast('✅ E-mail deletado.');
    });
  };

  const applyTemplateToCompose = (tpl: EmailTemplateRow) => {
    setCompose((c) => ({
      ...c,
      subject: tpl.subject,
      body: tpl.body,
    }));
  };

  const handleSaveTemplate = () => {
    startTransition(async () => {
      const result = await saveEmailTemplate({
        id: tplEditing?.id,
        name: tplForm.name,
        subject: tplForm.subject,
        body: tplForm.body,
      });
      if (!result.ok) {
        showToast(result.error ?? 'Erro ao salvar');
        return;
      }
      showToast('Template salvo.');
      setTplEditorOpen(false);
      router.refresh();
    });
  };

  const handleSaveEmailJs = () => {
    startTransition(async () => {
      const result = await saveEmailJsSettings(emailjsForm);
      if (!result.ok) {
        showToast(`❌ ${result.error}`);
        return;
      }
      setSettings((s) => ({
        ...s,
        connected: true,
        provider: 'emailjs',
        fromEmail: emailjsForm.fromEmail,
        emailjsConfigured: true,
      }));
      setSetupOpen(false);
      showToast('✅ Conexão confirmada! E-mail de teste enviado.');
    });
  };

  const handleDisconnect = () => {
    if (!confirm('Remover configuração de e-mail?\nOs e-mails já registrados serão mantidos.')) return;
    startTransition(async () => {
      await disconnectEmailAccount();
      setSettings({
        provider: 'none',
        fromEmail: null,
        fromName: null,
        connected: false,
        lastSyncAt: null,
        emailjsConfigured: false,
      });
      showToast('Configuração removida.');
    });
  };

  const handleSync = () => {
    startTransition(async () => {
      const result = await refreshInbox();
      if (!result.ok) {
        showToast(result.error ?? 'Erro ao sincronizar');
        return;
      }
      showToast('Caixa de entrada atualizada.');
      router.refresh();
    });
  };

  return (
    <div className="emails-page">
      <div className="email-panel">
        {/* Sidebar */}
        <aside className="email-sidebar">
          <div className="email-sidebar-compose">
            <button type="button" onClick={() => openCompose()}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
              </svg>
              Novo E-mail
            </button>
          </div>

          <div className={`email-gmail-banner${settings.connected ? ' connected' : ''}`}>
            <div className="email-gmail-banner-title">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />
              </svg>
              <span>{settings.connected ? '✅ E-mail configurado' : 'Configurar envio de e-mails'}</span>
            </div>
            <div className="email-gmail-banner-sub">
              {settings.connected
                ? settings.fromEmail
                : 'Conecte Gmail (OAuth) ou EmailJS para enviar e receber.'}
            </div>
            <button
              type="button"
              className={`email-gmail-btn${settings.connected ? ' connected' : ''}`}
              onClick={() => (settings.connected ? handleDisconnect() : setSetupOpen(true))}
            >
              <span>{settings.connected ? 'Desconectar' : 'Configurar'}</span>
            </button>
            {settings.provider === 'gmail' && settings.connected ? (
              <button type="button" className="email-gmail-btn" onClick={handleSync} disabled={pending}>
                ↻ Sincronizar inbox
              </button>
            ) : null}
          </div>

          <div className="email-sidebar-section">Pastas</div>
          {(['inbox', 'sent', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`email-sidebar-item${folder === f ? ' active' : ''}`}
              onClick={() => {
                setFolder(f);
                setSelectedId(null);
              }}
            >
              <FolderIcon folder={f} />
              <span>
                {f === 'inbox' ? 'Caixa de entrada' : f === 'sent' ? 'Enviados' : 'Todos os e-mails'}
              </span>
              {f === 'inbox' && unreadCount > 0 ? (
                <span className="email-count">{unreadCount}</span>
              ) : null}
            </button>
          ))}

          <div className="email-sidebar-section" style={{ marginTop: 8 }}>
            Templates
          </div>
          <button
            type="button"
            className={`email-sidebar-item${folder === 'templates' ? ' active' : ''}`}
            onClick={() => {
              setFolder('templates');
              setSelectedId(null);
            }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
            </svg>
            <span>Gerenciar templates</span>
          </button>
        </aside>

        {/* Main */}
        <div className="email-main">
          <div className="email-toolbar">
            <div className="email-toolbar-title">{FOLDER_TITLES[folder]}</div>
            {folder !== 'templates' ? (
              <>
                <input
                  className="email-search-box"
                  placeholder="Buscar e-mails..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button type="button" className="btn-primary" style={{ fontSize: 12, padding: '7px 14px' }} onClick={() => openCompose()}>
                  ✉️ Novo e-mail
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn-primary"
                style={{ fontSize: 12, padding: '7px 14px' }}
                onClick={() => {
                  setTplEditing(null);
                  setTplForm({ name: '', subject: '', body: '' });
                  setTplEditorOpen(true);
                }}
              >
                + Novo template
              </button>
            )}
          </div>

          {folder !== 'templates' ? (
            <div className="email-list">
              {filtered.length === 0 ? (
                <div className="email-list-empty">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />
                  </svg>
                  Nenhum e-mail encontrado.
                </div>
              ) : (
                filtered.map((item) => (
                  <EmailRow
                    key={item.id}
                    item={item}
                    selected={selectedId === item.id}
                    onOpen={() => openEmail(item)}
                    onDelete={() => handleDelete(item.id)}
                  />
                ))
              )}
            </div>
          ) : (
            <div className="email-templates-panel active">
              <div id="email-templates-list-body">
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="email-template-row"
                    onClick={() => {
                      setTplEditing(tpl);
                      setTplForm({ name: tpl.name, subject: tpl.subject, body: tpl.body });
                      setTplEditorOpen(true);
                    }}
                    onKeyDown={() => {}}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="email-template-row-name">{tpl.name}</div>
                    <div className="email-template-row-subject">{tpl.subject}</div>
                    <button
                      type="button"
                      className="email-template-del"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!confirm('Excluir este template?')) return;
                        startTransition(async () => {
                          await deleteEmailTemplate(tpl.id);
                          setTemplates((t) => t.filter((x) => x.id !== tpl.id));
                          showToast('Template excluído.');
                        });
                      }}
                      title="Excluir"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className={`email-template-edit-area${tplEditorOpen ? ' open' : ''}`}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>
                  {tplEditing ? 'Editar template' : 'Novo template'}
                </div>
                <div className="email-compose-field" style={{ marginBottom: 10 }}>
                  <div className="email-compose-label">Nome do template</div>
                  <input
                    className="email-compose-input"
                    value={tplForm.name}
                    onChange={(e) => setTplForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Ex: Apresentação inicial"
                  />
                </div>
                <div className="email-compose-field" style={{ marginBottom: 10 }}>
                  <div className="email-compose-label">Assunto</div>
                  <input
                    className="email-compose-input"
                    value={tplForm.subject}
                    onChange={(e) => setTplForm((f) => ({ ...f, subject: e.target.value }))}
                  />
                </div>
                <div className="email-compose-field" style={{ marginBottom: 14 }}>
                  <div className="email-compose-label">
                    Corpo — variáveis: {'{{empresa}}'}, {'{{responsavel}}'}, {'{{etapa}}'}, {'{{valor}}'}
                  </div>
                  <textarea
                    className="email-compose-textarea"
                    style={{ minHeight: 140 }}
                    value={tplForm.body}
                    onChange={(e) => setTplForm((f) => ({ ...f, body: e.target.value }))}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn-primary" onClick={handleSaveTemplate} disabled={pending}>
                    Salvar template
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setTplEditorOpen(false)}>
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Detail panel */}
        <aside className={`email-detail${selected ? '' : ' hidden'}`}>
          {selected ? (
            <>
              <div className="email-detail-header">
                <div className="email-detail-top">
                  <div className="email-detail-subject">{selected.subject || '(sem assunto)'}</div>
                  <button type="button" className="email-detail-close" onClick={() => setSelectedId(null)}>
                    ×
                  </button>
                </div>
                <div className="email-detail-meta">
                  <span>
                    {selected.direction === 'outbound'
                      ? `Para: ${selected.toAddresses.join(', ')}`
                      : `De: ${selected.fromName || selected.fromAddress}`}
                  </span>
                  <span>{formatEmailDateTime(selected.sentAt || selected.receivedAt || selected.createdAt)}</span>
                  {selected.dealLabel ? (
                    <span style={{ color: 'var(--blue)', fontWeight: 600 }}>📋 {selected.dealLabel}</span>
                  ) : null}
                </div>
              </div>

              {selected.direction === 'outbound' && selected.tracking ? (
                <div className="email-tracking-bar">
                  <div className="email-tracking-title">📊 Rastreamento</div>
                  {selected.tracking.sentAt ? (
                    <div className="email-tracking-event">
                      <div className="email-tracking-dot sent" />
                      Enviado — {formatEmailDateTime(selected.tracking.sentAt)}
                    </div>
                  ) : null}
                  {selected.tracking.deliveredAt ? (
                    <div className="email-tracking-event">
                      <div className="email-tracking-dot delivered" />
                      Entregue — {formatEmailDateTime(selected.tracking.deliveredAt)}
                    </div>
                  ) : null}
                  {selected.realSend ? (
                    <div className="email-tracking-event" style={{ color: 'var(--green)' }}>
                      <div className="email-tracking-dot delivered" />
                      Enviado via {settings.provider === 'gmail' ? 'Gmail' : settings.provider === 'emailjs' ? 'EmailJS' : 'Resend'} ✓
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="email-detail-body">{selected.bodyText}</div>
              <div className="email-detail-footer">
                <button type="button" className="btn-primary" style={{ fontSize: 12, padding: '7px 14px' }} onClick={handleReply}>
                  ↩ Responder
                </button>
                <button type="button" className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }} onClick={handleForward}>
                  → Encaminhar
                </button>
                <button type="button" className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }} onClick={handleToggleRead}>
                  {selected.isRead ? 'Marcar como não lido' : 'Marcar como lido'}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ fontSize: 12, padding: '7px 14px', color: 'var(--red)', marginLeft: 'auto' }}
                  onClick={() => handleDelete(selected.id)}
                >
                  🗑 Deletar
                </button>
              </div>
            </>
          ) : null}
        </aside>
      </div>

      {/* Compose modal */}
      <div
        className={`email-compose-overlay${composeOpen ? ' open' : ''}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setComposeOpen(false);
        }}
        onKeyDown={() => {}}
        role="presentation"
      >
        <div className="email-compose-modal">
          <div className="email-compose-header">
            <div className="email-compose-title">{compose.title}</div>
            <button type="button" className="email-detail-close" onClick={() => setComposeOpen(false)}>
              ×
            </button>
          </div>
          <div className="email-compose-body">
            <div className="email-compose-field">
              <div className="email-compose-label">Para</div>
              <input
                className="email-compose-input"
                value={compose.to}
                onChange={(e) => setCompose((c) => ({ ...c, to: e.target.value }))}
                placeholder="email@exemplo.com"
              />
            </div>
            <div className="email-compose-field">
              <div className="email-compose-label">Assunto</div>
              <input
                className="email-compose-input"
                value={compose.subject}
                onChange={(e) => setCompose((c) => ({ ...c, subject: e.target.value }))}
              />
            </div>
            <div className="email-compose-field">
              <div className="email-compose-label">Negócio (opcional)</div>
              <select
                className="email-compose-input"
                value={compose.opportunityId}
                onChange={(e) => {
                  const oppId = e.target.value;
                  const deal = initialData.deals.find((d) => d.id === oppId);
                  setCompose((c) => ({
                    ...c,
                    opportunityId: oppId,
                    to: c.to || deal?.contactEmail || c.to,
                  }));
                }}
              >
                <option value="">— Nenhum —</option>
                {initialData.deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            {templates.length > 0 ? (
              <div className="email-template-strip">
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    className="email-template-chip"
                    onClick={() => applyTemplateToCompose(tpl)}
                  >
                    {tpl.name}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="email-compose-field">
              <div className="email-compose-label">Mensagem</div>
              <textarea
                className="email-compose-textarea"
                value={compose.body}
                onChange={(e) => setCompose((c) => ({ ...c, body: e.target.value }))}
              />
            </div>
          </div>
          <div className="email-compose-footer">
            <div
              className="email-compose-from"
              style={{ color: settings.connected ? 'var(--green)' : 'var(--red)' }}
            >
              {settings.connected ? (
                <>
                  ✅ <strong>Enviando via {settings.provider}</strong> — {settings.fromEmail}
                </>
              ) : (
                <>
                  ⚠️ <strong>E-mail não configurado</strong> —{' '}
                  <button type="button" style={{ color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }} onClick={() => { setComposeOpen(false); setSetupOpen(true); }}>
                    Configurar agora
                  </button>
                </>
              )}
            </div>
            <button type="button" className="btn-ghost" onClick={() => setComposeOpen(false)}>
              Cancelar
            </button>
            <button type="button" className="btn-primary" onClick={handleSend} disabled={pending}>
              {pending ? '⏳ Enviando...' : '📤 Enviar'}
            </button>
          </div>
        </div>
      </div>

      {/* Setup modal */}
      <div
        className={`gmail-setup-overlay${setupOpen ? ' open' : ''}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSetupOpen(false);
        }}
        onKeyDown={() => {}}
        role="presentation"
      >
        <div className="gmail-setup-modal">
          <div className="gmail-setup-header">
            <div className="gmail-setup-header-icon">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="#2477D4" aria-hidden="true">
                <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div className="gmail-setup-title">Configurar envio e recebimento</div>
              <div className="gmail-setup-sub">Gmail OAuth (recomendado) ou EmailJS (legado, só envio).</div>
            </div>
            <button type="button" className="email-detail-close" onClick={() => setSetupOpen(false)}>
              ×
            </button>
          </div>
          <div className="gmail-setup-body">
            <div className="gmail-setup-tabs">
              <button
                type="button"
                className={`gmail-setup-tab${setupTab === 'gmail' ? ' active' : ''}`}
                onClick={() => setSetupTab('gmail')}
              >
                Gmail (OAuth)
              </button>
              <button
                type="button"
                className={`gmail-setup-tab${setupTab === 'emailjs' ? ' active' : ''}`}
                onClick={() => setSetupTab('emailjs')}
              >
                EmailJS
              </button>
            </div>

            {setupTab === 'gmail' ? (
              <>
                <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
                  Conecte sua conta Google para <strong>enviar</strong> e <strong>receber</strong> e-mails diretamente
                  no RainMaker. Requer variáveis <code>GOOGLE_CLIENT_ID</code> e <code>GOOGLE_CLIENT_SECRET</code> no servidor.
                </p>
                <a href="/api/email/google" className="btn-primary" style={{ textAlign: 'center', textDecoration: 'none' }}>
                  Conectar conta Google
                </a>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
                  Use EmailJS (gratuito, ~200 e-mails/mês). Configure em{' '}
                  <a href="https://www.emailjs.com/" target="_blank" rel="noreferrer">
                    emailjs.com
                  </a>
                  . Apenas envio — recebimento requer Gmail OAuth.
                </p>
                <div>
                  <div className="gmail-setup-input-label">Seu e-mail (remetente)</div>
                  <input
                    className="gmail-setup-clientid-input"
                    type="email"
                    value={emailjsForm.fromEmail}
                    onChange={(e) => setEmailjsForm((f) => ({ ...f, fromEmail: e.target.value }))}
                    placeholder="seuemail@gmail.com"
                  />
                </div>
                <div>
                  <div className="gmail-setup-input-label">Service ID</div>
                  <input
                    className="gmail-setup-clientid-input"
                    value={emailjsForm.serviceId}
                    onChange={(e) => setEmailjsForm((f) => ({ ...f, serviceId: e.target.value }))}
                    placeholder="service_abc123"
                  />
                </div>
                <div>
                  <div className="gmail-setup-input-label">Template ID</div>
                  <input
                    className="gmail-setup-clientid-input"
                    value={emailjsForm.templateId}
                    onChange={(e) => setEmailjsForm((f) => ({ ...f, templateId: e.target.value }))}
                    placeholder="template_xyz789"
                  />
                </div>
                <div>
                  <div className="gmail-setup-input-label">Public Key</div>
                  <input
                    className="gmail-setup-clientid-input"
                    value={emailjsForm.publicKey}
                    onChange={(e) => setEmailjsForm((f) => ({ ...f, publicKey: e.target.value }))}
                  />
                </div>
                <button type="button" className="btn-primary" onClick={handleSaveEmailJs} disabled={pending}>
                  {pending ? 'Testando...' : 'Salvar e ativar'}
                </button>
              </>
            )}
          </div>
          <div className="gmail-setup-footer">
            <button type="button" className="btn-ghost" onClick={() => setSetupOpen(false)}>
              Fechar
            </button>
          </div>
        </div>
      </div>

      {toast ? <div className="email-toast">{toast}</div> : null}
    </div>
  );
}

function FolderIcon({ folder }: { folder: 'inbox' | 'sent' | 'all' }) {
  if (folder === 'sent') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />
    </svg>
  );
}

function EmailRow({
  item,
  selected,
  onOpen,
  onDelete,
}: {
  item: EmailListItem;
  selected: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const dispName = getDisplayName(item);
  const initials = getInitials(dispName);
  const time = formatEmailTime(item.sentAt || item.receivedAt || item.createdAt);
  const isOut = item.direction === 'outbound';

  return (
    <div
      className={`email-row${!item.isRead && !isOut ? ' unread' : ''}${selected ? ' selected' : ''}`}
      onClick={onOpen}
      onKeyDown={() => {}}
      role="button"
      tabIndex={0}
    >
      <div className={`email-row-avatar${isOut ? ' out' : ''}`}>{initials}</div>
      <div className="email-row-body">
        <div className="email-row-from">{dispName}</div>
        <div className="email-row-subject">{item.subject || '(sem assunto)'}</div>
        <div className="email-row-preview">{item.preview}</div>
      </div>
      <div className="email-row-meta">
        <div className="email-row-time">{time}</div>
        <div className="email-row-badges">
          <span className={`email-status-badge ${statusClass(item)}`}>{statusLabel(item)}</span>
          {item.realSend ? (
            <span style={{ fontSize: 10, background: '#E6F5EC', color: '#1E8A4C', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>
              ✓ Enviado
            </span>
          ) : null}
          {item.dealLabel ? <span className="email-deal-tag">{item.dealLabel}</span> : null}
        </div>
        <button
          type="button"
          style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Deletar e-mail"
        >
          🗑
        </button>
      </div>
    </div>
  );
}
