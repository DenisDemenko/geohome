import React, { useState, useMemo, useRef, useEffect } from "react";
import { DomeModel } from "../core/types";
import {
  PackagingConfig,
  DEFAULT_PACKAGING_CONFIG,
  PalletStandardId,
  PALLET_STANDARDS,
  VEHICLE_OPTIONS,
  buildPackagingPlan,
  exportPackingManifestCSV,
  BoxPackage,
  OptimizedPallet,
  PlacedPackage
} from "../core/packaging";
import QRCode from "qrcode";
import {
  Package,
  Boxes,
  Truck,
  Layers,
  Scale,
  Download,
  Printer,
  Sliders,
  QrCode,
  Barcode,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Maximize2,
  Minimize2,
  Info,
  ShieldCheck,
  Search,
  ExternalLink,
  ChevronRight,
  Eye,
  SlidersHorizontal
} from "lucide-react";

interface PackagingPanelProps {
  model: DomeModel;
}

export const PackagingPanel: React.FC<PackagingPanelProps> = ({ model }) => {
  // Configuration state
  const [config, setConfig] = useState<PackagingConfig>(DEFAULT_PACKAGING_CONFIG);

  // Active sub-tab: "3d_pallets" | "manifest" | "labels" | "transport"
  const [activeSubTab, setActiveSubTab] = useState<"3d_pallets" | "manifest" | "labels" | "transport">("3d_pallets");

  // Selected pallet ID
  const [selectedPalletId, setSelectedPalletId] = useState<string>("all");

  // Selected package for inspection
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  // Explode view slider (0 to 100mm vertical separation of layers)
  const [explodeGapMm, setExplodeGapMm] = useState<number>(0);

  // 3D Canvas camera angles
  const [rotX, setRotX] = useState<number>(25); // degrees
  const [rotY, setRotY] = useState<number>(-35); // degrees
  const [zoom, setZoom] = useState<number>(1.0);
  const [showStrapping, setShowStrapping] = useState<boolean>(true);
  const [showStretchFilm, setShowStretchFilm] = useState<boolean>(false);
  const [showWireframe, setShowWireframe] = useState<boolean>(false);

  // Search filter in manifest
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  // QR Code data URL cache: packageId -> dataUrl
  const [qrCache, setQrCache] = useState<Record<string, string>>({});

  // Canvas ref for isometric 3D drawing
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Compute packaging plan
  const plan = useMemo(() => {
    return buildPackagingPlan(model, config);
  }, [model, config]);

  // Set default selected pallet once plan loads
  useEffect(() => {
    if (selectedPalletId !== "all" && !plan.pallets.some(p => p.id === selectedPalletId)) {
      setSelectedPalletId(plan.pallets[0]?.id || "all");
    }
  }, [plan.pallets, selectedPalletId]);

  // Generate QR codes for packages
  useEffect(() => {
    const generateQRs = async () => {
      const newCache: Record<string, string> = {};
      for (const pkg of plan.allPackages.slice(0, 40)) {
        try {
          const url = await QRCode.toDataURL(pkg.qrPayload, {
            width: 140,
            margin: 1,
            color: { dark: "#1A2E3B", light: "#FFFFFF" }
          });
          newCache[pkg.id] = url;
        } catch (err) {
          console.error("QR generation failed", err);
        }
      }
      setQrCache(newCache);
    };
    generateQRs();
  }, [plan.allPackages]);

  // Active pallet object (or null if "all")
  const currentPallet = useMemo(() => {
    if (selectedPalletId === "all") return null;
    return plan.pallets.find(p => p.id === selectedPalletId) || plan.pallets[0] || null;
  }, [plan.pallets, selectedPalletId]);

  // Selected package details
  const activePackage = useMemo(() => {
    if (!selectedPackageId) return null;
    return plan.allPackages.find(p => p.id === selectedPackageId) || null;
  }, [plan.allPackages, selectedPackageId]);

  // =========================================================================
  // INTERACTIVE 3D ISOMETRIC / ORBIT CANVAS RENDERING
  // =========================================================================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle high DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    // Pallets to render
    const palletsToRender = currentPallet ? [currentPallet] : plan.pallets;
    if (palletsToRender.length === 0) return;

    // Isometric projection mathematics
    const radX = (rotX * Math.PI) / 180;
    const radY = (rotY * Math.PI) / 180;

    // Center of scene
    const centerX = w / 2;
    const centerY = h * 0.58;

    // Scale calculation: fit pallet bounding box
    const maxPalletDimension = Math.max(
      ...palletsToRender.map(p => Math.max(p.palletStandard.lengthMm, p.palletStandard.widthMm, p.totalHeightWithPalletMm))
    );
    const sceneScale = (Math.min(w, h) / (maxPalletDimension * (palletsToRender.length > 1 ? 2.2 : 1.4))) * zoom;

    // 3D Point to 2D Screen projection
    const project = (xMm: number, yMm: number, zMm: number, offsetX = 0, offsetY = 0) => {
      // Offset for multi-pallet view in a neat line
      const px = xMm + offsetX;
      const py = yMm + offsetY;
      const pz = zMm;

      // Rotate around Z axis (rotY)
      const cosY = Math.cos(radY);
      const sinY = Math.sin(radY);
      const x1 = px * cosY - py * sinY;
      const y1 = px * sinY + py * cosY;
      const z1 = pz;

      // Rotate around X axis (rotX) - tilt
      const cosX = Math.cos(radX);
      const sinX = Math.sin(radX);
      const y2 = y1 * cosX - z1 * sinX;
      const z2 = y1 * sinX + z1 * cosX;

      const screenX = centerX + x1 * sceneScale;
      const screenY = centerY - z2 * sceneScale;

      return { x: screenX, y: screenY, depth: y2 };
    };

    // Draw Ground Grid & Shadows
    ctx.save();
    ctx.strokeStyle = "rgba(215, 205, 190, 0.45)";
    ctx.lineWidth = 1;
    const gridSize = 3000;
    const gridStep = 500;
    for (let gx = -gridSize / 2; gx <= gridSize / 2; gx += gridStep) {
      const p1 = project(gx, -gridSize / 2, -10);
      const p2 = project(gx, gridSize / 2, -10);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    for (let gy = -gridSize / 2; gy <= gridSize / 2; gy += gridStep) {
      const p1 = project(-gridSize / 2, gy, -10);
      const p2 = project(gridSize / 2, gy, -10);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.restore();

    // Helper: Draw 3D Box with realistic shading
    const draw3DBox = (
      x: number,
      y: number,
      z: number,
      len: number,
      wid: number,
      hei: number,
      baseColor: string,
      strokeColor: string,
      isSelected: boolean,
      label?: string,
      offsetX = 0,
      offsetY = 0
    ) => {
      // 8 vertices
      const v000 = project(x, y, z, offsetX, offsetY);
      const v100 = project(x + len, y, z, offsetX, offsetY);
      const v110 = project(x + len, y + wid, z, offsetX, offsetY);
      const v010 = project(x, y + wid, z, offsetX, offsetY);

      const v001 = project(x, y, z + hei, offsetX, offsetY);
      const v101 = project(x + len, y, z + hei, offsetX, offsetY);
      const v111 = project(x + len, y + wid, z + hei, offsetX, offsetY);
      const v011 = project(x, y + wid, z + hei, offsetX, offsetY);

      // Color shading
      const topFill = lightenDarkenColor(baseColor, 20);
      const frontFill = baseColor;
      const sideFill = lightenDarkenColor(baseColor, -25);

      // Top Face (Z+)
      ctx.beginPath();
      ctx.moveTo(v001.x, v001.y);
      ctx.lineTo(v101.x, v101.y);
      ctx.lineTo(v111.x, v111.y);
      ctx.lineTo(v011.x, v011.y);
      ctx.closePath();
      ctx.fillStyle = isSelected ? "#A6E3BA" : topFill;
      ctx.fill();
      ctx.strokeStyle = isSelected ? "#2E7D32" : strokeColor;
      ctx.lineWidth = isSelected ? 2.5 : 1;
      ctx.stroke();

      // Front Face (Y-)
      ctx.beginPath();
      ctx.moveTo(v000.x, v000.y);
      ctx.lineTo(v100.x, v100.y);
      ctx.lineTo(v101.x, v101.y);
      ctx.lineTo(v001.x, v001.y);
      ctx.closePath();
      ctx.fillStyle = isSelected ? "#85D4A0" : frontFill;
      ctx.fill();
      ctx.stroke();

      // Right Face (X+)
      ctx.beginPath();
      ctx.moveTo(v100.x, v100.y);
      ctx.lineTo(v110.x, v110.y);
      ctx.lineTo(v111.x, v111.y);
      ctx.lineTo(v101.x, v101.y);
      ctx.closePath();
      ctx.fillStyle = isSelected ? "#60C483" : sideFill;
      ctx.fill();
      ctx.stroke();

      // Optional text label on top face if zoomed in
      if (label && sceneScale > 0.12) {
        ctx.save();
        ctx.fillStyle = "#1A2E3B";
        ctx.font = "bold 9px JetBrains Mono, monospace";
        ctx.textAlign = "center";
        ctx.fillText(label, (v001.x + v111.x) / 2, (v001.y + v111.y) / 2 + 3);
        ctx.restore();
      }
    };

    // Helper: Draw Wooden Pallet Base with EPAL wooden runners & top deck boards
    const drawPalletBase = (plt: OptimizedPallet, offsetX = 0, offsetY = 0) => {
      const { lengthMm, widthMm, heightMm } = plt.palletStandard;
      const woodBaseColor = "#CDB38B";
      const woodDarkColor = "#9E8159";

      // Pallet shadow
      const s0 = project(-lengthMm / 2 - 40, -widthMm / 2 - 40, -1, offsetX, offsetY);
      const s1 = project(lengthMm / 2 + 40, -widthMm / 2 - 40, -1, offsetX, offsetY);
      const s2 = project(lengthMm / 2 + 40, widthMm / 2 + 40, -1, offsetX, offsetY);
      const s3 = project(-lengthMm / 2 - 40, widthMm / 2 + 40, -1, offsetX, offsetY);

      ctx.beginPath();
      ctx.moveTo(s0.x, s0.y);
      ctx.lineTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.lineTo(s3.x, s3.y);
      ctx.closePath();
      ctx.fillStyle = "rgba(70, 55, 40, 0.14)";
      ctx.fill();

      // 1. Bottom 3 skid runners (Y=0, Y=mid, Y=end)
      const runnerH = 22;
      const runnerW = 100;
      const blockH = 78;

      const yPositions = [-widthMm / 2, 0 - runnerW / 2, widthMm / 2 - runnerW];
      const xPositions = [-lengthMm / 2, 0 - runnerW / 2, lengthMm / 2 - runnerW];

      // 9 Wooden corner/center blocks
      for (const bx of xPositions) {
        for (const by of yPositions) {
          draw3DBox(
            bx,
            by,
            runnerH,
            runnerW,
            runnerW,
            blockH,
            woodDarkColor,
            "#7A603E",
            false,
            undefined,
            offsetX,
            offsetY
          );
        }
      }

      // Top deck boards (5 to 7 boards across X)
      const boardCount = lengthMm > 2000 ? 9 : 5;
      const boardWidth = 120;
      const boardGap = (lengthMm - boardCount * boardWidth) / (boardCount - 1);
      const boardThick = 24;

      for (let i = 0; i < boardCount; i++) {
        const bx = -lengthMm / 2 + i * (boardWidth + boardGap);
        draw3DBox(
          bx,
          -widthMm / 2,
          runnerH + blockH,
          boardWidth,
          widthMm,
          boardThick,
          woodBaseColor,
          "#8E704C",
          false,
          undefined,
          offsetX,
          offsetY
        );
      }
    };

    // Render each pallet
    palletsToRender.forEach((plt, pIdx) => {
      // Space pallets horizontally if showing all
      const palletSpacing = 1600;
      const totalOffsetWidth = (palletsToRender.length - 1) * palletSpacing;
      const offsetX = palletsToRender.length > 1 ? pIdx * palletSpacing - totalOffsetWidth / 2 : 0;
      const offsetY = 0;

      // 1. Draw Wooden Pallet Base
      drawPalletBase(plt, offsetX, offsetY);

      const palletBaseH = plt.palletStandard.heightMm;
      const palletLen = plt.palletStandard.lengthMm;
      const palletWid = plt.palletStandard.widthMm;

      // 2. Sort placed packages from back to front for proper painter's algorithm
      const sortedPlaced = [...plt.packages].sort((a, b) => {
        // Sort by layer index first, then by depth in isometric view
        if (a.layerIndex !== b.layerIndex) {
          return a.layerIndex - b.layerIndex;
        }
        return a.yMm - b.yMm;
      });

      // Draw Packages
      sortedPlaced.forEach(placed => {
        const pkg = placed.package;
        const isSelected = pkg.id === selectedPackageId;

        // Apply explode height gap
        const zExplode = placed.zMm + placed.layerIndex * explodeGapMm;

        // Relative box coords (pallet origin is at center)
        const boxX = -palletLen / 2 + placed.xMm;
        const boxY = -palletWid / 2 + placed.yMm;
        const boxZ = palletBaseH + zExplode;

        let boxBaseColor = "#E0C8A0"; // default cardboard kraft
        let strokeColor = "#A88D65";

        if (pkg.category === "connectors") {
          boxBaseColor = "#B0C8D6"; // blueish grey steel containers
          strokeColor = "#4A7C9B";
        } else if (pkg.category === "fasteners") {
          boxBaseColor = "#E6C2B4"; // terracotta hardware
          strokeColor = "#DE7C5A";
        } else if (pkg.category === "struts") {
          boxBaseColor = "#C4DBC8"; // pine wood bundle
          strokeColor = "#2E7D32";
        } else if (pkg.category === "panels") {
          boxBaseColor = "#E8DDB8"; // plywood sheets
          strokeColor = "#DDA843";
        } else if (pkg.category === "accessories") {
          boxBaseColor = "#C8E2D6"; // mint tool kit
          strokeColor = "#5B9279";
        }

        draw3DBox(
          boxX,
          boxY,
          boxZ,
          placed.lengthMm,
          placed.widthMm,
          placed.heightMm,
          boxBaseColor,
          strokeColor,
          isSelected,
          pkg.code,
          offsetX,
          offsetY
        );
      });

      // 3. Draw Strapping Bands (PET straps) if enabled
      if (showStrapping && explodeGapMm === 0) {
        ctx.save();
        ctx.strokeStyle = "#1A1A1A"; // Black PET strapping bands
        ctx.lineWidth = 3;

        // Transverse straps across width
        const strapCount = plt.category === "timber_struts" ? 3 : 2;
        for (let s = 1; s <= strapCount; s++) {
          const sx = -palletLen / 2 + (palletLen * s) / (strapCount + 1);
          const topZ = palletBaseH + plt.cargoHeightMm + 2;

          const p0 = project(sx, -palletWid / 2 - 2, 0, offsetX, offsetY);
          const p1 = project(sx, -palletWid / 2 - 2, topZ, offsetX, offsetY);
          const p2 = project(sx, palletWid / 2 + 2, topZ, offsetX, offsetY);
          const p3 = project(sx, palletWid / 2 + 2, 0, offsetX, offsetY);

          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.stroke();
        }

        // Metal buckle seal indicator
        ctx.fillStyle = "#E0E0E0";
        for (let s = 1; s <= strapCount; s++) {
          const sx = -palletLen / 2 + (palletLen * s) / (strapCount + 1);
          const topZ = palletBaseH + plt.cargoHeightMm + 2;
          const pb = project(sx, 0, topZ, offsetX, offsetY);
          ctx.fillRect(pb.x - 3, pb.y - 2, 6, 4);
        }
        ctx.restore();
      }

      // 4. Draw Stretch Film Sheen if enabled
      if (showStretchFilm && explodeGapMm === 0) {
        ctx.save();
        const topZ = palletBaseH + plt.cargoHeightMm;
        const c0 = project(-palletLen / 2 - 8, -palletWid / 2 - 8, palletBaseH - 10, offsetX, offsetY);
        const c1 = project(palletLen / 2 + 8, -palletWid / 2 - 8, palletBaseH - 10, offsetX, offsetY);
        const c2 = project(palletLen / 2 + 8, -palletWid / 2 - 8, topZ + 10, offsetX, offsetY);
        const c3 = project(-palletLen / 2 - 8, -palletWid / 2 - 8, topZ + 10, offsetX, offsetY);

        ctx.beginPath();
        ctx.moveTo(c0.x, c0.y);
        ctx.lineTo(c1.x, c1.y);
        ctx.lineTo(c2.x, c2.y);
        ctx.lineTo(c3.x, c3.y);
        ctx.closePath();
        ctx.fillStyle = "rgba(220, 240, 255, 0.22)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      // 5. Dimension labels
      if (palletsToRender.length === 1) {
        ctx.save();
        ctx.fillStyle = "#5A6778";
        ctx.font = "bold 10px JetBrains Mono, monospace";

        // Length label
        const pLenStart = project(-palletLen / 2, -palletWid / 2 - 60, 0);
        const pLenEnd = project(palletLen / 2, -palletWid / 2 - 60, 0);
        ctx.beginPath();
        ctx.moveTo(pLenStart.x, pLenStart.y);
        ctx.lineTo(pLenEnd.x, pLenEnd.y);
        ctx.strokeStyle = "#8C9BAE";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.textAlign = "center";
        ctx.fillText(`Д: ${palletLen} мм`, (pLenStart.x + pLenEnd.x) / 2, (pLenStart.y + pLenEnd.y) / 2 + 14);

        // Height label
        const pHStart = project(-palletLen / 2 - 60, -palletWid / 2, 0);
        const pHEnd = project(-palletLen / 2 - 60, -palletWid / 2, plt.totalHeightWithPalletMm);
        ctx.beginPath();
        ctx.moveTo(pHStart.x, pHStart.y);
        ctx.lineTo(pHEnd.x, pHEnd.y);
        ctx.stroke();
        ctx.fillText(`В: ${plt.totalHeightWithPalletMm} мм`, pHStart.x - 10, (pHStart.y + pHEnd.y) / 2);
        ctx.restore();
      }
    });
  }, [
    plan,
    currentPallet,
    selectedPalletId,
    selectedPackageId,
    rotX,
    rotY,
    zoom,
    explodeGapMm,
    showStrapping,
    showStretchFilm
  ]);

  // Color shading helper
  const lightenDarkenColor = (col: string, amt: number) => {
    let usePound = false;
    if (col[0] === "#") {
      col = col.slice(1);
      usePound = true;
    }
    const num = parseInt(col, 16);
    let r = (num >> 16) + amt;
    if (r > 255) r = 255;
    else if (r < 0) r = 0;
    let b = ((num >> 8) & 0x00ff) + amt;
    if (b > 255) b = 255;
    else if (b < 0) b = 0;
    let g = (num & 0x0000ff) + amt;
    if (g > 255) g = 255;
    else if (g < 0) g = 0;
    return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16).padStart(6, "0");
  };

  // Mouse drag handlers for Orbit Rotation
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - lastMousePosRef.current.x;
    const deltaY = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    setRotY(prev => (prev + deltaX * 0.7) % 360);
    setRotX(prev => Math.max(5, Math.min(85, prev - deltaY * 0.5)));
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(prev => Math.max(0.6, Math.min(2.5, prev - e.deltaY * 0.001)));
  };

  // Handle CSV Download
  const handleDownloadCSV = () => {
    const csvContent = exportPackingManifestCSV(plan, model);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `Packing-Manifest-${model.parameters.frequency}V-${model.parameters.diameter / 1000}m.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Handle Print Labels View
  const handlePrintLabels = () => {
    window.print();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 1. TOP STATS OVERVIEW CARDS */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-2xl tactile-card">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-[#5A6778]">Вага брутто</span>
            <Scale className="w-3.5 h-3.5 text-[#5B9279]" />
          </div>
          <span className="text-base font-mono font-black text-[#1A2E3B]">
            {plan.totalGrossWeightKg.toLocaleString()} кг
          </span>
          <span className="text-[10px] text-[#8C9BAE] block mt-0.5">
            Нетто: {plan.totalNetWeightKg} кг · Тара: {plan.totalTareWeightKg} кг
          </span>
        </div>

        <div className="p-3.5 rounded-2xl tactile-card">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-[#5A6778]">Кількість палет</span>
            <Layers className="w-3.5 h-3.5 text-[#2E7D32]" />
          </div>
          <span className="text-base font-mono font-black text-[#2E7D32]">
            {plan.totalPalletsCount} піддони
          </span>
          <span className="text-[10px] text-[#8C9BAE] block mt-0.5">
            Стандарт: {PALLET_STANDARDS[config.palletStandard].shortName}
          </span>
        </div>

        <div className="p-3.5 rounded-2xl tactile-card">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-[#5A6778]">Всього упаковок</span>
            <Boxes className="w-3.5 h-3.5 text-[#4A7C9B]" />
          </div>
          <span className="text-base font-mono font-black text-[#1A2E3B]">
            {plan.totalPackagesCount} місць
          </span>
          <span className="text-[10px] text-[#8C9BAE] block mt-0.5">
            Коробки, пачки та стінгер-пакети
          </span>
        </div>

        <div className="p-3.5 rounded-2xl tactile-card">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-[#5A6778]">Загальний об'єм</span>
            <Package className="w-3.5 h-3.5 text-[#DDA843]" />
          </div>
          <span className="text-base font-mono font-black text-[#1A2E3B]">
            {plan.totalVolumeM3.toFixed(2)} м³
          </span>
          <span className="text-[10px] text-[#8C9BAE] block mt-0.5">
            LDM: {plan.loadingMetersLdm} пог. м
          </span>
        </div>

        <div className="p-3.5 rounded-2xl tactile-card">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-[#5A6778]">Транспорт</span>
            <Truck className="w-3.5 h-3.5 text-[#DE7C5A]" />
          </div>
          <span className="text-xs font-bold text-[#1A2E3B] truncate block" title={plan.recommendedVehicle.name}>
            {plan.recommendedVehicle.name.split("(")[0]}
          </span>
          <span className="text-[10px] text-[#2E7D32] font-semibold block mt-0.5">
            Вміщується на 100%
          </span>
        </div>

        <div className="p-3.5 rounded-2xl tactile-card-mint flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-[#1A3E26]">Безпека праці</span>
            <ShieldCheck className="w-4 h-4 text-[#2E7D32]" />
          </div>
          <span className="text-xs font-mono font-bold text-[#1A3E26]">
            ≤ {config.maxBoxWeightKg} кг / місце
          </span>
          <span className="text-[10px] text-[#2E7D32] block">
            Ергономічний ручний підйом
          </span>
        </div>
      </section>

      {/* 2. SUB-NAVIGATION TABS & ACTION BUTTONS */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-2 rounded-2xl tactile-inset">
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setActiveSubTab("3d_pallets")}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
              activeSubTab === "3d_pallets"
                ? "bg-[#FAF7F2] text-[#1A2E3B] shadow-xs"
                : "text-[#5A6778] hover:text-[#1A2E3B]"
            }`}
          >
            <Boxes className="w-3.5 h-3.5 text-[#2E7D32]" />
            <span>3D Палети та Схема</span>
          </button>

          <button
            onClick={() => setActiveSubTab("manifest")}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
              activeSubTab === "manifest"
                ? "bg-[#FAF7F2] text-[#1A2E3B] shadow-xs"
                : "text-[#5A6778] hover:text-[#1A2E3B]"
            }`}
          >
            <Package className="w-3.5 h-3.5 text-[#4A7C9B]" />
            <span>Пакувальний лист (BOM)</span>
          </button>

          <button
            onClick={() => setActiveSubTab("labels")}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
              activeSubTab === "labels"
                ? "bg-[#FAF7F2] text-[#1A2E3B] shadow-xs"
                : "text-[#5A6778] hover:text-[#1A2E3B]"
            }`}
          >
            <QrCode className="w-3.5 h-3.5 text-[#DE7C5A]" />
            <span>Маркувальні етикетки</span>
          </button>

          <button
            onClick={() => setActiveSubTab("transport")}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
              activeSubTab === "transport"
                ? "bg-[#FAF7F2] text-[#1A2E3B] shadow-xs"
                : "text-[#5A6778] hover:text-[#1A2E3B]"
            }`}
          >
            <Truck className="w-3.5 h-3.5 text-[#DDA843]" />
            <span>Логістика та Транспорт</span>
          </button>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={handleDownloadCSV}
            className="px-3 py-1.5 text-xs font-bold rounded-xl tactile-btn flex items-center gap-1.5 text-[#1A2E3B] hover:text-[#2E7D32]"
            title="Експорт специфікації пакування у файл CSV"
          >
            <Download className="w-3.5 h-3.5 text-[#2E7D32]" />
            <span>Маніфест CSV</span>
          </button>

          <button
            onClick={handlePrintLabels}
            className="px-3 py-1.5 text-xs font-bold rounded-xl tactile-btn flex items-center gap-1.5 text-[#1A2E3B] hover:text-[#4A7C9B]"
            title="Друк накладної або етикеток"
          >
            <Printer className="w-3.5 h-3.5 text-[#4A7C9B]" />
            <span>Друк</span>
          </button>
        </div>
      </div>

      {/* 3. SUB-TAB 1: 3D PALLET VISUALIZER & LAYER BREAKDOWN */}
      {activeSubTab === "3d_pallets" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: 3D Canvas Viewport (8 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            <div className="p-4 rounded-3xl tactile-card relative flex flex-col overflow-hidden">
              {/* Viewport Top Bar: Pallet Selector Chips & Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-3 border-b border-[#E8E2D8]">
                {/* Pallet Switcher Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
                  <button
                    onClick={() => setSelectedPalletId("all")}
                    className={`px-3 py-1 text-xs font-bold rounded-xl transition-all ${
                      selectedPalletId === "all"
                        ? "bg-[#1A2E3B] text-white shadow-xs"
                        : "bg-[#F3EFE7] text-[#5A6778] hover:text-[#1A2E3B]"
                    }`}
                  >
                    Всі палети ({plan.totalPalletsCount})
                  </button>

                  {plan.pallets.map(plt => (
                    <button
                      key={plt.id}
                      onClick={() => setSelectedPalletId(plt.id)}
                      className={`px-3 py-1 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap ${
                        selectedPalletId === plt.id
                          ? "bg-[#2E7D32] text-white shadow-xs"
                          : "bg-[#F3EFE7] text-[#5A6778] hover:text-[#1A2E3B]"
                      }`}
                    >
                      <Layers className="w-3 h-3" />
                      <span>Палета #{plt.palletNumber}</span>
                    </button>
                  ))}
                </div>

                {/* Quick 3D Toggles */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowStrapping(prev => !prev)}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all ${
                      showStrapping
                        ? "bg-[#E1EDE3] text-[#1A3E26] border-[#A6C7AE]"
                        : "bg-white text-[#8C9BAE] border-[#E8E2D8]"
                    }`}
                    title="Відображати стяжні пакувальні стрічки PET"
                  >
                    Стрічки PET
                  </button>

                  <button
                    onClick={() => setShowStretchFilm(prev => !prev)}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all ${
                      showStretchFilm
                        ? "bg-[#EBF3F8] text-[#4A7C9B] border-[#A2C7E0]"
                        : "bg-white text-[#8C9BAE] border-[#E8E2D8]"
                    }`}
                    title="Відображати шар стретч-плівки"
                  >
                    Стретч
                  </button>

                  <button
                    onClick={() => {
                      setRotX(25);
                      setRotY(-35);
                      setZoom(1.0);
                      setExplodeGapMm(0);
                    }}
                    className="p-1 rounded-lg text-[#5A6778] hover:text-[#1A2E3B] hover:bg-[#EEE9E1]"
                    title="Скинути ракурс 3D камери"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* 3D Interactive Canvas */}
              <div
                className="w-full h-[450px] relative rounded-2xl bg-[#EDE7DF] overflow-hidden cursor-grab active:cursor-grabbing tactile-inset select-none"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
              >
                <canvas ref={canvasRef} className="w-full h-full block" />

                {/* Floating Orbit Help Hint */}
                <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-xl bg-white/80 backdrop-blur-xs text-[10px] text-[#5A6778] pointer-events-none shadow-xs">
                  🖱️ Затисніть ліву кнопку миші для обертання 3D · Колесо для наближення
                </div>

                {/* Floating Pallet Badge in Single View */}
                {currentPallet && (
                  <div className="absolute top-3 left-3 px-3 py-1.5 rounded-xl bg-white/90 backdrop-blur-xs shadow-xs border border-[#E8E2D8] flex flex-col">
                    <span className="text-xs font-bold text-[#1A2E3B]">
                      {currentPallet.title}
                    </span>
                    <span className="text-[10px] text-[#5A6778] font-mono">
                      Брутто: {currentPallet.grossWeightKg} кг · Габарити: {currentPallet.palletStandard.lengthMm}×{currentPallet.palletStandard.widthMm}×{currentPallet.totalHeightWithPalletMm} мм
                    </span>
                  </div>
                )}
              </div>

              {/* Bottom Control Bar: Explode View Slider */}
              <div className="mt-4 pt-3 border-t border-[#E8E2D8] flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1">
                  <span className="text-xs font-bold text-[#1A2E3B] whitespace-nowrap flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-[#5B9279]" />
                    <span>Пошаровий розрив (Explode):</span>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="150"
                    step="5"
                    value={explodeGapMm}
                    onChange={e => setExplodeGapMm(Number(e.target.value))}
                    className="w-full h-1.5 bg-[#EEE9E1] rounded-lg appearance-none cursor-pointer accent-[#2E7D32]"
                  />
                  <span className="text-xs font-mono font-bold text-[#2E7D32] min-w-[50px] text-right">
                    +{explodeGapMm} мм
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setZoom(prev => Math.min(2.2, prev + 0.2))}
                    className="w-7 h-7 rounded-xl tactile-btn flex items-center justify-center text-xs font-bold text-[#1A2E3B]"
                    title="Збільшити масштаб"
                  >
                    +
                  </button>
                  <button
                    onClick={() => setZoom(prev => Math.max(0.6, prev - 0.2))}
                    className="w-7 h-7 rounded-xl tactile-btn flex items-center justify-center text-xs font-bold text-[#1A2E3B]"
                    title="Зменшити масштаб"
                  >
                    -
                  </button>
                </div>
              </div>
            </div>

            {/* Current Pallet Details / Packages on this Pallet */}
            {currentPallet && (
              <div className="p-4 rounded-3xl tactile-card flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-xl bg-[#E1EDE3] flex items-center justify-center text-[#1A3E26]">
                      <Package className="w-4 h-4 text-[#2E7D32]" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#1A2E3B]">
                        Склад упаковок на Палеті #{currentPallet.palletNumber} ({currentPallet.packages.length} місць)
                      </h4>
                      <p className="text-[11px] text-[#5A6778]">
                        Клікніть на будь-яке місце, щоб підсвітити його в 3D та відкрити паспорт вмісту
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-mono font-bold text-[#2E7D32] bg-[#E1EDE3] px-2.5 py-1 rounded-xl">
                    Заповнення: {currentPallet.volumeUtilizationPct}%
                  </span>
                </div>

                {/* Grid of Packages */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mt-1">
                  {currentPallet.packages.map(placed => {
                    const pkg = placed.package;
                    const isSelected = pkg.id === selectedPackageId;

                    return (
                      <div
                        key={pkg.id}
                        onClick={() => setSelectedPackageId(pkg.id)}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                          isSelected
                            ? "bg-[#E1EDE3]/70 border-[#2E7D32] shadow-xs"
                            : "bg-[#FAF7F2] border-[#E8E2D8] hover:border-[#A2C7E0]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div>
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#EEE9E1] text-[#1A2E3B] mr-1.5">
                              {pkg.code}
                            </span>
                            <span className="text-xs font-bold text-[#1A2E3B] line-clamp-1">
                              {pkg.title}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono font-black text-[#2E7D32] whitespace-nowrap">
                            {pkg.grossWeightKg} кг
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-[#5A6778]">
                          <span>
                            {pkg.lengthMm}×{pkg.widthMm}×{pkg.heightMm} мм
                          </span>
                          <span className="font-semibold text-[#1A2E3B]">
                            {pkg.items.reduce((s, it) => s + it.quantity, 0)} од.
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Configuration & Selected Package Inspector (4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-5">
            {/* Inspector for Selected Package (if active) */}
            {activePackage ? (
              <div className="p-4 rounded-3xl tactile-card flex flex-col gap-3 border-2 border-[#2E7D32]">
                <div className="flex items-center justify-between border-b border-[#E8E2D8] pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-[#2E7D32] text-white">
                      {activePackage.code}
                    </span>
                    <h4 className="text-xs font-bold text-[#1A2E3B]">Паспорт упаковки</h4>
                  </div>
                  <button
                    onClick={() => setSelectedPackageId(null)}
                    className="text-xs text-[#8C9BAE] hover:text-[#1A2E3B]"
                  >
                    Закрити
                  </button>
                </div>

                <div className="flex items-start gap-3">
                  {/* Generated QR Code */}
                  {qrCache[activePackage.id] ? (
                    <img
                      src={qrCache[activePackage.id]}
                      alt="QR"
                      className="w-20 h-20 rounded-xl border border-[#E8E2D8] bg-white p-1 shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-[#EEE9E1] flex items-center justify-center shrink-0">
                      <QrCode className="w-8 h-8 text-[#8C9BAE]" />
                    </div>
                  )}

                  <div className="flex flex-col gap-1 text-xs">
                    <span className="font-bold text-[#1A2E3B]">{activePackage.title}</span>
                    <span className="text-[#5A6778] text-[11px]">
                      Габарити: {activePackage.lengthMm} × {activePackage.widthMm} × {activePackage.heightMm} мм
                    </span>
                    <span className="font-mono text-[11px] text-[#2E7D32] font-semibold">
                      Брутто: {activePackage.grossWeightKg} кг (Нетто: {activePackage.netWeightKg} кг)
                    </span>
                    <span className="text-[10px] text-[#8C9BAE] font-mono">
                      Штрихкод: {activePackage.barcode}
                    </span>
                  </div>
                </div>

                {/* Items in this box */}
                <div className="mt-1 flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold text-[#5A6778] uppercase tracking-wider">
                    Вміст упаковки:
                  </span>
                  <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
                    {activePackage.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-xl bg-[#F3EFE7] text-[11px] flex items-start justify-between gap-2"
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold text-[#1A2E3B]">{item.name}</span>
                          {item.details && <span className="text-[10px] text-[#5A6778]">{item.details}</span>}
                        </div>
                        <span className="font-mono font-bold text-[#2E7D32] whitespace-nowrap">
                          {item.quantity} {item.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Packaging Parameters & Optimization Settings */}
            <div className="p-4 rounded-3xl tactile-card flex flex-col gap-4">
              <div className="flex items-center gap-2 pb-2.5 border-b border-[#E8E2D8]">
                <Sliders className="w-4 h-4 text-[#5B9279]" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#1A2E3B]">
                  Параметри оптимізації пакування
                </h3>
              </div>

              {/* 1. Standard Pallet Type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#1A2E3B] flex items-center justify-between">
                  <span>Стандарт піддону (Палети):</span>
                  <span className="text-[11px] font-mono text-[#2E7D32]">
                    {PALLET_STANDARDS[config.palletStandard].lengthMm}×{PALLET_STANDARDS[config.palletStandard].widthMm} мм
                  </span>
                </label>
                <select
                  value={config.palletStandard}
                  onChange={e => setConfig(prev => ({ ...prev, palletStandard: e.target.value as PalletStandardId }))}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-[#FAF7F2] border border-[#E8E2D8] text-[#1A2E3B] focus:outline-none focus:border-[#2E7D32]"
                >
                  {Object.values(PALLET_STANDARDS).map(std => (
                    <option key={std.id} value={std.id}>
                      {std.name} (до {std.maxPayloadKg} кг)
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-[#8C9BAE]">
                  {PALLET_STANDARDS[config.palletStandard].description}
                </span>
              </div>

              {/* 2. Max box manual lifting limit */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#1A2E3B]">
                    Ліміт ваги коробки (Ручний підйом):
                  </label>
                  <span className="text-xs font-mono font-bold text-[#2E7D32]">
                    {config.maxBoxWeightKg} кг
                  </span>
                </div>
                <input
                  type="range"
                  min="15"
                  max="35"
                  step="1"
                  value={config.maxBoxWeightKg}
                  onChange={e => setConfig(prev => ({ ...prev, maxBoxWeightKg: Number(e.target.value) }))}
                  className="w-full h-1.5 bg-[#EEE9E1] rounded-lg appearance-none cursor-pointer accent-[#2E7D32]"
                />
                <div className="flex items-center justify-between text-[10px] text-[#8C9BAE]">
                  <span>15 кг (Легкий)</span>
                  <span className="text-[#2E7D32] font-semibold">25 кг (Норма ДСТУ/ISO)</span>
                  <span>35 кг (2 людини)</span>
                </div>
              </div>

              {/* 3. Max pallet stacking height */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#1A2E3B]">
                    Максимальна висота палети:
                  </label>
                  <span className="text-xs font-mono font-bold text-[#2E7D32]">
                    {config.maxPalletHeightMm} мм ({(config.maxPalletHeightMm / 1000).toFixed(1)} м)
                  </span>
                </div>
                <input
                  type="range"
                  min="1200"
                  max="2200"
                  step="50"
                  value={config.maxPalletHeightMm}
                  onChange={e => setConfig(prev => ({ ...prev, maxPalletHeightMm: Number(e.target.value) }))}
                  className="w-full h-1.5 bg-[#EEE9E1] rounded-lg appearance-none cursor-pointer accent-[#2E7D32]"
                />
                <span className="text-[10px] text-[#8C9BAE]">
                  Обмеження по висоті фургона вантажівки та складських стелажів
                </span>
              </div>

              {/* 4. Spare fasteners allowance */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#1A2E3B]">
                    Запасні метизи на монтаж:
                  </label>
                  <span className="text-xs font-mono font-bold text-[#2E7D32]">
                    +{config.fastenerSpareFactorPct}% болтів/гайок
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[0, 5, 10].map(pct => (
                    <button
                      key={pct}
                      onClick={() => setConfig(prev => ({ ...prev, fastenerSpareFactorPct: pct }))}
                      className={`py-1.5 text-xs font-bold rounded-xl transition-all ${
                        config.fastenerSpareFactorPct === pct
                          ? "bg-[#2E7D32] text-white shadow-xs"
                          : "bg-[#F3EFE7] text-[#5A6778] hover:text-[#1A2E3B]"
                      }`}
                    >
                      +{pct}%
                    </button>
                  ))}
                </div>
              </div>

              {/* 5. Sheathing Toggle */}
              <div className="pt-2 border-t border-[#E8E2D8] flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#1A2E3B] block">Враховувати обшивку купола</span>
                  <span className="text-[10px] text-[#8C9BAE]">Трикутні панелі на окремому піддоні</span>
                </div>
                <input
                  type="checkbox"
                  checked={config.includeSheathing}
                  onChange={e => setConfig(prev => ({ ...prev, includeSheathing: e.target.checked }))}
                  className="w-4 h-4 rounded text-[#2E7D32] accent-[#2E7D32] cursor-pointer"
                />
              </div>
            </div>

            {/* Category Breakdown Card */}
            <div className="p-4 rounded-3xl tactile-card flex flex-col gap-3">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#1A2E3B]">
                Розподіл ваги за матеріалами
              </h4>
              <div className="flex flex-col gap-2">
                {plan.categoryBreakdown.map(cat => {
                  const pct = Math.round((cat.weightKg / Math.max(1, plan.totalGrossWeightKg)) * 100);

                  return (
                    <div key={cat.category} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#1A2E3B]">{cat.label}</span>
                        <span className="font-mono text-[#5A6778]">
                          {cat.weightKg} кг ({pct}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[#EEE9E1] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${pct}%`, backgroundColor: cat.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. SUB-TAB 2: DETAILED PACKING MANIFEST (BOM) */}
      {activeSubTab === "manifest" && (
        <div className="flex flex-col gap-4">
          {/* Search & Filter Bar */}
          <div className="p-4 rounded-3xl tactile-card flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8C9BAE]" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Пошук упаковки чи деталі..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[#F3EFE7] border border-[#E8E2D8] text-[#1A2E3B] placeholder-[#8C9BAE] focus:outline-none focus:border-[#2E7D32]"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              {["all", "struts", "connectors", "fasteners", "panels", "accessories"].map(cat => {
                const labels: Record<string, string> = {
                  all: "Всі категорії",
                  struts: "Балки",
                  connectors: "Конектори",
                  fasteners: "Метизи",
                  panels: "Обшивка",
                  accessories: "Монтажний набір"
                };

                return (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    className={`px-3 py-1 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
                      filterCategory === cat
                        ? "bg-[#2E7D32] text-white shadow-xs"
                        : "bg-[#F3EFE7] text-[#5A6778] hover:text-[#1A2E3B]"
                    }`}
                  >
                    {labels[cat]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Table of all boxes */}
          <div className="p-4 rounded-3xl tactile-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#1A2E3B]">
                <thead className="bg-[#EEE9E1]/80 text-[#5A6778] uppercase text-[10px] font-bold border-b border-[#E8E2D8]">
                  <tr>
                    <th className="py-2.5 px-3">Код</th>
                    <th className="py-2.5 px-3">Палета</th>
                    <th className="py-2.5 px-3">Назва та Опис упаковки</th>
                    <th className="py-2.5 px-3">Категорія</th>
                    <th className="py-2.5 px-3">Габарити (Д×Ш×В)</th>
                    <th className="py-2.5 px-3 text-right">Нетто (кг)</th>
                    <th className="py-2.5 px-3 text-right">Брутто (кг)</th>
                    <th className="py-2.5 px-3 text-center">Штрихкод</th>
                    <th className="py-2.5 px-3 text-center">Дії</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E2D8]/60 font-sans">
                  {plan.allPackages
                    .filter(pkg => {
                      if (filterCategory !== "all" && pkg.category !== filterCategory) return false;
                      if (!searchQuery) return true;
                      const q = searchQuery.toLowerCase();
                      return (
                        pkg.title.toLowerCase().includes(q) ||
                        pkg.code.toLowerCase().includes(q) ||
                        pkg.items.some(it => it.name.toLowerCase().includes(q))
                      );
                    })
                    .map((pkg, idx) => {
                      const palletObj = plan.pallets.find(p => p.id === pkg.palletId);

                      return (
                        <tr
                          key={pkg.id}
                          className="hover:bg-[#E1EDE3]/25 transition-colors cursor-pointer"
                          onClick={() => {
                            setSelectedPackageId(pkg.id);
                            if (pkg.palletId) setSelectedPalletId(pkg.palletId);
                            setActiveSubTab("3d_pallets");
                          }}
                        >
                          <td className="py-2.5 px-3 font-mono font-bold text-[#2E7D32]">
                            {pkg.code}
                          </td>
                          <td className="py-2.5 px-3 text-[#5A6778] font-semibold whitespace-nowrap">
                            {palletObj ? `Палета #${palletObj.palletNumber}` : "—"}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-bold block text-[#1A2E3B]">{pkg.title}</span>
                            <span className="text-[10px] text-[#5A6778] block">
                              {pkg.items.map(it => `${it.name} (${it.quantity} ${it.unit})`).join("; ")}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FAF7F2] border border-[#E8E2D8] text-[#5A6778]">
                              {pkg.category}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-[#5A6778] whitespace-nowrap">
                            {pkg.lengthMm} × {pkg.widthMm} × {pkg.heightMm} мм
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#5A6778]">
                            {pkg.netWeightKg}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-[#1A2E3B]">
                            {pkg.grossWeightKg}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-[10px] text-[#8C9BAE]">
                            {pkg.barcode}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedPackageId(pkg.id);
                                setActiveSubTab("3d_pallets");
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold rounded-lg tactile-btn text-[#2E7D32]"
                            >
                              3D Огляд
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. SUB-TAB 3: LOGISTICS SHIPPING LABELS (100 x 150 mm) */}
      {activeSubTab === "labels" && (
        <div className="flex flex-col gap-4">
          <div className="p-4 rounded-3xl tactile-card flex items-center justify-between">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#1A2E3B]">
                Транспортні маркувальні етикетки (Стандарт 100 × 150 мм)
              </h3>
              <p className="text-[11px] text-[#5A6778]">
                Готові до друку на термопринтері етикеток або звичайному аркуші А4. Містять динамічний QR-код, штрихкод та міжнародні символи обробки вантажу.
              </p>
            </div>
            <button
              onClick={handlePrintLabels}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-[#2E7D32] text-white flex items-center gap-1.5 shadow-xs hover:bg-[#1A3E26]"
            >
              <Printer className="w-4 h-4" />
              <span>Друк усіх етикеток ({plan.allPackages.length})</span>
            </button>
          </div>

          {/* Grid of Printable Labels */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {plan.allPackages.map((pkg, idx) => {
              const palletObj = plan.pallets.find(p => p.id === pkg.palletId);

              return (
                <div
                  key={pkg.id}
                  className="bg-white border-2 border-black rounded-xl p-4 flex flex-col justify-between gap-3 text-black shadow-sm font-sans"
                  style={{ minHeight: "340px" }}
                >
                  {/* Label Header */}
                  <div className="flex items-center justify-between border-b-2 border-black pb-2">
                    <div>
                      <span className="text-[10px] font-black tracking-widest block uppercase">
                        КуполГео CAD · Відвантаження
                      </span>
                      <span className="text-xs font-bold">
                        Купол {model.parameters.frequency}V (D={model.parameters.diameter / 1000}м)
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-black font-mono block">
                        {pkg.code}
                      </span>
                      <span className="text-[10px] font-bold text-gray-700">
                        {palletObj ? `Палета #${palletObj.palletNumber}` : "Окремо"}
                      </span>
                    </div>
                  </div>

                  {/* Body: QR Code and Key Data */}
                  <div className="flex items-center gap-3">
                    {qrCache[pkg.id] ? (
                      <img
                        src={qrCache[pkg.id]}
                        alt="QR Code"
                        className="w-24 h-24 border border-black p-0.5 shrink-0"
                      />
                    ) : (
                      <div className="w-24 h-24 bg-gray-100 flex items-center justify-center shrink-0 border border-black">
                        <QrCode className="w-10 h-10 text-gray-400" />
                      </div>
                    )}

                    <div className="flex flex-col gap-1 text-xs">
                      <span className="font-extrabold text-sm line-clamp-2">
                        {pkg.title}
                      </span>
                      <span className="font-mono text-[11px] text-gray-700">
                        Габарити: {pkg.lengthMm} × {pkg.widthMm} × {pkg.heightMm} мм
                      </span>
                      <span className="font-black text-sm font-mono mt-0.5">
                        БРУТТО: {pkg.grossWeightKg} КГ
                      </span>
                      <span className="text-[10px] text-gray-600 font-mono">
                        (Нетто: {pkg.netWeightKg} кг)
                      </span>
                    </div>
                  </div>

                  {/* Contents list */}
                  <div className="border-t border-b border-gray-300 py-1.5 flex flex-col gap-0.5 text-[10px]">
                    <span className="font-bold text-gray-700">Склад місця:</span>
                    {pkg.items.slice(0, 3).map((it, i) => (
                      <div key={i} className="flex justify-between font-mono">
                        <span className="truncate pr-1">• {it.name}</span>
                        <span className="font-bold whitespace-nowrap">
                          {it.quantity} {it.unit}
                        </span>
                      </div>
                    ))}
                    {pkg.items.length > 3 && (
                      <span className="text-gray-500 italic">+ ще {pkg.items.length - 3} найменувань...</span>
                    )}
                  </div>

                  {/* ISO Handling Symbols & Barcode */}
                  <div className="flex items-center justify-between pt-1">
                    {/* Simulated barcode */}
                    <div className="flex flex-col items-start">
                      <div className="flex items-center gap-0.5 h-6">
                        {Array.from({ length: 28 }).map((_, bIdx) => (
                          <div
                            key={bIdx}
                            className={`h-full bg-black ${bIdx % 3 === 0 ? "w-1" : "w-0.5"}`}
                          />
                        ))}
                      </div>
                      <span className="text-[9px] font-mono tracking-wider">{pkg.barcode}</span>
                    </div>

                    {/* Handling icons */}
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <span title="Верх / This Way Up" className="border border-black px-1.5 py-0.5 rounded text-[11px]">
                        ↑↑
                      </span>
                      <span title="Берегти від вологи / Keep Dry" className="border border-black px-1.5 py-0.5 rounded text-[11px]">
                        ☂
                      </span>
                      {pkg.grossWeightKg >= 20 && (
                        <span title="Важкий вантаж / Heavy" className="border border-black px-1 py-0.5 rounded text-[10px] bg-black text-white">
                          ≥20kg
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. SUB-TAB 4: LOGISTICS & VEHICLE SELECTION */}
      {activeSubTab === "transport" && (
        <div className="flex flex-col gap-6">
          {/* Vehicle Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {plan.vehicleUtilization.map(v => {
              const veh = v.vehicle;
              const isRecommended = plan.recommendedVehicle.id === veh.id;

              return (
                <div
                  key={veh.id}
                  className={`p-5 rounded-3xl tactile-card flex flex-col justify-between gap-4 transition-all ${
                    isRecommended
                      ? "ring-2 ring-[#2E7D32] bg-[#FAF7F2]"
                      : "bg-[#FAF7F2]/80 opacity-90"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Truck className={`w-4 h-4 ${isRecommended ? "text-[#2E7D32]" : "text-[#5A6778]"}`} />
                        <h4 className="text-xs font-extrabold text-[#1A2E3B]">{veh.name}</h4>
                      </div>
                      <p className="text-[11px] text-[#5A6778] mt-1">{veh.description}</p>
                    </div>

                    {isRecommended && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E1EDE3] text-[#1A3E26] border border-[#A6C7AE] whitespace-nowrap">
                        Рекомендовано
                      </span>
                    )}
                  </div>

                  {/* Meters for Weight, Volume, Pallets */}
                  <div className="flex flex-col gap-3 py-2 border-t border-b border-[#E8E2D8]">
                    {/* Weight Utilization */}
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-[#5A6778]">Завантаження по вазі:</span>
                        <span className="font-mono font-bold text-[#1A2E3B]">
                          {plan.totalGrossWeightKg} / {veh.cargoCapacityKg} кг ({v.weightPct}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[#EEE9E1] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            v.weightPct > 100 ? "bg-red-500" : "bg-[#2E7D32]"
                          }`}
                          style={{ width: `${Math.min(100, v.weightPct)}%` }}
                        />
                      </div>
                    </div>

                    {/* Volume Utilization */}
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-[#5A6778]">Завантаження по об'єму:</span>
                        <span className="font-mono font-bold text-[#1A2E3B]">
                          {plan.totalVolumeM3.toFixed(1)} / {veh.cargoVolumeM3} м³ ({v.volumePct}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[#EEE9E1] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            v.volumePct > 100 ? "bg-red-500" : "bg-[#4A7C9B]"
                          }`}
                          style={{ width: `${Math.min(100, v.volumePct)}%` }}
                        />
                      </div>
                    </div>

                    {/* Pallet slots */}
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-[#5A6778]">Місць під палети:</span>
                        <span className="font-mono font-bold text-[#1A2E3B]">
                          {plan.totalPalletsCount} / {veh.maxEuroPallets} палет ({v.palletsPct}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[#EEE9E1] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            v.palletsPct > 100 ? "bg-red-500" : "bg-[#DDA843]"
                          }`}
                          style={{ width: `${Math.min(100, v.palletsPct)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Dimensions of Cargo Bay */}
                  <div className="text-[11px] text-[#5A6778] flex flex-col gap-0.5">
                    <span className="font-semibold text-[#1A2E3B]">Габарити вантажного відсіку:</span>
                    <span className="font-mono">
                      {veh.cargoBayDimensionsMm.length / 1000} м × {veh.cargoBayDimensionsMm.width / 1000} м × {veh.cargoBayDimensionsMm.height / 1000} м
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Transportation & Freight Recommendations */}
          <div className="p-5 rounded-3xl tactile-card flex flex-col gap-3">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#1A2E3B] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#2E7D32]" />
              <span>Правила безпечного транспортування та кріплення вантажу</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs text-[#5A6778]">
              <div className="p-3 rounded-2xl bg-[#F3EFE7] flex flex-col gap-1">
                <span className="font-bold text-[#1A2E3B]">Розподіл по осях</span>
                <span>
                  Палету з важкими конекторами та метизами ({plan.pallets[0]?.grossWeightKg || 0} кг) необхідно розміщувати ближче до переднього борта над ведучою віссю.
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-[#F3EFE7] flex flex-col gap-1">
                <span className="font-bold text-[#1A2E3B]">Стяжні ремені (Ratchets)</span>
                <span>
                  Кожну палету необхідно зафіксувати в кузові мінімум двома текстильними ременями з храповим механізмом навантаженням не менше 2.5т.
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-[#F3EFE7] flex flex-col gap-1">
                <span className="font-bold text-[#1A2E3B]">Захист від опадів</span>
                <span>
                  Пиломатеріали та картонні коробки мають бути закриті тентом або додатково обгорнуті поліетиленовою плівкою при перевезенні відкритим бортом.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
