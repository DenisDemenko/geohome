import React, { useState, useMemo, useRef } from "react";
import { DomeModel } from "../core/types";
import {
  FoundationType,
  StripFoundationParams,
  PileFoundationParams,
  SlabFoundationParams,
  AnchorBoltParams,
  DEFAULT_STRIP_PARAMS,
  DEFAULT_PILE_PARAMS,
  DEFAULT_SLAB_PARAMS,
  DEFAULT_ANCHOR_PARAMS,
  calculateFoundationLayout,
  generateFoundationLayoutCSV,
  generateFoundationDXF
} from "../core/foundation";
import {
  Compass,
  Layers,
  Disc,
  Ruler,
  Download,
  Printer,
  FileCode,
  ZoomIn,
  ZoomOut,
  Maximize2,
  CheckCircle2,
  Info,
  Shield,
  HelpCircle,
  Eye,
  Sliders,
  Anchor
} from "lucide-react";

interface Props {
  model: DomeModel;
}

export function FoundationLayoutPanel({ model }: Props) {
  // Foundation Type state
  const [foundationType, setFoundationType] = useState<FoundationType>("strip");

  // Params state
  const [stripParams, setStripParams] = useState<StripFoundationParams>(DEFAULT_STRIP_PARAMS);
  const [pileParams, setPileParams] = useState<PileFoundationParams>(DEFAULT_PILE_PARAMS);
  const [slabParams, setSlabParams] = useState<SlabFoundationParams>(DEFAULT_SLAB_PARAMS);
  const [anchorParams, setAnchorParams] = useState<AnchorBoltParams>(DEFAULT_ANCHOR_PARAMS);

  // Layer toggles for 2D Blueprint
  const [showAxes, setShowAxes] = useState(true);
  const [showRadiiLabels, setShowRadiiLabels] = useState(true);
  const [showChords, setShowChords] = useState(true);
  const [showFormwork, setShowFormwork] = useState(true);
  const [showAnchors, setShowAnchors] = useState(true);
  const [showDiagonals, setShowDiagonals] = useState(false);

  // Selected node for inspection
  const [selectedNodeIdx, setSelectedNodeIdx] = useState<number | null>(null);

  // SVG Pan & Zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Calculate layout geometry
  const layout = useMemo(() => {
    return calculateFoundationLayout(
      model,
      foundationType,
      stripParams,
      pileParams,
      slabParams,
      anchorParams
    );
  }, [model, foundationType, stripParams, pileParams, slabParams, anchorParams]);

  // Handle downloads
  const handleDownloadCSV = () => {
    const csv = generateFoundationLayoutCSV(layout);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kupol-foundation-points-${layout.nodesCount}nodes.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadDXF = () => {
    const dxf = generateFoundationDXF(layout);
    const blob = new Blob([dxf], { type: "application/dxf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kupol-foundation-blueprint-${foundationType}.dxf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSVG = () => {
    const svgEl = document.getElementById("foundation-svg-blueprint");
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgEl);
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kupol-foundation-plan.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  // Dimensions for SVG viewport
  const maxDim = layout.baseRadiusMm * 2.6;
  const viewBoxMin = -maxDim / 2;
  const viewBoxSize = maxDim;

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Header Banner & Foundation Type Switcher */}
      <div className="p-6 rounded-3xl bg-[#FAF7F2] border border-[#E8E2D8] shadow-xs flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-[#E1EDE3] text-[#1A3E26]">
                Інженерна розмітка
              </span>
              <span className="text-xs text-[#8C9BAE]">ДБН В.2.1-10 / Eurocode 7</span>
            </div>
            <h2 className="text-2xl font-black text-[#1A2E3B] tracking-tight">
              Розмітка та конструювання фундаменту купола
            </h2>
            <p className="text-xs text-[#5A6778] mt-1 max-w-2xl">
              Винесення в натуру центральної точки проекції вершини купола, радіальних осей до перших вузлів
              опори, геометричний розрахунок монолітної стрічки з опалубкою, пальового поля або плити із
              закладанням янкерних груп.
            </p>
          </div>

          {/* Quick Action Export Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleDownloadSVG}
              className="px-3.5 py-2 text-xs font-bold rounded-xl tactile-btn flex items-center gap-1.5 text-[#1A2E3B] hover:text-[#5B9279]"
              title="Завантажити креслення розмітки у векторі SVG"
            >
              <Download className="w-4 h-4 text-[#5B9279]" />
              <span>SVG Креслення</span>
            </button>
            <button
              onClick={handleDownloadDXF}
              className="px-3.5 py-2 text-xs font-bold rounded-xl tactile-btn flex items-center gap-1.5 text-[#1A2E3B] hover:text-[#DE7C5A]"
              title="Експорт креслення у форматі AutoCAD DXF"
            >
              <FileCode className="w-4 h-4 text-[#DE7C5A]" />
              <span>DXF AutoCAD</span>
            </button>
            <button
              onClick={handleDownloadCSV}
              className="px-3.5 py-2 text-xs font-bold rounded-xl tactile-btn flex items-center gap-1.5 text-[#1A2E3B] hover:text-[#4A7C9B]"
              title="Експорт точок розмітки для тахеометра (Leica, Trimble, Topcon)"
            >
              <Compass className="w-4 h-4 text-[#4A7C9B]" />
              <span>CSV Тахеометр</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-3 py-2 text-xs font-bold rounded-xl tactile-btn flex items-center gap-1.5 text-[#1A2E3B] hover:text-[#1A3E26]"
              title="Друк креслення та специфікації"
            >
              <Printer className="w-4 h-4 text-[#5A6778]" />
              <span className="hidden sm:inline">Друк</span>
            </button>
          </div>
        </div>

        {/* 3 Foundation Type Selection Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Option 1: Strip with formwork */}
          <button
            onClick={() => setFoundationType("strip")}
            className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between ${
              foundationType === "strip"
                ? "bg-[#FAF2DE]/60 border-[#DDA843] ring-2 ring-[#DDA843]/30 shadow-xs"
                : "bg-white border-[#E8E2D8] hover:border-[#DDA843]/50 text-[#5A6778]"
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#DDA843] flex items-center gap-1.5">
                  <Layers className="w-4 h-4" />
                  Тип 1
                </span>
                {foundationType === "strip" && (
                  <CheckCircle2 className="w-4 h-4 text-[#DDA843]" />
                )}
              </div>
              <h3 className="text-sm font-extrabold text-[#1A2E3B] mb-1">
                Стрічковий моноліт з опалубкою
              </h3>
              <p className="text-[11px] text-[#5A6778] leading-relaxed">
                Залізобетонна стрічка по периметру з регульованим відступом від 100 до 500 мм всередину та
                назовні від янкерних вузлів.
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-[#E8E2D8]/60 flex items-center justify-between text-[11px] font-mono font-bold text-[#1A2E3B]">
              <span>Ширина: {stripParams.innerOffsetMm + stripParams.outerOffsetMm} мм</span>
              <span className="text-[#DDA843]">{layout.stripGeometry?.concreteVolumeM3} м³</span>
            </div>
          </button>

          {/* Option 2: Pile foundation */}
          <button
            onClick={() => setFoundationType("pile")}
            className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between ${
              foundationType === "pile"
                ? "bg-[#EBF3F8]/70 border-[#4A7C9B] ring-2 ring-[#4A7C9B]/30 shadow-xs"
                : "bg-white border-[#E8E2D8] hover:border-[#4A7C9B]/50 text-[#5A6778]"
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#4A7C9B] flex items-center gap-1.5">
                  <Disc className="w-4 h-4" />
                  Тип 2
                </span>
                {foundationType === "pile" && (
                  <CheckCircle2 className="w-4 h-4 text-[#4A7C9B]" />
                )}
              </div>
              <h3 className="text-sm font-extrabold text-[#1A2E3B] mb-1">
                Пальовий (свайний) фундамент
              </h3>
              <p className="text-[11px] text-[#5A6778] leading-relaxed">
                Гвинтові або буронабивні палі безпосередньо під кожним кутовим янкерним вузлом опори з
                монтажними оголовками та обв'язкою.
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-[#E8E2D8]/60 flex items-center justify-between text-[11px] font-mono font-bold text-[#1A2E3B]">
              <span>Паль: {layout.pileGeometry?.totalPilesCount} шт</span>
              <span className="text-[#4A7C9B]">Ø{pileParams.diameterMm} мм</span>
            </div>
          </button>

          {/* Option 3: Solid slab */}
          <button
            onClick={() => setFoundationType("slab")}
            className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between ${
              foundationType === "slab"
                ? "bg-[#E1EDE3]/70 border-[#5B9279] ring-2 ring-[#5B9279]/30 shadow-xs"
                : "bg-white border-[#E8E2D8] hover:border-[#5B9279]/50 text-[#5A6778]"
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#5B9279] flex items-center gap-1.5">
                  <Compass className="w-4 h-4" />
                  Тип 3
                </span>
                {foundationType === "slab" && (
                  <CheckCircle2 className="w-4 h-4 text-[#5B9279]" />
                )}
              </div>
              <h3 className="text-sm font-extrabold text-[#1A2E3B] mb-1">
                Суцільний літий (плита)
              </h3>
              <p className="text-[11px] text-[#5A6778] leading-relaxed">
                Монолітна залізобетонна плита під усім куполом з виступом за межі янкерів, подвійним
                армуванням та теплоізоляцією.
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-[#E8E2D8]/60 flex items-center justify-between text-[11px] font-mono font-bold text-[#1A2E3B]">
              <span>Площа: {layout.slabGeometry?.areaM2} м²</span>
              <span className="text-[#5B9279]">{layout.slabGeometry?.concreteVolumeM3} м³</span>
            </div>
          </button>
        </div>
      </div>

      {/* 2. Key Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-2xl tactile-card">
          <span className="text-[11px] text-[#5A6778] block mb-0.5">Базовий діаметр / радіус</span>
          <span className="text-sm font-mono font-bold text-[#1A2E3B]">
            {(layout.baseDiameterMm / 1000).toFixed(2)} м / {(layout.baseRadiusMm / 1000).toFixed(2)} м
          </span>
        </div>

        <div className="p-3.5 rounded-2xl tactile-card">
          <span className="text-[11px] text-[#5A6778] block mb-0.5">Кутових вузлів / осей</span>
          <span className="text-sm font-mono font-bold text-[#2E7D32]">
            {layout.nodesCount} осей (через {layout.nodes[0]?.deltaAngleDeg}°)
          </span>
        </div>

        <div className="p-3.5 rounded-2xl tactile-card">
          <span className="text-[11px] text-[#5A6778] block mb-0.5">Периметр основи (хорди)</span>
          <span className="text-sm font-mono font-bold text-[#1A2E3B]">
            {(layout.baseCircumferenceMm / 1000).toFixed(2)} м
          </span>
        </div>

        <div className="p-3.5 rounded-2xl tactile-card">
          <span className="text-[11px] text-[#5A6778] block mb-0.5">Об'єм бетону</span>
          <span className="text-sm font-mono font-bold text-[#DE7C5A]">
            {foundationType === "strip"
              ? `${layout.stripGeometry?.concreteVolumeM3} м³`
              : foundationType === "slab"
              ? `${layout.slabGeometry?.concreteVolumeM3} м³`
              : layout.pileParams.pileType === "bored"
              ? `${layout.pileGeometry?.concreteVolumeM3} м³`
              : "0 м³ (гвинтові)"}
          </span>
        </div>

        <div className="p-3.5 rounded-2xl tactile-card">
          <span className="text-[11px] text-[#5A6778] block mb-0.5">Арматура / Метал</span>
          <span className="text-sm font-mono font-bold text-[#1A2E3B]">
            {foundationType === "strip"
              ? `${layout.stripGeometry?.rebarWeightKg} кг (Ø${stripParams.rebarDiameter})`
              : foundationType === "slab"
              ? `${layout.slabGeometry?.rebarWeightKg} кг (Ø${slabParams.rebarDiameter})`
              : `${layout.pileGeometry?.timberSillVolumeM3} м³ бруса`}
          </span>
        </div>

        <div className="p-3.5 rounded-2xl tactile-card">
          <span className="text-[11px] text-[#5A6778] block mb-0.5">Закладні янкери</span>
          <span className="text-sm font-mono font-bold text-[#4A7C9B]">
            {layout.anchorSchedule.studsTotal} шт ({anchorParams.diameter} кл {anchorParams.steelGrade})
          </span>
        </div>
      </div>

      {/* 3. Main Workspace: Interactive 2D Blueprint & Parameters Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (8 cols): Interactive 2D Blueprint Canvas */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="p-4 rounded-3xl bg-[#FAF7F2] border border-[#E8E2D8] shadow-xs flex flex-col gap-3">
            {/* Blueprint Control Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E8E2D8]">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#1A2E3B] flex items-center gap-1.5">
                  <Ruler className="w-4 h-4 text-[#DE7C5A]" />
                  План розмітки осей та опалубки
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-lg bg-white border border-[#E8E2D8] text-[#5A6778]">
                  Масштаб 1:{(1 / zoom).toFixed(1)}
                </span>
              </div>

              {/* Layer Visibility Toggles */}
              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                <button
                  onClick={() => setShowAxes(!showAxes)}
                  className={`px-2 py-1 rounded-lg font-bold transition-all ${
                    showAxes ? "bg-[#FAF2DE] text-[#DDA843] border border-[#DDA843]/40" : "bg-white text-[#8C9BAE] border border-[#E8E2D8]"
                  }`}
                  title="Показати радіальні лінії осей від центру (0,0)"
                >
                  Осі
                </button>
                <button
                  onClick={() => setShowRadiiLabels(!showRadiiLabels)}
                  className={`px-2 py-1 rounded-lg font-bold transition-all ${
                    showRadiiLabels ? "bg-[#FAF2DE] text-[#DDA843] border border-[#DDA843]/40" : "bg-white text-[#8C9BAE] border border-[#E8E2D8]"
                  }`}
                  title="Показати підписи радіусів та кутів азимута"
                >
                  Кути/Радіуси
                </button>
                <button
                  onClick={() => setShowChords(!showChords)}
                  className={`px-2 py-1 rounded-lg font-bold transition-all ${
                    showChords ? "bg-[#E1EDE3] text-[#1A3E26] border border-[#5B9279]/40" : "bg-white text-[#8C9BAE] border border-[#E8E2D8]"
                  }`}
                  title="Показати довжини хорд між сусідніми вузлами"
                >
                  Хорди
                </button>
                <button
                  onClick={() => setShowFormwork(!showFormwork)}
                  className={`px-2 py-1 rounded-lg font-bold transition-all ${
                    showFormwork ? "bg-[#EBF3F8] text-[#4A7C9B] border border-[#4A7C9B]/40" : "bg-white text-[#8C9BAE] border border-[#E8E2D8]"
                  }`}
                  title="Показати контури опалубки / плями паль / плити"
                >
                  Опалубка
                </button>
                <button
                  onClick={() => setShowAnchors(!showAnchors)}
                  className={`px-2 py-1 rounded-lg font-bold transition-all ${
                    showAnchors ? "bg-[#FDF0E6] text-[#DE7C5A] border border-[#DE7C5A]/40" : "bg-white text-[#8C9BAE] border border-[#E8E2D8]"
                  }`}
                  title="Показати закладні янкери"
                >
                  Янкери
                </button>
                <button
                  onClick={() => setShowDiagonals(!showDiagonals)}
                  className={`px-2 py-1 rounded-lg font-bold transition-all ${
                    showDiagonals ? "bg-[#EDE9FE] text-[#7C3AED] border border-[#7C3AED]/40" : "bg-white text-[#8C9BAE] border border-[#E8E2D8]"
                  }`}
                  title="Показати контрольні міжкатетні діагоналі для перевірки в натурі"
                >
                  Діагоналі
                </button>

                {/* Zoom buttons */}
                <div className="flex items-center gap-1 ml-2 border-l border-[#E8E2D8] pl-2">
                  <button
                    onClick={() => setZoom(z => Math.min(3, z + 0.2))}
                    className="p-1 rounded-lg bg-white border border-[#E8E2D8] hover:bg-[#FAF7F2] text-[#5A6778]"
                    title="Збільшити"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setZoom(z => Math.max(0.5, z - 0.2))}
                    className="p-1 rounded-lg bg-white border border-[#E8E2D8] hover:bg-[#FAF7F2] text-[#5A6778]"
                    title="Зменшити"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setZoom(1);
                      setPan({ x: 0, y: 0 });
                    }}
                    className="p-1 rounded-lg bg-white border border-[#E8E2D8] hover:bg-[#FAF7F2] text-[#5A6778]"
                    title="Скинути масштаб"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Interactive SVG Viewport */}
            <div
              className="relative w-full h-[520px] bg-white rounded-2xl border border-[#E8E2D8] overflow-hidden cursor-crosshair select-none"
              onMouseDown={e => {
                isDraggingRef.current = true;
                dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
              }}
              onMouseMove={e => {
                if (isDraggingRef.current) {
                  setPan({
                    x: e.clientX - dragStartRef.current.x,
                    y: e.clientY - dragStartRef.current.y
                  });
                }
              }}
              onMouseUp={() => {
                isDraggingRef.current = false;
              }}
              onMouseLeave={() => {
                isDraggingRef.current = false;
              }}
            >
              <svg
                id="foundation-svg-blueprint"
                viewBox={`${viewBoxMin} ${viewBoxMin} ${viewBoxSize} ${viewBoxSize}`}
                className="w-full h-full"
                style={{
                  transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                  transformOrigin: "center center",
                  transition: isDraggingRef.current ? "none" : "transform 0.1s ease-out"
                }}
              >
                <defs>
                  {/* Subtle Grid Pattern */}
                  <pattern id="foundation-grid" width="500" height="500" patternUnits="userSpaceOnUse">
                    <path d="M 500 0 L 0 0 0 500" fill="none" stroke="#F0EBE1" strokeWidth="2" />
                  </pattern>

                  {/* Strip Hatch Pattern */}
                  <pattern id="concrete-hatch" width="40" height="40" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                    <line x1="0" y1="0" x2="0" y2="40" stroke="#E2DCD2" strokeWidth="2" />
                  </pattern>
                </defs>

                {/* Background Grid */}
                <rect x={viewBoxMin} y={viewBoxMin} width={viewBoxSize} height={viewBoxSize} fill="url(#foundation-grid)" />

                {/* 1. SLAB FOUNDATION CONTOUR (If slab) */}
                {foundationType === "slab" && layout.slabGeometry && showFormwork && (
                  <g id="slab-contour">
                    {slabParams.shape === "circle" ? (
                      <circle
                        cx="0"
                        cy="0"
                        r={layout.slabGeometry.radiusMm}
                        fill="#E1EDE3"
                        fillOpacity="0.4"
                        stroke="#5B9279"
                        strokeWidth="8"
                        strokeDasharray="16 8"
                      />
                    ) : (
                      <polygon
                        points={layout.slabGeometry.polygon.map(p => `${p.x},${-p.y}`).join(" ")}
                        fill="#E1EDE3"
                        fillOpacity="0.4"
                        stroke="#5B9279"
                        strokeWidth="8"
                      />
                    )}
                  </g>
                )}

                {/* 2. STRIP FOUNDATION FORMWORK (If strip) */}
                {foundationType === "strip" && layout.stripGeometry && showFormwork && (
                  <g id="strip-formwork">
                    {/* Concrete band fill using path with inner hole */}
                    <path
                      d={`
                        M ${layout.stripGeometry.outerPolygon.map(p => `${p.x} ${-p.y}`).join(" L ")} Z
                        M ${layout.stripGeometry.innerPolygon.map(p => `${p.x} ${-p.y}`).join(" L ")} Z
                      `}
                      fill="url(#concrete-hatch)"
                      fillRule="evenodd"
                      stroke="none"
                    />

                    {/* Outer Formwork Contour */}
                    <polygon
                      points={layout.stripGeometry.outerPolygon.map(p => `${p.x},${-p.y}`).join(" ")}
                      fill="none"
                      stroke="#DE7C5A"
                      strokeWidth="6"
                      strokeLinejoin="round"
                    />

                    {/* Inner Formwork Contour */}
                    <polygon
                      points={layout.stripGeometry.innerPolygon.map(p => `${p.x},${-p.y}`).join(" ")}
                      fill="none"
                      stroke="#4A7C9B"
                      strokeWidth="6"
                      strokeLinejoin="round"
                    />

                    {/* Formwork Segment Dimension Annotations */}
                    {layout.stripGeometry.segments.map((s, idx) => {
                      const midOutX = (s.outerStart.x + s.outerEnd.x) / 2;
                      const midOutY = (-s.outerStart.y + -s.outerEnd.y) / 2;
                      return (
                        <text
                          key={`seg-out-${idx}`}
                          x={midOutX}
                          y={midOutY}
                          fill="#DE7C5A"
                          fontSize="70"
                          fontWeight="bold"
                          textAnchor="middle"
                          dy="-15"
                        >
                          {s.outerLengthMm}
                        </text>
                      );
                    })}
                  </g>
                )}

                {/* 3. BASE POLYGON CONNECTING BASE NODES */}
                <polygon
                  points={layout.nodes.map(n => `${n.x},${-n.y}`).join(" ")}
                  fill="none"
                  stroke="#1A2E3B"
                  strokeWidth="6"
                  strokeDasharray="14 10"
                />

                {/* 4. CHORD DIMENSION LABELS */}
                {showChords && (
                  <g id="chord-dimensions">
                    {layout.nodes.map((n, i) => {
                      const next = layout.nodes[(i + 1) % layout.nodes.length];
                      const mx = (n.x + next.x) / 2;
                      const my = (-n.y + -next.y) / 2;
                      return (
                        <g key={`chord-${i}`}>
                          <rect
                            x={mx - 60}
                            y={my - 22}
                            width="120"
                            height="44"
                            rx="10"
                            fill="#FFFFFF"
                            stroke="#1A2E3B"
                            strokeWidth="2"
                          />
                          <text
                            x={mx}
                            y={my + 7}
                            fill="#1A2E3B"
                            fontSize="65"
                            fontFamily="monospace"
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            {n.chordToNextMm}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                )}

                {/* 5. RADIAL AXES FROM APEX PROJECTION (0,0) TO EACH BASE NODE */}
                {showAxes && (
                  <g id="radial-axes">
                    {layout.nodes.map((n, i) => (
                      <g key={`axis-${i}`}>
                        <line
                          x1="0"
                          y1="0"
                          x2={n.x}
                          y2={-n.y}
                          stroke={selectedNodeIdx === i ? "#DE7C5A" : "#DDA843"}
                          strokeWidth={selectedNodeIdx === i ? "6" : "3"}
                          strokeDasharray="10 8"
                        />
                        {showRadiiLabels && (
                          <g>
                            <text
                              x={n.x * 0.55}
                              y={-n.y * 0.55}
                              fill="#926014"
                              fontSize="65"
                              fontWeight="bold"
                              fontFamily="monospace"
                              textAnchor="middle"
                            >
                              R={n.radius} ({n.azimuthDeg}°)
                            </text>
                          </g>
                        )}
                      </g>
                    ))}
                  </g>
                )}

                {/* 6. CROSS-DIAGONAL CHECK LINES */}
                {showDiagonals && (
                  <g id="diagonals">
                    {layout.nodes.map((n, i) => {
                      const opp = layout.nodes[n.oppositeNodeIndex - 1];
                      if (!opp || i >= layout.nodes.length / 2) return null;
                      return (
                        <g key={`diag-${i}`}>
                          <line
                            x1={n.x}
                            y1={-n.y}
                            x2={opp.x}
                            y2={-opp.y}
                            stroke="#7C3AED"
                            strokeWidth="3"
                            strokeDasharray="6 6"
                          />
                          <text
                            x={(n.x + opp.x) / 2}
                            y={(-n.y + -opp.y) / 2}
                            fill="#7C3AED"
                            fontSize="70"
                            fontWeight="bold"
                            fontFamily="monospace"
                            textAnchor="middle"
                            dy="-10"
                          >
                            D={n.diagonalCheckMm}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                )}

                {/* 7. PILES RENDER (If pile foundation) */}
                {foundationType === "pile" && layout.pileGeometry && (
                  <g id="piles">
                    {layout.pileGeometry.piles.map(p => {
                      const r = pileParams.diameterMm / 2;
                      const cap = pileParams.capPlateSizeMm;
                      return (
                        <g key={`pile-${p.index}`}>
                          {/* Pile cap plate square */}
                          <rect
                            x={p.x - cap / 2}
                            y={-p.y - cap / 2}
                            width={cap}
                            height={cap}
                            fill="#4A7C9B"
                            fillOpacity="0.3"
                            stroke="#4A7C9B"
                            strokeWidth="3"
                            rx="4"
                          />
                          {/* Pile body cylinder cross section */}
                          <circle
                            cx={p.x}
                            cy={-p.y}
                            r={r}
                            fill="#1A2E3B"
                            stroke="#4A7C9B"
                            strokeWidth="4"
                          />
                        </g>
                      );
                    })}
                  </g>
                )}

                {/* 8. EMBEDDED ANCHORS (Янкери) & BASE NODES */}
                {showAnchors && (
                  <g id="anchors">
                    {layout.nodes.map((n, i) => {
                      const isSelected = selectedNodeIdx === i;
                      const r = 35;
                      return (
                        <g
                          key={`anchor-${i}`}
                          className="cursor-pointer transition-transform"
                          onClick={() => setSelectedNodeIdx(isSelected ? null : i)}
                        >
                          {/* Outer halo */}
                          <circle
                            cx={n.x}
                            cy={-n.y}
                            r={isSelected ? r * 1.8 : r * 1.3}
                            fill={isSelected ? "#DE7C5A" : "#5B9279"}
                            fillOpacity="0.25"
                          />

                          {/* Base anchor plate representation */}
                          <circle
                            cx={n.x}
                            cy={-n.y}
                            r={r}
                            fill={isSelected ? "#DE7C5A" : "#2E7D32"}
                            stroke="#FFFFFF"
                            strokeWidth="5"
                          />

                          {/* Embedded Studs Representation */}
                          {anchorParams.studCount === 1 ? (
                            <circle cx={n.x} cy={-n.y} r="8" fill="#FFFFFF" />
                          ) : anchorParams.studCount === 2 ? (
                            <>
                              <circle cx={n.x - 14} cy={-n.y} r="6" fill="#FFFFFF" />
                              <circle cx={n.x + 14} cy={-n.y} r="6" fill="#FFFFFF" />
                            </>
                          ) : (
                            <>
                              <circle cx={n.x - 12} cy={-n.y - 12} r="5" fill="#FFFFFF" />
                              <circle cx={n.x + 12} cy={-n.y - 12} r="5" fill="#FFFFFF" />
                              <circle cx={n.x - 12} cy={-n.y + 12} r="5" fill="#FFFFFF" />
                              <circle cx={n.x + 12} cy={-n.y + 12} r="5" fill="#FFFFFF" />
                            </>
                          )}

                          {/* Node Number Badge */}
                          <text
                            x={n.x * 1.12}
                            y={-n.y * 1.12}
                            fill="#1A2E3B"
                            fontSize="75"
                            fontWeight="900"
                            textAnchor="middle"
                            dominantBaseline="central"
                          >
                            №{n.index}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                )}

                {/* 9. CENTER APEX PROJECTION (ТОЧКА НУЛЬ 0,0) */}
                <g id="apex-center">
                  <circle cx="0" cy="0" r="70" fill="#DDA843" fillOpacity="0.2" />
                  <circle cx="0" cy="0" r="30" fill="#DDA843" stroke="#FFFFFF" strokeWidth="4" />
                  {/* Crosshairs */}
                  <line x1="-120" y1="0" x2="120" y2="0" stroke="#926014" strokeWidth="4" />
                  <line x1="0" y1="-120" x2="0" y2="120" stroke="#926014" strokeWidth="4" />
                  <text
                    x="25"
                    y="-35"
                    fill="#926014"
                    fontSize="75"
                    fontWeight="bold"
                  >
                    Точка Нуль (Проекція вершини)
                  </text>
                </g>
              </svg>

              {/* Interactive Tooltip for Selected Node */}
              {selectedNodeIdx !== null && layout.nodes[selectedNodeIdx] && (
                <div className="absolute bottom-4 left-4 p-4 rounded-2xl bg-[#1A2E3B]/95 text-white backdrop-blur-md shadow-lg border border-white/20 text-xs flex flex-col gap-1 max-w-sm pointer-events-auto">
                  <div className="flex items-center justify-between font-bold border-b border-white/10 pb-1 mb-1">
                    <span className="text-[#DE7C5A]">
                      Вузол опори №{layout.nodes[selectedNodeIdx].index}
                    </span>
                    <button
                      onClick={() => setSelectedNodeIdx(null)}
                      className="text-white/60 hover:text-white"
                    >
                      ×
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono">
                    <span>Координата X:</span>
                    <span className="text-right text-[#A6C7AE]">
                      {layout.nodes[selectedNodeIdx].x} мм
                    </span>
                    <span>Координата Y:</span>
                    <span className="text-right text-[#A6C7AE]">
                      {layout.nodes[selectedNodeIdx].y} мм
                    </span>
                    <span>Азимут від 0°:</span>
                    <span className="text-right text-[#FAF2DE]">
                      {layout.nodes[selectedNodeIdx].azimuthDeg}°
                    </span>
                    <span>Радіус від центру:</span>
                    <span className="text-right text-[#FAF2DE]">
                      {layout.nodes[selectedNodeIdx].radius} мм
                    </span>
                    <span>Хорда до наступного:</span>
                    <span className="text-right text-white">
                      {layout.nodes[selectedNodeIdx].chordToNextMm} мм
                    </span>
                    <span>Контрольна діагональ:</span>
                    <span className="text-right text-[#EDE9FE]">
                      {layout.nodes[selectedNodeIdx].diagonalCheckMm} мм (до №{layout.nodes[selectedNodeIdx].oppositeNodeIndex})
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Blueprint Legend */}
            <div className="flex items-center gap-4 text-[11px] text-[#5A6778] flex-wrap pt-1 px-1">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-[#DDA843]"></span> Радіальні лінії осей
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-[#1A2E3B] border-t border-dashed"></span> Периметр хорд купола
              </span>
              {foundationType === "strip" && (
                <>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-[#DE7C5A]"></span> Зовнішня опалубка (+{stripParams.outerOffsetMm} мм)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-[#4A7C9B]"></span> Внутрішня опалубка (-{stripParams.innerOffsetMm} мм)
                  </span>
                </>
              )}
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#2E7D32]"></span> Янкерний вузол
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#DDA843]"></span> Проекція вершини (0,0)
              </span>
            </div>
          </div>

          {/* Surveying Polarization Table (Таблиця винесення в натуру) */}
          <div className="p-5 rounded-3xl bg-[#FAF7F2] border border-[#E8E2D8] shadow-xs flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-[#1A2E3B] flex items-center gap-2">
                  <Compass className="w-4 h-4 text-[#4A7C9B]" />
                  Геодезична таблиця розбивки осей від центру
                </h3>
                <p className="text-[11px] text-[#5A6778]">
                  Винесення в натуру тахеометром, лазерним далекоміром або рулеткою від точки нуль
                </p>
              </div>
              <button
                onClick={handleDownloadCSV}
                className="px-3 py-1.5 text-xs font-bold rounded-xl tactile-btn flex items-center gap-1.5 text-[#1A2E3B]"
              >
                <Download className="w-3.5 h-3.5 text-[#4A7C9B]" />
                <span>CSV</span>
              </button>
            </div>

            <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-xl border border-[#E8E2D8] bg-white">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#FAF7F2] text-[#5A6778] sticky top-0 border-b border-[#E8E2D8]">
                  <tr>
                    <th className="py-2 px-3">Вузол</th>
                    <th className="py-2 px-3">Азимут α</th>
                    <th className="py-2 px-3">Кут Δα</th>
                    <th className="py-2 px-3">Радіус R (мм)</th>
                    <th className="py-2 px-3">X схід (мм)</th>
                    <th className="py-2 px-3">Y північ (мм)</th>
                    <th className="py-2 px-3">Хорда до наст.</th>
                    <th className="py-2 px-3">Діагональ перевірки</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E2D8]">
                  {layout.nodes.map(n => (
                    <tr
                      key={`tr-${n.index}`}
                      onClick={() => setSelectedNodeIdx(n.index - 1)}
                      className={`cursor-pointer hover:bg-[#FAF7F2] transition-colors ${
                        selectedNodeIdx === n.index - 1 ? "bg-[#FAF2DE]" : ""
                      }`}
                    >
                      <td className="py-2 px-3 font-bold text-[#1A2E3B]">
                        №{n.index}
                      </td>
                      <td className="py-2 px-3 text-[#DDA843] font-bold">
                        {n.azimuthDeg.toFixed(2)}°
                      </td>
                      <td className="py-2 px-3 text-[#5A6778]">
                        +{n.deltaAngleDeg.toFixed(2)}°
                      </td>
                      <td className="py-2 px-3 font-bold text-[#1A2E3B]">
                        {n.radius} мм
                      </td>
                      <td className="py-2 px-3 text-[#5A6778]">{n.x}</td>
                      <td className="py-2 px-3 text-[#5A6778]">{n.y}</td>
                      <td className="py-2 px-3 text-[#2E7D32] font-bold">
                        {n.chordToNextMm} мм
                      </td>
                      <td className="py-2 px-3 text-[#7C3AED]">
                        {n.diagonalCheckMm} мм (до №{n.oppositeNodeIndex})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column (4 cols): Detailed Parameters & Formwork Calculations */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          {/* 1. Foundation Specific Parameters Card */}
          <div className="p-5 rounded-3xl bg-[#FAF7F2] border border-[#E8E2D8] shadow-xs flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-[#E8E2D8] pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#1A2E3B] flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-[#DE7C5A]" />
                Параметри конструювання
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-[#FAF2DE] text-[#DDA843]">
                {foundationType === "strip"
                  ? "Стрічка"
                  : foundationType === "pile"
                  ? "Палі"
                  : "Плита"}
              </span>
            </div>

            {/* STRIP FOUNDATION FORM CONTROLS */}
            {foundationType === "strip" && (
              <div className="flex flex-col gap-4">
                {/* Inner Offset (100 - 500 mm) */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-[#1A2E3B] mb-1">
                    <span>Відступ всередину купола:</span>
                    <span className="font-mono text-[#4A7C9B] font-extrabold">
                      {stripParams.innerOffsetMm} мм
                    </span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="500"
                    step="10"
                    value={stripParams.innerOffsetMm}
                    onChange={e =>
                      setStripParams(p => ({
                        ...p,
                        innerOffsetMm: parseInt(e.target.value, 10)
                      }))
                    }
                    className="w-full accent-[#4A7C9B]"
                  />
                  <div className="flex justify-between text-[10px] text-[#8C9BAE]">
                    <span>100 мм</span>
                    <span>Центр вузла</span>
                    <span>500 мм</span>
                  </div>
                </div>

                {/* Outer Offset (100 - 500 mm) */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-[#1A2E3B] mb-1">
                    <span>Відступ назовні купола:</span>
                    <span className="font-mono text-[#DE7C5A] font-extrabold">
                      {stripParams.outerOffsetMm} мм
                    </span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="500"
                    step="10"
                    value={stripParams.outerOffsetMm}
                    onChange={e =>
                      setStripParams(p => ({
                        ...p,
                        outerOffsetMm: parseInt(e.target.value, 10)
                      }))
                    }
                    className="w-full accent-[#DE7C5A]"
                  />
                  <div className="flex justify-between text-[10px] text-[#8C9BAE]">
                    <span>100 мм</span>
                    <span>Центр вузла</span>
                    <span>500 мм</span>
                  </div>
                </div>

                {/* Total Strip Width Info Box */}
                <div className="p-3 rounded-xl bg-white border border-[#E8E2D8] flex items-center justify-between text-xs font-bold">
                  <span className="text-[#5A6778]">Повна ширина стрічки:</span>
                  <span className="font-mono text-[#1A2E3B] text-sm font-extrabold">
                    {stripParams.innerOffsetMm + stripParams.outerOffsetMm} мм
                  </span>
                </div>

                {/* Strip Depth (Глибина стрічки) */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-[#1A2E3B] mb-1">
                    <span>Глибина закладення:</span>
                    <span className="font-mono text-[#1A2E3B]">
                      {stripParams.depthMm} мм
                    </span>
                  </div>
                  <input
                    type="range"
                    min="400"
                    max="1400"
                    step="50"
                    value={stripParams.depthMm}
                    onChange={e =>
                      setStripParams(p => ({
                        ...p,
                        depthMm: parseInt(e.target.value, 10)
                      }))
                    }
                    className="w-full accent-[#5B9279]"
                  />
                </div>

                {/* Plinth Height (Цоколь над землею) */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-[#1A2E3B] mb-1">
                    <span>Висота цоколя:</span>
                    <span className="font-mono text-[#1A2E3B]">
                      {stripParams.plinthHeightMm} мм
                    </span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="600"
                    step="50"
                    value={stripParams.plinthHeightMm}
                    onChange={e =>
                      setStripParams(p => ({
                        ...p,
                        plinthHeightMm: parseInt(e.target.value, 10)
                      }))
                    }
                    className="w-full accent-[#5B9279]"
                  />
                </div>

                {/* Concrete Class & Rebar Selection */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[11px] text-[#5A6778] block mb-1">Клас бетону</label>
                    <select
                      value={stripParams.concreteClass}
                      onChange={e =>
                        setStripParams(p => ({
                          ...p,
                          concreteClass: e.target.value as any
                        }))
                      }
                      className="w-full p-2 rounded-xl bg-white border border-[#E8E2D8] text-[#1A2E3B] font-bold"
                    >
                      <option value="B15">B15 (M200)</option>
                      <option value="B20">B20 (M250)</option>
                      <option value="B25">B25 (M350)</option>
                      <option value="B30">B30 (M400)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-[#5A6778] block mb-1">Арматура стрічки</label>
                    <select
                      value={stripParams.rebarDiameter}
                      onChange={e =>
                        setStripParams(p => ({
                          ...p,
                          rebarDiameter: parseInt(e.target.value, 10) as any
                        }))
                      }
                      className="w-full p-2 rounded-xl bg-white border border-[#E8E2D8] text-[#1A2E3B] font-bold"
                    >
                      <option value={10}>Ø10 мм (A500C)</option>
                      <option value={12}>Ø12 мм (A500C)</option>
                      <option value={14}>Ø14 мм (A500C)</option>
                      <option value={16}>Ø16 мм (A500C)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* PILE FOUNDATION FORM CONTROLS */}
            {foundationType === "pile" && (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-bold text-[#1A2E3B] block mb-1.5">Тип паль</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setPileParams(p => ({ ...p, pileType: "screw" }))}
                      className={`p-2 rounded-xl text-xs font-bold border transition-all ${
                        pileParams.pileType === "screw"
                          ? "bg-[#EBF3F8] border-[#4A7C9B] text-[#4A7C9B]"
                          : "bg-white border-[#E8E2D8] text-[#5A6778]"
                      }`}
                    >
                      Гвинтові палі
                    </button>
                    <button
                      onClick={() => setPileParams(p => ({ ...p, pileType: "bored" }))}
                      className={`p-2 rounded-xl text-xs font-bold border transition-all ${
                        pileParams.pileType === "bored"
                          ? "bg-[#EBF3F8] border-[#4A7C9B] text-[#4A7C9B]"
                          : "bg-white border-[#E8E2D8] text-[#5A6778]"
                      }`}
                    >
                      Буронабивні
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-[#1A2E3B] mb-1">
                    <span>Діаметр палі:</span>
                    <span className="font-mono text-[#4A7C9B]">Ø{pileParams.diameterMm} мм</span>
                  </div>
                  <select
                    value={pileParams.diameterMm}
                    onChange={e =>
                      setPileParams(p => ({
                        ...p,
                        diameterMm: parseInt(e.target.value, 10)
                      }))
                    }
                    className="w-full p-2 rounded-xl bg-white border border-[#E8E2D8] text-[#1A2E3B] font-bold text-xs"
                  >
                    <option value={89}>89 мм (для легких куполів до 6 м)</option>
                    <option value={108}>108 мм (стандартний для 7-10 м)</option>
                    <option value={133}>133 мм (посилений для 10-14 м)</option>
                    <option value={159}>159 мм (великі навантаження)</option>
                    <option value={200}>200 мм (буронабивна бетонна)</option>
                    <option value={250}>250 мм (буронабивна бетонна)</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-[#1A2E3B] mb-1">
                    <span>Глибина загвинчування / буріння:</span>
                    <span className="font-mono text-[#1A2E3B]">{pileParams.depthMm} мм</span>
                  </div>
                  <input
                    type="range"
                    min="1500"
                    max="4000"
                    step="100"
                    value={pileParams.depthMm}
                    onChange={e =>
                      setPileParams(p => ({
                        ...p,
                        depthMm: parseInt(e.target.value, 10)
                      }))
                    }
                    className="w-full accent-[#4A7C9B]"
                  />
                </div>

                {/* Center pile toggle */}
                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-[#E8E2D8] text-xs font-bold text-[#1A2E3B] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pileParams.hasCenterPile}
                    onChange={e =>
                      setPileParams(p => ({ ...p, hasCenterPile: e.target.checked }))
                    }
                    className="accent-[#4A7C9B]"
                  />
                  <span>Центральна опорна паля у точці (0,0)</span>
                </label>
              </div>
            )}

            {/* SLAB FOUNDATION FORM CONTROLS */}
            {foundationType === "slab" && (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-bold text-[#1A2E3B] block mb-1.5">Форма плити</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setSlabParams(p => ({ ...p, shape: "polygon" }))}
                      className={`p-2 rounded-xl text-xs font-bold border transition-all ${
                        slabParams.shape === "polygon"
                          ? "bg-[#E1EDE3] border-[#5B9279] text-[#1A3E26]"
                          : "bg-white border-[#E8E2D8] text-[#5A6778]"
                      }`}
                    >
                      Багатогранна
                    </button>
                    <button
                      onClick={() => setSlabParams(p => ({ ...p, shape: "circle" }))}
                      className={`p-2 rounded-xl text-xs font-bold border transition-all ${
                        slabParams.shape === "circle"
                          ? "bg-[#E1EDE3] border-[#5B9279] text-[#1A3E26]"
                          : "bg-white border-[#E8E2D8] text-[#5A6778]"
                      }`}
                    >
                      Кругла плита
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-[#1A2E3B] mb-1">
                    <span>Виступ за межі янкерів:</span>
                    <span className="font-mono text-[#5B9279]">{slabParams.overhangMm} мм</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="500"
                    step="25"
                    value={slabParams.overhangMm}
                    onChange={e =>
                      setSlabParams(p => ({
                        ...p,
                        overhangMm: parseInt(e.target.value, 10)
                      }))
                    }
                    className="w-full accent-[#5B9279]"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-[#1A2E3B] mb-1">
                    <span>Товщина монолітної плити:</span>
                    <span className="font-mono text-[#1A2E3B]">{slabParams.thicknessMm} мм</span>
                  </div>
                  <input
                    type="range"
                    min="150"
                    max="400"
                    step="25"
                    value={slabParams.thicknessMm}
                    onChange={e =>
                      setSlabParams(p => ({
                        ...p,
                        thicknessMm: parseInt(e.target.value, 10)
                      }))
                    }
                    className="w-full accent-[#5B9279]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 2. Embedded Anchors (Янкери) Configuration Card */}
          <div className="p-5 rounded-3xl bg-[#FAF7F2] border border-[#E8E2D8] shadow-xs flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-[#E8E2D8] pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#1A2E3B] flex items-center gap-1.5">
                <Anchor className="w-4 h-4 text-[#DE7C5A]" />
                Закладні янкери вузлів
              </span>
              <span className="text-[11px] font-mono font-bold text-[#DE7C5A]">
                {layout.anchorSchedule.studsTotal} шт
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-[11px] text-[#5A6778] block mb-1">Діаметр різьби</label>
                <select
                  value={anchorParams.diameter}
                  onChange={e =>
                    setAnchorParams(p => ({
                      ...p,
                      diameter: e.target.value as any
                    }))
                  }
                  className="w-full p-2 rounded-xl bg-white border border-[#E8E2D8] font-bold text-[#1A2E3B]"
                >
                  <option value="M12">M12 (L=250 мм)</option>
                  <option value="M16">M16 (L=330 мм)</option>
                  <option value="M20">M20 (L=400 мм)</option>
                  <option value="M24">M24 (L=500 мм)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-[#5A6778] block mb-1">Кількість на вузол</label>
                <select
                  value={anchorParams.studCount}
                  onChange={e =>
                    setAnchorParams(p => ({
                      ...p,
                      studCount: parseInt(e.target.value, 10) as any
                    }))
                  }
                  className="w-full p-2 rounded-xl bg-white border border-[#E8E2D8] font-bold text-[#1A2E3B]"
                >
                  <option value={1}>1 центральна шпилька</option>
                  <option value={2}>2 шпильки (симетрія)</option>
                  <option value={4}>4 шпильки (квадрат)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-[11px] text-[#5A6778] block mb-1">Клас міцності</label>
                <select
                  value={anchorParams.steelGrade}
                  onChange={e =>
                    setAnchorParams(p => ({
                      ...p,
                      steelGrade: e.target.value as any
                    }))
                  }
                  className="w-full p-2 rounded-xl bg-white border border-[#E8E2D8] font-bold text-[#1A2E3B]"
                >
                  <option value="5.8">5.8 (будівельна)</option>
                  <option value="8.8">8.8 (високоміцна)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-[#5A6778] block mb-1">Глибина закладення</label>
                <div className="p-2 rounded-xl bg-white border border-[#E8E2D8] font-mono font-bold text-[#1A2E3B]">
                  {anchorParams.embedmentDepthMm} мм
                </div>
              </div>
            </div>

            {/* Anchor Strength Verification Box */}
            <div className="p-3.5 rounded-2xl bg-white border border-[#E8E2D8] flex flex-col gap-1.5 text-xs">
              <div className="flex justify-between font-bold text-[#1A2E3B]">
                <span className="flex items-center gap-1 text-[#5A6778]">
                  <Shield className="w-3.5 h-3.5 text-[#2E7D32]" />
                  Несуча здатність на виривання:
                </span>
                <span className="font-mono text-[#2E7D32]">
                  {layout.anchorSchedule.tensileCapacityKn} кН
                </span>
              </div>
              <div className="flex justify-between font-bold text-[#1A2E3B]">
                <span className="flex items-center gap-1 text-[#5A6778]">
                  <Shield className="w-3.5 h-3.5 text-[#4A7C9B]" />
                  Несуча здатність на зріз:
                </span>
                <span className="font-mono text-[#4A7C9B]">
                  {layout.anchorSchedule.shearCapacityKn} кН
                </span>
              </div>
            </div>
          </div>

          {/* 3. Step-by-Step On-Site Surveying Guide */}
          <div className="p-5 rounded-3xl bg-[#FAF7F2] border border-[#E8E2D8] shadow-xs flex flex-col gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#1A2E3B] flex items-center gap-1.5">
              <Info className="w-4 h-4 text-[#DDA843]" />
              Інструкція винесення в натуру на ділянці
            </h3>

            <ol className="flex flex-col gap-2.5 text-xs text-[#5A6778] list-decimal list-inside leading-relaxed">
              <li className="pl-1">
                <strong className="text-[#1A2E3B]">Точка Нуль:</strong> Забити центральний кілочок у проекцію вершини купола.
              </li>
              <li className="pl-1">
                <strong className="text-[#1A2E3B]">Базова вісь 0°:</strong> Направити візир на північ або по осі вхідної групи.
              </li>
              <li className="pl-1">
                <strong className="text-[#1A2E3B]">Кути та радіуси:</strong> Відкладати азимут за таблицею та точний радіус R ({layout.baseRadiusMm} мм) до кожного кілочка опори.
              </li>
              <li className="pl-1">
                <strong className="text-[#1A2E3B]">Перевірка хорд:</strong> Перевірити відстань між сусідніми кілочками ({layout.nodes[0]?.chordToNextMm} мм).
              </li>
              <li className="pl-1">
                <strong className="text-[#1A2E3B]">Контрольні діагоналі:</strong> Заміряти діагоналі між протилежними вузлами ({layout.nodes[0]?.diagonalCheckMm} мм) для виключення перекосу.
              </li>
              {foundationType === "strip" && (
                <li className="pl-1">
                  <strong className="text-[#1A2E3B]">Опалубка:</strong> Встановити внутрішні щити з відступом {stripParams.innerOffsetMm} мм та зовнішні з відступом {stripParams.outerOffsetMm} мм від кілочків.
                </li>
              )}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
