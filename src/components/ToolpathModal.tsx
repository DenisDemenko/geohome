import React, { useState, useMemo } from "react";
import {
  DomeToolpathResult,
  SheetToolpathResult,
  ToolpathConfig,
  TriangleToolpath
} from "../core/toolpath";
import { downloadFile } from "../export/svgExport";
import {
  Cpu,
  Download,
  Copy,
  Check,
  X,
  FileCode,
  Settings2,
  Clock,
  Ruler,
  Zap,
  Sliders,
  Play,
  RotateCw,
  Layers,
  Info
} from "lucide-react";

interface ToolpathModalProps {
  isOpen: boolean;
  onClose: () => void;
  toolpathResult: DomeToolpathResult | SheetToolpathResult;
  selectedTriangleId?: number | null;
  onSelectTriangle?: (id: number | null) => void;
  config: ToolpathConfig;
  onChangeConfig: (partial: Partial<ToolpathConfig>) => void;
  frequency: number;
  diameterMm: number;
  title?: string;
}

export const ToolpathModal: React.FC<ToolpathModalProps> = ({
  isOpen,
  onClose,
  toolpathResult,
  selectedTriangleId,
  onSelectTriangle,
  config,
  onChangeConfig,
  frequency,
  diameterMm
}) => {
  const [copied, setCopied] = useState(false);
  const [scopeTab, setScopeTab] = useState<"all" | "selected">("all");
  const [searchFilter, setSearchFilter] = useState("");

  const activeSelectedTriangle: TriangleToolpath | undefined = useMemo(() => {
    if (selectedTriangleId !== undefined && selectedTriangleId !== null) {
      return toolpathResult.triangles.find(t => t.faceId === selectedTriangleId);
    }
    return toolpathResult.triangles[0];
  }, [toolpathResult.triangles, selectedTriangleId]);

  const displayedGCode = useMemo(() => {
    if (scopeTab === "selected" && activeSelectedTriangle) {
      return [
        `(================================================================)`,
        `( SINGLE TRIANGLE TOOLPATH: #${activeSelectedTriangle.faceId} [TYPE ${activeSelectedTriangle.faceType}] )`,
        `( POST-PROCESSOR: AUTODESK FUSION 360 - MACH3MILL.CPS )`,
        `( CONTROLLER: MACH3 / MACH2 CNC ROUTER )`,
        `( CUT LENGTH: ${(activeSelectedTriangle.cutLengthMm / 1000).toFixed(2)}m | TIME: ~${activeSelectedTriangle.estimatedTimeSec}s )`,
        `( TOOL: D=${config.toolDiameterMm}mm | FEED: ${config.feedRateMmMin} mm/min | RPM: ${config.spindleRpm} )`,
        `(================================================================)`,
        `G90 G94 G91.1 G40 G49 G17`,
        `G21`,
        `G28 G91 Z0.`,
        `G90`,
        `T1 M6`,
        `S${config.spindleRpm} M3`,
        `G54`,
        `G43 H1 Z${config.safeHeightMm.toFixed(3)}`,
        ``,
        activeSelectedTriangle.gcode,
        ``,
        `M5`,
        `G0 Z${config.safeHeightMm.toFixed(3)}`,
        `G28 G91 Z0.`,
        `G90`,
        `G28 X0. Y0.`,
        `M30`,
        `%`
      ].join("\n");
    }
    return toolpathResult.gcode;
  }, [scopeTab, activeSelectedTriangle, toolpathResult.gcode, config]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(displayedGCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (ext: "tap" | "nc" | "gcode") => {
    const layerStr = config.layer === "inner" ? "inner" : "outer";
    const scopeStr = scopeTab === "selected" && activeSelectedTriangle ? `face_${activeSelectedTriangle.faceId}` : "all_panels";
    const filename = `dome_${frequency}V_${layerStr}_${scopeStr}_D${config.toolDiameterMm}mm_${config.postProcessor}.${ext}`;
    downloadFile(filename, displayedGCode, "text/plain;charset=utf-8");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="bg-[#FAF7F2] rounded-3xl border border-[#DCD6CA] shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden text-[#1A2E3B]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#E8E2D8] bg-white/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#DE7C5A] to-[#D97706] text-white flex items-center justify-center shrink-0 shadow-md">
              <Cpu className="w-5 h-5 text-amber-100" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-sm sm:text-base text-[#1A2E3B] leading-tight">
                  G-код ЧПК розкрою (Autodesk Fusion 360 · Mach2/Mach3)
                </h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                  mach3mill.cps
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                  {config.layer === "inner" ? "Внутрішня обшивка" : "Зовнішня обшивка"}
                </span>
              </div>
              <p className="text-[11px] text-[#5A6778] mt-0.5">
                Керуюча програма фрезерування обшивки купола {frequency}V (Ø{(diameterMm / 1000).toFixed(2)}м) під контролери Mach3 / Mach2
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#64748B] hover:text-[#1E293B] hover:bg-black/5 rounded-xl cursor-pointer transition-colors"
            title="Закрити вікно"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick KPI stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 sm:p-4 bg-[#F3EFE6]/70 border-b border-[#E8E2D8] text-center">
          <div className="bg-white p-2.5 rounded-xl border border-[#E8E2D8] shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-[#64748B] block flex items-center justify-center gap-1">
              <Layers className="w-3 h-3 text-[#D97706]" />
              <span>Деталей у програмі</span>
            </span>
            <span className="font-mono font-black text-sm sm:text-base text-[#1E293B]">
              {scopeTab === "all" ? `${toolpathResult.totalPanelsCount} шт` : `1 шт (#${activeSelectedTriangle?.faceId})`}
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-[#E8E2D8] shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-[#64748B] block flex items-center justify-center gap-1">
              <Ruler className="w-3 h-3 text-[#0284C7]" />
              <span>Довжина різу</span>
            </span>
            <span className="font-mono font-black text-sm sm:text-base text-[#0284C7]">
              {scopeTab === "all" ? `${toolpathResult.totalCutLengthM} м` : `${((activeSelectedTriangle?.cutLengthMm || 0) / 1000).toFixed(2)} м`}
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-[#E8E2D8] shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-[#64748B] block flex items-center justify-center gap-1">
              <Clock className="w-3 h-3 text-emerald-600" />
              <span>Час обробки</span>
            </span>
            <span className="font-mono font-black text-sm sm:text-base text-emerald-700">
              {scopeTab === "all"
                ? `~${Math.ceil(toolpathResult.totalTimeSec / 60)} хв`
                : `~${activeSelectedTriangle?.estimatedTimeSec || 0} с`}
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-[#E8E2D8] shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-[#64748B] block flex items-center justify-center gap-1">
              <Zap className="w-3 h-3 text-[#7C3AED]" />
              <span>Параметри різу</span>
            </span>
            <span className="font-mono font-bold text-xs sm:text-sm text-[#1E293B]">
              Ø{config.toolDiameterMm}мм · F{config.feedRateMmMin}
            </span>
          </div>
        </div>

        {/* CAM Configuration Options Bar */}
        <div className="p-3 sm:p-4 bg-white border-b border-[#E8E2D8] flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Post-processor & Layer */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 font-bold text-[#1A2E3B]">
              <Settings2 className="w-3.5 h-3.5 text-[#DE7C5A]" />
              <span>Постпроцесор:</span>
            </div>
            <select
              value={config.postProcessor}
              onChange={e => onChangeConfig({ postProcessor: e.target.value as any })}
              className="bg-[#FAF7F2] border border-[#CBD5E1] text-[#1E293B] font-bold text-xs px-2.5 py-1 rounded-xl outline-none cursor-pointer"
            >
              <option value="mach3">Mach3 / Mach3Mill (mach3mill.cps)</option>
              <option value="mach2">Mach2 / Mach2Mill (mach2mill.cps)</option>
            </select>

            <select
              value={config.layer}
              onChange={e => onChangeConfig({ layer: e.target.value as any })}
              className="bg-[#FAF7F2] border border-[#CBD5E1] text-[#1E293B] font-bold text-xs px-2.5 py-1 rounded-xl outline-none cursor-pointer"
            >
              <option value="outer">Зовнішня обшивка (Фанера / OSB)</option>
              <option value="inner">Внутрішня обшивка (Гіпсокартон / ДСП)</option>
            </select>
          </div>

          {/* Quick CAM Settings: Tool Dia, Feed, Passes, Tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1 text-[11px] font-semibold text-[#5A6778]">
              <span>Фреза:</span>
              <select
                value={config.toolDiameterMm}
                onChange={e => onChangeConfig({ toolDiameterMm: Number(e.target.value) })}
                className="bg-[#FAF7F2] border border-[#CBD5E1] font-mono font-bold text-[#1E293B] px-1.5 py-0.5 rounded-lg text-xs"
              >
                {[4, 6, 8, 10, 12].map(d => (
                  <option key={d} value={d}>Ø{d} мм</option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1 text-[11px] font-semibold text-[#5A6778]">
              <span>Подача F:</span>
              <input
                type="number"
                min={500}
                max={12000}
                step={250}
                value={config.feedRateMmMin}
                onChange={e => onChangeConfig({ feedRateMmMin: Number(e.target.value) })}
                className="w-16 bg-[#FAF7F2] border border-[#CBD5E1] font-mono font-bold text-center text-[#1E293B] px-1 py-0.5 rounded-lg text-xs"
              />
              <span className="text-[10px]">мм/хв</span>
            </label>

            <label className="flex items-center gap-1 text-[11px] font-semibold text-[#5A6778]">
              <span>Проходи:</span>
              <select
                value={config.passes}
                onChange={e => onChangeConfig({ passes: Number(e.target.value) })}
                className="bg-[#FAF7F2] border border-[#CBD5E1] font-mono font-bold text-[#1E293B] px-1.5 py-0.5 rounded-lg text-xs"
              >
                <option value={1}>1 прохід</option>
                <option value={2}>2 проходи</option>
                <option value={3}>3 проходи</option>
              </select>
            </label>

            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#5A6778] cursor-pointer">
              <input
                type="checkbox"
                checked={config.holdingTabs}
                onChange={e => onChangeConfig({ holdingTabs: e.target.checked })}
                className="rounded text-[#DE7C5A]"
              />
              <span>Перемички (Tabs)</span>
            </label>
          </div>
        </div>

        {/* Scope Tabs & G-Code Viewer Stage */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#F8FAFC] border-b border-[#E8E2D8] flex-wrap gap-2">
          <div className="flex items-center gap-1 p-0.5 bg-[#FAF7F2] rounded-xl border border-[#E2E8F0]">
            <button
              type="button"
              onClick={() => setScopeTab("all")}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                scopeTab === "all"
                  ? "bg-[#1A2E3B] text-white shadow-xs"
                  : "text-[#64748B] hover:text-[#1E293B]"
              }`}
            >
              Всі трикутники ({toolpathResult.totalPanelsCount} шт)
            </button>
            <button
              type="button"
              onClick={() => setScopeTab("selected")}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                scopeTab === "selected"
                  ? "bg-[#DE7C5A] text-white shadow-xs"
                  : "text-[#64748B] hover:text-[#1E293B]"
              }`}
            >
              Окремий трикутник {activeSelectedTriangle ? `#${activeSelectedTriangle.faceId} (${activeSelectedTriangle.faceType})` : ""}
            </button>
          </div>

          {scopeTab === "selected" && onSelectTriangle && (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-[#64748B] font-semibold">Обрати трикутник:</span>
              <select
                value={activeSelectedTriangle?.faceId ?? ""}
                onChange={e => onSelectTriangle(Number(e.target.value))}
                className="bg-white border border-[#CBD5E1] rounded-lg px-2 py-0.5 font-mono text-xs font-bold text-[#1E293B]"
              >
                {toolpathResult.triangles.map(t => (
                  <option key={t.faceId} value={t.faceId}>
                    №{t.faceId} (Тип {t.faceType}) — {(t.cutLengthMm / 1000).toFixed(2)}м
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="text-[11px] font-mono text-[#64748B] hidden sm:block">
            {displayedGCode.split("\n").length} рядків коду
          </div>
        </div>

        {/* G-Code Monospace Terminal Box */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#0F172A] text-emerald-400 font-mono text-xs selection:bg-emerald-800 selection:text-white max-h-[46vh]">
          <pre className="whitespace-pre font-mono leading-relaxed">
            {displayedGCode.split("\n").map((line, idx) => {
              const isComment = line.trim().startsWith("(") || line.trim().startsWith("%");
              const isG0 = line.includes("G0 ");
              const isG1 = line.includes("G1 ");
              const isTool = line.includes("T1") || line.includes("M6") || line.includes("S");
              const isHeader = line.includes("POST-PROCESSOR") || line.includes("PROGRAM");

              let color = "text-[#E2E8F0]";
              if (isComment) color = "text-[#64748B] italic";
              if (isG0) color = "text-[#38BDF8]";
              if (isG1) color = "text-[#4ADE80]";
              if (isTool) color = "text-[#FCD34D] font-bold";
              if (isHeader) color = "text-[#FB923C] font-bold";

              return (
                <div key={idx} className="flex hover:bg-white/5 py-0.2 px-1 rounded">
                  <span className="w-12 text-[#475569] select-none text-right pr-3 shrink-0">
                    {idx + 1}
                  </span>
                  <span className={color}>{line}</span>
                </div>
              );
            })}
          </pre>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-3.5 sm:p-4 border-t border-[#E8E2D8] bg-white/80 backdrop-blur-md flex-wrap gap-2">
          {/* Download Buttons (.TAP for Mach3, .NC, .GCODE) */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Primary .GCODE button */}
            <button
              type="button"
              onClick={() => handleDownload("gcode")}
              className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:brightness-110 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              title="Завантажити керуючу програму у форматі G-code (.gcode) за постпроцесором Mach3"
            >
              <Download className="w-3.5 h-3.5 text-emerald-200" />
              <span>Завантажити G-code (.gcode)</span>
            </button>

            {/* .TAP (Mach3) */}
            <button
              type="button"
              onClick={() => handleDownload("tap")}
              className="px-3 py-1.5 bg-[#1E293B] hover:bg-[#334155] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              title="Завантажити у форматі .TAP (стандартний файл для Mach3 / Mach2 Mill)"
            >
              <Download className="w-3.5 h-3.5 text-amber-300" />
              <span>.TAP (Mach3)</span>
            </button>

            {/* .NC */}
            <button
              type="button"
              onClick={() => handleDownload("nc")}
              className="px-2.5 py-1.5 bg-white hover:bg-[#F3EFE6] border border-[#CBD5E1] text-[#1E293B] rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
              title="Завантажити у форматі .NC"
            >
              <span>.NC</span>
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                copied
                  ? "bg-emerald-600 text-white"
                  : "bg-white border border-[#CBD5E1] text-[#1E293B] hover:bg-[#F3EFE6]"
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Скопійовано!" : "Копіювати G-код"}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white hover:bg-[#F3EFE6] border border-[#CBD5E1] rounded-xl text-xs font-semibold text-[#4A5568] transition-colors cursor-pointer"
          >
            Закрити
          </button>
        </div>
      </div>
    </div>
  );
};
