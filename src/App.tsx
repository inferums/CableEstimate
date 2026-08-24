import { useEffect, useMemo, useRef, useState } from "react";
import { SegmentsTable } from "./components/segments";
import { TrenchParams } from "./components/params";
import {
  BtnGhost,
  BtnPrimary,
  FlashValue,
  IconBlock,
  IconBolt,
  IconDoc,
  IconDownload,
  IconGnb,
  IconLayers,
  IconLotok,
  IconOpen,
  IconPlus,
  IconPrint,
  IconRoute,
  IconSliders,
  Logo,
  NumInput,
  Reveal,
  Section,
} from "./components/ui";
import { VorPreview, VorSheet } from "./components/vor";
import { TRENCH_META, VOLTAGE_META } from "./data/catalogs";
import { buildVor } from "./lib/calc";
import { exportVorExcel } from "./lib/excel";
import type {
  ParamsMap,
  ProjectState,
  Segment,
  TrenchType,
  VoltageClass,
} from "./lib/types";

let segUid = 0;
const newSegId = () => `s${++segUid}`;

const VOLT_BIG: Record<VoltageClass, string> = {
  "0.4-10": "0,4–10",
  "35": "35",
  "110-220": "110–220",
};

const NAV = [
  { id: "s01", num: "01", label: "Тип объекта", Icon: IconBolt },
  { id: "s02", num: "02", label: "Типы траншеи", Icon: IconLayers },
  { id: "s03", num: "03", label: "Параметры траншей", Icon: IconSliders },
  { id: "s04", num: "04", label: "Участки трассы", Icon: IconRoute },
  { id: "s05", num: "05", label: "Ведомость · ВОР", Icon: IconDoc },
];

function initialState(): ProjectState {
  return {
    projectName: "Реконструкция КЛ 10 кВ от ПС «Заречная»",
    projectCode: "24-07-КЛ",
    voltage: "0.4-10",
    types: ["gnb", "block", "lotok", "open"],
    chains: 2,
    params: {
      gnb: {
        boreDiameter: 250,
        pipes: [{ id: "p1", diameter: 110, count: 4 }],
      },
      block: {
        width: 0.8,
        bedding: 0.1,
        beddingType: "sand",
        pipes: [{ id: "p2", diameter: 160, count: 2 }],
      },
      lotok: {
        width: 1.0,
        bedding: 0.1,
        beddingType: "sand",
        trayMark: "ЛК 75.120.60-1",
        plateMark: "П 75.120.16-3",
      },
      open: {
        width: 0.7,
        bedding: 0.1,
        beddingType: "sand",
        cover: "pzk",
        plateMark: "ПТ 75.120.20-3",
      },
    },
    segments: [
      { id: newSegId(), from: "1", to: "2", type: "lotok", length: 6, h1: 2.5, h2: 3 },
      { id: newSegId(), from: "2", to: "3", type: "open", length: 45, h1: 1.2, h2: 1.4 },
      { id: newSegId(), from: "3", to: "4", type: "block", length: 12, h1: 1.5, h2: 1.5 },
      { id: newSegId(), from: "4", to: "5", type: "gnb", length: 28, h1: 3, h2: 3 },
      { id: newSegId(), from: "5", to: "6", type: "lotok", length: 80, h1: 1.0, h2: 1.2 },
    ],
  };
}

/* живой кабельный провод в подвале сайдбара */
function LiveCable() {
  return (
    <svg viewBox="0 0 240 40" className="w-full h-9 block" preserveAspectRatio="none" aria-hidden>
      <path d="M0 12h240" stroke="var(--color-line)" strokeWidth="1.5" />
      <path d="M40 12l10 16h26l10-16M130 12l10 16h26l10-16" stroke="var(--color-line)" strokeWidth="1.5" fill="none" />
      <path d="M0 26h240" stroke="var(--color-accent)" strokeWidth="1.8" className="cableflow" opacity=".65" />
    </svg>
  );
}

