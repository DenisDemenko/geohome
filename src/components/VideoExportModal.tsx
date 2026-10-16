import React, { useState, useEffect, useRef } from "react";
import {
  Film,
  Play,
  Square,
  Download,
  Settings2,
  Sparkles,
  Layers,
  Sun,
  RotateCw,
  Camera,
  X,
  CheckCircle2,
  Clock,
  Video,
  Monitor,
  Share2,
  Maximize2
} from "lucide-react";
import { DomeModel } from "../core/types";

export type AnimationType = "orbit_360" | "assembly_timelapse" | "exploded_view" | "sun_path";

export interface VideoExportOptions {
  type: AnimationType;
  durationSeconds: number;
  fps: number;
  includeTitleOverlay: boolean;
  resolutionMultiplier: number;
}

interface VideoExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  model: DomeModel;
  onStartRecording: (options: VideoExportOptions) => void;
  onStopRecording: () => void;
  isRecording: boolean;
  recordingProgress: number; // 0 to 100
  recordedVideoUrl: string | null;
  onTakeHighResSnapshot: (multiplier?: number) => void;
}

export const VideoExportModal: React.FC<VideoExportModalProps> = ({
  isOpen,
  onClose,
  model,
  onStartRecording,
  onStopRecording,
  isRecording,
  recordingProgress,
  recordedVideoUrl,
  onTakeHighResSnapshot
}) => {
  const [animationType, setAnimationType] = useState<AnimationType>("orbit_360");
  const [durationSeconds, setDurationSeconds] = useState<number>(10);
  const [fps, setFps] = useState<number>(30);
  const [includeTitleOverlay, setIncludeTitleOverlay] = useState<boolean>(true);
  const [snapshotSuccess, setSnapshotSuccess] = useState<boolean>(false);

  // Reset snapshot feedback
  useEffect(() => {
    if (snapshotSuccess) {
      const timer = setTimeout(() => setSnapshotSuccess(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [snapshotSuccess]);

  if (!isOpen) return null;

  const handleStart = () => {
    onStartRecording({
      type: animationType,
      durationSeconds,
      fps,
      includeTitleOverlay,
      resolutionMultiplier: 1.0
    });
  };

  const handleSnapshotClick = (mult: number) => {
    onTakeHighResSnapshot(mult);
    setSnapshotSuccess(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-[#FAF7F2] rounded-3xl border border-white/80 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E2D8] bg-white/70 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#DE7C5A] to-[#E5A352] flex items-center justify-center text-white shadow-sm">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#1A2E3B] flex items-center gap-2">
                <span>Анімація та Експорт Відео 3D</span>
                <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-full bg-[#E1EDE3] text-[#1B4D2E] border border-[#C5DEC9]">
                  HD / 60 FPS
                </span>
              </h2>
              <p className="text-xs text-[#6B7280]">
                Створення відеороликів, кінематографічного обльоту та знімків для клієнтів і соцмереж
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isRecording}
            className="p-2 text-[#64748B] hover:text-[#1E293B] hover:bg-black/5 rounded-2xl transition-all cursor-pointer disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* Active Recording State Banner */}
          {isRecording && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-[#EA580C] to-[#DE7C5A] text-white shadow-lg animate-pulse flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-3.5 h-3.5 rounded-full bg-white animate-ping" />
                  <span className="font-bold text-sm tracking-wide">
                    ЙДЕ ЗАПИС ВІДЕО В РЕАЛЬНОМУ ЧАСІ...
                  </span>
                </div>
                <span className="font-mono font-bold text-sm bg-black/25 px-2.5 py-0.5 rounded-xl">
                  {Math.round(recordingProgress)}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-black/25 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-white h-full rounded-full transition-all duration-150 ease-out"
                  style={{ width: `${recordingProgress}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-white/90">
                <span>Будь ласка, зачекайте завершення обльоту камери</span>
                <button
                  type="button"
                  onClick={onStopRecording}
                  className="px-3 py-1 bg-white text-[#EA580C] hover:bg-white/90 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>Зупинити зараз</span>
                </button>
              </div>
            </div>
          )}

          {/* Recorded Video Preview Result */}
          {recordedVideoUrl && !isRecording && (
            <div className="p-4 rounded-2xl bg-[#E1EDE3] border border-[#A7CCA9] space-y-3 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#1B4D2E] font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-[#2E7D32]" />
                  <span>Відео успішно записано та готове до завантаження!</span>
                </div>
                <a
                  href={recordedVideoUrl}
                  download={`geodome-${animationType}-${model.parameters.diameter}mm.webm`}
                  className="px-3.5 py-1.5 bg-[#2E7D32] hover:bg-[#1B4D2E] text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Завантажити файл (.webm)</span>
                </a>
              </div>

              <div className="rounded-xl overflow-hidden border border-black/10 bg-black aspect-video max-h-56 flex items-center justify-center">
                <video
                  src={recordedVideoUrl}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          )}

          {/* Mode Selector */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#5A6778] mb-2.5 block">
              1. Оберіть тип анімації для запису
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Option: 360 Orbit */}
              <button
                type="button"
                disabled={isRecording}
                onClick={() => setAnimationType("orbit_360")}
                className={`p-3.5 rounded-2xl text-left border transition-all flex items-start gap-3 cursor-pointer ${
                  animationType === "orbit_360"
                    ? "bg-white border-[#DE7C5A] shadow-md ring-2 ring-[#DE7C5A]/30"
                    : "bg-white/60 hover:bg-white border-[#E8E2D8] hover:border-[#DCD6CA]"
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    animationType === "orbit_360"
                      ? "bg-[#DE7C5A] text-white"
                      : "bg-[#F3EFE6] text-[#8B5E34]"
                  }`}
                >
                  <RotateCw className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#1A2E3B] flex items-center gap-1.5">
                    <span>360° Кінематографічний тур</span>
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                      Популярне
                    </span>
                  </div>
                  <p className="text-[11px] text-[#6B7280] mt-0.5 leading-snug">
                    Плавний круговий обліт камерою купола з кінематографічною зміною кута нахилу.
                  </p>
                </div>
              </button>

              {/* Option: Assembly Timelapse */}
              <button
                type="button"
                disabled={isRecording}
                onClick={() => setAnimationType("assembly_timelapse")}
                className={`p-3.5 rounded-2xl text-left border transition-all flex items-start gap-3 cursor-pointer ${
                  animationType === "assembly_timelapse"
                    ? "bg-white border-[#5B9279] shadow-md ring-2 ring-[#5B9279]/30"
                    : "bg-white/60 hover:bg-white border-[#E8E2D8] hover:border-[#DCD6CA]"
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    animationType === "assembly_timelapse"
                      ? "bg-[#5B9279] text-white"
                      : "bg-[#EBF3ED] text-[#2C6246]"
                  }`}
                >
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#1A2E3B]">
                    Таймлапс збирання каркасу
                  </div>
                  <p className="text-[11px] text-[#6B7280] mt-0.5 leading-snug">
                    Послідовне будівництво: фундамент, ряди балок, конектори, замки та обшивка з титрами.
                  </p>
                </div>
              </button>

              {/* Option: Exploded View */}
              <button
                type="button"
                disabled={isRecording}
                onClick={() => setAnimationType("exploded_view")}
                className={`p-3.5 rounded-2xl text-left border transition-all flex items-start gap-3 cursor-pointer ${
                  animationType === "exploded_view"
                    ? "bg-white border-[#4A7C9B] shadow-md ring-2 ring-[#4A7C9B]/30"
                    : "bg-white/60 hover:bg-white border-[#E8E2D8] hover:border-[#DCD6CA]"
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    animationType === "exploded_view"
                      ? "bg-[#4A7C9B] text-white"
                      : "bg-[#EAF1F5] text-[#27536F]"
                  }`}
                >
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#1A2E3B]">
                    Вибух-схема (Exploded View)
                  </div>
                  <p className="text-[11px] text-[#6B7280] mt-0.5 leading-snug">
                    Динамічний радіальний розліт обшивки та балок назовні для показу багатошаровості.
                  </p>
                </div>
              </button>

              {/* Option: Sun Path Simulation */}
              <button
                type="button"
                disabled={isRecording}
                onClick={() => setAnimationType("sun_path")}
                className={`p-3.5 rounded-2xl text-left border transition-all flex items-start gap-3 cursor-pointer ${
                  animationType === "sun_path"
                    ? "bg-white border-[#D97706] shadow-md ring-2 ring-[#D97706]/30"
                    : "bg-white/60 hover:bg-white border-[#E8E2D8] hover:border-[#DCD6CA]"
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    animationType === "sun_path"
                      ? "bg-[#D97706] text-white"
                      : "bg-[#FEF3C7] text-[#92400E]"
                  }`}
                >
                  <Sun className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#1A2E3B]">
                    Хід сонця та гра тіней
                  </div>
                  <p className="text-[11px] text-[#6B7280] mt-0.5 leading-snug">
                    Симуляція сонячного дня (ранок, полудень, захід) з реалістичними падаючими тінями.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Animation & Video Recording Settings */}
          <div className="p-4 rounded-2xl bg-white/70 border border-[#E8E2D8] space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#1A2E3B]">
              <Settings2 className="w-4 h-4 text-[#8B5E34]" />
              <span>Параметри відеоролика</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Duration */}
              <div>
                <label className="text-[11px] font-semibold text-[#5A6778] mb-1.5 block">
                  Тривалість:
                </label>
                <div className="flex items-center gap-1.5">
                  {[5, 10, 15].map(sec => (
                    <button
                      key={sec}
                      type="button"
                      disabled={isRecording}
                      onClick={() => setDurationSeconds(sec)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                        durationSeconds === sec
                          ? "bg-[#1A2E3B] text-white shadow-xs"
                          : "bg-white border border-[#DCD6CA] text-[#4A5568] hover:bg-[#F3EFE6]"
                      }`}
                    >
                      {sec} сек
                    </button>
                  ))}
                </div>
              </div>

              {/* Framerate */}
              <div>
                <label className="text-[11px] font-semibold text-[#5A6778] mb-1.5 block">
                  Частота кадрів:
                </label>
                <div className="flex items-center gap-1.5">
                  {[30, 60].map(val => (
                    <button
                      key={val}
                      type="button"
                      disabled={isRecording}
                      onClick={() => setFps(val)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                        fps === val
                          ? "bg-[#1A2E3B] text-white shadow-xs"
                          : "bg-white border border-[#DCD6CA] text-[#4A5568] hover:bg-[#F3EFE6]"
                      }`}
                    >
                      {val} FPS
                    </button>
                  ))}
                </div>
              </div>

              {/* Overlay Toggle */}
              <div>
                <label className="text-[11px] font-semibold text-[#5A6778] mb-1.5 block">
                  Титр проекту:
                </label>
                <button
                  type="button"
                  disabled={isRecording}
                  onClick={() => setIncludeTitleOverlay(!includeTitleOverlay)}
                  className={`w-full py-1.5 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    includeTitleOverlay
                      ? "bg-[#5B9279] text-white shadow-xs font-bold"
                      : "bg-white border border-[#DCD6CA] text-[#5A6778]"
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{includeTitleOverlay ? "Включено" : "Без титрів"}</span>
                </button>
              </div>
            </div>

            {/* Title preview chip */}
            {includeTitleOverlay && (
              <div className="p-2.5 rounded-xl bg-[#FAF7F2] border border-[#E8E2D8] flex items-center justify-between text-[11px] text-[#5A6778]">
                <span>
                  <b>Титр у відео:</b> «КуполГео V{model.parameters.frequency} · Ø{(model.parameters.diameter / 1000).toFixed(1)}м · {model.statistics?.edges || model.edges.length} балок · {((model.statistics?.floorAreaM2) || (Math.PI * Math.pow(model.parameters.diameter / 2000, 2))).toFixed(1)} м²»
                </span>
                <span className="text-[10px] text-[#8C9BAE] shrink-0 font-mono">FullHD</span>
              </div>
            )}
          </div>

          {/* High-Resolution Screenshot Section */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-[#F0FDF4] to-[#ECFDF5] border border-[#A7F3D0] flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#059669] text-white flex items-center justify-center shrink-0">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-[#065F46] flex items-center gap-1.5">
                  <span>Миттєвий знімок у надвисокій якості (4K Snapshot)</span>
                  {snapshotSuccess && (
                    <span className="text-[10px] font-bold text-[#059669] animate-bounce">
                      ✓ Збережено!
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#047857]">
                  Збереження поточного 3D-ракурсу у форматі PNG без водяних знаків для звітів і друку
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => handleSnapshotClick(1.5)}
                className="flex-1 sm:flex-initial px-3 py-1.5 bg-white hover:bg-[#F0FDF4] border border-[#6EE7B7] text-[#065F46] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition-all"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>2K Фото</span>
              </button>
              <button
                type="button"
                onClick={() => handleSnapshotClick(2.5)}
                className="flex-1 sm:flex-initial px-3.5 py-1.5 bg-[#059669] hover:bg-[#047857] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-all"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>4K Ultra</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer / Actions */}
        <div className="px-5 py-4 border-t border-[#E8E2D8] bg-white/70 backdrop-blur-md flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isRecording}
            className="px-4 py-2 text-xs font-bold text-[#5A6778] hover:text-[#1A2E3B] hover:bg-black/5 rounded-xl transition-all cursor-pointer disabled:opacity-40"
          >
            Закрити
          </button>

          <div className="flex items-center gap-2.5">
            {isRecording ? (
              <button
                type="button"
                onClick={onStopRecording}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-2 shadow-md cursor-pointer transition-all animate-pulse"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>Зупинити запис</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStart}
                className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-[#DE7C5A] via-[#E5A352] to-[#DE7C5A] hover:opacity-95 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-[#DE7C5A]/25 cursor-pointer transition-all transform active:scale-95"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Запустити анімацію та записати відео ({durationSeconds} сек)</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
