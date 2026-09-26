import React, { useState, useEffect, useMemo } from "react";
import { generateDome } from "../core/dome";
import { DEFAULT_BEAM_PROFILES } from "../core/beams";
import { DEFAULT_CONNECTOR_PARAMS } from "../core/connectors";
import { DEFAULT_SHEATHING_PARAMS } from "../core/sheathing";
import { generateDomeUSDZ, downloadUSDZ } from "../export/usdzExport";
import { Viewer3D } from "./Viewer3D";
import {
  Smartphone,
  Eye,
  Download,
  RotateCw,
  Layers,
  ArrowLeft,
  CheckCircle,
  Sparkles,
  Info
} from "lucide-react";

export const MobileARViewer: React.FC = () => {
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);

  const diameter = Number(searchParams.get("d")) || 4000;
  const frequency = (Number(searchParams.get("f")) || 3) as any;
  const cutType = (searchParams.get("cut") || "1/2") as any;
  const initialThickness = Number(searchParams.get("th")) || 12;
  const initialStyle = (searchParams.get("style") || "hybrid") as "hybrid" | "beams" | "sheathing";
  const initialScale = (searchParams.get("scale") || "1:1") as "1:1" | "1:10" | "1:20";

  const [scale, setScale] = useState<"1:1" | "1:10" | "1:20">(initialScale);
  const [style, setStyle] = useState<"hybrid" | "beams" | "sheathing">(initialStyle);
  const [plywoodThickness, setPlywoodThickness] = useState<number>(initialThickness);

  const [usdzBlobUrl, setUsdzBlobUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(true);

  // Build model
  const domeModel = useMemo(() => {
    return generateDome(
      {
        diameter,
        frequency,
        cutType,
        height: Math.round(diameter / 2),
        levelBaseHorizon: true,
        levelingMode: "flat_ring"
      },
      DEFAULT_BEAM_PROFILES[0],
      DEFAULT_CONNECTOR_PARAMS,
      {
        ...DEFAULT_SHEATHING_PARAMS,
        thickness: plywoodThickness
      }
    );
  }, [diameter, frequency, cutType, plywoodThickness]);

  // Generate USDZ for Apple AR Quick Look
  useEffect(() => {
    let active = true;
    setIsGenerating(true);

    generateDomeUSDZ(domeModel, {
      scale,
      style,
      plywoodThickness,
      beamColorStyle: "timber",
      sheathingStyle: "plywood"
    })
      .then(blob => {
        if (!active) return;
        const url = URL.createObjectURL(blob);
        setUsdzBlobUrl(url);
        setIsGenerating(false);
      })
      .catch(err => {
        console.error("USDZ generation error:", err);
        setIsGenerating(false);
      });

    return () => {
      active = false;
      if (usdzBlobUrl) URL.revokeObjectURL(usdzBlobUrl);
    };
  }, [domeModel, scale, style, plywoodThickness]);

  const handleExitAR = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("ar");
    window.location.href = url.pathname;
  };

  const realDiameterM = (diameter / 1000).toFixed(1);
  const tabletopDiamCm = (diameter / 100).toFixed(0);

  return (
    <div className="min-h-screen bg-[#F4EFEA] flex flex-col text-[#1A2E3B]">
      {/* Top Header */}
      <header className="p-4 bg-white/90 backdrop-blur-md border-b border-[#E8E2D8] flex items-center justify-between sticky top-0 z-30 shadow-2xs">
        <button
          onClick={handleExitAR}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#5A6778] hover:text-[#1A2E3B] px-2.5 py-1.5 rounded-xl tactile-btn"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>До конструктора</span>
        </button>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl flex items-center justify-center bg-[#FDEFE7] text-[#DE7C5A]">
            <Smartphone className="w-4 h-4" />
          </div>
          <span className="font-bold text-xs">AR Quick Look · {frequency}V</span>
        </div>
      </header>

      {/* Main Action Banner: Launch Camera in AR */}
      <div className="p-4 bg-gradient-to-b from-white to-[#F9F6F0] border-b border-[#E8E2D8]">
        <div className="max-w-md mx-auto text-center space-y-3">
          <h1 className="text-lg font-bold text-[#1A2E3B]">
            Перегляд купола {frequency}V у вашому просторі
          </h1>
          <p className="text-xs text-[#5A6778]">
            Діаметр {realDiameterM} м · Масштаб {scale === "1:1" ? "1:1 (Реальний)" : "1:10 (Стіл)"}
          </p>

          {/* Primary AR Launch Button */}
          {usdzBlobUrl ? (
            <a
              rel="ar"
              href={usdzBlobUrl}
              className="inline-flex items-center justify-center gap-2.5 w-full py-3.5 px-6 text-sm font-bold text-white bg-gradient-to-r from-[#DE7C5A] to-[#C9603D] hover:opacity-95 rounded-2xl shadow-lg transform active:scale-98 transition-all animate-pulse"
            >
              <Eye className="w-5 h-5" />
              <span>Торкніться, щоб відкрити в AR через камеру</span>
            </a>
          ) : (
            <div className="w-full py-3.5 px-6 text-sm font-bold text-[#8C9BAE] bg-slate-100 rounded-2xl animate-pulse">
              Підготовка 3D AR моделі...
            </div>
          )}

          {/* Scale toggles */}
          <div className="flex items-center justify-center gap-2 pt-1 text-xs">
            <span className="text-[11px] text-[#5A6778] font-semibold">Масштаб:</span>
            <button
              onClick={() => setScale("1:1")}
              className={`px-3 py-1 rounded-xl font-bold transition-all ${
                scale === "1:1"
                  ? "bg-[#1A2E3B] text-white shadow-2xs"
                  : "bg-white text-[#5A6778] border border-[#DCD6CA]"
              }`}
            >
              1:1 Реальний ({realDiameterM} м)
            </button>
            <button
              onClick={() => setScale("1:10")}
              className={`px-3 py-1 rounded-xl font-bold transition-all ${
                scale === "1:10"
                  ? "bg-[#1A2E3B] text-white shadow-2xs"
                  : "bg-white text-[#5A6778] border border-[#DCD6CA]"
              }`}
            >
              1:10 Стіл ({tabletopDiamCm} см)
            </button>
          </div>
        </div>
      </div>

      {/* Interactive 3D Canvas Preview on mobile */}
      <div className="flex-1 relative min-h-[360px]">
        <Viewer3D
          model={domeModel}
          selectedNodeId={null}
          selectedEdgeId={null}
          selectedFaceId={null}
          onSelectNode={() => {}}
          onSelectEdge={() => {}}
          onSelectFace={() => {}}
        />
      </div>

      {/* Bottom Footer Actions */}
      <footer className="p-4 bg-white/95 border-t border-[#E8E2D8] flex items-center justify-between text-xs text-[#5A6778]">
        <button
          onClick={() => downloadUSDZ(domeModel, { scale, style, plywoodThickness })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#DCD6CA] bg-white font-semibold text-[#1A2E3B] shadow-2xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Завантажити .USDZ</span>
        </button>

        <span className="text-[11px] text-[#8C9BAE]">
          Підтримує iOS Quick Look та WebXR
        </span>
      </footer>
    </div>
  );
};