export default function App() {
  const [state, setState] = useState<ProjectState>(initialState);
  const [activeNav, setActiveNav] = useState("s01");
  const sheetRef = useRef<HTMLDivElement>(null);
  const vor = useMemo(() => buildVor(state), [state]);

  /* scrollspy для навигации */
  useEffect(() => {
    const els = NAV.map((n) => document.getElementById(n.id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveNav(e.target.id);
        }
      },
      { rootMargin: "-35% 0px -55% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const goTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const patch = (p: Partial<ProjectState>) => setState((s) => ({ ...s, ...p }));

  const updateParams = <K extends TrenchType>(type: K, p: ParamsMap[K]) =>
    setState((s) => ({ ...s, params: { ...s.params, [type]: p } }));

  const toggleType = (t: TrenchType) =>
    setState((s) => ({
      ...s,
      types: s.types.includes(t) ? s.types.filter((x) => x !== t) : [...s.types, t],
    }));

  const updateSegment = (id: string, part: Partial<Segment>) =>
    setState((s) => ({
      ...s,
      segments: s.segments.map((x) => (x.id === id ? { ...x, ...part } : x)),
    }));

  const addSegment = () =>
    setState((s) => {
      const last = s.segments[s.segments.length - 1];
      const nextFrom = last ? last.to : "1";
      const num = Number(last?.to);
      const nextTo = last ? (Number.isFinite(num) && num > 0 ? String(num + 1) : "") : "2";
      return {
        ...s,
        segments: [
          ...s.segments,
          {
            id: newSegId(),
            from: nextFrom,
            to: nextTo,
            type: s.types[0] ?? "open",
            length: 10,
            h1: 1,
            h2: 1,
          },
        ],
      };
    });

  const removeSegment = (id: string) =>
    setState((s) => ({ ...s, segments: s.segments.filter((x) => x.id !== id) }));

  const meta = VOLTAGE_META[state.voltage];

  return (
    <div className="min-h-screen relative">
      <div className="ambient" />

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* ================= topbar ================= */}
        <header className="no-print sticky top-0 z-40 h-16 bg-surface/90 backdrop-blur-md border-b border-line">
          <div className="h-full flex items-center justify-between gap-4 px-4 lg:px-6">
            <div className="flex items-center gap-3 min-w-0">
              <Logo className="w-9 h-9 shrink-0" />
              <div className="leading-none min-w-0">
                <div className="font-display font-bold text-[15px] tracking-tight text-ink">
                  ВОР<span className="text-accent">·</span>КЛ
                </div>
                <div className="text-[10.5px] text-mut mt-1 truncate">
                  ведомость объемов · кабельные линии
                </div>
              </div>
            </div>

            <div className="hidden lg:flex items-center gap-5 font-mono text-xs text-mut">
              <span>
                трасса <b className="text-ink font-bold"><FlashValue value={vor.totals.length} decimals={0} /></b> м
              </span>
              <span className="w-px h-4 bg-line" />
              <span>
                земля <b className="text-accent-deep font-bold"><FlashValue value={vor.totals.earth} decimals={1} /></b> м³
              </span>
              <span className="w-px h-4 bg-line" />
              <span>
                кабель <b className="text-ink font-bold"><FlashValue value={vor.totals.cable} decimals={0} /></b> м
              </span>
            </div>

            <div className="flex items-center gap-2">
              <BtnPrimary
                onClick={() => exportVorExcel(state, vor)}
                disabled={vor.rows.length === 0}
                className="h-9 px-3.5 text-[13px]"
              >
                <IconDownload /> <span className="hidden sm:inline">Excel</span>
              </BtnPrimary>
              <BtnGhost onClick={() => window.print()} className="h-9 px-3.5 text-[13px]">
                <IconPrint /> <span className="hidden sm:inline">Печать</span>
              </BtnGhost>
            </div>
          </div>
        </header>

        {/* ================= mobile nav chips ================= */}
        <nav className="no-print lg:hidden sticky top-16 z-30 bg-page/95 backdrop-blur border-b border-line px-4 py-2.5 flex gap-2 overflow-x-auto">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => goTo(n.id)}
              className={`btn shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors ${
                activeNav === n.id
                  ? "bg-accent text-white border-accent"
                  : "bg-surface text-mut border-line hover:text-accent hover:border-accent/50"
              }`}
            >
              <span className="font-mono text-[10px] opacity-70">{n.num}</span>
              {n.label}
            </button>
          ))}
        </nav>

        <div className="flex flex-1 max-w-[1720px] w-full mx-auto">
          {/* ================= sidebar ================= */}
          <aside className="no-print hidden lg:flex flex-col w-[264px] shrink-0 border-r border-line bg-page/70 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
            <div className="p-4 flex-1 flex flex-col">
              <div className="px-3 mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-mut2">
                Разделы расчета
              </div>
              <nav className="space-y-1">
                {NAV.map((n) => {
                  const active = activeNav === n.id;
                  return (
                    <button
                      key={n.id}
                      onClick={() => goTo(n.id)}
                      className={`btn group w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left relative transition-colors ${
                        active ? "bg-accent-soft text-accent-deep" : "text-body hover:bg-well"
                      }`}
                    >
                      <span
                        className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r bg-accent transition-all ${
                          active ? "opacity-100" : "opacity-0 group-hover:opacity-40"
                        }`}
                      />
                      <n.Icon
                        className={`w-5 h-5 shrink-0 transition-colors ${
                          active ? "text-accent" : "text-mut group-hover:text-body"
                        }`}
                      />
                      <span className={`flex-1 text-[13.5px] font-semibold ${active ? "" : ""}`}>
                        {n.label}
                      </span>
                      <span
                        className={`font-mono text-[10px] font-bold ${
                          active ? "text-accent" : "text-mut2"
                        }`}
                      >
                        {n.num}
                      </span>
                    </button>
                  );
                })}
              </nav>

              <div className="mt-auto space-y-3 pt-6">
                {/* карточка проекта */}
                <div className="bg-surface border border-line rounded-xl p-4 shadow-card">
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-mut2 mb-2">
                    Текущий объект
                  </div>
                  <div className="text-[13px] font-bold text-ink leading-snug line-clamp-2">
                    {state.projectName || "Без названия"}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="font-mono text-[10px] font-bold text-accent bg-accent-soft border border-accent-100 rounded px-1.5 py-0.5">
                      {meta.short}
                    </span>
                    <span className="font-mono text-[10px] font-bold text-mut bg-well border border-line rounded px-1.5 py-0.5">
                      {state.chains} цеп.
                    </span>
                    <span className="font-mono text-[10px] font-bold text-mut bg-well border border-line rounded px-1.5 py-0.5">
                      {state.projectCode || "шифр —"}
                    </span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-line grid grid-cols-3 gap-1 text-center">
                    {[
                      { l: "уч.", v: vor.totals.activeSegments },
                      { l: "поз.", v: vor.totals.rows },
                      { l: "м³", v: Math.round(vor.totals.earth) },
                    ].map((s) => (
                      <div key={s.l}>
                        <div className="font-mono text-sm font-extrabold text-ink">{s.v}</div>
                        <div className="text-[9.5px] font-bold uppercase tracking-wider text-mut2">{s.l}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-surface border border-line rounded-xl px-3 pt-3 pb-1 shadow-card">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-mut2">
                      Расчет активен
                    </span>
                    <span className="w-2 h-2 rounded-full bg-ok pulse-dot" />
                  </div>
                  <LiveCable />
                </div>
              </div>
            </div>
          </aside>

          {/* ================= main ================= */}
          <main className="flex-1 min-w-0 px-4 lg:px-8 py-6 lg:py-8">
            <div className="grid xl:grid-cols-[minmax(0,1fr)_344px] gap-6 items-start">
              <div className="space-y-6 min-w-0">
                {/* ---------- 01 объект ---------- */}
                <Section
                  num="01"
                  title="Тип объекта"
                  sub="Класс напряжения определяет число кабелей на цепь и наименования позиций кабельных работ."
                  className="print-hide"
                  id="s01"
                >
                  <div className="grid md:grid-cols-[1fr_250px] gap-5 items-start">
                    <div>
                      <div className="grid grid-cols-3 gap-3">
                        {(Object.keys(VOLTAGE_META) as VoltageClass[]).map((v, i) => {
                          const m = VOLTAGE_META[v];
                          const active = state.voltage === v;
                          return (
                            <Reveal key={v} delay={i * 60}>
                              <button
                                type="button"
                                onClick={() => patch({ voltage: v })}
                                className={`btn w-full text-left rounded-xl border px-4 py-4 transition-all ${
                                  active
                                    ? "border-accent bg-accent-soft shadow-[0_8px_24px_-12px_rgba(37,99,235,0.45)]"
                                    : "border-line bg-surface hover:border-accent/50 hover:-translate-y-0.5"
                                }`}
                              >
                                <div
                                  className={`font-display font-bold text-xl sm:text-2xl leading-none tracking-tight ${
                                    active ? "text-accent-deep" : "text-ink"
                                  }`}
                                >
                                  {VOLT_BIG[v]}
                                  <span className="text-xs sm:text-sm font-semibold align-top ml-1 text-mut">кВ</span>
                                </div>
                                <div className="mt-2.5 text-[11px] leading-snug text-mut">{m.cableNote}</div>
                                <div
                                  className={`mt-3 h-1 rounded-full overflow-hidden bg-well ${active ? "" : "opacity-50"}`}
                                >
                                  <div
                                    className={`h-full bg-accent rounded-full barfill ${active ? "" : "scale-x-0"}`}
                                    style={{ width: active ? "100%" : "0%" }}
                                  />
                                </div>
                              </button>
                            </Reveal>
                          );
                        })}
                      </div>

                      <Reveal delay={120}>
                        <div className="mt-4 grid sm:grid-cols-2 gap-3">
                          <label className="block">
                            <span className="block mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-mut">
                              Наименование объекта
                            </span>
                            <input
                              value={state.projectName}
                              onChange={(e) => patch({ projectName: e.target.value })}
                              placeholder="Например: КЛ 10 кВ от ПС «Заречная»"
                              className="w-full h-10 bg-raise border border-line rounded-lg px-3 text-sm font-medium text-ink outline-none transition-all focus:bg-surface focus:border-accent focus:ring-4 focus:ring-accent/10 hover:border-line2 placeholder:text-mut2"
                            />
                          </label>
                          <label className="block">
                            <span className="block mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-mut">
                              Шифр проекта
                            </span>
                            <input
                              value={state.projectCode}
                              onChange={(e) => patch({ projectCode: e.target.value })}
                              placeholder="24-07-КЛ"
                              className="w-full h-10 bg-raise border border-line rounded-lg px-3 font-mono text-sm font-medium text-accent-deep outline-none transition-all focus:bg-surface focus:border-accent focus:ring-4 focus:ring-accent/10 hover:border-line2 placeholder:text-mut2"
                            />
                          </label>
                        </div>
                      </Reveal>
                    </div>

                    <Reveal delay={160}>
                      <div className="bg-raise border border-line rounded-xl p-4">
                        <label className="block">
                          <span className="block mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-mut">
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
                        <p className="mt-3 text-xs text-mut leading-relaxed">
                          На каждую цепь — <b className="font-mono text-accent-deep">{meta.cablesPerChain}</b> каб. ×
                          сигнальная лента. Кабелей на участок:{" "}
                          <b className="font-mono text-accent-deep">{state.chains * meta.cablesPerChain}</b>
                        </p>
                      </div>
                    </Reveal>
                  </div>
                </Section>

                {/* ---------- 02 типы траншеи ---------- */}
                <Section
                  num="02"
                  title="Типы траншеи"
                  sub="Множественный выбор — для каждого выбранного типа далее задаются свои параметры."
                  className="print-hide"
                  id="s02"
                >
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                    {(["gnb", "block", "lotok", "open"] as TrenchType[]).map((t, i) => {
                      const m = TRENCH_META[t];
                      const active = state.types.includes(t);
                      const Icon = { gnb: IconGnb, block: IconBlock, lotok: IconLotok, open: IconOpen }[t];
                      const len = vor.totals.lengthByType[t] ?? 0;
                      return (
                        <Reveal key={t} delay={i * 60}>
                          <button
                            type="button"
                            onClick={() => toggleType(t)}
                            className={`btn relative w-full text-left rounded-xl border px-4 py-4 overflow-hidden transition-all ${
                              active
                                ? "border-accent bg-accent-soft shadow-[0_8px_24px_-14px_rgba(37,99,235,0.5)]"
                                : "border-line bg-surface hover:border-line2 hover:bg-raise"
                            }`}
                          >
                            <span
                              className={`absolute top-0 left-0 h-full w-1 transition-colors ${
                                active ? "bg-accent" : "bg-transparent"
                              }`}
                            />
                            <div className="flex items-center justify-between">
                              <span
                                className={`font-mono text-xs font-bold w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
                                  active ? "bg-accent text-white" : "bg-well border border-line text-mut"
                                }`}
                              >
                                {m.letter}
                              </span>
                              <span className={active ? "text-accent" : "text-mut2"}>
                                <Icon className="w-8 h-8" />
                              </span>
                            </div>
                            <div
                              className={`mt-2.5 font-display font-semibold text-[13.5px] tracking-tight ${
                                active ? "text-ink" : "text-mut"
                              }`}
                            >
                              {m.label}
                            </div>
                            <div className="mt-1 font-mono text-[10.5px] font-semibold text-mut">
                              {active ? (len > 0 ? `${len} м трассы` : "выбран") : "не используется"}
                            </div>
                          </button>
                        </Reveal>
                      );
                    })}
                  </div>
                  {state.types.length === 0 && (
                    <p className="mt-4 flex items-center gap-2 text-xs font-medium text-danger bg-danger-soft border border-danger/20 rounded-lg px-3.5 py-2.5">
                      <IconPlus className="w-3.5 h-3.5 rotate-45 shrink-0" /> Выберите хотя бы один тип
                      траншеи — участки без активного типа исключаются из расчета.
                    </p>
                  )}
                </Section>

                {/* ---------- 03 параметры ---------- */}
                <Section
                  num="03"
                  title="Параметры траншей"
                  sub="Ширина, подсыпка и конструкции для каждого выбранного типа. ГНБ — диаметр скважины и пучок труб."
                  className="print-hide"
                  id="s03"
                >
                  <TrenchParams state={state} update={updateParams} />
                </Section>

                {/* ---------- 04 участки ---------- */}
                <Section
                  num="04"
                  title="Участки трассы"
                  sub="Точки, длины и глубина в начале/конце участка. H ср. и объемы пересчитываются сразу. Позже — загрузка полилинии из DXF."
                  className="print-hide"
                  id="s04"
                >
                  <SegmentsTable
                    state={state}
                    calcs={vor.calcs}
                    onUpdate={updateSegment}
                    onAdd={addSegment}
                    onRemove={removeSegment}
                  />
                </Section>

                {/* ---------- 05 ведомость ---------- */}
                <Section num="05" title="Ведомость (ВОР)" sub="Итоговый документ — в Excel или на печать." hideHeaderOnPrint id="s05">
                  <div ref={sheetRef}>
                    <VorSheet state={state} vor={vor} />
                  </div>
                  <div className="no-print mt-4 text-xs text-mut leading-relaxed bg-raise border border-line rounded-lg px-4 py-3">
                    <span className="font-bold uppercase tracking-wider text-[10px] text-mut2">Методика · </span>
                    V траншеи = B · H<sub>ср</sub> · L; при H<sub>ср</sub> &gt; 1,5 м — откосы k = 1,15. Лотки и
                    плиты — Серия 3.006.1-2.87 (лоток 0,59 м, плита 1,19 м). ПЗК — 4 шт/м на кабель. Фиксаторы
                    труб — шаг 1,5 м. Засыпка песком/ПГС поверх конструкций t = 10 см. ГНБ: V = π·D²/4 · L.
                  </div>
                </Section>
              </div>

              {/* ================= sticky preview ================= */}
              <aside className="no-print hidden xl:block">
                <VorPreview
                  state={state}
                  vor={vor}
                  onExport={() => exportVorExcel(state, vor)}
                  onPrint={() => window.print()}
                />
              </aside>
            </div>
          </main>
        </div>

        {/* mobile export bar */}
        <div className="no-print xl:hidden sticky bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur px-4 py-3 flex gap-3">
          <BtnPrimary
            onClick={() => exportVorExcel(state, vor)}
            disabled={vor.rows.length === 0}
            className="flex-1 h-11"
          >
            <IconDownload /> Скачать Excel
          </BtnPrimary>
          <BtnGhost onClick={() => window.print()} className="flex-1 h-11">
            <IconPrint /> Печать
          </BtnGhost>
        </div>
      </div>
    </div>
  );
}
