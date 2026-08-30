import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SegmentsTable } from "./components/segments";
import {
  defaultParamsFor,
  TrenchTypeCards,
  TrenchTypeForm,
  TypePickerList,
  TYPE_ICONS,
} from "./components/params";
import {
  BtnGhost,
  BtnPrimary,
  FlashValue,
  IconBolt,
  IconDoc,
  IconDownload,
  IconLayers,
  IconPlus,
  IconPrint,
  IconRoute,
  IconShield,
  IconSliders,
  IconUpload,
  Logo,
  Modal,
  NumInput,
  Reveal,
  Section,
  useReveal,
} from "./components/ui";
import { VorSheet, VorPreview } from "./components/vor";
import { SurfacesModal } from "./components/surfaces";
import { SurveyImportWizard } from "./components/survey-wizard";
import { PlanView, ProfileView } from "./components/route-viz";
import { ComparisonTable } from "./components/comparison";
import { TrenchDiagram } from "./components/diagrams";
import { DEFAULT_SURFACES, TRENCH_META, VOLTAGE_META } from "./data/catalogs";
import { buildVor } from "./lib/calc";
import { exportVorExcel } from "./lib/excel";
import { downloadDxf } from "./lib/dxf-export";
import { exportJsonFile, importJsonFile, loadFromLocal, saveToLocal } from "./lib/storage";
import type {
  ParamsMap,
  ProjectState,
  Segment,
  TrenchType,
  VoltageClass,
} from "./lib/types";

let segUid = 100;
const newSegId = () => `s${++segUid}`;

const VOLT_BIG: Record<VoltageClass, string> = {
  "0.4-10": "0,4–10",
  "35": "35",
  "110-220": "110–220",
};

function defaultState(): ProjectState {
  return {
    projectName: "Реконструкция КЛ 10 кВ от ПС «Заречная»",
    projectCode: "24-07-КЛ",
    voltage: "0.4-10",
    types: ["lotok", "open", "block", "gnb", "splice"],
    chains: 2,
    params: {
      gnb: { boreDiameter: 300, pipes: [{ id: "p1", diameter: 110, count: 4 }] },
      block: { width: 0.8, bedding: 0.1, beddingType: "sand", pipes: [{ id: "p2", diameter: 160, count: 2 }] },
      lotok: { width: 1.0, bedding: 0.1, beddingType: "sand", trayMark: "Л4-8", plateMark: "П5-8" },
      open: { width: 0.7, bedding: 0.1, beddingType: "sand", cover: "pzk", plateMark: "П5д-8" },
      splice: { width: 1.5, bedding: 0.1, beddingType: "sand" },
    },
    segments: [
      { id: newSegId(), from: "1", to: "2", type: "lotok", length: 6, h1: 2.5, h2: 3, surfaceId: "sidewalk" },
      { id: newSegId(), from: "2", to: "3", type: "open", length: 45, h1: 1.2, h2: 1.4, surfaceId: "road" },
      { id: newSegId(), from: "3", to: "4", type: "block", length: 12, h1: 1.5, h2: 1.5, surfaceId: "sidewalk" },
      { id: newSegId(), from: "4", to: "5", type: "gnb", length: 28, h1: 3, h2: 3, surfaceId: "road" },
      { id: newSegId(), from: "5", to: "6", type: "splice", length: 4, h1: 1.8, h2: 1.8, surfaceId: "lawn" },
      { id: newSegId(), from: "6", to: "7", type: "lotok", length: 80, h1: 1.0, h2: 1.2, surfaceId: "lawn" },
    ],
    surfaces: DEFAULT_SURFACES,
  };
}

function initialState(): ProjectState {
  return loadFromLocal() ?? defaultState();
}

type ModalState =
  | { kind: "picker" }
  | { kind: "type"; type: TrenchType; isNew: boolean }
  | { kind: "surfaces" }
  | { kind: "survey" }
  | null;

const NAV = [
  { id: "sec-object", num: "01", label: "Тип объекта", Icon: IconBolt },
  { id: "sec-trench", num: "02", label: "Типы траншеи", Icon: IconLayers },
  { id: "sec-params", num: "03", label: "Параметры", Icon: IconSliders },
  { id: "sec-segments", num: "04", label: "Участки трассы", Icon: IconRoute },
  { id: "sec-viz", num: "05", label: "Трасса на плане", Icon: IconRoute },
  { id: "sec-compare", num: "06", label: "Проект — факт", Icon: IconShield },
  { id: "sec-vor", num: "07", label: "Ведомость", Icon: IconDoc },
];

