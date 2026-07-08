'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { deleteContact } from '@/app/contatos/actions';
import { ContactRowMenu } from '@/components/contacts/ContactRowMenu';
import type { FunnelStageConfig } from '@/lib/funnel/stage-config';
import { visibleStages } from '@/lib/funnel/stage-config';
import type { ContactAgendaItem } from '@/lib/contacts/types';
import {
  BRAZILIAN_UFS,
  CONTACT_ORIGINS,
  PORTE_FILTER_OPTIONS,
  type ContactSort,
  type ContactTypeFilter,
} from '@/lib/contacts/constants';
import {
  buildSearchHaystack,
  getInitials,
  porteMatchesFilter,
} from '@/lib/contacts/utils';
import { REGIMES_TRIBUTARIOS, SETORES } from '@/components/board/types';

type Props = {
  items: ContactAgendaItem[];
  stageConfig: FunnelStageConfig[];
};

type Filters = {
  search: string;
  type: ContactTypeFilter;
  stage: string;
  sort: ContactSort;
  setor: string;
  regime: string;
  porte: string;
  uf: string;
  origem: string;
};

const EMPTY_FILTERS: Filters = {
  search: '',
  type: '',
  stage: '',
  sort: 'az',
  setor: '',
  regime: '',
  porte: '',
  uf: '',
  origem: '',
};

function hasActiveFilters(f: Filters): boolean {
  return Boolean(
    f.search.trim() ||
    f.type ||
    f.stage ||
    f.setor ||
    f.regime ||
    f.porte ||
    f.uf ||
    f.origem,
  );
}

