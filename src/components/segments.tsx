import type { ReactNode } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { SegmentCalc } from "../lib/calc";
import { fmt } from "../lib/calc";
import { isTypeAllowed, TRENCH_META } from "../data/catalogs";
import type { ProjectState, Segment } from "../lib/types";
import {
  FlashValue,
  IconPlus,
  IconTrash,
  IconWarn,
  NumInput,
  Panel,
} from "./ui";

const cell = "px-2 py-2 align-middle";

/* ================= drag handle ================= */
function DragHandle({ className = "" }: { className?: string }) {
  return (
    <button
      className={`btn cursor-grab active:cursor-grabbing p-1 text-mut2 hover:text-accent rounded ${className}`}
      title="Перетащить участок"
      {...{ "data-drag-handle": true }}
    >
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
        <circle cx="5" cy="3" r="1.3" />
        <circle cx="11" cy="3" r="1.3" />
        <circle cx="5" cy="8" r="1.3" />
        <circle cx="11" cy="8" r="1.3" />
        <circle cx="5" cy="13" r="1.3" />
        <circle cx="11" cy="13" r="1.3" />
      </svg>
    </button>
  );
}

/* ================= sortable row wrapper ================= */
function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (dragHandle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
    position: isDragging ? ("relative" as const) : undefined,
  };

  const handle = <DragHandle />;

  return (
    <tr ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children(handle)}
    </tr>
  );
}

/* ================= insert row ================= */
function InsertRow({ onInsert }: { onInsert: () => void }) {
  return (
    <tr className="group/ins">
      <td colSpan={11} className="p-0">
        <button
          onClick={onInsert}
          className="btn w-full flex items-center gap-2 px-3 py-[3px] text-[10px] font-semibold uppercase tracking-[0.14em] text-mut2 opacity-45 group-hover/ins:opacity-100 hover:!text-accent transition-all"
        >
          <span className="flex-1 border-t border-dashed border-line2 group-hover/ins:border-accent/50" />
          <IconPlus className="w-3 h-3" /> вставить участок
          <span className="flex-1 border-t border-dashed border-line2 group-hover/ins:border-accent/50" />
        </button>
      </td>
    </tr>
  );
}

