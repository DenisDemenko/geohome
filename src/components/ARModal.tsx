import React, { useState, useEffect } from "react";
import { DomeModel } from "../core/types";
import {
  generateDomeUSDZ,
  downloadUSDZ,
  generateARLink,
  generateARQRCode,
  USDZExportOptions
} from "../export/usdzExport";
import {
  Smartphone,
  QrCode,
  X,
  Download,
  Copy,
  Check,
  ExternalLink,
  Eye,
  Layers,
  Sparkles,
  Info,
  Maximize,
  Scan
} from "lucide-react";

interface ARModalProps {
  model: DomeModel;
  plywoodThickness: number;
  isOpen: boolean;
  onClose: () => void;
}

export const ARModal: React.FC<ARModalProps> = ({
  model,
  plywoodThickness,
  isOpen,
  onClose
}) => {
  const [scale, setScale] = useState<"1:1" | "1:10" | "1:20">("1:1");
  const [style, setStyle] = useState<"hybrid" | "beams" | "sheathing">("hybrid");
  const [sheathingStyle, setSheathingStyle] = useState<"colored" | "plywood">("colored");
  const [beamColorStyle, setBeamColorStyle] = useState<"types" | "timber">("timber");

  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const [arLink, setArLink] = useState<string>("");
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isGeneratingUSDZ, setIsGeneratingUSDZ] = useState<boolean>(false);
  const [usdzBlobUrl, setUsdzBlobUrl] = useState<string | null>(null);

  // Detect iOS/iPadOS for direct native 1-tap AR Quick Look button
  const [isAppleDevice, setIsAppleDevice] = useState<boolean>(false);

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      const ua = navigator.userAgent;
      const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      setIsAppleDevice(isIOS);
    }
  }, []);

  // Re-generate AR Link & QR Code whenever options change
  useEffect(() => {
    if (!isOpen) return;

    const link = generateARLink({
      diameter: model.parameters.diameter,
      frequency: model.parameters.frequency,
      cutType: model.parameters.cutType,
      thickness: plywoodThickness,
      style,
      scale
    });
    setArLink(link);

    generateARQRCode(link)
      .then(url => setQrCodeDataUrl(url))
      .catch(err => console.error("QR Code Error:", err));
  }, [
    isOpen,
    model.parameters.diameter,
    model.parameters.frequency,
    model.parameters.cutType,
    plywoodThickness,
    style,
    scale
  ]);

  // Generate USDZ blob URL for direct on-device AR preview
  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    generateDomeUSDZ(model, {
      scale,
      style,
      plywoodThickness,
      beamColorStyle,
      sheathingStyle
    })
      .then(blob => {
        if (!active) return;
        const url = URL.createObjectURL(blob);
        setUsdzBlobUrl(url);
      })
      .catch(err => console.error("USDZ blob generation error:", err));

    return () => {
      active = false;
      if (usdzBlobUrl) URL.revokeObjectURL(usdzBlobUrl);
    };
  }, [
    isOpen,
    model,
    scale,
    style,
    plywoodThickness,
    beamColorStyle,
    sheathingStyle
  ]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(arLink);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch (e) {
      console.error("Clipboard copy error:", e);
    }
  };

  const handleDownloadUSDZ = async () => {
    setIsGeneratingUSDZ(true);
    try {
      await downloadUSDZ(
        model,
        {
          scale,
          style,
          plywoodThickness,
          beamColorStyle,
          sheathingStyle
        }
      );
    } catch (err) {
      console.error("USDZ download error:", err);
    } finally {
      setIsGeneratingUSDZ(false);
    }
  };

  if (!isOpen) return null;

  const realDiameterM = (model.parameters.diameter / 1000).toFixed(1);
  const tabletopDiamCm = (model.parameters.diameter / 100).toFixed(0);
  const miniatureDiamCm = (model.parameters.diameter / 200).toFixed(0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl tactile-card bg-[#FAF7F2] border border-white/80 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#E8E2D8] bg-white/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-[#FDEFE7] text-[#DE7C5A] shadow-xs">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1A2E3B] flex items-center gap-2">
                <span>Перегляд в AR (Доповнена реальність)</span>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-[#E1EDE3] text-[#1B4D2E] rounded-md">
                  Apple USDZ
                </span>
              </h2>
              <p className="text-xs text-[#5A6778]">
                Швидкий огляд моделі купола у реальному просторі через камеру смартфона
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl tactile-btn text-[#8C9BAE] hover:text-[#1A2E3B] transition-all"
            title="Закрити"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto p-5 space-y-5 text-xs text-[#4A5568]">
          {/* Main Grid: QR Code Left + Settings Right */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
            {/* Left: QR Code Display Card */}
            <div className="md:col-span-5 flex flex-col items-center justify-center p-4 rounded-2xl bg-white border border-[#E8E2D8] shadow-sm">
              <div className="relative p-2 rounded-xl bg-white border border-[#DCD6CA] shadow-2xs group">
                {qrCodeDataUrl ? (
                  <img
                    src={qrCodeDataUrl}
                    alt="AR Quick Look QR Code"
                    className="w-48 h-48 sm:w-52 sm:h-52 object-contain rounded-lg"
                  />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center bg-slate-50 text-[#8C9BAE] animate-pulse rounded-lg">
                    Генерація QR-коду...
                  </div>
                )}
                {/* Visual scan frame overlay */}
                <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-[#DE7C5A] rounded-tl pointer-events-none" />
                <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-[#DE7C5A] rounded-tr pointer-events-none" />
                <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-[#DE7C5A] rounded-bl pointer-events-none" />
                <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-[#DE7C5A] rounded-br pointer-events-none" />
              </div>

              <div className="mt-3 text-center">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#E8F1F5] text-[#2C5D7A]">
                  <Scan className="w-3 h-3" />
                  <span>Наведіть камеру смартфона</span>
                </span>
                <p className="mt-1 text-[10px] text-[#8C9BAE]">
                  Підтримує iOS Safari (Apple AR Quick Look) та Android
                </p>
              </div>
            </div>

            {/* Right: AR Scale, Style & Action Controls */}
            <div className="md:col-span-7 flex flex-col gap-3.5">
              {/* Scale Selector */}
              <div>
                <label className="block text-xs font-bold text-[#1A2E3B] mb-1.5">
                  1. Масштаб відображення в просторі:
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setScale("1:1")}
                    className={`p-2 rounded-xl text-left border transition-all ${
                      scale === "1:1"
                        ? "bg-[#FDEFE7] border-[#DE7C5A] text-[#4A2411] font-bold shadow-2xs"
                        : "bg-white border-[#E8E2D8] hover:bg-slate-50 text-[#5A6778]"
                    }`}
                  >
                    <span className="block text-[11px] font-bold">1:1 Реальний</span>
                    <span className="block text-[10px] opacity-75">Ø {realDiameterM} м</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScale("1:10")}
                    className={`p-2 rounded-xl text-left border transition-all ${
                      scale === "1:10"
                        ? "bg-[#FDEFE7] border-[#DE7C5A] text-[#4A2411] font-bold shadow-2xs"
                        : "bg-white border-[#E8E2D8] hover:bg-slate-50 text-[#5A6778]"
                    }`}
                  >
                    <span className="block text-[11px] font-bold">1:10 Стіл</span>
                    <span className="block text-[10px] opacity-75">Ø {tabletopDiamCm} см</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScale("1:20")}
                    className={`p-2 rounded-xl text-left border transition-all ${
                      scale === "1:20"
                        ? "bg-[#FDEFE7] border-[#DE7C5A] text-[#4A2411] font-bold shadow-2xs"
                        : "bg-white border-[#E8E2D8] hover:bg-slate-50 text-[#5A6778]"
                    }`}
                  >
                    <span className="block text-[11px] font-bold">1:20 Макет</span>
                    <span className="block text-[10px] opacity-75">Ø {miniatureDiamCm} см</span>
                  </button>
                </div>
              </div>

              {/* Style Selector */}
              <div>
                <label className="block text-xs font-bold text-[#1A2E3B] mb-1.5">
                  2. Елементи для відображення в AR:
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setStyle("hybrid")}
                    className={`p-2 rounded-xl text-center border transition-all ${
                      style === "hybrid"
                        ? "bg-[#F9E8D2] border-[#DDA843] text-[#3A2A1A] font-bold shadow-2xs"
                        : "bg-white border-[#E8E2D8] hover:bg-slate-50 text-[#5A6778]"
                    }`}
                  >
                    <span className="block text-[11px]">Каркас + Фанера</span>
                    <span className="block text-[9px] opacity-75">{plywoodThickness} мм</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStyle("beams")}
                    className={`p-2 rounded-xl text-center border transition-all ${
                      style === "beams"
                        ? "bg-[#E1EDE3] border-[#5B9279] text-[#1B4D2E] font-bold shadow-2xs"
                        : "bg-white border-[#E8E2D8] hover:bg-slate-50 text-[#5A6778]"
                    }`}
                  >
                    <span className="block text-[11px]">Лише балки</span>
                    <span className="block text-[9px] opacity-75">Каркас</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStyle("sheathing")}
                    className={`p-2 rounded-xl text-center border transition-all ${
                      style === "sheathing"
                        ? "bg-[#FDEFE7] border-[#DE7C5A] text-[#4A2411] font-bold shadow-2xs"
                        : "bg-white border-[#E8E2D8] hover:bg-slate-50 text-[#5A6778]"
                    }`}
                  >
                    <span className="block text-[11px]">Лише обшивка</span>
                    <span className="block text-[9px] opacity-75">Купол цілком</span>
                  </button>
                </div>
              </div>

              {/* Texture Finishes */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-[#E8E2D8] text-[11px]">
                <span className="font-semibold text-[#1A2E3B]">Текстура панелей:</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSheathingStyle("colored")}
                    className={`px-2 py-0.5 rounded-lg font-medium transition-all ${
                      sheathingStyle === "colored"
                        ? "bg-[#1A2E3B] text-white font-bold"
                        : "text-[#5A6778] hover:bg-slate-100"
                    }`}
                  >
                    🎨 Кольори типів
                  </button>
                  <button
                    type="button"
                    onClick={() => setSheathingStyle("plywood")}
                    className={`px-2 py-0.5 rounded-lg font-medium transition-all ${
                      sheathingStyle === "plywood"
                        ? "bg-[#8B5E34] text-white font-bold"
                        : "text-[#5A6778] hover:bg-slate-100"
                    }`}
                  >
                    🪵 Фанера
                  </button>
                </div>
              </div>

              {/* Direct Native Apple Quick Look button (for iPhone/iPad users) */}
              {isAppleDevice && usdzBlobUrl && (
                <a
                  rel="ar"
                  href={usdzBlobUrl}
                  className="w-full py-2.5 px-4 text-xs font-bold text-white bg-gradient-to-r from-[#2C5D7A] to-[#1A3E26] hover:opacity-95 rounded-xl shadow-md flex items-center justify-center gap-2 transition-all transform active:scale-98"
                >
                  <Eye className="w-4 h-4" />
                  <span>Відкрити камеру AR на цьому iPhone / iPad</span>
                </a>
              )}
            </div>
          </div>

          {/* Action Buttons: Copy Link & Download USDZ */}
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#E8E2D8]">
            <button
              type="button"
              onClick={handleCopyLink}
              className={`flex-1 min-w-[170px] py-2 px-3 text-xs font-bold rounded-xl border transition-all flex items-center justify-center gap-1.5 ${
                isCopied
                  ? "bg-[#E1EDE3] border-[#5B9279] text-[#1B4D2E]"
                  : "bg-white border-[#DCD6CA] hover:bg-slate-50 text-[#1A2E3B] shadow-2xs"
              }`}
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-[#2E7D32]" /> : <Copy className="w-3.5 h-3.5 text-[#5A6778]" />}
              <span>{isCopied ? "Посилання скопійовано!" : "Копіювати посилання"}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadUSDZ}
              disabled={isGeneratingUSDZ}
              className="flex-1 min-w-[170px] py-2 px-3 text-xs font-bold rounded-xl bg-[#FAF0E4] hover:bg-[#F7E7D5] border border-[#DEB887] text-[#6E421F] shadow-2xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isGeneratingUSDZ ? "Експорт USDZ..." : "Завантажити .USDZ файл"}</span>
            </button>

            <a
              href={arLink}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2 px-3 text-xs font-semibold rounded-xl bg-white border border-[#DCD6CA] hover:bg-slate-50 text-[#5A6778] flex items-center gap-1 shadow-2xs"
              title="Переглянути AR сторінку в новій вкладці"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Тест у браузері</span>
            </a>
          </div>

          {/* Quick 3-Step Instruction Guide */}
          <div className="p-3.5 rounded-2xl bg-white/80 border border-[#E8E2D8] text-[11px] text-[#5A6778] space-y-1.5">
            <div className="font-bold text-[#1A2E3B] flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-[#DE7C5A]" />
              <span>Як переглянути купол у вашій кімнаті:</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 pl-1">
              <li>
                <b>iPhone / iPad:</b> Відкрийте стандартну Камеру, наведіть на QR-код і натисніть банер Safari. Safari автоматично запустить <b>Apple AR Quick Look</b>.
              </li>
              <li>
                <b>Android:</b> Відкрийте Google Об'єктив (Lens) або Камеру, перейдіть за посиланням у Chrome та натисніть «Переглянути у моєму просторі».
              </li>
              <li>
                Повільно проведіть смартфоном по підлозі чи столу — геодезичний купол з'явиться у масштабі {scale}!
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};
