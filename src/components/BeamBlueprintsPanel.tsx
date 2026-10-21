import React, { useState, useMemo } from "react";
import { DomeModel, ConnectorParams, BeamTypeGroup } from "../core/types";
import { calculateBeamMiterAngles } from "../core/beams";
import {
  generateBeamBlueprintsSVG,
  generateSingleBeamBlueprintSVG,
  downloadFile
} from "../export/svgExport";
import {
  Ruler,
  Download,
  Printer,
  Layers,
  Disc,
  CheckCircle,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileCode,
  Hammer,
  ShieldCheck,
  Compass,
  Info,
  FileSpreadsheet,
  Search,
  Filter
} from "lucide-react";

interface BeamBlueprintsPanelProps {
  model: DomeModel;
  connectorParams?: ConnectorParams;
  onChangeConnectorParams?: (params: ConnectorParams) => void;
}

export const BeamBlueprintsPanel: React.FC<BeamBlueprintsPanelProps> = ({
  model,
  connectorParams,
  onChangeConnectorParams
}) => {
  const activeParams = connectorParams || model.connectorParams;
  const hubDiam = activeParams.hubDiameter || 140;
  const hubRadius = hubDiam / 2;

  const groups = model.beamGroups;

  // Selected view: "all" or specific beam type (e.g. "A", "B", "C")
  const [selectedType, setSelectedType] = useState<string>("all");
  const [zoomScale, setZoomScale] = useState<number>(1.0);

  // View mode: standard grouped blueprints vs full individual schedule
  const [viewMode, setViewMode] = useState<"blueprints" | "schedule">(
    model.parameters.shapeType === "ellipsoid" ? "schedule" : "blueprints"
  );
  const [quadrantFilter, setQuadrantFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Filtered edges for schedule table
  const filteredEdges = useMemo(() => {
    return model.edges.filter(e => {
      if (quadrantFilter !== "all" && e.quadrant !== quadrantFilter) return false;
      if (typeFilter !== "all" && e.type !== typeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const label = (e.beamLabel || `E-${e.id + 1}`).toLowerCase();
        const type = e.type.toLowerCase();
        const idStr = String(e.id);
        if (!label.includes(q) && !type.includes(q) && !idStr.includes(q)) return false;
      }
      return true;
    });
  }, [model.edges, quadrantFilter, typeFilter, searchQuery]);

  // Export full schedule as CSV with UTF-8 BOM
  const handleDownloadCSV = () => {
    const headers =
      "Маркування,Тип,Квадрант,Довжина_по_осях_мм,Чистий_розпил_мм,Торцевий_кут_A_град,Торцевий_кут_B_град,Кут_скосу_град,Вузол_A,Вузол_B\n";
    const rows = model.edges
      .map(
        e =>
          `${e.beamLabel || `E-${String(e.id + 1).padStart(3, "0")}`},${e.type},${e.quadrant || "Q1"},${e.length},${e.cutLength || e.length},${e.startMiterDeg || 0},${e.endMiterDeg || 0},${e.bevelDeg || 0},${e.start},${e.end}`
      )
      .join("\n");
    const shapeLabel = model.parameters.shapeType === "ellipsoid" ? "ellipsoid" : "sphere";
    downloadFile(
      `kupolgeo_beams_schedule_${shapeLabel}_${model.parameters.frequency}V.csv`,
      "\uFEFF" + headers + rows,
      "text/csv;charset=utf-8"
    );
  };

  // Active group if single beam selected
  const activeGroup: BeamTypeGroup = useMemo(() => {
    return groups.find(g => g.type === selectedType) || groups[0];
  }, [groups, selectedType]);

  const activeSampleEdge = useMemo(() => {
    return model.edges.find(e => e.type === activeGroup.type) || model.edges[0];
  }, [model.edges, activeGroup]);

  const activeMiter = useMemo(() => {
    return calculateBeamMiterAngles(activeSampleEdge, model.nodes, activeParams);
  }, [activeSampleEdge, model.nodes, activeParams]);

  // Generated SVG content
  const currentSvg = useMemo(() => {
    if (selectedType === "all") {
      return generateBeamBlueprintsSVG(model);
    } else {
      return generateSingleBeamBlueprintSVG(model, selectedType);
    }
  }, [model, selectedType, hubDiam]);

  // Download SVG
  const handleDownloadSVG = () => {
    const filename =
      selectedType === "all"
        ? `kupolgeo_all_beams_${model.parameters.frequency}V.svg`
        : `kupolgeo_beam_type_${selectedType}_${model.parameters.frequency}V.svg`;
    downloadFile(filename, currentSvg, "image/svg+xml;charset=utf-8");
  };

  // Print blueprint
  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Креслення балок — Купол ${model.parameters.frequency}V</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            body { margin: 0; padding: 0; background: #fff; display: flex; justify-content: center; align-items: center; }
            svg { width: 100%; height: auto; max-height: 95vh; }
          </style>
        </head>
        <body>
          ${currentSvg}
          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const netCut =
  activeGroup.cutLength || Math.max(10, Math.round(activeGroup.length - hubDiam));
  const linearM = Math.round(((netCut * activeGroup.count) / 1000) * 10) / 10;
  const isRound = model.beamProfile.type === "circular" || model.beamProfile.type === "pipe";
  const dVal = model.beamProfile.diameter || model.beamProfile.width;
  const crossAreaM2 = isRound
    ? (Math.PI / 4) * Math.pow(dVal / 1000, 2)
    : (model.beamProfile.width / 1000) * (model.beamProfile.depth / 1000);
  const volM3 = Math.round(linearM * crossAreaM2 * 100) / 100;
  const weightKg = Math.round(volM3 * model.beamProfile.density);

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header Card */}
      <div className="flex flex-col gap-5 p-6 rounded-3xl tactile-card">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-[#E8E2D8] gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-[#E1EDE3] text-[#1A3E26] shadow-xs">
              <Ruler className="w-5 h-5 text-[#2E7D32]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1A2E3B]">
                Креслення всіх балок каркаса (Технічні карти розкрою)
              </h2>
              <p className="text-xs text-[#5A6778]">
                Повні робочі креслення з двома розмірами (до вузла сходження та обрізка під конектор), кутами запилу й отворами
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Interactive Ring Trim Offset Input */}
            {onChangeConnectorParams && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#A6C7AE] text-xs shadow-2xs">
                <Disc className="w-3.5 h-3.5 text-[#2E7D32]" />
                <span className="font-semibold text-[#1A2E3B] whitespace-nowrap">
                  Кільце Ø:
                </span>
                <input
                  type="number"
                  min={20}
                  max={300}
                  step={5}
                  value={hubDiam}
                  onChange={e =>
                    onChangeConnectorParams({
                      ...activeParams,
                      hubDiameter: Number(e.target.value)
                    })
                  }
                  className="w-12 text-xs font-mono font-bold text-center text-[#1A2E3B] bg-[#FAF7F2] border border-[#DCD6CA] rounded-md outline-none"
                  title="Діаметр кільця для автоматичної обрізки бруса"
                />
                <span className="text-[10px] text-[#8C9BAE]">мм</span>
                <span className="text-[10px] font-mono font-bold text-[#2E7D32] bg-[#E1EDE3] px-1.5 py-0.5 rounded ml-0.5">
                  -{hubRadius.toFixed(0)} мм
                </span>
              </div>
            )}

            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl tactile-btn flex items-center gap-1.5 text-[#1A2E3B]"
              title="Друкувати креслення"
            >
              <Printer className="w-3.5 h-3.5 text-[#4A7C9B]" />
              <span>Друк A4</span>
            </button>

            <button
              onClick={handleDownloadSVG}
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl tactile-btn-mint flex items-center gap-1.5 shadow-2xs whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Завантажити SVG</span>
            </button>
          </div>
        </div>

        {/* View Mode Toggle: Grouped Blueprints vs Individual Schedule */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 p-1.5 rounded-2xl tactile-inset">
          <div className="flex items-center gap-1.5 flex-1">
            <button
              type="button"
              onClick={() => setViewMode("blueprints")}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                viewMode === "blueprints"
                  ? "bg-white text-[#1A2E3B] shadow-xs"
                  : "text-[#5A6778] hover:text-[#1A2E3B]"
              }`}
            >
              <FileCode className="w-3.5 h-3.5 text-[#5B9279]" />
              <span>Креслення за типами ({groups.length} груп)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("schedule")}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                viewMode === "schedule"
                  ? "bg-white text-[#DE7C5A] shadow-xs"
                  : "text-[#5A6778] hover:text-[#1A2E3B]"
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#DE7C5A]" />
              <span>Подетальна специфікація ({model.edges.length} деталей)</span>
              {model.parameters.shapeType === "ellipsoid" && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#DE7C5A]/15 text-[#DE7C5A]">
                  Овал
                </span>
              )}
            </button>
          </div>

          {viewMode === "schedule" && (
            <button
              type="button"
              onClick={handleDownloadCSV}
              className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl tactile-btn-mint text-[#1A2E3B] shadow-2xs whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Завантажити CSV</span>
            </button>
          )}
        </div>

        {viewMode === "blueprints" && (
          <div>
            <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold tracking-wide text-[#5A6778] uppercase">
              Оберіть креслення балки ({groups.length} типів каркаса):
            </span>
            <span className="text-[11px] font-mono text-[#5B9279] font-bold">
              Всього: {model.edges.length} балок
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
            {/* View All Beams Tab */}
            <button
              onClick={() => setSelectedType("all")}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
                selectedType === "all"
                  ? "bg-[#1A2E3B] text-white shadow-xs"
                  : "bg-white/80 hover:bg-white text-[#5A6778] border border-[#E8E2D8]"
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Всі типи на одному аркуші</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20">
                {groups.length}
              </span>
            </button>

            {/* Individual Beam Type Tabs */}
            {groups.map(g => {
              const cutL =
                g.cutLength || Math.max(10, Math.round(g.length - hubDiam));
              const isSelected = selectedType === g.type;

              return (
                <button
                  key={g.type}
                  onClick={() => setSelectedType(g.type)}
                  className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap border ${
                    isSelected
                      ? "bg-white text-[#1A2E3B] border-[#5B9279] ring-2 ring-[#5B9279]/20 shadow-xs"
                      : "bg-white/70 hover:bg-white text-[#5A6778] border-[#E8E2D8]"
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0 shadow-2xs"
                    style={{ backgroundColor: g.color }}
                  />
                  <span>Балка {g.type}</span>
                  <span className="font-mono text-[11px] text-[#2B6CB0]">
                    Lвуз: {g.length}
                  </span>
                  <span className="font-mono text-[11px] font-black text-[#2E7D32] bg-[#E1EDE3] px-1.5 py-0.5 rounded">
                    Lобр: {cutL}
                  </span>
                  <span className="text-[10px] text-[#718096]">
                    ({g.count} шт)
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        )}
      </div>

      {/* Mode A: Grouped CAD Blueprints */}
      {viewMode === "blueprints" && (
        <div className="flex flex-col gap-4 p-6 rounded-3xl tactile-card">
          {/* Canvas Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#1A2E3B]">
              {selectedType === "all"
                ? "Загальне технічне креслення розкрою всіх балок"
                : `Детальне креслення: Балка Тип ${activeGroup.type} (Lвуз = ${activeGroup.length} мм, Lобріз = ${netCut} мм)`}
            </span>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#E1EDE3] text-[#1A3E26]">
              Векторний CAD SVG (ЧПК / Столярний цех)
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setZoomScale(s => Math.max(0.6, s - 0.15))}
              className="p-1.5 rounded-xl tactile-btn text-[#5A6778]"
              title="Зменшити"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono font-bold text-[#5A6778] px-1.5">
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              onClick={() => setZoomScale(s => Math.min(2.0, s + 0.15))}
              className="p-1.5 rounded-xl tactile-btn text-[#5A6778]"
              title="Збільшити"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoomScale(1.0)}
              className="p-1.5 rounded-xl tactile-btn text-[#5A6778]"
              title="Масштаб 1:1"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Blueprint Vector Viewer Box */}
        <div className="w-full rounded-2xl bg-[#FBF9F5] border border-[#DCD6CA] p-4 overflow-auto min-h-[420px] max-h-[700px] flex items-center justify-center shadow-inner">
          <div
            style={{
              transform: `scale(${zoomScale})`,
              transformOrigin: "top center",
              transition: "transform 0.15s ease-out",
              width: "100%",
              maxWidth: selectedType === "all" ? "1100px" : "900px"
            }}
            dangerouslySetInnerHTML={{ __html: currentSvg }}
          />
        </div>
      </div>
      )}

      {/* Detail Technical Breakdown for Active Beam */}
      {viewMode === "blueprints" && selectedType !== "all" && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Card 1: Dual Lengths Breakdown */}
          <div className="p-4 rounded-2xl tactile-card-mint border border-white/80 flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-bold text-[#1A3E26] block uppercase mb-1">
                Розміри балки
              </span>
              <div className="space-y-1.5 my-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-[#3D6B5D]">1. До вузла сходження:</span>
                  <span className="font-mono font-bold text-sm text-[#1A2E3B]">
                    {activeGroup.length} мм
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-[#3D6B5D]">Відступ під кільце:</span>
                  <span className="font-mono font-bold text-xs text-[#DE7C5A]">
                    -2 × {hubRadius.toFixed(0)} мм
                  </span>
                </div>
                <div className="flex justify-between items-baseline pt-1 border-t border-[#A6C7AE]/60">
                  <span className="text-xs font-bold text-[#1A3E26]">2. Обрізаний під конектор:</span>
                  <span className="font-mono font-black text-base text-[#1B4D2E]">
                    {netCut} мм
                  </span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-[#3D6B5D] mt-2">
              Чистий габарит розпилу деревини для нарізки на торцювальній пилі.
            </p>
          </div>

          {/* Card 2: Miter & Bevel Angles */}
          <div className="p-4 rounded-2xl tactile-card-peach border border-white/80 flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-bold text-[#9A3412] block uppercase mb-1">
                Кути запилу (Торцювання)
              </span>
              <div className="space-y-1.5 my-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-[#7C2D12]">Торцевий зпил зліва:</span>
                  <span className="font-mono font-bold text-sm text-[#9A3412]">
                    {activeMiter.startMiterDeg}°
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-[#7C2D12]">Торцевий зпил справа:</span>
                  <span className="font-mono font-bold text-sm text-[#9A3412]">
                    {activeMiter.endMiterDeg}°
                  </span>
                </div>
                <div className="flex justify-between items-baseline pt-1 border-t border-[#F8C8AF]">
                  <span className="text-xs font-bold text-[#9A3412]">Фаска прилягання (bevel):</span>
                  <span className="font-mono font-bold text-sm text-[#9A3412]">
                    {activeMiter.bevelDeg}°
                  </span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-[#7C2D12] mt-2">
              Кут нахилу диска торцювальної пили. Допустиме відхилення: ±0.2°.
            </p>
          </div>

          {/* Card 3: Drill Marks for Bolts */}
          <div className="p-4 rounded-2xl tactile-card-sky border border-white/80 flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-bold text-[#1A2E3B] block uppercase mb-1">
                Присадка отворів під болти
              </span>
              <div className="space-y-1.5 my-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-[#4A5568]">Отвори на торці:</span>
                  <span className="font-mono font-bold text-xs text-[#1A2E3B]">
                    по 2 отвори (разом 4)
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-[#4A5568]">Відстань від торця:</span>
                  <span className="font-mono font-bold text-xs text-[#1A2E3B]">
                    35 мм та 75 мм
                  </span>
                </div>
                <div className="flex justify-between items-baseline pt-1 border-t border-[#CBD5E0]">
                  <span className="text-xs font-bold text-[#1A2E3B]">Діаметр свердла:</span>
                  <span className="font-mono font-bold text-xs text-[#2B6CB0]">
                    Ø10.5 мм (під М10)
                  </span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-[#4A5568] mt-2">
              Отвори точно співпадають з пазами променів сталевих конекторів Thunder Domes.
            </p>
          </div>

          {/* Card 4: Material & Batch Spec */}
          <div className="p-4 rounded-2xl tactile-inset-subtle border border-white/60 flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-bold text-[#5A6778] block uppercase mb-1">
                Матеріал та тираж
              </span>
              <div className="space-y-1.5 my-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-[#5A6778]">Кількість на купол:</span>
                  <span className="font-mono font-bold text-sm text-[#2E7D32]">
                    {activeGroup.count} шт
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-[#5A6778]">{isRound ? "Переріз балки:" : "Переріз бруса:"}</span>
                  <span className="font-mono font-bold text-xs text-[#1A2E3B]">
                    {isRound ? `Круглий Ø ${dVal} мм` : `${model.beamProfile.width} × ${model.beamProfile.depth} мм`}
                  </span>
                </div>
                <div className="flex justify-between items-baseline pt-1 border-t border-[#E8E2D8]">
                  <span className="text-xs text-[#5A6778]">Об'єм / Вага тиражу:</span>
                  <span className="font-mono font-bold text-xs text-[#1A2E3B]">
                    {volM3} м³ ({weightKg} кг)
                  </span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-[#8C9BAE] mt-2">
              Матеріал: {model.beamProfile.name.split("(")[0]}. Вологість W ≤ 12%.
            </p>
          </div>
        </div>
      )}

      {/* Mode B: Detailed Individual Schedule Table */}
      {viewMode === "schedule" && (
        <div className="flex flex-col gap-4 p-6 rounded-3xl tactile-card">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-[#E8E2D8]">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-bold text-[#1A2E3B] uppercase tracking-wide">
                Квадрант симетрії:
              </span>
              <div className="flex items-center gap-1 p-1 rounded-xl tactile-inset">
                {[
                  { id: "all", label: "Всі 4 квадранти" },
                  { id: "Q1", label: "Q1 (+X, +Y)" },
                  { id: "Q2", label: "Q2 (-X, +Y)" },
                  { id: "Q3", label: "Q3 (-X, -Y)" },
                  { id: "Q4", label: "Q4 (+X, -Y)" }
                ].map(q => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setQuadrantFilter(q.id)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      quadrantFilter === q.id
                        ? "bg-white text-[#1A2E3B] shadow-xs"
                        : "text-[#5A6778] hover:text-[#1A2E3B]"
                    }`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 w-full lg:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 text-[#8C9BAE] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Пошук (E-001, тип A, вузол)..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#FAF7F2] border border-[#DCD6CA] rounded-xl outline-none focus:border-[#5B9279]"
                />
              </div>
              <span className="text-xs font-mono font-bold text-[#5B9279] bg-[#E1EDE3] px-2.5 py-1 rounded-lg whitespace-nowrap">
                {filteredEdges.length} з {model.edges.length} балок
              </span>
            </div>
          </div>

          {/* Quick Metrics Bar for Ellipsoid / Detailed Schedule */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-2xl bg-[#FAF7F2] border border-[#E8E2D8]">
            <div>
              <span className="text-[10px] text-[#5A6778] block uppercase font-bold">Всього деталей</span>
              <span className="text-sm font-mono font-bold text-[#1A2E3B]">{model.edges.length} шт</span>
            </div>
            <div>
              <span className="text-[10px] text-[#5A6778] block uppercase font-bold">Груп симетрії</span>
              <span className="text-sm font-mono font-bold text-[#2B6CB0]">{groups.length} типів</span>
            </div>
            <div>
              <span className="text-[10px] text-[#5A6778] block uppercase font-bold">Погонна довжина</span>
              <span className="text-sm font-mono font-bold text-[#2E7D32]">
                {Math.round((model.edges.reduce((s, e) => s + (e.cutLength || e.length), 0) / 1000) * 10) / 10} м
              </span>
            </div>
            <div>
              <span className="text-[10px] text-[#5A6778] block uppercase font-bold">Формат експорту</span>
              <span className="text-sm font-mono font-bold text-[#DE7C5A]">CSV для ЧПК / Пилки</span>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto rounded-2xl border border-[#E8E2D8] bg-white shadow-2xs max-h-[600px] overflow-y-auto scrollbar-thin">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#FAF7F2] border-b border-[#E8E2D8] text-[11px] font-bold text-[#5A6778] uppercase">
                  <th className="py-2.5 px-3">Маркування</th>
                  <th className="py-2.5 px-3">Тип</th>
                  <th className="py-2.5 px-3">Квадрант</th>
                  <th className="py-2.5 px-3 text-right">L вузла (мм)</th>
                  <th className="py-2.5 px-3 text-right">L розпилу (мм)</th>
                  <th className="py-2.5 px-3 text-right">Торцевий зпил A</th>
                  <th className="py-2.5 px-3 text-right">Торцевий зпил B</th>
                  <th className="py-2.5 px-3 text-right">Скос грані</th>
                  <th className="py-2.5 px-3 text-center">Вузли зʼєднання</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EBE1] font-mono">
                {filteredEdges.map(edge => (
                  <tr key={edge.id} className="hover:bg-[#FAF7F2]/70 transition-colors">
                    <td className="py-2 px-3 font-bold text-[#1A2E3B]">
                      {edge.beamLabel || `E-${String(edge.id + 1).padStart(3, "0")}`}
                    </td>
                    <td className="py-2 px-3">
                      <span className="inline-flex items-center gap-1.5 font-sans font-bold text-[#1A2E3B]">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: edge.color }}
                        />
                        {edge.type}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#E8EFF5] text-[#2B6CB0]">
                        {edge.quadrant || "Q1"}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right text-[#1A2E3B] font-semibold tabular-nums">
                      {edge.length}
                    </td>
                    <td className="py-2 px-3 text-right font-black text-[#2E7D32] tabular-nums">
                      {edge.cutLength || Math.round(edge.length - hubDiam)}
                    </td>
                    <td className="py-2 px-3 text-right text-[#DE7C5A] font-bold tabular-nums">
                      {edge.startMiterDeg ?? "—"}°
                    </td>
                    <td className="py-2 px-3 text-right text-[#DE7C5A] font-bold tabular-nums">
                      {edge.endMiterDeg ?? "—"}°
                    </td>
                    <td className="py-2 px-3 text-right text-[#7B6D8D] font-bold tabular-nums">
                      {edge.bevelDeg ?? "—"}°
                    </td>
                    <td className="py-2 px-3 text-center text-[#5A6778] font-sans text-[11px]">
                      #{edge.start} ↔ #{edge.end}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