export default function App() {
  const [state, setState] = useState<ProjectState>(initialState);
  const [modal, setModal] = useState<ModalState>(null);
  const [draft, setDraft] = useState<ParamsMap[TrenchType] | null>(null);
  const [activeNav, setActiveNav] = useState("sec-object");
  const sheetRef = useRef<HTMLDivElement>(null);
  const revealSheet = useReveal<HTMLDivElement>();
  const vor = useMemo(() => buildVor(state), [state]);

  const patch = (p: Partial<ProjectState>) => setState((s) => ({ ...s, ...p }));

  const meta = VOLTAGE_META[state.voltage];
  const cablesPerSegment = state.chains * meta.cablesPerChain;

  /* -------- автосохранение в localStorage -------- */
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveToLocal(state), 400);
    return () => clearTimeout(saveTimer.current);
  }, [state]);

  /* -------- импорт JSON-файла -------- */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    importJsonFile(file)
      .then((loaded) => {
        setState(loaded);
        saveToLocal(loaded);
      })
      .catch((err: Error) => alert(`Ошибка импорта: ${err.message}`));
    e.target.value = "";
  }, []);

  /* -------- навигация + scrollspy -------- */
  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveNav(id);
  };
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setActiveNav(e.target.id)),
      { rootMargin: "-30% 0px -55% 0px" },
    );
    NAV.forEach((n) => {
      const el = document.getElementById(n.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  /* -------- типы прокладки -------- */
  const openTypeEditor = (type: TrenchType, isNew: boolean) => {
    setDraft(
      isNew
        ? defaultParamsFor(type)
        : (JSON.parse(JSON.stringify(state.params[type])) as ParamsMap[TrenchType]),
    );
    setModal({ kind: "type", type, isNew });
  };

  const saveTypeEditor = () => {
    if (modal?.kind !== "type" || !draft) return;
    const { type, isNew } = modal;
    setState((s) => ({
      ...s,
      types: isNew && !s.types.includes(type) ? [...s.types, type] : s.types,
      params: { ...s.params, [type]: draft },
    }));
    setModal(null);
  };

  const deleteType = (type: TrenchType) =>
    setState((s) => ({ ...s, types: s.types.filter((t) => t !== type) }));

  /* -------- участки -------- */
  const updateSegment = (id: string, part: Partial<Segment>) =>
    setState((s) => ({
      ...s,
      segments: s.segments.map((x) => (x.id === id ? { ...x, ...part } : x)),
    }));

  const insertSegment = (index: number) =>
    setState((s) => {
      const prev = s.segments[index - 1];
      const next = s.segments[index];
      const num = Number(prev?.to);
      const seg: Segment = {
        id: newSegId(),
        from: prev?.to ?? "1",
        to: next?.from ?? (Number.isFinite(num) && num > 0 ? String(num + 1) : ""),
        type: prev?.type ?? s.types[0] ?? "open",
        length: 10,
        h1: prev?.h2 ?? 1,
        h2: prev?.h2 ?? 1,
        surfaceId: prev?.surfaceId ?? s.surfaces[0]?.id ?? "lawn",
      };
      const segments = [...s.segments];
      segments.splice(index, 0, seg);
      return { ...s, segments };
    });

  const removeSegment = (id: string) =>
    setState((s) => ({ ...s, segments: s.segments.filter((x) => x.id !== id) }));

  const reorderSegments = (fromId: string, toId: string) =>
    setState((s) => {
      const oldIdx = s.segments.findIndex((x) => x.id === fromId);
      const newIdx = s.segments.findIndex((x) => x.id === toId);
      if (oldIdx < 0 || newIdx < 0) return s;
      const segments = [...s.segments];
      const [moved] = segments.splice(oldIdx, 1);
      segments.splice(newIdx, 0, moved);
      return { ...s, segments };
    });

  const modalType = modal?.kind === "type" ? modal.type : null;

  return (
    <div className="relative min-h-screen">
      <div className="ambient no-print" />

      {/* ================= top bar ================= */}
      <header className="no-print sticky top-0 z-40 h-16 bg-surface border-b border-line">
        <div className="max-w-[1560px] mx-auto px-4 lg:px-8 h-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo className="w-8 h-8 text-accent" />
            <div className="leading-none">
              <div className="font-display text-[15px] tracking-wide text-ink">
                ВОР<span className="text-accent">·</span>КЛ
              </div>
              <div className="text-[10px] text-mut2 mt-1 tracking-wide">
                ведомость объемов работ · кабельные линии
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-5 font-mono text-[11px] uppercase tracking-wider text-mut">
              <span>
                уч. <b className="text-accent">{vor.totals.activeSegments}</b>
              </span>
              <span>
                поз. <b className="text-accent">{vor.totals.rows}</b>
              </span>
              <span className="flex items-center gap-1.5 text-ok">
                <span className="w-1.5 h-1.5 rounded-full bg-ok pulse-dot" />
                сохранено
              </span>
            </div>
            <div className="flex items-center gap-1.5 border-l border-line pl-3 ml-1">
              <button
                onClick={() => setModal({ kind: "survey" })}
                className="btn text-[11px] font-semibold text-mut hover:text-accent px-2 py-1.5 rounded-md hover:bg-accent-soft/60 transition-colors"
                title="Импорт точек геодезической съёмки (CSV, Excel)"
              >
                <IconRoute className="w-3.5 h-3.5 inline-block mr-1" />Съёмка
              </button>
              <button
                onClick={() => exportJsonFile(state)}
                className="btn text-[11px] font-semibold text-mut hover:text-accent px-2 py-1.5 rounded-md hover:bg-accent-soft/60 transition-colors"
                title="Сохранить проект в JSON-файл"
              >
                <IconDownload className="w-3.5 h-3.5 inline-block mr-1" />JSON
              </button>
              <button
                onClick={handleImport}
                className="btn text-[11px] font-semibold text-mut hover:text-accent px-2 py-1.5 rounded-md hover:bg-accent-soft/60 transition-colors"
                title="Загрузить проект из JSON-файла"
              >
                <IconUpload className="w-3.5 h-3.5 inline-block mr-1" />Открыть
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>
        </div>
      </header>

      <div className="relative z-10 flex max-w-[1560px] mx-auto">
        {/* ================= warnings banner ================= */}
        {vor.warnings.length > 0 && (
          <div className="no-print fixed top-16 left-0 right-0 z-30 bg-warn-soft border-b border-warn/30 px-4 py-2">
            <div className="max-w-[1560px] mx-auto flex items-start gap-2">
              <span className="text-warn font-bold text-sm">⚠</span>
              <div className="flex-1 text-xs text-body">
                {vor.warnings.slice(0, 3).map((w, i) => (
                  <span key={i} className={`mr-4 ${w.severity === "error" ? "text-danger font-semibold" : ""}`}>
                    {w.text}
                  </span>
                ))}
                {vor.warnings.length > 3 && (
                  <span className="text-mut">…и ещё {vor.warnings.length - 3}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= sidebar ================= */}
        <aside className="no-print hidden lg:flex flex-col w-[268px] shrink-0 border-r border-line bg-page/70 sticky top-16 h-[calc(100vh-4rem)] px-4 py-5">
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-mut2">
            Разделы
          </p>
          <nav className="space-y-1">
            {NAV.map(({ id, num, label, Icon }) => {
              const active = activeNav === id;
              return (
                <button
                  key={id}
                  onClick={() => go(id)}
                  className={`btn relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                    active ? "bg-accent-soft text-accent-deep" : "text-body hover:bg-well"
                  }`}
                >
                  <span className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full transition-colors ${active ? "bg-accent" : "bg-transparent"}`} />
                  <Icon className={`w-[18px] h-[18px] ${active ? "text-accent" : "text-mut"}`} />
                  <span className="flex-1 text-left">{label}</span>
                  <span className={`font-mono text-[10px] ${active ? "text-accent" : "text-mut2"}`}>{num}</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto">
            {/* живой кабель */}
            <svg viewBox="0 0 240 40" className="w-full h-9" preserveAspectRatio="none">
              <path d="M0 12h240" stroke="#E4E4E7" strokeWidth="1.5" />
              <path d="M40 12l14 16h28l14-16M140 12l14 16h28l14-16" stroke="#E4E4E7" strokeWidth="1.5" fill="none" />
              <path d="M0 26h240" stroke="#2563EB" strokeWidth="1.6" className="cableflow" />
            </svg>
            <div className="border border-line rounded-xl bg-surface shadow-card p-3.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mut2">Текущий объект</div>
              <div className="mt-1 text-[13px] font-semibold text-ink leading-snug">{state.projectName || "—"}</div>
              <div className="mt-1 font-mono text-[11px] text-accent">{state.projectCode || "без шифра"}</div>
              <div className="mt-3 grid grid-cols-3 divide-x divide-line border border-line rounded-lg bg-raise">
                {[
                  { l: "Траншея", v: fmtShort(vor.totals.length), u: "м" },
                  { l: "Земля", v: fmtShort(vor.totals.earth), u: "м³" },
                  { l: "Кабель", v: fmtShort(vor.totals.cable), u: "м" },
                ].map((s) => (
                  <div key={s.l} className="px-2 py-1.5 text-center">
                    <div className="text-[8.5px] uppercase tracking-wider text-mut2">{s.l}</div>
                    <div className="font-mono text-[11.5px] font-semibold text-accent-deep leading-tight">
                      {s.v}
                      <span className="text-mut2 font-normal text-[9px]"> {s.u}</span>
                    </div>
                  </div>
                ))}
              </div>
              {state.surveyMeta && (
                <div className="mt-2.5 pt-2.5 border-t border-line">
                  <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ok flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-ok" />
                    съёмка импортирована
                  </div>
                  <div className="mt-1 text-[10px] text-mut leading-relaxed">
                    {state.surveyMeta.fileName && (
                      <span className="font-mono text-accent-deep">{state.surveyMeta.fileName}</span>
                    )}
                    {state.surveyMeta.date && (
                      <span className="ml-1.5">от {state.surveyMeta.date}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* ================= main ================= */}
        <main className="flex-1 min-w-0 px-4 lg:px-8 py-7">
          <div className="space-y-10 min-w-0">
            {/* ---------- 01 объект ---------- */}
            <div id="sec-object" className="scroll-mt-24">
              <Section num="01" title="Тип объекта" sub="Класс напряжения определяет число кабелей на цепь и наименования кабельных работ." className="print-hide">
                <div className="grid grid-cols-3 gap-3">
                  {(Object.keys(VOLTAGE_META) as VoltageClass[]).map((v, i) => {
                    const m = VOLTAGE_META[v];
                    const active = state.voltage === v;
                    return (
                      <Reveal key={v} delay={i * 60}>
                        <button
                          type="button"
                          onClick={() => patch({ voltage: v })}
                          className={`btn w-full text-left border rounded-xl px-4 sm:px-5 py-4 sm:py-5 transition-colors ${
                            active
                              ? "border-accent bg-accent-soft shadow-[0_10px_28px_-14px_rgba(37,99,235,0.45)]"
                              : "border-line bg-surface hover:border-accent/50 shadow-card"
                          }`}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className={`font-display text-2xl sm:text-3xl leading-none ${active ? "text-accent-deep" : "text-ink"}`}>
                              {VOLT_BIG[v]}
                              <span className="text-sm align-top ml-1 text-mut">кВ</span>
                            </span>
                            <span
                              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                                active ? "border-accent bg-accent" : "border-line2"
                              }`}
                            >
                              {active && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </span>
                          </div>
                          <div className="mt-2.5 text-[11px] leading-snug text-mut">{m.cableNote}</div>
                        </button>
                      </Reveal>
                    );
                  })}
                </div>

                <Reveal delay={120}>
                  <div className="mt-3 grid sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.8fr)] gap-3">
                    <label className="block">
                      <span className="block mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-mut">Наименование объекта</span>
                      <input
                        value={state.projectName}
                        onChange={(e) => patch({ projectName: e.target.value })}
                        placeholder="Например: КЛ 10 кВ от ПС «Заречная»"
                        className="w-full bg-surface border border-line rounded-lg px-3.5 py-2.5 text-sm text-ink shadow-card outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 placeholder:text-mut2"
                      />
                    </label>
                    <label className="block">
                      <span className="block mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-mut">Шифр проекта</span>
                      <input
                        value={state.projectCode}
                        onChange={(e) => patch({ projectCode: e.target.value })}
                        placeholder="24-07-КЛ"
                        className="w-full bg-surface border border-line rounded-lg px-3.5 py-2.5 font-mono text-sm text-accent-deep shadow-card outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 placeholder:text-mut2"
                      />
                    </label>
                    <label className="block">
                      <span className="block mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-mut">
                        Цепей в одной траншее
                      </span>
                      <NumInput
                        value={state.chains}
                        onChange={(n) => patch({ chains: Math.max(1, Math.round(n)) })}
                        step={1}
                        min={1}
                        suffix="цеп."
                      />
                    </label>
                  </div>
                  <p className="mt-2.5 text-[11px] text-mut2">
                    На каждую цепь — <span className="text-accent font-mono">{meta.cablesPerChain}</span> каб. × сигнальная лента ·
                    всего кабелей на участок: <span className="text-accent font-mono">{cablesPerSegment}</span>
                  </p>
                </Reveal>
              </Section>
            </div>

            {/* ---------- 02 типы траншеи ---------- */}
            <div id="sec-trench" className="scroll-mt-24">
              <Section num="02" title="Типы траншеи" sub="Добавьте способы прокладки — для каждого откроется форма с разрезом и параметрами." className="print-hide">
                <div className="flex flex-wrap gap-2.5">
                  {state.types.map((t, i) => {
                    const m = TRENCH_META[t];
                    const Icon = TYPE_ICONS[t];
                    const len = vor.totals.lengthByType[t] ?? 0;
                    return (
                      <button
                        key={t}
                        onClick={() => openTypeEditor(t, false)}
                        className="btn group flex items-center gap-3 border border-line rounded-xl bg-surface shadow-card pl-3 pr-4 py-2.5 hover:border-accent/60 hover:bg-accent-soft/60 rowin"
                        style={{ animationDelay: `${i * 50}ms` }}
                        title="Открыть параметры"
                      >
                        <span className="font-mono text-[11px] font-bold w-6 h-6 flex items-center justify-center rounded-md bg-accent-soft text-accent group-hover:bg-accent group-hover:text-white transition-colors">
                          {m.letter}
                        </span>
                        <span className="text-accent">
                          <Icon className="w-6 h-6" />
                        </span>
                        <span className="text-left">
                          <span className="block font-display text-[13px] uppercase tracking-wide text-ink leading-tight">{m.label}</span>
                          <span className="block font-mono text-[10px] text-mut2">{len > 0 ? `${fmtShort(len)} м трассы` : "нет участков"}</span>
                        </span>
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setModal({ kind: "picker" })}
                    className="btn flex items-center gap-2 border border-dashed border-line2 rounded-xl px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-mut hover:text-accent hover:border-accent/60 hover:bg-accent-soft/50"
                  >
                    <IconPlus className="w-4 h-4" /> добавить тип прокладки
                  </button>
                </div>
                {state.types.length === 0 && (
                  <p className="mt-3 text-xs text-danger flex items-center gap-2">
                    <IconShield className="w-4 h-4" /> Добавьте хотя бы один тип прокладки — без него ведомость не формируется.
                  </p>
                )}
              </Section>
            </div>

            {/* ---------- 03 параметры ---------- */}
            <div id="sec-params" className="scroll-mt-24">
              <Section num="03" title="Параметры траншей" sub="Схема разреза по каждому типу с геометрическими параметрами. «Изменить» — редактировать, корзина — удалить." className="print-hide">
                <TrenchTypeCards
                  state={state}
                  cables={cablesPerSegment}
                  onEdit={(t) => openTypeEditor(t, false)}
                  onDelete={deleteType}
                />
              </Section>
            </div>

            {/* ---------- 04 участки ---------- */}
            <div id="sec-segments" className="scroll-mt-24">
              <Section num="04" title="Участки трассы" sub="Точки, длины, глубины и покрытие по каждому участку. Вставка — между строками, H ср. и объемы считаются сразу." className="print-hide">
                <SegmentsTable
                  state={state}
                  calcs={vor.calcs}
                  onUpdate={updateSegment}
                  onInsert={insertSegment}
                  onRemove={removeSegment}
                  onReorder={reorderSegments}
                  onOpenSurfaces={() => setModal({ kind: "surfaces" })}
                />
              </Section>
            </div>

            {/* ---------- 05 трасса на плане ---------- */}
            <div id="sec-viz" className="scroll-mt-24">
              <Section num="05" title="Трасса на плане" sub="Схема трассы (вид сверху) и продольный профиль с отметками земли, дна траншеи и кабеля." className="print-hide">
                <div className="space-y-5">
                  <PlanView state={state} />
                  <ProfileView state={state} />
                </div>
              </Section>
            </div>

            {/* ---------- 06 проект — факт ---------- */}
            <div id="sec-compare" className="scroll-mt-24">
              <Section num="06" title="Проект — факт" sub="Сравнение фактических параметров с проектом из рабочей документации. Отклонения длины и глубины." className="print-hide">
                <ComparisonTable
                  state={state}
                  onUpdate={updateSegment}
                />
              </Section>
            </div>

            {/* ---------- 07 ведомость ---------- */}
            <div id="sec-vor" className="scroll-mt-24">
              <Section
                num="07"
                title="Ведомость (ВОР)"
                sub="Итоговый документ — в Excel или на печать."
                hideHeaderOnPrint
                actions={
                  <>
                    <BtnPrimary onClick={async () => { await exportVorExcel(state, vor); }} disabled={vor.rows.length === 0}>
                      <IconDownload /> В Excel
                    </BtnPrimary>
                    <BtnGhost onClick={() => downloadDxf(state)}>
                      <IconDownload /> DXF
                    </BtnGhost>
                    <BtnGhost onClick={() => window.print()}>
                      <IconPrint /> Печать
                    </BtnGhost>
                  </>
                }
              >
                <div className="grid lg:grid-cols-[1fr_340px] gap-5">
                  <div ref={revealSheet} className="reveal">
                    <div ref={sheetRef}>
                      <VorSheet state={state} vor={vor} />
                    </div>
                    <div className="no-print mt-4 text-[11px] text-mut2 leading-relaxed border border-dashed border-line2 rounded-lg px-4 py-3 bg-surface/60">
                      <span className="text-mut font-semibold uppercase tracking-wider text-[10px]">Методика · </span>
                      V траншеи = (B + m·Hср)·Hср·L, m = 0,5 по СП 45.13330.
                      Лотки и плиты — Серия 3.006.1-2. ПЗК — по фактическим размерам 250×124×50 мм.
                      Фиксаторы труб — шаг 1,5 м. Засыпка песком/ПГС поверх конструкций t = 10 см.
                      ГНБ: V = π·D²/4 · L + приямки 2 шт. Шлам — отдельная позиция с Кшл=1,3.
                      Кабель: запас 2% на прокладку + 3 м на разделку. Вывоз грунта — с Кр=1,2.
                      Благоустройство — по бровке с уширением 0,15 м.
                    </div>
                  </div>
                  <div className="no-print">
                    <VorPreview
                      state={state}
                      vor={vor}
                      onExport={async () => { await exportVorExcel(state, vor); }}
                      onPrint={() => window.print()}
                    />
                  </div>
                </div>
              </Section>
            </div>
          </div>

        </main>
      </div>

      {/* ================= modals ================= */}
      {modal?.kind === "picker" && (
        <Modal
          title="Добавить тип прокладки"
          sub="Выберите способ — откроется форма с разрезом и параметрами"
          onClose={() => setModal(null)}
        >
          <TypePickerList added={state.types} onPick={(t) => openTypeEditor(t, true)} />
        </Modal>
      )}

      {modal?.kind === "type" && modalType && draft && (
        <Modal
          title={`${modal.isNew ? "Новый тип" : "Параметры"}: ${TRENCH_META[modalType].label}`}
          sub="Разрез обновляется по мере ввода параметров"
          onClose={() => setModal(null)}
          wide
          footer={
            <>
              <button onClick={() => setModal(null)} className="btn text-sm font-medium text-mut border border-line rounded-md px-4 py-2 hover:bg-well">
                Отмена
              </button>
              <button onClick={saveTypeEditor} className="btn text-sm font-semibold text-white bg-accent rounded-md px-5 py-2 hover:bg-accent-deep shadow-sm">
                {modal.isNew ? "Добавить тип" : "Сохранить"}
              </button>
            </>
          }
        >
          <div className="border border-line rounded-lg bg-well/70 mb-4 overflow-hidden">
            <TrenchDiagram type={modalType} params={{ ...state.params, [modalType]: draft }} cables={cablesPerSegment} />
          </div>
          <TrenchTypeForm
            type={modalType}
            value={draft}
            onChange={(v) => setDraft(v as ParamsMap[TrenchType])}
          />
        </Modal>
      )}

      {modal?.kind === "surfaces" && (
        <SurfacesModal
          surfaces={state.surfaces}
          segments={state.segments}
          onSave={(surfaces) => {
            setState((s) => ({ ...s, surfaces }));
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.kind === "survey" && (
        <SurveyImportWizard
          surfaces={state.surfaces}
          onClose={() => setModal(null)}
          onImport={({ segments, surveyMeta }) => {
            setState((s) => ({
              ...s,
              segments: [...s.segments, ...segments],
              surveyMeta,
            }));
          }}
        />
      )}
    </div>
  );
}

const fmtShort = (n: number) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: n >= 100 ? 0 : 1 }).replace(/\u00a0/g, " ");