/* ================= main table ================= */
export function SegmentsTable({
  state,
  calcs,
  onUpdate,
  onInsert,
  onRemove,
  onReorder,
  onOpenSurfaces,
}: {
  state: ProjectState;
  calcs: SegmentCalc[];
  onUpdate: (id: string, part: Partial<Segment>) => void;
  onInsert: (index: number) => void;
  onRemove: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  onOpenSurfaces: () => void;
}) {
  /* Неприменимые на этом классе напряжения типы не предлагаем выбирать */
  const activeTypes = state.types.filter((t) => isTypeAllowed(state.voltage, t));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id));
    }
  };

  const thCls =
    "px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-mut whitespace-nowrap";

  const segmentIds = state.segments.map((s) => s.id);

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-line bg-raise">
        <span className="text-[11px] text-mut">
          Участков: <b className="font-mono text-ink">{state.segments.length}</b>
          {activeTypes.length === 0 && (
            <span className="ml-2 inline-flex items-center gap-1 text-danger">
              <IconWarn className="w-3.5 h-3.5" /> нет активных типов прокладки
            </span>
          )}
        </span>
        <button
          onClick={onOpenSurfaces}
          className="btn text-[11px] font-semibold text-accent border border-line2 rounded-md px-2.5 py-1.5 hover:bg-accent-soft hover:border-accent/50"
        >
          Типы покрытий…
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={segmentIds} strategy={verticalListSortingStrategy}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[1020px]">
              <thead>
                <tr className="border-b border-line bg-raise text-mut">
                  <th className={`${thCls} w-8`} />
                  <th className={`${thCls} pl-2`}>Точки</th>
                  <th className={thCls}>Тип прокладки</th>
                  <th className={`${thCls} text-right`}>L, м</th>
                  <th className={`${thCls} text-right`}>H1, м</th>
                  <th className={`${thCls} text-right`}>H2, м</th>
                  <th className={thCls}>Покрытие</th>
                  <th className={`${thCls} text-right`}>H ср., м</th>
                  <th className={`${thCls} text-right`}>Земля, м³</th>
                  <th className={`${thCls} text-right`}>Кабель, м</th>
                  <th className={`${thCls} w-10`} />
                </tr>
              </thead>
              <tbody>
                <InsertRow onInsert={() => onInsert(0)} />
                {state.segments.map((s, idx) => {
                  const c = calcs[idx];
                  const inactive = !c.active;
                  return (
                    <SortableRow key={s.id} id={s.id}>
                      {(dragHandle) => (
                        <>
                          <td className={`${cell} pl-2`}>{dragHandle}</td>
                          <td className={cell}>
                            <div className="flex items-center gap-1.5 font-mono text-xs">
                              <input
                                value={s.from}
                                onChange={(e) => onUpdate(s.id, { from: e.target.value })}
                                className="w-11 bg-well border border-line rounded px-1.5 py-1 text-center text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                              />
                              <span className="text-mut2">–</span>
                              <input
                                value={s.to}
                                onChange={(e) => onUpdate(s.id, { to: e.target.value })}
                                className="w-11 bg-well border border-line rounded px-1.5 py-1 text-center text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                              />
                            </div>
                          </td>
                          <td className={cell}>
                            <div className="relative">
                              <select
                                value={s.type}
                                onChange={(e) =>
                                  onUpdate(s.id, { type: e.target.value as Segment["type"] })
                                }
                                className="w-full bg-well border border-line rounded-md px-2.5 py-1.5 pr-8 text-xs text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 appearance-none cursor-pointer"
                              >
                                {activeTypes.map((t) => (
                                  <option key={t} value={t}>
                                    {TRENCH_META[t].letter}) {TRENCH_META[t].label}
                                  </option>
                                ))}
                                {!activeTypes.includes(s.type) && (
                                  <option value={s.type}>{TRENCH_META[s.type].label} — выключен</option>
                                )}
                              </select>
                              <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-mut2">
                                <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              {inactive && (
                                <span className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-danger" title="Тип прокладки не активен" />
                              )}
                            </div>
                          </td>
                          <td className={`${cell} text-right`}>
                            <NumInput value={s.length} onChange={(n) => onUpdate(s.id, { length: n })} step={1} center className="w-24 ml-auto" />
                          </td>
                          <td className={`${cell} text-right`}>
                            <NumInput value={s.h1} onChange={(n) => onUpdate(s.id, { h1: n })} step={0.1} center className="w-24 ml-auto" />
                          </td>
                          <td className={`${cell} text-right`}>
                            <NumInput value={s.h2} onChange={(n) => onUpdate(s.id, { h2: n })} step={0.1} center className="w-24 ml-auto" />
                          </td>
                          <td className={cell}>
                            {s.type === "gnb" ? (
                              <span className="text-[10px] text-mut2 italic" title="ГНБ — прокладка без вскрытия покрытия">
                                без вскрытия
                              </span>
                            ) : (
                              <div className="relative">
                                <select
                                  value={s.surfaceId}
                                  onChange={(e) => onUpdate(s.id, { surfaceId: e.target.value })}
                                  className="w-full bg-well border border-line rounded-md px-2.5 py-1.5 pr-8 text-xs text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 appearance-none cursor-pointer"
                                >
                                  {state.surfaces.map((sf) => (
                                    <option key={sf.id} value={sf.id}>
                                      {sf.name}
                                    </option>
                                  ))}
                                </select>
                                <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-mut2">
                                  <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </div>
                            )}
                          </td>
                          <td className={`${cell} text-right font-mono text-xs text-mut2`}>{fmt(c.hAvg)}</td>
                          <td className={`${cell} text-right font-mono text-xs font-semibold ${c.excavation > 0 ? "text-accent-deep" : "text-mut2"}`}>
                            <FlashValue value={c.excavation} />
                          </td>
                          <td className={`${cell} text-right font-mono text-xs font-semibold ${c.cable > 0 ? "text-ink" : "text-mut2"}`}>
                            <FlashValue value={c.cable} decimals={0} />
                          </td>
                          <td className={`${cell} pr-3`}>
                            <button
                              onClick={() => onRemove(s.id)}
                              className="btn p-1.5 rounded-md text-mut2 hover:text-danger hover:bg-danger-soft"
                              title="Удалить участок"
                            >
                              <IconTrash />
                            </button>
                          </td>
                        </>
                      )}
                    </SortableRow>
                  );
                })}
                <InsertRow onInsert={() => onInsert(state.segments.length)} />
              </tbody>
              <tfoot>
                <tr className="bg-raise font-mono text-xs text-ink">
                  <td className="px-4 py-2.5 font-sans font-semibold uppercase tracking-wider text-[10px] text-mut" colSpan={3}>
                    Итого по активным участкам
                  </td>
                  <td className="px-2 py-2.5 text-right font-semibold">
                    <FlashValue value={calcs.reduce((s, c) => s + (c.active ? c.seg.length : 0), 0)} decimals={0} />
                  </td>
                  <td colSpan={4} className="px-2 py-2.5" />
                  <td className="px-2 py-2.5 text-right font-semibold text-accent-deep">
                    <FlashValue value={calcs.reduce((s, c) => s + c.excavation, 0)} decimals={1} />
                  </td>
                  <td className="px-2 py-2.5 text-right font-semibold">
                    <FlashValue value={calcs.reduce((s, c) => s + c.cable, 0)} decimals={0} />
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </SortableContext>
      </DndContext>
      <p className="px-4 py-2.5 border-t border-line text-[11px] text-mut2">
        Перетаскивайте участки за ручку <span className="inline-block align-middle text-mut">⠿</span> для изменения порядка.
        Вставка — на разделитель между строками. Для ГНБ благоустройство не считается.
      </p>
    </Panel>
  );
}
