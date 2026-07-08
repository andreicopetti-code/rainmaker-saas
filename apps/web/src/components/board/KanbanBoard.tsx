'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  createOpportunity,
  deleteOpportunity,
  moveOpportunity,
  reorderOpportunities,
  updateOpportunity,
} from '@/app/funil/actions';
import { useFunnelChrome } from '@/lib/funnel/funnel-chrome-context';
import { buildVisibleStages } from '@/lib/funnel/stages';
import { resolveStageId, visibleStages } from '@/lib/funnel/stage-config';
import { isLostStage } from '@/lib/ceo/stage-utils';
import { KanbanColumn } from './KanbanColumn';
import { LostReasonModal } from './LostReasonModal';
import { OpportunityModal } from './OpportunityModal';
import { AppointmentQuickModal } from './AppointmentQuickModal';
import type { FunnelData, NextAppointment, OrgMember, OpportunityItem } from './types';

type Props = {
  funnel: FunnelData;
  opportunities: OpportunityItem[];
  userRole: string;
  members: OrgMember[];
  currentUserId: string;
  organizationName?: string;
};

// drop target: { stage, beforeId } where beforeId=null means "end of column"
type DropTarget = { stage: string; beforeId: string | null } | null;

export function KanbanBoard({
  funnel,
  opportunities,
  userRole,
  members,
  currentUserId,
  organizationName,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openedDealRef = useRef<string | null>(null);
  const { search, register, unregister } = useFunnelChrome();
  const stages = useMemo(() => buildVisibleStages(funnel.stageConfig), [funnel.stageConfig]);
  const allStages = useMemo(() => visibleStages(funnel.stageConfig), [funnel.stageConfig]);

  const [localOpps, setLocalOpps] = useState<OpportunityItem[]>(opportunities);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStage, setModalStage] = useState(stages[0]?.id ?? funnel.stageConfig[0]?.id ?? '');
  const [editing, setEditing] = useState<OpportunityItem | null>(null);
  const [schedOpp, setSchedOpp] = useState<OpportunityItem | null>(null);
  const [schedExisting, setSchedExisting] = useState<NextAppointment | null | undefined>(undefined);
  const [lostMove, setLostMove] = useState<{
    id: string;
    targetStage: string;
    beforeId: string | null;
    dealName: string;
  } | null>(null);
  const [, startTransition] = useTransition();

  // sync when server refreshes (but not during active drag)
  useMemo(() => {
    if (!draggingId) setLocalOpps(opportunities);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunities]);

  useEffect(() => {
    const dealId = searchParams.get('deal');
    if (!dealId || openedDealRef.current === dealId) return;
    const opp = opportunities.find((o) => o.id === dealId);
    if (!opp) return;
    openedDealRef.current = dealId;
    setEditing(opp);
    setModalStage(resolveStageId(opp.stage, funnel.stageConfig));
    setModalOpen(true);
  }, [searchParams, opportunities, funnel.stageConfig]);

  useEffect(() => {
    const defaultStage = stages[0]?.id ?? funnel.stageConfig[0]?.id ?? '';
    register({
      funnelId: funnel.id,
      stageConfig: funnel.stageConfig,
      userRole,
      currentUserId,
      stages: stages.map((s) => ({ id: s.id, label: s.label })),
      defaultStage,
      onOpenNewDeal: (stageId) => openCreate(stageId),
    });
    return unregister;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages, funnel.stageConfig, funnel.id, userRole, currentUserId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = localOpps;
    if (q) {
      list = list.filter(
        (o) =>
          o.title.toLowerCase().includes(q) ||
          (o.description ?? '').toLowerCase().includes(q) ||
          (o.contact?.name ?? '').toLowerCase().includes(q) ||
          (o.contact?.company ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [localOpps, search]);

  const byStage = useMemo(() => {
    const map = new Map<string, OpportunityItem[]>();
    for (const stage of stages) map.set(stage.id, []);
    for (const opp of filtered) {
      const stageId = resolveStageId(opp.stage, funnel.stageConfig);
      const list = map.get(stageId) ?? [];
      list.push({ ...opp, stage: stageId });
      map.set(stageId, list);
    }
    return map;
  }, [filtered, stages, funnel.stageConfig]);

  function openCreate(stage: string) {
    setEditing(null);
    setModalStage(stage);
    setModalOpen(true);
  }

  function openEdit(opp: OpportunityItem) {
    setEditing(opp);
    setModalStage(resolveStageId(opp.stage, funnel.stageConfig));
    setModalOpen(true);
  }

  function handleCardDelete(id: string) {
    const prevOpps = localOpps;
    setLocalOpps((prev) => prev.filter((o) => o.id !== id));
    startTransition(async () => {
      try {
        await deleteOpportunity(id);
        router.refresh();
      } catch (err) {
        setLocalOpps(prevOpps);
        alert(err instanceof Error ? err.message : 'Erro ao excluir deal');
      }
    });
  }

  function applyMove(
    id: string,
    target: { stage: string; beforeId: string | null },
    lostReason?: string,
  ) {
    const prevOpps = localOpps;
    const draggedOpp = localOpps.find((o) => o.id === id);
    if (!draggedOpp) return;

    const targetStage = target.stage;
    const sameStage = draggedOpp.stage === targetStage;

    const stageOpps = localOpps
      .filter((o) => o.stage === targetStage && o.id !== id)
      .slice();

    const insertIdx = target.beforeId
      ? stageOpps.findIndex((o) => o.id === target.beforeId)
      : stageOpps.length;

    const idx = insertIdx < 0 ? stageOpps.length : insertIdx;
    stageOpps.splice(idx, 0, {
      ...draggedOpp,
      stage: targetStage,
      lost_reason: lostReason ?? draggedOpp.lost_reason,
    });

    const updatedStage = stageOpps.map((o, i) => ({ ...o, sort_order: i }));
    const newOpps = localOpps
      .filter((o) => o.stage !== targetStage && o.id !== id)
      .concat(updatedStage);

    setLocalOpps(newOpps);

    startTransition(async () => {
      try {
        if (!sameStage) {
          await moveOpportunity(id, funnel.stageConfig, targetStage, lostReason);
        }
        await reorderOpportunities(
          updatedStage.map((o) => ({ id: o.id, sort_order: o.sort_order ?? 0 })),
        );
        router.refresh();
      } catch (err) {
        setLocalOpps(prevOpps);
        alert(err instanceof Error ? err.message : 'Erro ao mover deal');
      }
    });
  }

  function handleDrop() {
    if (!draggingId || !dropTarget) {
      setDraggingId(null);
      setDropTarget(null);
      return;
    }

    const id = draggingId;
    const target = dropTarget;
    const draggedOpp = localOpps.find((o) => o.id === id);

    setDraggingId(null);
    setDropTarget(null);

    if (!draggedOpp) return;

    if (isLostStage(target.stage, funnel.stageConfig) && draggedOpp.stage !== target.stage) {
      const dealName =
        draggedOpp.contact?.company ||
        draggedOpp.contact?.name ||
        draggedOpp.title;
      setLostMove({
        id,
        targetStage: target.stage,
        beforeId: target.beforeId,
        dealName,
      });
      return;
    }

    applyMove(id, target);
  }

  function confirmLostMove(reason: string) {
    if (!lostMove) return;
    const { id, targetStage, beforeId } = lostMove;
    setLostMove(null);
    applyMove(id, { stage: targetStage, beforeId }, reason);
  }

  const isAdmin = userRole === 'admin';
  const showMemberEmptyHint = !isAdmin && opportunities.length === 0;

  return (
    <div className="board-main">
      {showMemberEmptyHint && (
        <div
          style={{
            margin: '0 0 12px',
            padding: '12px 16px',
            borderRadius: 10,
            background: 'var(--blue-bg)',
            border: '1px solid #B6D4F5',
            color: 'var(--text2)',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          Você está em <strong>{organizationName ?? 'sua equipe'}</strong> como membro.
          Só aparecem negócios sob sua responsabilidade — use <strong>+ Novo deal</strong> para cadastrar o primeiro.
        </div>
      )}
      <div className="board">
        {stages.map((stage) => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            stageConfig={funnel.stageConfig}
            opportunities={byStage.get(stage.id) ?? []}
            draggingId={draggingId}
            dropTarget={dropTarget}
            onDragStart={setDraggingId}
            onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
            onSetDropTarget={setDropTarget}
            onDrop={handleDrop}
            onCardClick={openEdit}
            onCardDelete={handleCardDelete}
            onCardSchedule={(opp, existing) => {
              setSchedOpp(opp);
              setSchedExisting(existing);
            }}
          />
        ))}
      </div>

      {schedOpp && (
        <AppointmentQuickModal
          opportunityId={schedOpp.id}
          opportunityName={
            schedOpp.contact?.company ||
            schedOpp.contact?.name ||
            schedOpp.title
          }
          existing={schedExisting ?? undefined}
          onClose={() => { setSchedOpp(null); setSchedExisting(undefined); }}
          onSaved={(appt) => {
            const oppId = schedOpp.id;
            // Optimistic update: apply new appointment immediately to the card
            setLocalOpps((prev) =>
              prev.map((o) =>
                o.id === oppId ? { ...o, next_appointment: appt ?? null } : o,
              ),
            );
            setSchedOpp(null);
            setSchedExisting(undefined);
            startTransition(() => router.refresh());
          }}
        />
      )}

      <LostReasonModal
        open={!!lostMove}
        dealName={lostMove?.dealName ?? ''}
        onCancel={() => setLostMove(null)}
        onConfirm={confirmLostMove}
      />

      <OpportunityModal
        open={modalOpen}
        stageConfig={funnel.stageConfig}
        stageOptions={allStages.map((s) => ({ id: s.id, label: s.label }))}
        initialStage={modalStage}
        opportunity={editing}
        members={members}
        currentUserId={currentUserId}
        userRole={userRole}
        onClose={() => setModalOpen(false)}
        onSave={async (data) => {
          if (editing) {
            await updateOpportunity(editing.id, funnel.stageConfig, data);
          } else {
            await createOpportunity(funnel.id, funnel.stageConfig, data);
          }
          router.refresh();
        }}
        onDelete={
          editing
            ? async () => {
                await deleteOpportunity(editing.id);
                router.refresh();
              }
            : undefined
        }
      />
    </div>
  );
}
