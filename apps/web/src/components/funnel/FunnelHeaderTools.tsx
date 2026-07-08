'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { listTrashedOpportunities } from '@/app/funil/actions';
import { TrashPanel } from '@/components/funnel/TrashPanel';
import { useFunnelChromeOptional } from '@/lib/funnel/funnel-chrome-context';

export function FunnelHeaderTools() {
  const pathname = usePathname();
  const chrome = useFunnelChromeOptional();
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashCount, setTrashCount] = useState(0);

  useEffect(() => {
    if (!chrome?.active || !chrome.funnelId) {
      setTrashCount(0);
      return;
    }

    let cancelled = false;
    void listTrashedOpportunities(chrome.funnelId)
      .then((rows) => {
        if (!cancelled) setTrashCount(rows.length);
      })
      .catch(() => {
        if (!cancelled) setTrashCount(0);
      });

    return () => {
      cancelled = true;
    };
  }, [chrome?.active, chrome?.funnelId, trashOpen]);

  if (!pathname.startsWith('/funil') || !chrome?.active || chrome.stages.length === 0) {
    return null;
  }

  return (
    <>
      <div className="header-funnel-tools">
        <input
          type="search"
          className="header-search-box"
          placeholder="Buscar deals…"
          value={chrome.search}
          onChange={(e) => chrome.setSearch(e.target.value)}
          aria-label="Buscar deals"
        />
        <button
          type="button"
          className="btn-trash"
          onClick={() => setTrashOpen(true)}
          title="Lixeira"
          aria-label="Abrir lixeira"
        >
          🗑️
          {trashCount > 0 && <span className="btn-trash-badge">{trashCount}</span>}
        </button>
        <button type="button" className="btn-new-deal" onClick={chrome.openNewDeal}>
          + Novo deal
        </button>
      </div>

      <TrashPanel
        open={trashOpen}
        funnelId={chrome.funnelId}
        stageConfig={chrome.stageConfig}
        userRole={chrome.userRole}
        currentUserId={chrome.currentUserId}
        onClose={() => setTrashOpen(false)}
        onCountChange={setTrashCount}
      />
    </>
  );
}
