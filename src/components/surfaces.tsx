import { useState } from "react";
import type { Segment, Surface } from "../lib/types";
import { SurfaceDiagram } from "./diagrams";
import { IconPlus, IconTrash, Modal, NumInput } from "./ui";

let sfUid = 0;

export function SurfacesModal({
  surfaces,
  segments,
  onSave,
  onClose,
}: {
  surfaces: Surface[];
  segments: Segment[];
  onSave: (surfaces: Surface[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Surface[]>(() =>
    surfaces.map((s) => ({ ...s, layers: s.layers.map((l) => ({ ...l })) })),
  );
  const [selId, setSelId] = useState(draft[0]?.id ?? "");
  const sel = draft.find((s) => s.id === selId) ?? draft[0];

  const updateSel = (fn: (s: Surface) => Surface) =>
    setDraft((d) => d.map((s) => (s.id === sel.id ? fn(s) : s)));

  const usedBy = (id: string) => segments.filter((s) => s.surfaceId === id).length;

  const addSurface = () => {
    const s: Surface = {
      id: `sf${Date.now()}${++sfUid}`,
      name: "Новое покрытие",
      layers: [
        { name: "Песок", thickness: 10 },
        { name: "Щебень", thickness: 10 },
      ],
    };
    setDraft((d) => [...d, s]);
    setSelId(s.id);
  };

  const removeSurface = (id: string) => {
    const rest = draft.filter((s) => s.id !== id);
    setDraft(rest);
    if (selId === id) setSelId(rest[0]?.id ?? "");
  };

  return (
    <Modal
      title="Типы покрытий"
      sub="Конструктор покрытий для благоустройства: разрез и толщины слоёв участвуют в позициях «разработка / восстановление»"
      onClose={onClose}
      wide
      footer={
        <>
          <button onClick={onClose} className="btn text-sm font-medium text-mut border border-line rounded-md px-4 py-2 hover:bg-well">
            Отмена
          </button>
          <button
            onClick={() => onSave(draft)}
            className="btn text-sm font-semibold text-white bg-accent rounded-md px-4 py-2 hover:bg-accent-deep shadow-sm"
          >
            Сохранить покрытия
          </button>
        </>
      }
    >
      <div className="grid sm:grid-cols-[218px_minmax(0,1fr)] gap-4">
        {/* список */}
        <div className="space-y-1.5">
          {draft.map((s) => {
            const used = usedBy(s.id);
            return (
              <div
                key={s.id}
                className={`flex items-center gap-1.5 border rounded-lg transition-colors ${
                  s.id === sel.id ? "border-accent/70 bg-accent-soft" : "border-line bg-surface hover:border-line2"
                }`}
              >
                <button onClick={() => setSelId(s.id)} className="btn flex-1 text-left px-3 py-2 min-w-0">
                  <span className={`block text-xs font-semibold truncate ${s.id === sel.id ? "text-accent-deep" : "text-ink"}`}>
                    {s.name}
                  </span>
                  <span className="block text-[10px] text-mut2">
                    {s.layers.length} сл. · Σ {Math.round(s.layers.reduce((a, l) => a + l.thickness, 0))} см
                    {used > 0 && ` · на ${used} уч.`}
                  </span>
                </button>
                <button
                  onClick={() => removeSurface(s.id)}
                  disabled={used > 0 || draft.length <= 1}
                  title={used > 0 ? "Покрытие используется на участках" : "Удалить покрытие"}
                  className="btn p-1.5 mr-1 text-mut2 hover:text-danger disabled:opacity-30"
                >
                  <IconTrash className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
          <button
            onClick={addSurface}
            className="btn w-full flex items-center justify-center gap-2 border border-dashed border-line2 rounded-lg py-2 text-xs font-semibold uppercase tracking-wider text-mut hover:text-accent hover:border-accent/60"
          >
            <IconPlus className="w-3.5 h-3.5" /> новое покрытие
          </button>
        </div>

        {/* редактор */}
        {sel && (
          <div className="border border-line rounded-lg bg-raise/50 overflow-hidden">
            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-line">
              <div className="p-3 bg-well/50">
                <SurfaceDiagram surface={sel} />
              </div>
              <div className="p-3.5 space-y-3">
                <label className="block">
                  <span className="block mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-mut">Название покрытия</span>
                  <input
                    value={sel.name}
                    onChange={(e) => updateSel((s) => ({ ...s, name: e.target.value }))}
                    className="w-full bg-surface border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                  />
                </label>
                <div>
                  <span className="block mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-mut">
                    Слои (сверху вниз)
                  </span>
                  <div className="space-y-2">
                    {sel.layers.map((l, i) => (
                      <div key={i} className="flex items-center gap-2 rowin">
                        <span className="font-mono text-[10px] text-mut2 w-4 text-right">{i + 1}</span>
                        <input
                          value={l.name}
                          onChange={(e) =>
                            updateSel((s) => ({
                              ...s,
                              layers: s.layers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                            }))
                          }
                          className="flex-1 min-w-0 bg-surface border border-line rounded-md px-2.5 py-1.5 text-xs text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                          placeholder="Название слоя"
                        />
                        <NumInput
                          value={l.thickness}
                          onChange={(n) =>
                            updateSel((s) => ({
                              ...s,
                              layers: s.layers.map((x, j) => (j === i ? { ...x, thickness: n } : x)),
                            }))
                          }
                          step={1}
                          suffix="см"
                          className="w-24"
                        />
                        <button
                          onClick={() =>
                            updateSel((s) => ({ ...s, layers: s.layers.filter((_, j) => j !== i) }))
                          }
                          disabled={sel.layers.length <= 1}
                          className="btn p-1.5 text-mut2 hover:text-danger disabled:opacity-30"
                          title="Удалить слой"
                        >
                          <IconTrash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() =>
                      updateSel((s) => ({ ...s, layers: [...s.layers, { name: "Новый слой", thickness: 10 }] }))
                    }
                    className="btn mt-2 w-full flex items-center justify-center gap-2 border border-dashed border-line2 rounded-md py-1.5 text-[11px] font-semibold uppercase tracking-wider text-mut hover:text-accent hover:border-accent/60"
                  >
                    <IconPlus className="w-3 h-3" /> слой
                  </button>
                </div>
                <p className="text-[11px] text-mut2 leading-relaxed border-t border-line pt-2.5">
                  По каждому участку с этим покрытием будут сформированы позиции разработки и
                  восстановления каждого слоя (площадь = ширина траншеи × длина) и вывоз отходов.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
