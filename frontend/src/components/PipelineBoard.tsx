import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, type Deal, type Stage } from "../api/client";
import { formatDate } from "../lib/dates";
import { formatUsd } from "../lib/money";
import {
  STAGES,
  applyMove,
  boardTotals,
  columnDeals,
  columnTotals,
  isLate,
} from "../lib/pipeline";
import DealForm from "./DealForm";

const columnDroppableId = (stage: Stage): string => `column:${stage}`;

interface DealCardProps {
  deal: Deal;
  organizationName: string;
  late: boolean;
  onOpen: (deal: Deal) => void;
}

function DealCard({ deal, organizationName, late, onOpen }: DealCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deal.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`deal-card${late ? " late" : ""}${isDragging ? " dragging" : ""}`}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(deal)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(deal);
        }
      }}
    >
      <div className="deal-card-name">{deal.name}</div>
      <div className="deal-card-org muted">{organizationName}</div>
      <div className="deal-card-foot">
        <span className="num">{formatUsd(deal.value_cents)}</span>
        <span className="num">{deal.probability}%</span>
        <span className="deal-card-date num">
          {formatDate(deal.close_date)}
          {late ? <span className="late-pill">Late</span> : null}
        </span>
      </div>
    </div>
  );
}

interface PipelineColumnProps {
  stage: Stage;
  deals: Deal[];
  organizationNameOf: (deal: Deal) => string;
  isOver: boolean;
  onAdd: () => void;
  onOpen: (deal: Deal) => void;
}

function PipelineColumn({
  stage,
  deals,
  organizationNameOf,
  isOver,
  onAdd,
  onOpen,
}: PipelineColumnProps) {
  const { setNodeRef } = useDroppable({ id: columnDroppableId(stage) });
  const totals = columnTotals(deals, stage);

  return (
    <section
      ref={setNodeRef}
      className={`pipeline-column${isOver ? " over" : ""}`}
      aria-label={`${stage} column`}
    >
      <header className="column-head">
        <span className={`badge badge-${stage}`}>{stage}</span>
        <span className="column-count num">{totals.count}</span>
        <button type="button" className="link-button" onClick={onAdd}>
          Add
        </button>
      </header>
      <p className="column-totals num">
        {formatUsd(totals.valueCents)}
        <span className="muted">
          {" "}
          · expected {formatUsd(totals.expectedCents)}
        </span>
      </p>
      <SortableContext
        items={deals.map((deal) => deal.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="column-cards">
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              organizationName={organizationNameOf(deal)}
              late={isLate(deal)}
              onOpen={onOpen}
            />
          ))}
        </div>
      </SortableContext>
      {deals.length === 0 ? (
        <p className="muted column-empty">No deals.</p>
      ) : null}
    </section>
  );
}

export default function PipelineBoard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const dealsQuery = useQuery({ queryKey: ["deals"], queryFn: api.deals.list });
  const { data: organizations = [] } = useQuery({
    queryKey: ["organizations"],
    queryFn: api.organizations.list,
  });
  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: api.contacts.list,
  });

  const [addingStage, setAddingStage] = useState<Stage | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState(false);
  const lastDragEnd = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const deals = dealsQuery.data ?? [];
  const board = boardTotals(deals);

  const organizationNameOf = (deal: Deal): string =>
    organizations.find(
      (organization) => organization.id === deal.organization_id,
    )?.name ?? "";

  const moveDeal = async (dealId: number, stage: Stage, position: number) => {
    const previous = queryClient.getQueryData<Deal[]>(["deals"]);
    if (previous) {
      queryClient.setQueryData(
        ["deals"],
        applyMove(previous, dealId, stage, position),
      );
    }
    try {
      await api.deals.move(dealId, { stage, position });
      setMoveError(false);
    } catch (error) {
      console.error(error);
      setMoveError(true);
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["deals"] }),
      queryClient.invalidateQueries({ queryKey: ["activities"] }),
    ]);
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over ? String(event.over.id) : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    lastDragEnd.current = Date.now();
    setOverId(null);

    const { active, over } = event;
    if (!over) {
      return;
    }
    const dealId = Number(active.id);
    const deal = deals.find((row) => row.id === dealId);
    if (!deal) {
      return;
    }

    const overKey = String(over.id);
    if (overKey.startsWith("column:")) {
      const stage = overKey.slice("column:".length) as Stage;
      const others = columnDeals(
        deals.filter((row) => row.id !== dealId),
        stage,
      );
      void moveDeal(dealId, stage, others.length);
      return;
    }

    const overDeal = deals.find((row) => row.id === Number(over.id));
    if (!overDeal || overDeal.id === dealId) {
      return;
    }
    // The over-card's index in the full column: works for both within-column
    // reorders (the dragged card is part of that list) and cross-column drops.
    const fullColumn = columnDeals(deals, overDeal.stage);
    const overIndex = fullColumn.findIndex((row) => row.id === overDeal.id);
    void moveDeal(dealId, overDeal.stage, Math.max(0, overIndex));
  };

  const openDeal = (deal: Deal) => {
    // A drag must not also navigate: clicks within a beat of the drop are ignored.
    if (Date.now() - lastDragEnd.current < 300) {
      return;
    }
    navigate(`/deals/${deal.id}`);
  };

  const handleCreate = async (
    payload: Parameters<typeof api.deals.create>[0],
  ) => {
    await api.deals.create(payload);
    await queryClient.invalidateQueries({ queryKey: ["deals"] });
    setAddingStage(null);
  };

  if (dealsQuery.isLoading) {
    return <p className="muted">Loading…</p>;
  }
  if (dealsQuery.isError) {
    return (
      <p className="form-error" role="alert">
        Could not load deals.
      </p>
    );
  }

  return (
    <div>
      {moveError ? (
        <p className="form-error" role="alert">
          Could not move the deal. The board shows the saved state again.
        </p>
      ) : null}
      <div className="board-header">
        <span>
          <span className="muted">Open pipeline</span>{" "}
          <strong className="num">{formatUsd(board.valueCents)}</strong>
        </span>
        <span>
          <span className="muted">Expected</span>{" "}
          <strong className="num">{formatUsd(board.expectedCents)}</strong>
        </span>
        <span className="muted">{board.count} open deals</span>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setOverId(null)}
      >
        <div className="pipeline-board">
          {STAGES.map((stage) => (
            <PipelineColumn
              key={stage}
              stage={stage}
              deals={columnDeals(deals, stage)}
              organizationNameOf={organizationNameOf}
              isOver={overId === columnDroppableId(stage)}
              onAdd={() => setAddingStage(stage)}
              onOpen={openDeal}
            />
          ))}
        </div>
      </DndContext>

      {addingStage ? (
        <DealForm
          organizations={organizations}
          contacts={contacts}
          initialStage={addingStage}
          onSubmit={handleCreate}
          onCancel={() => setAddingStage(null)}
        />
      ) : null}
    </div>
  );
}
