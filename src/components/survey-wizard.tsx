import { useCallback, useRef, useState } from "react";
import {
  autoAssemble,
  autoDetectColumns,
  type ColumnMapping,
  parseExcelFile,
  parseRows,
  parseTextFile,
  type ParseResult,
  type SurveyPoint,
  toSegments,
  type AssembledSegment,
} from "../lib/survey-import";
import type { Segment, Surface, SurveyMeta, TrenchType } from "../lib/types";
import { TRENCH_META } from "../data/catalogs";
import { Modal, BtnPrimary, BtnGhost } from "./ui";

/* ================================================================
   Типы
   ================================================================ */

interface Props {
  surfaces: Surface[];
  onClose: () => void;
  onImport: (data: {
    segments: Segment[];
    surveyMeta: SurveyMeta;
  }) => void;
}

type Step = 1 | 2 | 3;

interface WizardState {
  parseResult: ParseResult | null;
  mapping: ColumnMapping;
  points: SurveyPoint[];
  assembled: AssembledSegment[];
  parseWarnings: string[];
  assembleWarnings: string[];
  designDepth: number;
  fileName: string;
}

/* ================================================================
   Компонент мастера
   ================================================================ */

export function SurveyImportWizard({ surfaces, onClose, onImport }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [ws, setWs] = useState<WizardState>({
    parseResult: null,
    mapping: { nameIdx: 0, xIdx: 1, yIdx: 2, zIdx: 3, codeIdx: 4 },
    points: [],
    assembled: [],
    parseWarnings: [],
    assembleWarnings: [],
    designDepth: 1.5,
    fileName: "",
  });

  /* -------- Шаг 1: загрузка файла -------- */
  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setLoading(true);

      try {
        let result: ParseResult;

        const name = file.name.toLowerCase();
        /* Старый двоичный .xls не читается — просим пересохранить */
        if (name.endsWith(".xls")) {
          throw new Error("формат .xls не поддерживается, пересохраните файл как .xlsx");
        }
        if (name.endsWith(".xlsx")) {
          const buf = await file.arrayBuffer();
          result = await parseExcelFile(buf);
        } else {
          const text = await file.text();
          result = parseTextFile(text);
        }

        const detected = autoDetectColumns(result.headers);
        const mapping: ColumnMapping = {
          nameIdx: detected.nameIdx ?? 0,
          xIdx: detected.xIdx ?? (result.headers.length > 1 ? 1 : 0),
          yIdx: detected.yIdx ?? (result.headers.length > 2 ? 2 : 0),
          zIdx: detected.zIdx ?? (result.headers.length > 3 ? 3 : 0),
          codeIdx: detected.codeIdx ?? (result.headers.length > 4 ? 4 : 0),
        };

        setWs((prev) => ({
          ...prev,
          parseResult: result,
          mapping,
          fileName: file.name,
          points: [],
          assembled: [],
          parseWarnings: [],
          assembleWarnings: [],
        }));
      } catch (err) {
        alert(`Ошибка чтения файла: ${(err as Error).message}`);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /* -------- Шаг 2: привязка колонок -------- */
  const applyMapping = useCallback(() => {
    if (!ws.parseResult) return;
    const { points, warnings } = parseRows(ws.parseResult.rawRows, ws.mapping);
    const assembled = autoAssemble(points, surfaces, ws.designDepth);

    setWs((prev) => ({
      ...prev,
      points,
      parseWarnings: warnings,
      assembled: assembled.segments,
      assembleWarnings: assembled.warnings,
    }));
    setStep(3);
  }, [ws.parseResult, ws.mapping, ws.designDepth, surfaces]);

  /* -------- Шаг 3: импорт -------- */
  const handleImport = () => {
    const segments = toSegments(ws.assembled);
    onImport({
      segments,
      surveyMeta: {
        date: new Date().toISOString().slice(0, 10),
        surveyor: "",
        fileName: ws.fileName,
      },
    });
    onClose();
  };

  const pr = ws.parseResult;
  const colCount = pr?.headers.length ?? 0;

  return (
    <Modal
      title="Импорт съёмки"
      sub="Мастер импорта точек геодезической съёмки и автосборки участков трассы"
      onClose={onClose}
      wide
      footer={
        <div className="flex items-center gap-2 w-full">
          <div className="flex-1 flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  s <= step ? "bg-accent" : "bg-line2"
                }`}
              />
            ))}
          </div>
          {step === 2 && (
            <BtnGhost onClick={() => setStep(1)}>Назад</BtnGhost>
          )}
          {step === 3 && (
            <BtnGhost onClick={() => setStep(2)}>Назад</BtnGhost>
          )}
          {step === 2 && (
            <BtnPrimary onClick={applyMapping} disabled={ws.points.length === 0 && !pr}>
              Далее →
            </BtnPrimary>
          )}
          {step === 3 && (
            <BtnPrimary onClick={handleImport} disabled={ws.assembled.length === 0}>
              Импортировать {ws.assembled.length} участков
            </BtnPrimary>
          )}
        </div>
      }
    >
      {/* ================= Шаг 1: файл ================= */}
      {step === 1 && (
        <div className="space-y-4">
          <div
            className="border-2 border-dashed border-line2 rounded-xl p-8 text-center hover:border-accent/50 transition-colors cursor-pointer"
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.xlsx"
              className="hidden"
              onChange={handleFile}
            />
            {loading ? (
              <p className="text-sm text-mut">Чтение файла…</p>
            ) : pr ? (
              <div>
                <p className="text-sm font-semibold text-ok">✓ {ws.fileName}</p>
                <p className="text-xs text-mut mt-1">
                  {pr.headers.length} колонок · {pr.totalLines} строк · формат {pr.format}
                </p>
                <p className="text-xs text-accent mt-2">Нажмите для замены файла</p>
              </div>
            ) : (
              <div>
                <p className="text-3xl mb-2">📂</p>
                <p className="text-sm font-semibold text-ink">
                  Выберите файл съёмки
                </p>
                <p className="text-xs text-mut mt-1">
                  CSV, TXT или Excel (.xlsx) — точки с координатами и кодами
                </p>
              </div>
            )}
          </div>

          {pr && pr.headers.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-mut">
                Предпросмотр данных
              </p>
              <div className="overflow-x-auto border border-line rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-raise border-b border-line">
                      <th className="px-2 py-1.5 text-left font-mono text-mut2 w-8">№</th>
                      {pr.headers.map((h, i) => (
                        <th
                          key={i}
                          className="px-2 py-1.5 text-left font-mono text-mut whitespace-nowrap"
                        >
                          {h || `Кол.${i + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pr.rawRows.slice(0, 5).map((row, ri) => (
                      <tr key={ri} className="border-b border-line/50">
                        <td className="px-2 py-1 font-mono text-mut2">{ri + 1}</td>
                        {pr.headers.map((_, ci) => (
                          <td key={ci} className="px-2 py-1 font-mono whitespace-nowrap">
                            {row[ci] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {pr.totalLines > 5 && (
                      <tr>
                        <td
                          colSpan={pr.headers.length + 1}
                          className="px-2 py-1 text-center text-mut2"
                        >
                          …и ещё {pr.totalLines - 5} строк
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {pr && (
            <div className="flex justify-end">
              <BtnPrimary onClick={() => setStep(2)}>
                Далее: привязка колонок →
              </BtnPrimary>
            </div>
          )}
        </div>
      )}

      {/* ================= Шаг 2: привязка колонок ================= */}
      {step === 2 && pr && (
        <div className="space-y-4">
          <p className="text-xs text-mut">
            Укажите, какие колонки соответствуют координатам, отметке и коду точки.
            Приложение определило автоматически — проверьте и поправьте при необходимости.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {([
              ["nameIdx", "Имя точки", "PK7"],
              ["xIdx", "X (восток)", "6543380"],
              ["yIdx", "Y (север)", "2345755"],
              ["zIdx", "Отметка Z", "125.3"],
              ["codeIdx", "Код", "OPN_GAZ"],
            ] as const).map(([key, label, hint]) => (
              <label key={key} className="block">
                <span className="block mb-1 text-[10px] font-semibold uppercase tracking-wider text-mut">
                  {label}
                </span>
                <select
                  value={ws.mapping[key as keyof ColumnMapping]}
                  onChange={(e) =>
                    setWs((prev) => ({
                      ...prev,
                      mapping: { ...prev.mapping, [key]: Number(e.target.value) },
                    }))
                  }
                  className="w-full h-9 bg-raise border border-line rounded-lg px-2 text-xs font-mono text-ink outline-none focus:border-accent"
                >
                  {pr.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {i + 1}: {h || `Кол.${i + 1}`}
                    </option>
                  ))}
                </select>
                <span className="block mt-0.5 text-[9px] text-mut2">напр. {hint}</span>
              </label>
            ))}
          </div>

          <label className="block">
            <span className="block mb-1 text-[10px] font-semibold uppercase tracking-wider text-mut">
              Проектная глубина заложения, м
            </span>
            <input
              type="number"
              step={0.1}
              min={0.3}
              max={5}
              value={ws.designDepth}
              onChange={(e) =>
                setWs((prev) => ({
                  ...prev,
                  designDepth: parseFloat(e.target.value.replace(",", ".")) || 1.5,
                }))
              }
              className="w-32 h-9 bg-raise border border-line rounded-lg px-3 font-mono text-sm text-ink outline-none focus:border-accent"
            />
          </label>

          <div className="flex justify-end">
            <BtnPrimary onClick={applyMapping}>
              Собрать участки →
            </BtnPrimary>
          </div>
        </div>
      )}

      {/* ================= Шаг 3: предпросмотр участков ================= */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Статистика */}
          <div className="grid grid-cols-3 gap-3">
            <div className="border border-line rounded-lg bg-raise px-3 py-2 text-center">
              <div className="text-[9px] uppercase tracking-wider text-mut2">Точек</div>
              <div className="font-mono text-lg font-bold text-accent-deep">{ws.points.length}</div>
            </div>
            <div className="border border-line rounded-lg bg-raise px-3 py-2 text-center">
              <div className="text-[9px] uppercase tracking-wider text-mut2">Пикетов</div>
              <div className="font-mono text-lg font-bold text-accent-deep">
                {new Set(ws.points.map((p) => p.name.replace(/\d+.*$/, ""))).size || "—" }
              </div>
            </div>
            <div className="border border-line rounded-lg bg-raise px-3 py-2 text-center">
              <div className="text-[9px] uppercase tracking-wider text-mut2">Участков</div>
              <div className="font-mono text-lg font-bold text-accent-deep">{ws.assembled.length}</div>
            </div>
          </div>

          {/* Предупреждения */}
          {[...ws.parseWarnings, ...ws.assembleWarnings].length > 0 && (
            <div className="border border-warn/30 bg-warn-soft rounded-lg px-3 py-2">
              {[...ws.parseWarnings, ...ws.assembleWarnings].map((w, i) => (
                <p key={i} className="text-xs text-warn flex items-start gap-1.5">
                  <span>⚠</span> {w}
                </p>
              ))}
            </div>
          )}

          {/* Таблица участков */}
          <div className="overflow-x-auto border border-line rounded-lg">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-raise border-b border-line">
                  <th className="px-2 py-1.5 text-left font-mono text-mut2">№</th>
                  <th className="px-2 py-1.5 text-left font-mono text-mut">От</th>
                  <th className="px-2 py-1.5 text-left font-mono text-mut">До</th>
                  <th className="px-2 py-1.5 text-left font-mono text-mut">Тип</th>
                  <th className="px-2 py-1.5 text-right font-mono text-mut">L, м</th>
                  <th className="px-2 py-1.5 text-right font-mono text-mut">L накл., м</th>
                  <th className="px-2 py-1.5 text-right font-mono text-mut">Отм. нач., м</th>
                  <th className="px-2 py-1.5 text-right font-mono text-mut">Отм. кон., м</th>
                  <th className="px-2 py-1.5 text-right font-mono text-mut">H, м</th>
                </tr>
              </thead>
              <tbody>
                {ws.assembled.map((seg, i) => (
                  <tr key={i} className="border-b border-line/50 hover:bg-raise/50">
                    <td className="px-2 py-1 font-mono text-mut2">{i + 1}</td>
                    <td className="px-2 py-1 font-mono font-semibold text-ink">{seg.from}</td>
                    <td className="px-2 py-1 font-mono font-semibold text-ink">{seg.to}</td>
                    <td className="px-2 py-1">
                      <span className="inline-flex items-center gap-1">
                        <span className="font-mono text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded bg-accent-soft text-accent">
                          {TRENCH_META[seg.type]?.letter ?? "?"}
                        </span>
                        <span className="text-ink">{TRENCH_META[seg.type]?.short ?? seg.type}</span>
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right font-mono font-medium text-ink">
                      {seg.length.toFixed(1)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-mut">
                      {seg.slopeLength.toFixed(1)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-mut">
                      {seg.groundElev1.toFixed(2)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-mut">
                      {seg.groundElev2.toFixed(2)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-accent-deep font-medium">
                      {seg.h1.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-raise border-t border-line font-semibold">
                  <td colSpan={4} className="px-2 py-1.5 text-right text-mut">
                    Σ горизонтальная:
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-accent-deep">
                    {ws.assembled.reduce((s, a) => s + a.length, 0).toFixed(1)} м
                  </td>
                  <td colSpan={2} className="px-2 py-1.5 text-right text-mut">
                    Σ наклонная:
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-accent-deep" colSpan={2}>
                    {ws.assembled.reduce((s, a) => s + a.slopeLength, 0).toFixed(1)} м
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Подсказка */}
          <p className="text-[11px] text-mut2 leading-relaxed border border-dashed border-line2 rounded-lg px-3 py-2 bg-surface/60">
            <span className="text-mut font-semibold">Кодировщик: </span>
            OPN — открытая, LOT — лотки, BLK — блок, GNB — ГНБ, SPL — муфты.
            Покрытие: ASF — асфальт, TROT — тротуар, GAZ — газон, SHEB — щебень.
            Глубина принята проектной для всех участков — при необходимости поправьте в таблице участков.
          </p>
        </div>
      )}
    </Modal>
  );
}
