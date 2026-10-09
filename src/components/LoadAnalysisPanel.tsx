import React, { useState, useMemo, useEffect, useRef } from "react";
import * as d3 from "d3";
import { DomeModel } from "../core/types";
import {
  LoadSimulationParams,
  DEFAULT_LOAD_PARAMS,
  calculateDomeLoads,
  NodeLoadAnalysis,
  BeamLoadAnalysis
} from "../core/structuralLoadAnalysis";
import {
  Wind,
  CloudSnow,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  ShieldAlert,
  Compass,
  Zap,
  Info,
  Layers,
  ArrowRight,
  Maximize2,
  ZoomIn,
  ZoomOut,
  TrendingUp,
  BarChart3
} from "lucide-react";

interface Props {
  model: DomeModel;
}

export function LoadAnalysisPanel({ model }: Props) {
  // Real-time Load Simulation Parameters State
  const [params, setParams] = useState<LoadSimulationParams>(DEFAULT_LOAD_PARAMS);

  // Visualization display mode
  const [displayMode, setDisplayMode] = useState<"utilization" | "snow" | "wind">("utilization");

  // Selected node for deep inspection
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);

  // SVG Refs for D3
  const svgRef = useRef<SVGSVGElement | null>(null);
  const chartRef = useRef<SVGSVGElement | null>(null);

  // Calculate loads real-time
  const loadResult = useMemo(() => {
    return calculateDomeLoads(model, params);
  }, [model, params]);

  // Color scale for utilization: 0 -> emerald (safe), 0.8 -> amber, 1.0+ -> crimson (critical)
  const getUtilizationColor = (util: number) => {
    if (util > 1.0) return "#DC2626"; // Crimson Red (Overstressed)
    if (util >= 0.8) return "#EA580C"; // Dark Orange (Warning)
    if (util >= 0.5) return "#D97706"; // Amber (Moderate)
    return "#16A34A"; // Emerald Green (Safe)
  };

  // Color scale for wind: suction (blue) to pressure (orange/red)
  const getWindColor = (pressureKPa: number) => {
    if (pressureKPa > 0) {
      // Pressure: Yellow to Orange
      return d3.interpolateYlOrRd(Math.min(1, pressureKPa / 0.8));
    }
    // Suction: Cyan to Deep Blue
    return d3.interpolateBlues(Math.min(1, Math.abs(pressureKPa) / 1.0));
  };

  // Color scale for snow: light blue to deep snow white/blue
  const getSnowColor = (snowKPa: number) => {
    const t = Math.min(1, snowKPa / Math.max(0.1, params.snowLoadKPa * 1.5));
    return d3.interpolatePurples(0.2 + t * 0.8);
  };

  // --- D3 RENDERING: 2D POLAR TOPOLOGY STRESS MAP ---
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = 640;
    const height = 540;
    const margin = 30;
    const radius = Math.min(width, height) / 2 - margin;
    const centerX = width / 2;
    const centerY = height / 2;

    const g = svg
      .append("g")
      .attr("class", "main-group")
      .attr("transform", `translate(${centerX}, ${centerY})`);

    // Zoom behavior
    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.6, 4])
      .on("zoom", event => {
        g.attr("transform", event.transform);
      });

    svg.call(zoomBehavior);

    // Initial transform
    zoomBehavior.transform(
      svg,
      d3.zoomIdentity.translate(centerX, centerY).scale(1)
    );

    // Max 2D radius of dome base
    const maxRadiusMm = Math.max(...loadResult.nodes.map(n => n.radius2D), 1);
    const scaleCoord = (v: number) => (v / maxRadiusMm) * radius;

    // Draw background concentric elevation guide circles (0°, 30°, 60°, 90°)
    [0.33, 0.66, 1.0].forEach(ratio => {
      g.append("circle")
        .attr("r", radius * ratio)
        .attr("fill", "none")
        .attr("stroke", "#E8E2D8")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "4 4");
    });

    // Draw Wind Direction Arrow in background
    const windRad = (params.windDirectionDeg * Math.PI) / 180;
    const arrowLen = radius * 1.15;
    const windSourceX = -Math.sin(windRad) * arrowLen;
    const windSourceY = Math.cos(windRad) * arrowLen;
    const windDestX = Math.sin(windRad) * (arrowLen * 0.4);
    const windDestY = -Math.cos(windRad) * (arrowLen * 0.4);

    const windGroup = g.append("g").attr("class", "wind-vector");

    // Wind flow lines
    [-0.5, 0, 0.5].forEach(offset => {
      const perpX = Math.cos(windRad) * (radius * 0.6 * offset);
      const perpY = Math.sin(windRad) * (radius * 0.6 * offset);

      windGroup
        .append("line")
        .attr("x1", windSourceX + perpX)
        .attr("y1", windSourceY + perpY)
        .attr("x2", windDestX + perpX)
        .attr("y2", windDestY + perpY)
        .attr("stroke", "#3B82F6")
        .attr("stroke-width", 2.5)
        .attr("stroke-dasharray", "6 4")
        .attr("stroke-opacity", 0.45)
        .attr("marker-end", "url(#wind-arrow)");
    });

    // Marker def for wind arrows
    svg
      .append("defs")
      .append("marker")
      .attr("id", "wind-arrow")
      .attr("viewBox", "0 0 10 10")
      .attr("refX", 6)
      .attr("refY", 5)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto-start-reverse")
      .append("path")
      .attr("d", "M 0 1 L 10 5 L 0 9 z")
      .attr("fill", "#3B82F6")
      .attr("fill-opacity", 0.7);

    // Draw Beams (Edges)
    const beamLines = g
      .append("g")
      .attr("class", "beams-layer")
      .selectAll("line")
      .data(loadResult.beams)
      .enter()
      .append("line")
      .attr("x1", d => scaleCoord(loadResult.nodes[d.startNode].x))
      .attr("y1", d => -scaleCoord(loadResult.nodes[d.startNode].y))
      .attr("x2", d => scaleCoord(loadResult.nodes[d.endNode].x))
      .attr("y2", d => -scaleCoord(loadResult.nodes[d.endNode].y))
      .attr("stroke", d => {
        if (displayMode === "utilization") {
          return getUtilizationColor(d.utilization);
        }
        return "#CBD5E1";
      })
      .attr("stroke-width", d => (d.isCritical ? 4.5 : 2.5))
      .attr("stroke-opacity", 0.85);

    // Draw Nodes
    const nodeGroup = g
      .append("g")
      .attr("class", "nodes-layer")
      .selectAll("g")
      .data(loadResult.nodes)
      .enter()
      .append("g")
      .attr("transform", d => `translate(${scaleCoord(d.x)}, ${-scaleCoord(d.y)})`)
      .attr("class", "node-item cursor-pointer")
      .on("click", (_, d) => {
        setSelectedNodeId(prev => (prev === d.nodeId ? null : d.nodeId));
      });

    // Pulsing outer warning circle for critical nodes
    nodeGroup
      .filter(d => d.isCritical)
      .append("circle")
      .attr("r", 14)
      .attr("fill", "#EF4444")
      .attr("fill-opacity", 0.35)
      .attr("stroke", "#EF4444")
      .attr("stroke-width", 1.5)
      .append("animate")
      .attr("attributeName", "r")
      .attr("values", "10;18;10")
      .attr("dur", "1.6s")
      .attr("repeatCount", "indefinite");

    // Main Node Circle
    nodeGroup
      .append("circle")
      .attr("r", d => {
        if (d.nodeId === selectedNodeId) return 10;
        return d.isCritical ? 8 : 5.5;
      })
      .attr("fill", d => {
        if (displayMode === "utilization") return getUtilizationColor(d.stressUtilization);
        if (displayMode === "snow") return getSnowColor(d.snowPressureKPa);
        return getWindColor(d.windPressureKPa);
      })
      .attr("stroke", d => (d.nodeId === selectedNodeId ? "#1A2E3B" : "#FFFFFF"))
      .attr("stroke-width", d => (d.nodeId === selectedNodeId ? 3 : 1.5))
      .append("title")
      .text(
        d =>
          `Вузол #${d.nodeId} (Z=${d.z} мм)\nНапруження: ${(d.stressUtilization * 100).toFixed(0)}%\nСніг: ${d.snowPressureKPa} кПа\nВітер: ${d.windPressureKPa} кПа\nСумарна сила: ${d.resultantForceKn} кН`
      );

    // Node ID Label for critical or selected
    nodeGroup
      .filter(d => d.isCritical || d.nodeId === selectedNodeId)
      .append("text")
      .attr("x", 12)
      .attr("y", 4)
      .attr("fill", "#1A2E3B")
      .attr("font-size", 10)
      .attr("font-family", "monospace")
      .attr("font-weight", "bold")
      .text(d => `#${d.nodeId}`);
  }, [loadResult, displayMode, selectedNodeId, params.windDirectionDeg]);

  // --- D3 RENDERING: REAL-TIME STRESS HISTOGRAM BAR CHART ---
  useEffect(() => {
    if (!chartRef.current) return;

    const svg = d3.select(chartRef.current);
    svg.selectAll("*").remove();

    const width = 340;
    const height = 150;
    const margin = { top: 15, right: 20, bottom: 25, left: 35 };

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // Utilization bins: [0-0.3], [0.3-0.6], [0.6-0.8], [0.8-1.0], [>1.0]
    const bins = [
      { label: "0-30%", min: 0, max: 0.3, color: "#16A34A", count: 0 },
      { label: "30-60%", min: 0.3, max: 0.6, color: "#65A30D", count: 0 },
      { label: "60-80%", min: 0.6, max: 0.8, color: "#D97706", count: 0 },
      { label: "80-100%", min: 0.8, max: 1.0, color: "#EA580C", count: 0 },
      { label: ">100%", min: 1.0, max: 99.0, color: "#DC2626", count: 0 }
    ];

    loadResult.nodes.forEach(n => {
      const bin = bins.find(b => n.stressUtilization >= b.min && n.stressUtilization < b.max) || bins[bins.length - 1];
      bin.count++;
    });

    const xScale = d3
      .scaleBand()
      .domain(bins.map(b => b.label))
      .range([0, innerWidth])
      .padding(0.25);

    const maxCount = Math.max(1, d3.max(bins, b => b.count) || 1);
    const yScale = d3.scaleLinear().domain([0, maxCount]).nice().range([innerHeight, 0]);

    // X Axis
    g.append("g")
      .attr("transform", `translate(0, ${innerHeight})`)
      .call(d3.axisBottom(xScale).tickSize(0))
      .call(g => g.select(".domain").attr("stroke", "#E8E2D8"))
      .selectAll("text")
      .attr("font-size", 9)
      .attr("font-family", "monospace")
      .attr("fill", "#5A6778");

    // Y Axis
    g.append("g")
      .call(d3.axisLeft(yScale).ticks(4).tickSize(-innerWidth))
      .call(g => g.select(".domain").remove())
      .call(g => g.selectAll(".tick line").attr("stroke", "#F4EFEB"))
      .selectAll("text")
      .attr("font-size", 9)
      .attr("font-family", "monospace")
      .attr("fill", "#8C9BAE");

    // Bars
    g.selectAll(".bar")
      .data(bins)
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", d => xScale(d.label) || 0)
      .attr("y", d => yScale(d.count))
      .attr("width", xScale.bandwidth())
      .attr("height", d => innerHeight - yScale(d.count))
      .attr("fill", d => d.color)
      .attr("rx", 3);

    // Value Labels on top of bars
    g.selectAll(".label")
      .data(bins)
      .enter()
      .filter(d => d.count > 0)
      .append("text")
      .attr("x", d => (xScale(d.label) || 0) + xScale.bandwidth() / 2)
      .attr("y", d => yScale(d.count) - 4)
      .attr("text-anchor", "middle")
      .attr("font-size", 9)
      .attr("font-weight", "bold")
      .attr("fill", "#1A2E3B")
      .text(d => d.count);
  }, [loadResult]);

  const selectedNodeData = useMemo(() => {
    if (selectedNodeId === null) return null;
    return loadResult.nodes.find(n => n.nodeId === selectedNodeId) || null;
  }, [selectedNodeId, loadResult]);

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Header & Live Safety Status Banner */}
      <div className="p-6 rounded-3xl bg-[#FAF7F2] border border-[#E8E2D8] shadow-xs flex flex-col gap-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-[#EBF3F8] text-[#4A7C9B]">
                Аеродинамічний та сніговий аналіз D3.js
              </span>
              <span className="text-xs text-[#8C9BAE]">Єврокод 1 / ДБН В.1.2-2:2006</span>
            </div>
            <h2 className="text-2xl font-black text-[#1A2E3B] tracking-tight">
              Візуалізація навантажень на елементи купола в реальному часі
            </h2>
            <p className="text-xs text-[#5A6778] mt-1 max-w-2xl">
              Інтерактивне моделювання снігових мішків, вітрового напору та відсмоктування купола за допомогою
              векторних D3.js діаграм. Миттєве виявлення перевантажених вузлів та балок каркаса.
            </p>
          </div>

          {/* Real-time Global Safety Badge */}
          <div
            className={`p-4 rounded-2xl border flex items-center gap-3 transition-all ${
              loadResult.isGloballySafe
                ? "bg-[#E1EDE3] border-[#A6C7AE] text-[#1A3E26]"
                : "bg-[#FEE2E2] border-[#EF4444] text-[#991B1B] animate-pulse"
            }`}
          >
            {loadResult.isGloballySafe ? (
              <>
                <CheckCircle2 className="w-6 h-6 text-[#16A34A] shrink-0" />
                <div>
                  <div className="text-xs font-black uppercase tracking-wider">
                    Конструкція надійна
                  </div>
                  <div className="text-[11px] opacity-80">
                    Макс. напруження: {(loadResult.maxNodeUtilization * 100).toFixed(0)}% (Запас{" "}
                    {(Math.max(0, 1 - loadResult.maxNodeUtilization) * 100).toFixed(0)}%)
                  </div>
                </div>
              </>
            ) : (
              <>
                <ShieldAlert className="w-6 h-6 text-[#DC2626] shrink-0" />
                <div>
                  <div className="text-xs font-black uppercase tracking-wider">
                    УВАГА: {loadResult.criticalNodesCount} критичних вузлів!
                  </div>
                  <div className="text-[11px] opacity-90">
                    Макс. перевантаження: {(loadResult.maxNodeUtilization * 100).toFixed(0)}% (Потрібне
                    посилення)
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Real-time Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3.5 rounded-2xl tactile-card">
            <span className="text-[11px] text-[#5A6778] block mb-0.5">Критичні вузли</span>
            <span
              className={`text-sm font-mono font-bold ${
                loadResult.criticalNodesCount > 0 ? "text-[#DC2626]" : "text-[#16A34A]"
              }`}
            >
              {loadResult.criticalNodesCount} шт ({loadResult.warningNodesCount} на межі)
            </span>
          </div>

          <div className="p-3.5 rounded-2xl tactile-card">
            <span className="text-[11px] text-[#5A6778] block mb-0.5">Макс. напруження η</span>
            <span
              className={`text-sm font-mono font-bold ${
                loadResult.maxNodeUtilization > 1.0
                  ? "text-[#DC2626]"
                  : loadResult.maxNodeUtilization >= 0.8
                  ? "text-[#EA580C]"
                  : "text-[#16A34A]"
              }`}
            >
              {(loadResult.maxNodeUtilization * 100).toFixed(0)}%
            </span>
          </div>

          <div className="p-3.5 rounded-2xl tactile-card">
            <span className="text-[11px] text-[#5A6778] block mb-0.5">Снігове навантаження</span>
            <span className="text-sm font-mono font-bold text-[#4A7C9B]">
              {loadResult.totalSnowLoadTons} тонн ({params.snowLoadKPa} кПа)
            </span>
          </div>

          <div className="p-3.5 rounded-2xl tactile-card">
            <span className="text-[11px] text-[#5A6778] block mb-0.5">Вітровий тиск / зсув</span>
            <span className="text-sm font-mono font-bold text-[#DE7C5A]">
              {loadResult.totalWindThrustKn} кН ({params.windSpeedMs} м/с)
            </span>
          </div>

          <div className="p-3.5 rounded-2xl tactile-card">
            <span className="text-[11px] text-[#5A6778] block mb-0.5">Аеродинамічний відрив</span>
            <span className="text-sm font-mono font-bold text-[#7C3AED]">
              {loadResult.maxUpliftSuctionKPa} кПа (вершина)
            </span>
          </div>

          <div className="p-3.5 rounded-2xl tactile-card">
            <span className="text-[11px] text-[#5A6778] block mb-0.5">Макс. вигин у балці</span>
            <span className="text-sm font-mono font-bold text-[#1A2E3B]">
              {loadResult.maxBendingMomentNm} Н·м
            </span>
          </div>
        </div>
      </div>

      {/* 2. Interactive Controls & Visualization Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (8 cols): D3 Polar Topology Stress Map */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="p-4 rounded-3xl bg-[#FAF7F2] border border-[#E8E2D8] shadow-xs flex flex-col gap-3">
            {/* View Mode Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E8E2D8]">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#1A2E3B] flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-[#DE7C5A]" />
                  D3 Карта напружень та потоків навантаження
                </span>
              </div>

              {/* Mode Toggles */}
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white border border-[#E8E2D8] text-xs">
                <button
                  onClick={() => setDisplayMode("utilization")}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    displayMode === "utilization"
                      ? "bg-[#1A2E3B] text-white shadow-2xs"
                      : "text-[#5A6778] hover:text-[#1A2E3B]"
                  }`}
                >
                  Сумарне напруження η
                </button>
                <button
                  onClick={() => setDisplayMode("snow")}
                  className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1 ${
                    displayMode === "snow"
                      ? "bg-[#4A7C9B] text-white shadow-2xs"
                      : "text-[#5A6778] hover:text-[#1A2E3B]"
                  }`}
                >
                  <CloudSnow className="w-3.5 h-3.5" />
                  <span>Сніг</span>
                </button>
                <button
                  onClick={() => setDisplayMode("wind")}
                  className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1 ${
                    displayMode === "wind"
                      ? "bg-[#DE7C5A] text-white shadow-2xs"
                      : "text-[#5A6778] hover:text-[#1A2E3B]"
                  }`}
                >
                  <Wind className="w-3.5 h-3.5" />
                  <span>Вітер</span>
                </button>
              </div>
            </div>

            {/* D3 SVG Viewport */}
            <div className="relative w-full h-[520px] bg-white rounded-2xl border border-[#E8E2D8] overflow-hidden">
              <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

              {/* Map Legend Overlay */}
              <div className="absolute top-3 left-3 p-3 rounded-2xl bg-white/95 backdrop-blur-md border border-[#E8E2D8] shadow-xs text-xs flex flex-col gap-1.5 pointer-events-none">
                <span className="font-bold text-[#1A2E3B] text-[11px] uppercase tracking-wider">
                  {displayMode === "utilization"
                    ? "Шкала напруження вузлів"
                    : displayMode === "snow"
                    ? "Шкала тиску снігу (кПа)"
                    : "Аеродинамічний тиск / тяга"}
                </span>

                {displayMode === "utilization" ? (
                  <div className="flex flex-col gap-1 text-[11px] font-medium">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#16A34A]" />
                      <span>&lt; 50% (Безпечно)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#D97706]" />
                      <span>50 - 80% (Помірно)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#EA580C]" />
                      <span>80 - 100% (На межі)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#DC2626] animate-pulse" />
                      <span className="font-bold text-[#DC2626]">&gt; 100% (КРИТИЧНО!)</span>
                    </div>
                  </div>
                ) : displayMode === "snow" ? (
                  <div className="flex items-center gap-1 text-[11px]">
                    <span className="text-[#8C9BAE]">0 кПа</span>
                    <div className="w-24 h-2.5 rounded-full bg-gradient-to-r from-[#EDE9FE] to-[#581C87]" />
                    <span className="text-[#581C87] font-bold">{(params.snowLoadKPa * 1.5).toFixed(1)} кПа</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-[#1E40AF] font-bold">Відрив (-1.2 кПа)</span>
                    <div className="w-20 h-2.5 rounded-full bg-gradient-to-r from-[#1D4ED8] via-[#E2E8F0] to-[#EA580C]" />
                    <span className="text-[#EA580C] font-bold">Тиск (+0.8 кПа)</span>
                  </div>
                )}

                <div className="mt-1 pt-1.5 border-t border-[#E8E2D8] flex items-center gap-2 text-[10px] text-[#5A6778]">
                  <span className="w-4 h-0.5 bg-[#3B82F6] border-t border-dashed" />
                  <span>Напрямок вітру: {params.windDirectionDeg}° ({params.windSpeedMs} м/с)</span>
                </div>
              </div>

              {/* Inspector popup for selected node */}
              {selectedNodeData && (
                <div className="absolute bottom-4 right-4 p-4 rounded-2xl bg-[#1A2E3B]/95 text-white backdrop-blur-md shadow-lg border border-white/20 text-xs flex flex-col gap-1.5 max-w-xs pointer-events-auto">
                  <div className="flex items-center justify-between font-bold border-b border-white/10 pb-1">
                    <span className="text-[#DE7C5A]">Вузол #{selectedNodeData.nodeId}</span>
                    <button
                      onClick={() => setSelectedNodeId(null)}
                      className="text-white/60 hover:text-white"
                    >
                      ×
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] font-mono">
                    <span className="text-[#8C9BAE]">Висота Z:</span>
                    <span className="text-right">{selectedNodeData.z} мм</span>

                    <span className="text-[#8C9BAE]">Кут нахилу α:</span>
                    <span className="text-right">{selectedNodeData.slopeAngleDeg}°</span>

                    <span className="text-[#8C9BAE]">Вантажна площа:</span>
                    <span className="text-right">{selectedNodeData.tributaryAreaM2} м²</span>

                    <span className="text-[#8C9BAE]">Тиск снігу:</span>
                    <span className="text-right text-[#A6C7AE]">
                      {selectedNodeData.snowPressureKPa} кПа ({selectedNodeData.snowLoadKn} кН)
                    </span>

                    <span className="text-[#8C9BAE]">Тиск вітру:</span>
                    <span className="text-right text-[#FAF2DE]">
                      {selectedNodeData.windPressureKPa} кПа ({selectedNodeData.windLoadKn} кН)
                    </span>

                    <span className="text-[#8C9BAE]">Сумарна реакція:</span>
                    <span className="text-right font-bold text-white">
                      {selectedNodeData.resultantForceKn} кН
                    </span>

                    <span className="text-[#8C9BAE]">Напруження η:</span>
                    <span
                      className={`text-right font-bold ${
                        selectedNodeData.isCritical ? "text-[#EF4444]" : "text-[#16A34A]"
                      }`}
                    >
                      {(selectedNodeData.stressUtilization * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* D3 Histogram Bar Chart for Distribution of Node Stresses */}
          <div className="p-5 rounded-3xl bg-[#FAF7F2] border border-[#E8E2D8] shadow-xs flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-[#1A2E3B] flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#DE7C5A]" />
                  D3 Гістограма розподілу напружень вузлів купола
                </h3>
                <p className="text-[11px] text-[#5A6778]">
                  Кількість вузлів за діапазонами коефіцієнта використання несучої здатності η
                </p>
              </div>
            </div>

            <div className="w-full flex items-center justify-center bg-white rounded-2xl border border-[#E8E2D8] py-2">
              <svg ref={chartRef} width={340} height={150} />
            </div>
          </div>
        </div>

        {/* Right Column (4 cols): Real-Time Climate Sliders & Critical Nodes Inspector */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          {/* Real-time Environmental Load Controls Card */}
          <div className="p-5 rounded-3xl bg-[#FAF7F2] border border-[#E8E2D8] shadow-xs flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-[#E8E2D8] pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#1A2E3B] flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-[#DE7C5A]" />
                Параметри навантажень в реальному часі
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#EBF3F8] text-[#4A7C9B] font-bold">
                Live D3
              </span>
            </div>

            {/* Slider 1: Snow Load (0.5 to 3.0 kPa) */}
            <div>
              <div className="flex justify-between text-xs font-bold text-[#1A2E3B] mb-1">
                <span className="flex items-center gap-1 text-[#4A7C9B]">
                  <CloudSnow className="w-4 h-4" />
                  Снігове навантаження S_k:
                </span>
                <span className="font-mono text-[#4A7C9B] font-extrabold">
                  {params.snowLoadKPa} кПа ({(params.snowLoadKPa * 100).toFixed(0)} кг/м²)
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="3.0"
                step="0.1"
                value={params.snowLoadKPa}
                onChange={e =>
                  setParams(p => ({
                    ...p,
                    snowLoadKPa: parseFloat(e.target.value)
                  }))
                }
                className="w-full accent-[#4A7C9B]"
              />
              <div className="flex justify-between text-[10px] text-[#8C9BAE]">
                <span>0.5 кПа (Південь)</span>
                <span>1.4 кПа (Київ/Центр)</span>
                <span>3.0 кПа (Карпати)</span>
              </div>
            </div>

            {/* Snow Pattern Toggle */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => setParams(p => ({ ...p, snowPattern: "uniform" }))}
                className={`p-2 rounded-xl text-xs font-bold border transition-all ${
                  params.snowPattern === "uniform"
                    ? "bg-[#EBF3F8] border-[#4A7C9B] text-[#4A7C9B]"
                    : "bg-white border-[#E8E2D8] text-[#5A6778]"
                }`}
              >
                Рівномірний сніг
              </button>
              <button
                onClick={() => setParams(p => ({ ...p, snowPattern: "drift" }))}
                className={`p-2 rounded-xl text-xs font-bold border transition-all ${
                  params.snowPattern === "drift"
                    ? "bg-[#FAF2DE] border-[#DDA843] text-[#DDA843]"
                    : "bg-white border-[#E8E2D8] text-[#5A6778]"
                }`}
              >
                Сніговий мішок
              </button>
            </div>

            {/* Slider 2: Wind Speed (10 to 45 m/s) */}
            <div>
              <div className="flex justify-between text-xs font-bold text-[#1A2E3B] mb-1">
                <span className="flex items-center gap-1 text-[#DE7C5A]">
                  <Wind className="w-4 h-4" />
                  Швидкість вітру:
                </span>
                <span className="font-mono text-[#DE7C5A] font-extrabold">
                  {params.windSpeedMs} м/с ({(params.windSpeedMs * 3.6).toFixed(0)} км/год)
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="45"
                step="1"
                value={params.windSpeedMs}
                onChange={e =>
                  setParams(p => ({
                    ...p,
                    windSpeedMs: parseInt(e.target.value, 10)
                  }))
                }
                className="w-full accent-[#DE7C5A]"
              />
              <div className="flex justify-between text-[10px] text-[#8C9BAE]">
                <span>15 м/с (Свіжий)</span>
                <span>25 м/с (Шторм)</span>
                <span>45 м/с (Ураган)</span>
              </div>
            </div>

            {/* Slider 3: Wind Direction Azimuth (0° to 360°) */}
            <div>
              <div className="flex justify-between text-xs font-bold text-[#1A2E3B] mb-1">
                <span className="flex items-center gap-1 text-[#1A2E3B]">
                  <Compass className="w-4 h-4 text-[#5B9279]" />
                  Напрямок вітру (Азимут):
                </span>
                <span className="font-mono text-[#1A2E3B] font-extrabold">
                  {params.windDirectionDeg}° (
                  {params.windDirectionDeg >= 337.5 || params.windDirectionDeg < 22.5
                    ? "Пн"
                    : params.windDirectionDeg < 67.5
                    ? "Пн-Сх"
                    : params.windDirectionDeg < 112.5
                    ? "Сх"
                    : params.windDirectionDeg < 157.5
                    ? "Пд-Сх"
                    : params.windDirectionDeg < 202.5
                    ? "Пд"
                    : params.windDirectionDeg < 247.5
                    ? "Пд-Зх"
                    : params.windDirectionDeg < 292.5
                    ? "Зх"
                    : "Пн-Зх"}
                  )
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                step="5"
                value={params.windDirectionDeg}
                onChange={e =>
                  setParams(p => ({
                    ...p,
                    windDirectionDeg: parseInt(e.target.value, 10)
                  }))
                }
                className="w-full accent-[#5B9279]"
              />
            </div>

            {/* Combination Preset */}
            <div>
              <label className="text-[11px] text-[#5A6778] block mb-1">Комбінація розрахунку</label>
              <select
                value={params.combination}
                onChange={e =>
                  setParams(p => ({
                    ...p,
                    combination: e.target.value as any
                  }))
                }
                className="w-full p-2 rounded-xl bg-white border border-[#E8E2D8] text-xs font-bold text-[#1A2E3B]"
              >
                <option value="ULS_max_snow">ULS: Макс. сніг (1.35G + 1.5S + 0.9W)</option>
                <option value="ULS_max_wind">ULS: Штормовий вітер (1.35G + 0.9S + 1.5W)</option>
                <option value="SLS_characteristic">SLS: Експлуатаційний стан (1.0G + 1.0S + 1.0W)</option>
              </select>
            </div>
          </div>

          {/* Critical Nodes Ranked Real-Time Table */}
          <div className="p-5 rounded-3xl bg-[#FAF7F2] border border-[#E8E2D8] shadow-xs flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#1A2E3B] flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-[#DC2626]" />
                Найбільш навантажені вузли купола
              </h3>
              <span className="text-[11px] font-mono text-[#5A6778]">Топ-5</span>
            </div>

            <div className="flex flex-col gap-2">
              {loadResult.nodes
                .slice()
                .sort((a, b) => b.stressUtilization - a.stressUtilization)
                .slice(0, 5)
                .map((n, i) => (
                  <div
                    key={`crit-node-${n.nodeId}`}
                    onClick={() => setSelectedNodeId(n.nodeId)}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                      selectedNodeId === n.nodeId
                        ? "bg-white border-[#1A2E3B] shadow-2xs"
                        : "bg-white/70 border-[#E8E2D8] hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                          n.isCritical ? "bg-[#DC2626]" : n.stressUtilization >= 0.8 ? "bg-[#EA580C]" : "bg-[#D97706]"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-[#1A2E3B]">
                          Вузол #{n.nodeId} (Z={n.z} мм)
                        </div>
                        <div className="text-[10px] text-[#5A6778]">
                          Сила: {n.resultantForceKn} кН · Сніг: {n.snowPressureKPa} кПа
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span
                        className={`text-xs font-mono font-black ${
                          n.isCritical
                            ? "text-[#DC2626]"
                            : n.stressUtilization >= 0.8
                            ? "text-[#EA580C]"
                            : "text-[#D97706]"
                        }`}
                      >
                        {(n.stressUtilization * 100).toFixed(0)}%
                      </span>
                      <span className="block text-[9px] text-[#8C9BAE]">
                        {n.isCritical ? "Перевантаження!" : "На межі"}
                      </span>
                    </div>
                  </div>
                ))}
            </div>

            {/* Engineering Recommendation Box */}
            <div className="p-3.5 rounded-2xl bg-white border border-[#E8E2D8] text-xs text-[#5A6778] leading-relaxed flex flex-col gap-1.5">
              <span className="font-bold text-[#1A2E3B] flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-[#5B9279]" />
                Інженерні рекомендації:
              </span>
              {loadResult.criticalNodesCount > 0 ? (
                <span>
                  Для зняття перевантаження ({loadResult.criticalNodesCount} вузлів) рекомендується збільшити
                  переріз балки (наприклад, з 50×100 до 50×150 або 50×200 мм) або перейти на вищу частоту
                  розбивки геосфери (4V / 5V).
                </span>
              ) : (
                <span>
                  Поточний профіль балок {model.beamProfile.type === "circular" || model.beamProfile.type === "pipe" ? `Ø ${model.beamProfile.diameter || model.beamProfile.width} мм` : `${model.beamProfile.width}×${model.beamProfile.depth} мм`} повністю
                  забезпечує міцність купола під заданим сніговим ({params.snowLoadKPa} кПа) та вітровим тиском
                  з коефіцієнтом надійності за Єврокодом.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