function ContactRow({
  item,
  onClick,
  onEdit,
  onDelete,
}: {
  item: ContactAgendaItem;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const initials = getInitials(item.displayName);
  const avatarBg = item.stageBg ?? 'var(--blue-bg)';
  const avatarColor = item.stageText ?? 'var(--blue-dark)';

  return (
    <div
      className="contact-row"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
      title={item.opportunityId ? 'Clique para abrir no funil' : 'Contato sem deal no funil'}
    >
      <div className="contact-avatar" style={{ background: avatarBg, color: avatarColor }}>
        {initials}
      </div>
      <div className="contact-name-cell">
        <div className="contact-name">
          {item.displayName}
          <span className={`contact-type-badge ${item.isPJ ? 'pj' : 'pf'}`}>
            {item.isPJ ? 'PJ' : 'PF'}
          </span>
        </div>
        {item.isPJ && item.legalName && item.legalName !== item.displayName ? (
          <div className="contact-sub">{item.legalName}</div>
        ) : null}
      </div>
      <div className="contact-cell contact-mono">{item.doc}</div>
      <div className="contact-cell">
        {item.isPJ && !item.contactPerson ? (
          <span className="contact-decisor-hint">Ver Decisor</span>
        ) : (
          item.contactPerson || (item.isPJ ? '—' : item.displayName)
        )}
      </div>
      <div className="contact-cell">{item.phone || '—'}</div>
      <div className="contact-cell">{item.email || '—'}</div>
      <div className="contact-cell">{item.cityUf || '—'}</div>
      {item.stageLabel ? (
        <span
          className="contact-stage"
          style={{ background: item.stageBg ?? undefined, color: item.stageText ?? undefined }}
        >
          {item.stageLabel}
        </span>
      ) : (
        <span className="contact-stage contact-stage-empty">—</span>
      )}
      <ContactRowMenu
        canEdit={Boolean(item.opportunityId)}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </div>
  );
}

export function ContactsAgenda({ items, stageConfig }: Props) {
  const router = useRouter();
  const stages = useMemo(() => visibleStages(stageConfig), [stageConfig]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [localItems, setLocalItems] = useState(items);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const filtered = useMemo(() => {
    const q = buildSearchHaystack([filters.search.trim()]);

    let list = localItems.filter((item) => {
      if (filters.type === 'pj' && !item.isPJ) return false;
      if (filters.type === 'pf' && item.isPJ) return false;
      if (filters.stage && item.stageId !== filters.stage) return false;
      if (filters.setor && item.setor !== filters.setor) return false;
      if (filters.regime && item.regime !== filters.regime) return false;
      if (!porteMatchesFilter(filters.porte, item.porte)) return false;
      if (filters.uf) {
        const itemUf = item.cityUf?.includes(' / ')
          ? item.cityUf.split(' / ').pop()
          : item.cityUf;
        if (itemUf !== filters.uf) return false;
      }
      if (filters.origem && item.origem !== filters.origem) return false;

      if (filters.search.trim()) {
        const hay = buildSearchHaystack([
          item.displayName,
          item.legalName,
          item.doc,
          item.contactPerson,
          item.phone,
          item.email,
          item.cityUf,
          item.setor,
          item.regime,
        ]);
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      const na = a.displayName.toLowerCase();
      const nb = b.displayName.toLowerCase();
      if (filters.sort === 'az') return na.localeCompare(nb, 'pt-BR');
      if (filters.sort === 'za') return nb.localeCompare(na, 'pt-BR');
      if (filters.sort === 'value-desc') return (b.value ?? 0) - (a.value ?? 0);
      if (filters.sort === 'value-asc') return (a.value ?? 0) - (b.value ?? 0);
      return na.localeCompare(nb, 'pt-BR');
    });

    return list;
  }, [localItems, filters]);

  const isAlphaSort = filters.sort === 'az' || filters.sort === 'za';

  const groups = useMemo(() => {
    if (!isAlphaSort) return null;
    const map = new Map<string, ContactAgendaItem[]>();
    for (const item of filtered) {
      const letter = (item.displayName[0] ?? '#').toUpperCase();
      const key = /[A-ZÀ-ÖØ-Ý]/.test(letter) ? letter : '#';
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    const keys = [...map.keys()].sort((a, b) =>
      filters.sort === 'za' ? b.localeCompare(a, 'pt-BR') : a.localeCompare(b, 'pt-BR'),
    );
    return keys.map((letter) => ({ letter, items: map.get(letter)! }));
  }, [filtered, isAlphaSort, filters.sort]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
  }

  function handleRowClick(item: ContactAgendaItem) {
    if (item.opportunityId) {
      router.push(`/funil?deal=${item.opportunityId}`);
    }
  }

  function handleEdit(item: ContactAgendaItem) {
    if (item.opportunityId) {
      router.push(`/funil?deal=${item.opportunityId}`);
    }
  }

  function handleDelete(item: ContactAgendaItem) {
    const msg = item.opportunityId
      ? `Excluir "${item.displayName}"?\n\nO contato e o deal no funil serão removidos.`
      : `Excluir "${item.displayName}"?\n\nO contato será removido da agenda.`;
    if (!confirm(msg)) return;

    const prev = localItems;
    setLocalItems((list) => list.filter((i) => i.contactId !== item.contactId));

    startTransition(async () => {
      try {
        await deleteContact(item.contactId);
        router.refresh();
      } catch (err) {
        setLocalItems(prev);
        alert(err instanceof Error ? err.message : 'Erro ao excluir contato');
      }
    });
  }

  return (
    <div className="contacts-panel">
      <div className="contacts-toolbar">
        <div className="contacts-toolbar-scroll">
          <input
            className="contacts-search"
            type="search"
            placeholder="Buscar nome, CNPJ, CPF, e-mail…"
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            aria-label="Buscar contatos"
          />
          <select
            value={filters.type}
            onChange={(e) => updateFilter('type', e.target.value as ContactTypeFilter)}
            aria-label="Filtrar por tipo"
          >
            <option value="">Todos os tipos</option>
            <option value="pj">Pessoa Jurídica</option>
            <option value="pf">Pessoa Física</option>
          </select>
          <select
            value={filters.stage}
            onChange={(e) => updateFilter('stage', e.target.value)}
            aria-label="Filtrar por etapa"
          >
            <option value="">Todas as etapas</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <select
            value={filters.sort}
            onChange={(e) => updateFilter('sort', e.target.value as ContactSort)}
            aria-label="Ordenar"
          >
            <option value="az">Nome A → Z</option>
            <option value="za">Nome Z → A</option>
            <option value="value-desc">Maior valor</option>
            <option value="value-asc">Menor valor</option>
          </select>

          <span className="contacts-toolbar-sep" aria-hidden="true" />

          <div className="filter-chip-group">
            <span className="filter-chip-label">Setor</span>
            <select
              value={filters.setor}
              onChange={(e) => updateFilter('setor', e.target.value)}
              aria-label="Filtrar por setor"
            >
              <option value="">Todos</option>
              {SETORES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="filter-chip-group">
            <span className="filter-chip-label">Regime</span>
            <select
              value={filters.regime}
              onChange={(e) => updateFilter('regime', e.target.value)}
              aria-label="Filtrar por regime tributário"
            >
              <option value="">Todos</option>
              {REGIMES_TRIBUTARIOS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="filter-chip-group">
            <span className="filter-chip-label">Porte</span>
            <select
              value={filters.porte}
              onChange={(e) => updateFilter('porte', e.target.value)}
              aria-label="Filtrar por porte"
            >
              <option value="">Todos</option>
              {PORTE_FILTER_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div className="filter-chip-group">
            <span className="filter-chip-label">UF</span>
            <select
              value={filters.uf}
              onChange={(e) => updateFilter('uf', e.target.value)}
              aria-label="Filtrar por UF"
            >
              <option value="">Todas</option>
              {BRAZILIAN_UFS.map((uf) => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </select>
          </div>
          <div className="filter-chip-group">
            <span className="filter-chip-label">Origem</span>
            <select
              value={filters.origem}
              onChange={(e) => updateFilter('origem', e.target.value)}
              aria-label="Filtrar por origem"
            >
              <option value="">Todas</option>
              {CONTACT_ORIGINS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          {hasActiveFilters(filters) ? (
            <button type="button" className="btn-clear-filters" onClick={clearFilters}>
              ✕ Limpar
            </button>
          ) : null}
        </div>
        <span className="contacts-count">
          {filtered.length} contato{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="contacts-body">
        {filtered.length === 0 ? (
          <div className="no-contacts">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
            </svg>
            <p>Nenhum contato encontrado com os filtros aplicados.</p>
            {hasActiveFilters(filters) ? (
              <button type="button" className="btn-clear-filters visible" onClick={clearFilters}>
                Limpar filtros
              </button>
            ) : (
              <p className="no-contacts-hint">
                Adicione deals no{' '}
                <Link href="/funil">funil</Link>
                {' '}ou envie empresas pela{' '}
                <Link href="/empresas">consulta CNPJ</Link>.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="contacts-header-row" aria-hidden="true">
              <span />
              <span>Nome Fantasia</span>
              <span>CNPJ / CPF</span>
              <span>Contato</span>
              <span>Telefone</span>
              <span>E-mail</span>
              <span>Cidade/UF</span>
              <span>Etapa do Funil</span>
              <span />
            </div>

            {isAlphaSort && groups
              ? groups.map(({ letter, items: groupItems }) => (
                  <div key={letter} className="alpha-group">
                    <div className="alpha-letter">{letter}</div>
                    {groupItems.map((item) => (
                      <ContactRow
                        key={item.contactId}
                        item={item}
                        onClick={() => handleRowClick(item)}
                        onEdit={() => handleEdit(item)}
                        onDelete={() => handleDelete(item)}
                      />
                    ))}
                  </div>
                ))
              : filtered.map((item) => (
                  <ContactRow
                    key={item.contactId}
                    item={item}
                    onClick={() => handleRowClick(item)}
                    onEdit={() => handleEdit(item)}
                    onDelete={() => handleDelete(item)}
                  />
                ))}
          </>
        )}
      </div>
    </div>
  );
}
