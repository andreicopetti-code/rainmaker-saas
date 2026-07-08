'use client';

import type { OpportunityItem } from './types';
import type { StageStyle } from '@/lib/funnel/stages';
import type { FunnelStageConfig } from '@/lib/funnel/stage-config';
import { formatBRL } from '@/lib/funnel/stages';
import { OpportunityCard } from './OpportunityCard';

type DropTarget = { stage: string; beforeId: string | null } | null;

type Props = {
  stage: StageStyle;
  stageConfig: FunnelStageConfig[];
  opportunities: OpportunityItem[];
  draggingId: string | null;
  dropTarget: DropTarget;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onSetDropTarget: (t: DropTarget) => void;
  onDrop: () => void;
  onCardClick: (opp: OpportunityItem) => void;
  onCardDelete: (id: string) => void;
  onCardSchedule: (opp: OpportunityItem, existing?: import('./types').NextAppointment) => void;
};

export function KanbanColumn({
  stage,
  stageConfig,
  opportunities,
  draggingId,
  dropTarget,
  onDragStart,
  onDragEnd,
  onSetDropTarget,
  onDrop,
  onCardClick,
  onCardDelete,
  onCardSchedule,
}: Props) {
  const isWon = stage.label.toLowerCase().includes('ganho');
  const isLost = stage.label.toLowerCase().includes('perdido');
  const active = !isWon && !isLost;

  const columnValue = opportunities.reduce((s, o) => s + Number(o.value ?? 0), 0);
  const valueLabel = isWon
    ? (columnValue > 0 ? formatBRL(columnValue) : '—')
    : (columnValue > 0 ? formatBRL(columnValue) : '—');

  const isDropOver = dropTarget?.stage === stage.id;

  function handleCardDragOver(e: React.DragEvent, cardId: string) {
    e.preventDefault();
    e.stopPropagation();
    // determine if mouse is in top or bottom half of the card
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const beforeId = e.clientY < mid
      ? cardId                                                    // insert before this card
      : (opportunities[opportunities.findIndex((o) => o.id === cardId) + 1]?.id ?? null); // insert before next
    onSetDropTarget({ stage: stage.id, beforeId });
  }

  function handleColumnDragOver(e: React.DragEvent) {
    e.preventDefault();
    // only set "end of column" if not hovering over a card
    if (dropTarget?.stage !== stage.id) {
      onSetDropTarget({ stage: stage.id, beforeId: null });
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    // only clear if leaving the column entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      onSetDropTarget(null);
    }
  }

  return (
    <div
      className={`column${isDropOver ? ' drag-over' : ''}`}
      onDragOver={handleColumnDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
    >
      <div className="col-header">
        <div className="col-top">
          <span className="col-name" style={{ color: stage.color }}>
            {stage.label}
          </span>
          <span className="col-count" style={{ background: stage.bg, color: stage.text }}>
            {opportunities.length}
          </span>
        </div>
        {(active || isWon) && (
          <div
            className="col-value"
            style={isWon ? { color: 'var(--green)', fontWeight: 600 } : undefined}
          >
            {valueLabel}
          </div>
        )}
      </div>

      <div className="col-cards">
        {opportunities.map((opp) => {
          const isDraggingThis = opp.id === draggingId;
          const showIndicatorBefore =
            isDropOver && dropTarget?.beforeId === opp.id && !isDraggingThis;

          return (
            <div key={opp.id}>
              {showIndicatorBefore && <div className="drop-indicator" />}
              <OpportunityCard
                opportunity={opp}
                isWon={isWon}
                isDragging={isDraggingThis}
                onClick={() => onCardClick(opp)}
                onDelete={() => onCardDelete(opp.id)}
                onSchedule={(existing) => onCardSchedule(opp, existing)}
                onDragStart={() => onDragStart(opp.id)}
                onDragEnd={onDragEnd}
                onDragOver={(e) => handleCardDragOver(e, opp.id)}
              />
            </div>
          );
        })}

        {/* Indicator at end of column */}
        {isDropOver && dropTarget?.beforeId === null && (
          <div className="drop-indicator" />
        )}

        {opportunities.length === 0 && !isDropOver && (
          <div className="col-empty">Arraste deals aqui</div>
        )}
      </div>
    </div>
  );
}
