import { useMemo, useRef, useState } from "react";
import { SegmentsTable } from "./components/segments";
import { TrenchParams } from "./components/params";
import {
  FlashValue,
  IconBlock,
  IconGnb,
  IconLotok,
  IconOpen,
  IconPlus,
  Logo,
  NumInput,
  Reveal,
  Section,
  useReveal,
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

/* фоновый чертежный разрез траншеи */
function BgSection() {
  return (
    <div className="no-print fixed inset-y-0 right-0 w-[520px] pointer-events-none hidden xl:block opacity-[0.055]">
      <svg viewBox="0 0 520 900" fill="none" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
        <path d="M0 220h520" stroke="#9adcf5" strokeWidth="2" />
        <path d="M120 220l70 260h140l70-260" stroke="#9adcf5" strokeWidth="2" />
        <circle cx="230" cy="420" r="26" stroke="#9adcf5" strokeWidth="2" />
        <circle cx="290" cy="420" r="26" stroke="#9adcf5" strokeWidth="2" />
        <circle cx="260" cy="360" r="26" stroke="#9adcf5" strokeWidth="2" />
        <path d="M60 220v260M460 220v260" stroke="#f5a524" strokeWidth="1.4" strokeDasharray="6 6" />
        <path d="M60 490h400" stroke="#f5a524" strokeWidth="1.4" />
        <text x="70" y="360" fill="#f5a524" fontSize="22" fontFamily="monospace">H</text>
        <text x="245" y="530" fill="#f5a524" fontSize="22" fontFamily="monospace">B</text>
        <path d="M0 640h520" stroke="#9adcf5" strokeWidth="2" />
        <path d="M150 640c60 60 160 60 220 0" stroke="#9adcf5" strokeWidth="2" strokeDasharray="8 8" />
        <circle cx="370" cy="640" r="30" stroke="#9adcf5" strokeWidth="2" />
      </svg>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<ProjectState>(initialState);
  const sheetRef = useRef<HTMLDivElement>(null);
  const revealSheet = useReveal<HTMLDivElement>();
  const vor = useMemo(() => buildVor(state), [state]);

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
      <BgSection />

      {/* ================= top bar ================= */}
      <header className="no-print sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur-sm">
        <div className="max-w-[1500px] mx-auto px-4 lg:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo className="w-8 h-8 text-line2" />
            <div className="leading-none">
              <div className="font-display text-sm tracking-wide text-white">
                ВОР<span className="text-amber">·</span>КЛ
              </div>
              <div className="text-[10px] text-mut2 mt-1 tracking-wide">
                ведомость объемов работ · кабельные линии
              </div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-5 font-mono text-[11px] uppercase tracking-wider text-mut">
            <span>
              уч. <b className="text-cyan2">{vor.totals.activeSegments}</b>
            </span>
            <span>
              поз. <b className="text-cyan2">{vor.totals.rows}</b>
            </span>
            <span className="flex items-center gap-1.5 text-ok">
              <span className="w-1.5 h-1.5 rounded-full bg-ok pulse-dot" />
              расчет активен
            </span>
          </div>
        </div>
      </header>

      {/* ================= title block (штамп) ================= */}
      <div className="max-w-[1500px] mx-auto px-4 lg:px-8 pt-6">
        <Reveal>
          <div className="no-print corners border border-line2 bg-panel relative overflow-hidden">
            <div className="grid lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="p-5 sm:p-7">
                <div className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.22em] text-cyan mb-2">
                  Форма ведомости · приложение к наряду-заказу
                </div>
                <h1 className="font-display uppercase text-2xl sm:text-4xl xl:text-[2.6rem] leading-[1.08] text-white">
                  Ведомость объемов
                  <br />
                  <span className="text-amber">выполненных работ</span>
                </h1>
                <p className="mt-3 text-sm text-mut max-w-xl">
                  Кабельная линия <span className="text-cyan2 font-mono">{meta.label}</span> ·{" "}
                  {meta.cableNote}. Земляные работы, монтаж каналов и труб, прокладка кабеля —
                  по участкам трассы с глубиной в точках.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 border-t lg:border-t-0 lg:border-l border-line divide-x divide-line font-mono">
                {[
                  { k: "Объект", v: state.projectName || "—" },
                  { k: "Шифр", v: state.projectCode || "—" },
                  { k: "Цепей в траншее", v: String(state.chains) },
                  { k: "Способы", v: state.types.map((t) => TRENCH_META[t].letter).join(" · ") || "—" },
                ].map((c) => (
                  <div key={c.k} className="px-4 py-3 min-w-0">
                    <div className="text-[9px] uppercase tracking-[0.18em] text-mut2">{c.k}</div>
                    <div className="text-xs text-white truncate mt-1" title={c.v}>
                      {c.v}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* анимированная кабельная линия */}
            <svg viewBox="0 0 1200 46" className="w-full h-10 block" preserveAspectRatio="none">
              <path d="M0 14h1200" stroke="#2e4266" strokeWidth="1.5" />
              <path d="M180 14l26 22h60l26-22M560 14l26 22h60l26-22M940 14l26 22h60l26-22" stroke="#2e4266" strokeWidth="1.5" fill="none" />
              <path d="M0 30h1200" stroke="var(--color-amber)" strokeWidth="2" className="cableflow" />
            </svg>
          </div>
        </Reveal>
      </div>

      {/* ================= main grid ================= */}
      <main className="max-w-[1500px] mx-auto px-4 lg:px-8 py-8 grid lg:grid-cols-[minmax(0,1fr)_360px] gap-8 items-start">
        <div className="space-y-12 min-w-0">
          {/* ---------- 01 объект ---------- */}
          <Section num="01" title="Тип объекта" sub="Класс напряжения определяет число кабелей на цепь и наименования позиций кабельных работ." className="print-hide">
            <div className="grid md:grid-cols-[1fr_240px] gap-4 items-start">
              <div className="grid grid-cols-3 gap-3">
                {(Object.keys(VOLTAGE_META) as VoltageClass[]).map((v, i) => {
                  const m = VOLTAGE_META[v];
                  const active = state.voltage === v;
                  return (
                    <Reveal key={v} delay={i * 60}>
                      <button
                        type="button"
                        onClick={() => patch({ voltage: v })}
                        className={`btn w-full text-left border px-4 py-4 transition-colors ${
                          active
                            ? "border-amber bg-amber/10 shadow-[0_10px_30px_-14px_rgba(245,165,36,0.5)]"
                            : "border-line2 bg-panel hover:border-amber/50"
                        }`}
                      >
                        <div className={`font-display text-lg sm:text-2xl leading-none ${active ? "text-amber2" : "text-white"}`}>
                          {VOLT_BIG[v]}
                          <span className="text-xs sm:text-sm align-top ml-1 text-mut">кВ</span>
                        </div>
                        <div className="mt-2 text-[10px] sm:text-[11px] leading-snug text-mut">
                          {m.cableNote}
                        </div>
                      </button>
                    </Reveal>
                  );
                })}
              </div>

              <Reveal delay={180}>
                <div className="corners border border-line bg-panel p-4">
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
                  <p className="mt-3 text-[11px] text-mut2 leading-relaxed">
                    На каждую цепь — <span className="text-cyan2 font-mono">{meta.cablesPerChain}</span>{" "}
                    каб. × сигнальная лента. Всего кабелей на участок:{" "}
                    <span className="text-amber2 font-mono">{state.chains * meta.cablesPerChain}</span>
                  </p>
                </div>
              </Reveal>
            </div>

            <Reveal delay={100}>
              <div className="mt-4 grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-mut">
                    Наименование объекта
                  </span>
                  <input
                    value={state.projectName}
                    onChange={(e) => patch({ projectName: e.target.value })}
                    placeholder="Например: КЛ 10 кВ от ПС «Заречная»"
                    className="w-full bg-panel2 border border-line2 px-3 py-2 text-sm text-white outline-none focus:border-amber/70 placeholder:text-mut2"
                  />
                </label>
                <label className="block">
                  <span className="block mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-mut">
                    Шифр проекта
                  </span>
                  <input
                    value={state.projectCode}
                    onChange={(e) => patch({ projectCode: e.target.value })}
                    placeholder="24-07-КЛ"
                    className="w-full bg-panel2 border border-line2 px-3 py-2 font-mono text-sm text-cyan2 outline-none focus:border-amber/70 placeholder:text-mut2"
                  />
                </label>
              </div>
            </Reveal>
          </Section>

          {/* ---------- 02 типы траншеи ---------- */}
          <Section num="02" title="Типы траншеи" sub="Множественный выбор — для каждого выбранного типа далее задаются свои параметры." className="print-hide">
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
                      className={`btn relative w-full text-left border px-4 py-4 overflow-hidden transition-colors ${
                        active
                          ? "border-cyan/70 bg-cyan/10"
                          : "border-line2 bg-panel hover:border-cyan/40"
                      }`}
                    >
                      <span
                        className={`absolute top-0 left-0 h-full w-1 transition-colors ${
                          active ? "bg-cyan" : "bg-transparent"
                        }`}
                      />
                      <div className="flex items-center justify-between">
                        <span className={`font-mono text-xs font-bold w-6 h-6 flex items-center justify-center ${active ? "bg-cyan text-deep" : "border border-line2 text-mut"}`}>
                          {m.letter}
                        </span>
                        <span className={active ? "text-cyan" : "text-mut2"}>
                          <Icon className="w-8 h-8" />
                        </span>
                      </div>
                      <div className={`mt-2 font-display text-sm uppercase tracking-wide ${active ? "text-white" : "text-mut"}`}>
                        {m.label}
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-mut2">
                        {active ? (len > 0 ? `${len} м трассы` : "выбран") : "не используется"}
                      </div>
                    </button>
                  </Reveal>
                );
              })}
            </div>
            {state.types.length === 0 && (
              <p className="mt-3 text-xs text-danger flex items-center gap-2">
                <IconPlus className="w-3.5 h-3.5 rotate-45" /> Выберите хотя бы один тип траншеи —
                участки без активного типа исключаются из расчета.
              </p>
            )}
          </Section>

          {/* ---------- 03 параметры ---------- */}
          <Section num="03" title="Параметры траншей" sub="Ширина, подсыпка и конструкции для каждого выбранного типа. ГНБ — диаметр скважины и пучок труб." className="print-hide">
            <TrenchParams state={state} update={updateParams} />
          </Section>

          {/* ---------- 04 участки ---------- */}
          <Section num="04" title="Участки трассы" sub="Точки, длины и глубина в начале/конце участка. H ср. и объемы пересчитываются сразу." className="print-hide">
            <SegmentsTable
              state={state}
              calcs={vor.calcs}
              onUpdate={updateSegment}
              onAdd={addSegment}
              onRemove={removeSegment}
            />
          </Section>

          {/* ---------- 05 ведомость ---------- */}
          <Section num="05" title="Ведомость (ВОР)" sub="Итоговый документ для выдачи подрядчику и заказчику — в Excel или на печать." hideHeaderOnPrint>
            <div ref={revealSheet} className="reveal">
              <div ref={sheetRef}>
                <VorSheet state={state} vor={vor} />
              </div>
              <div className="no-print mt-4 text-[11px] text-mut2 leading-relaxed border border-dashed border-line2 px-4 py-3">
                <span className="text-mut font-semibold uppercase tracking-wider text-[10px]">Методика · </span>
                V траншеи = B · H<sub>ср</sub> · L; при H<sub>ср</sub> &gt; 1,5 м — откосы k = 1,15.
                Лотки и плиты — Серия 3.006.1-2.87 (лоток 0,59 м, плита 1,19 м). ПЗК — 4 шт/м на кабель.
                Фиксаторы труб — шаг 1,5 м. Засыпка {`песком/ПГС`} поверх конструкций t = 10 см.
                ГНБ: V бурения = π·D²/4 · L.
              </div>
            </div>
          </Section>
        </div>

        {/* ================= sticky preview ================= */}
        <aside className="no-print hidden lg:block">
          <VorPreview
            state={state}
            vor={vor}
            onExport={() => exportVorExcel(state, vor)}
            onPrint={() => window.print()}
          />
        </aside>
      </main>

      {/* mobile export bar */}
      <div className="no-print lg:hidden sticky bottom-0 z-40 border-t border-line bg-ink/95 backdrop-blur px-4 py-3 flex gap-3">
        <button
          onClick={() => exportVorExcel(state, vor)}
          disabled={vor.rows.length === 0}
          className="btn flex-1 flex items-center justify-center gap-2 bg-amber text-deep font-semibold text-sm px-4 py-3 disabled:opacity-40"
        >
          Скачать Excel
        </button>
        <button
          onClick={() => window.print()}
          className="btn flex-1 flex items-center justify-center gap-2 border border-line2 text-mut font-medium text-sm px-4 py-3 hover:text-amber2 hover:border-amber/60"
        >
          Печать
        </button>
      </div>

      <footer className="no-print border-t border-line mt-8">
        <div className="max-w-[1500px] mx-auto px-4 lg:px-8 py-5 flex flex-col sm:flex-row gap-2 sm:items-center justify-between text-[11px] text-mut2">
          <span className="font-mono uppercase tracking-wider">
            ВОР·КЛ — калькулятор ведомости объемов · для ПИР и ППР
          </span>
          <span>
            Итоги: <FlashValue value={vor.totals.length} decimals={0} className="text-cyan2" /> м трассы ·{" "}
            <FlashValue value={vor.totals.earth} decimals={1} className="text-amber2" /> м³ земли ·{" "}
            <FlashValue value={vor.totals.cable} decimals={0} className="text-amber2" /> м кабеля
          </span>
        </div>
      </footer>
    </div>
  );
}
