import React, { useState, useRef } from "react";
import {
  AssemblyState,
  ASSEMBLY_STEPS,
  AssemblyElementsVisibility
} from "../core/assembly";
import {
  Play,
  Pause,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  GripHorizontal,
  Minimize2,
  Maximize2,
  X,
  Hammer,
  Info,
  ChevronDown,
  ChevronUp
} from "lucide-react";

interface Props {
  state: AssemblyState;
  visibility: AssemblyElementsVisibility;
  onChangeState: (updater: (prev: AssemblyState) => AssemblyState) => void;
  onSetStep: (stepNumber: number) => void;
  onClose?: () => void;
}

export function AssemblyControlBar({
  state,
  visibility,
  onChangeState,
  onSetStep,
  onClose
}: Props) {
  // Find current step info
  const currentStep =
    ASSEMBLY_STEPS.find(s => s.step === state.step) ||
    ASSEMBLY_STEPS[ASSEMBLY_STEPS.length - 1];

  // Dragging & Positioning State
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showTipDetails, setShowTipDetails] = useState(true);

  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    startX: number;
    startY: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null>(null);

  // Helper to compute drag bounds ONCE at drag start, eliminating stale closure and drift
  const calculateDragBounds = (currentStartX: number, currentStartY: number) => {
    const el = panelRef.current;
    if (!el || !el.parentElement) {
      return { minX: -1000, maxX: 1000, minY: -1000, maxY: 1000 };
    }

    const parentRect = el.parentElement.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    // The true un-transformed base top and left of the element relative to parent
    const baseLeft = elRect.left - currentStartX - parentRect.left;
    const baseTop = elRect.top - currentStartY - parentRect.top;
    const parentW = parentRect.width;
    const parentH = parentRect.height;
    const elW = elRect.width;
    const elH = elRect.height;

    // Allow generous free movement across mobile & desktop screens:
    // User can drag it so at least 60px of the handle stays visible inside the viewport
    const rawMinX = 8 - (baseLeft + elW - 60);
    const rawMaxX = parentW - 60 - baseLeft;
    const rawMinY = 6 - baseTop;
    const rawMaxY = parentH - 34 - baseTop;

    return {
      minX: Math.min(rawMinX, rawMaxX),
      maxX: Math.max(rawMinX, rawMaxX),
      minY: Math.min(rawMinY, rawMaxY),
      maxY: Math.max(rawMinY, rawMaxY)
    };
  };

  // Touch Drag Handlers (with window listeners for silky smooth drag)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const bounds = calculateDragBounds(offset.x, offset.y);

    dragStartRef.current = {
      clientX: touch.clientX,
      clientY: touch.clientY,
      startX: offset.x,
      startY: offset.y,
      ...bounds
    };
    setIsDragging(true);

    const onTouchMove = (ev: TouchEvent) => {
      if (!dragStartRef.current || ev.touches.length !== 1) return;
      if (ev.cancelable) ev.preventDefault();
      const t = ev.touches[0];
      const dx = t.clientX - dragStartRef.current.clientX;
      const dy = t.clientY - dragStartRef.current.clientY;

      const newX = dragStartRef.current.startX + dx;
      const newY = dragStartRef.current.startY + dy;

      const clampedX = Math.max(dragStartRef.current.minX, Math.min(dragStartRef.current.maxX, newX));
      const clampedY = Math.max(dragStartRef.current.minY, Math.min(dragStartRef.current.maxY, newY));

      setOffset({ x: clampedX, y: clampedY });
    };

    const onTouchEnd = () => {
      dragStartRef.current = null;
      setIsDragging(false);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };

    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
  };

  // Mouse Drag Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    const bounds = calculateDragBounds(offset.x, offset.y);
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startX: offset.x,
      startY: offset.y,
      ...bounds
    };
    setIsDragging(true);

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragStartRef.current) return;
      ev.preventDefault();
      const dx = ev.clientX - dragStartRef.current.clientX;
      const dy = ev.clientY - dragStartRef.current.clientY;

      const newX = dragStartRef.current.startX + dx;
      const newY = dragStartRef.current.startY + dy;

      const clampedX = Math.max(dragStartRef.current.minX, Math.min(dragStartRef.current.maxX, newX));
      const clampedY = Math.max(dragStartRef.current.minY, Math.min(dragStartRef.current.maxY, newY));

      setOffset({ x: clampedX, y: clampedY });
    };

    const onMouseUp = () => {
      dragStartRef.current = null;
      setIsDragging(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleTogglePlay = () => {
    onChangeState(prev => {
      const nextProgress = prev.progress >= 0.999 ? 0.05 : prev.progress;
      return {
        ...prev,
        isActive: true,
        progress: nextProgress,
        isPlaying: !prev.isPlaying
      };
    });
  };

  const handleReset = () => {
    onChangeState(prev => ({
      ...prev,
      progress: 0.05,
      step: 1,
      isPlaying: false
    }));
  };

  const handlePrevStep = () => {
    const prevStepNum = Math.max(1, state.step - 1);
    onSetStep(prevStepNum);
  };

  const handleNextStep = () => {
    const nextStepNum = Math.min(6, state.step + 1);
    onSetStep(nextStepNum);
  };

  const handleSpeedToggle = () => {
    onChangeState(prev => {
      const nextSpeed = prev.speed === 1 ? 2 : prev.speed === 2 ? 0.5 : 1;
      return { ...prev, speed: nextSpeed };
    });
  };

  return (
    <div
      ref={panelRef}
      style={{
        transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
        touchAction: "none"
      }}
      className={`absolute z-30 bottom-2.5 left-2 right-2 sm:bottom-4 sm:left-4 sm:right-4 sm:max-w-2xl sm:mx-auto flex flex-col gap-1.5 p-2 sm:p-3 rounded-2xl sm:rounded-3xl bg-[#FAF7F2]/95 backdrop-blur-md border border-[#E8E2D8] text-xs transition-shadow duration-150 select-none ${
        isDragging ? "shadow-2xl ring-2 ring-[#DE7C5A]/50 cursor-grabbing" : "shadow-lg"
      }`}
    >
      {/* 1. Header Drag Handle Bar (Затисніть для вільного переміщення пальцем або мишкою) */}
      <div
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className={`flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/5 hover:bg-black/10 select-none touch-none cursor-grab active:cursor-grabbing transition-colors ${
          isDragging ? "cursor-grabbing bg-[#DE7C5A]/20 ring-1 ring-[#DE7C5A]/50" : ""
        }`}
        title="Затисніть пальцем або мишкою і вільно рухайте вікно по всьому екрану"
      >
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#5A6778]">
          <GripHorizontal className="w-4 h-4 text-[#DE7C5A] shrink-0" />
          <span className="hidden sm:inline">Затисніть для переміщення вікна</span>
          <span className="sm:hidden text-[10px] font-bold text-[#1A2E3B]">Рухати вікно пальцем</span>
          {(offset.x !== 0 || offset.y !== 0) && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                setOffset({ x: 0, y: 0 });
              }}
              className="text-[10px] text-[#DE7C5A] hover:underline font-bold ml-1.5 px-1.5 py-0.5 rounded bg-white/80 border border-[#E8E2D8] cursor-pointer"
              title="Повернути панель у вихідне положення внизу"
            >
              Скинути
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Minimize / Expand Toggle Button */}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              setIsMinimized(!isMinimized);
            }}
            className="px-2 py-0.5 rounded-lg text-[#5A6778] hover:text-[#1A2E3B] bg-white/70 hover:bg-white border border-[#E8E2D8] transition-all flex items-center gap-1 text-[11px] font-bold cursor-pointer"
            title={isMinimized ? "Розгорнути повну панель збірки" : "Згорнути в компактну смужку"}
          >
            {isMinimized ? (
              <>
                <Maximize2 className="w-3 h-3 text-[#DE7C5A]" />
                <span className="text-[10px]">Розгорнути</span>
              </>
            ) : (
              <>
                <Minimize2 className="w-3 h-3 text-[#5A6778]" />
                <span className="text-[10px]">Згорнути</span>
              </>
            )}
          </button>

          {/* Close Button */}
          {onClose && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onClose();
              }}
              className="p-1 rounded-lg text-[#8C9BAE] hover:text-red-600 hover:bg-white/80 transition-all cursor-pointer"
              title="Закрити анімацію збірки"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Compact Minimized View (Лише необхідне, 90% екрану вільні для 3D огляду) */}
      {isMinimized ? (
        <div className="flex items-center justify-between gap-1.5 px-1 pt-0.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                handleTogglePlay();
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl font-bold text-xs shadow-xs text-white cursor-pointer ${
                state.isPlaying ? "bg-[#DE7C5A] hover:bg-[#C9603D]" : "bg-[#2E7D32] hover:bg-[#236327]"
              }`}
            >
              {state.isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current" />}
              <span>{state.isPlaying ? "Пауза" : "Пуск"}</span>
            </button>

            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                handlePrevStep();
              }}
              disabled={state.step <= 1}
              className="p-1 rounded-lg tactile-btn text-[#5A6778] disabled:opacity-30 cursor-pointer"
              title="Попередній крок"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono font-bold text-[11px] text-[#1A2E3B] whitespace-nowrap">
              {state.step}/6: {currentStep.shortName}
            </span>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                handleNextStep();
              }}
              disabled={state.step >= 6}
              className="p-1 rounded-lg tactile-btn text-[#5A6778] disabled:opacity-30 cursor-pointer"
              title="Наступний крок"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                handleSpeedToggle();
              }}
              className="px-1.5 py-0.5 rounded-lg tactile-btn font-mono font-bold text-[10px] text-[#5A6778]"
              title="Швидкість відтворення"
            >
              {state.speed}x
            </button>
            <span className="font-mono font-bold text-xs text-[#DE7C5A] bg-white px-2 py-0.5 rounded-lg border border-[#E8E2D8]">
              {Math.round(state.progress * 100)}%
            </span>
          </div>
        </div>
      ) : (
        /* 3. Full Expanded Controls View */
        <>
          {/* Top Row: Playback Controls, Step Chips, Speed, Reset */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 pb-1.5 border-b border-[#E8E2D8]">
            {/* Play / Pause / Reset Group */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  handleTogglePlay();
                }}
                className={`flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl font-bold transition-all shadow-xs cursor-pointer ${
                  state.isPlaying
                    ? "bg-[#DE7C5A] text-white hover:opacity-95"
                    : "bg-[#2E7D32] text-white hover:opacity-95"
                }`}
                title={state.isPlaying ? "Призупинити 3D анімацію" : "Запустити 3D анімацію збірки купола"}
              >
                {state.isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Пауза</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{state.progress >= 0.99 ? "Зібрати" : "Анімація"}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  handleReset();
                }}
                className="p-1 sm:p-1.5 rounded-xl tactile-btn text-[#5A6778] hover:text-[#1A2E3B] cursor-pointer"
                title="Скинути на початок (до фундаменту)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  handleSpeedToggle();
                }}
                className="px-2 py-1 rounded-xl tactile-btn font-mono font-bold text-[11px] text-[#5A6778] hover:text-[#1A2E3B] cursor-pointer"
                title="Швидкість відтворення"
              >
                {state.speed}x
              </button>
            </div>

            {/* Step Selector Pills (1 to 6) - with smooth horizontal scroll and no wrap */}
            <div className="flex items-center gap-1 overflow-x-auto max-w-full py-0.5 no-scrollbar">
              {ASSEMBLY_STEPS.map(s => {
                const isCurrent = state.step === s.step;
                return (
                  <button
                    key={`step-btn-${s.step}`}
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onSetStep(s.step);
                    }}
                    className={`flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-xl text-[10px] sm:text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                      isCurrent
                        ? "bg-[#1A2E3B] text-white shadow-xs"
                        : "bg-white hover:bg-[#F4EFEB] text-[#5A6778] border border-[#E8E2D8]"
                    }`}
                    title={s.description}
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${
                        isCurrent ? "bg-white/20 text-white" : "bg-[#FAF7F2] text-[#8C9BAE]"
                      }`}
                    >
                      {s.step}
                    </span>
                    <span>{s.shortName}</span>
                  </button>
                );
              })}
            </div>

            {/* Prev / Next navigation buttons */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  handlePrevStep();
                }}
                disabled={state.step <= 1}
                className="p-1 sm:p-1.5 rounded-xl tactile-btn text-[#5A6778] disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                title="Попередній крок"
              >
                <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <span className="font-mono font-bold text-[11px] text-[#1A2E3B] px-1">
                {state.step}/6
              </span>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  handleNextStep();
                }}
                disabled={state.step >= 6}
                className="p-1 sm:p-1.5 rounded-xl tactile-btn text-[#5A6778] disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                title="Наступний крок"
              >
                <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>

          {/* Middle Row: Continuous Progress Slider (0% - 100%) */}
          <div className="flex flex-col gap-0.5 pt-0.5">
            <div className="flex justify-between items-center text-[10px] sm:text-[11px] font-semibold text-[#5A6778]">
              <span className="flex items-center gap-1.5 text-[#1A2E3B] font-bold">
                <Hammer className="w-3.5 h-3.5 text-[#DE7C5A]" />
                Прогрес монтажу купола:
              </span>
              <span className="font-mono font-bold text-[#DE7C5A] text-xs">
                {Math.round(state.progress * 100)}%
              </span>
            </div>

            <div className="relative flex items-center">
              <input
                type="range"
                min="0.05"
                max="1.0"
                step="0.005"
                value={state.progress}
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  let inferredStep = 1;
                  for (const s of ASSEMBLY_STEPS) {
                    if (val >= s.targetProgress - 0.08) inferredStep = s.step;
                  }
                  onChangeState(prev => ({
                    ...prev,
                    isActive: true,
                    progress: val,
                    step: inferredStep,
                    isPlaying: false
                  }));
                }}
                className="w-full h-1.5 sm:h-2 rounded-lg bg-[#E8E2D8] accent-[#DE7C5A] cursor-pointer"
              />
            </div>

            {/* Step Tick Marks on Progress Bar */}
            <div className="flex justify-between text-[9px] sm:text-[10px] font-mono text-[#8C9BAE] px-0.5">
              <span>0% Фундамент</span>
              <span className="hidden xs:inline">35% Базовий</span>
              <span>55% Середній</span>
              <span className="hidden xs:inline">72% Вершина</span>
              <span>88% Обшивка</span>
              <span>100%</span>
            </div>
          </div>

          {/* Bottom Row: Detailed Engineering Information & Metrics */}
          <div className="mt-0.5 p-2 sm:p-2.5 rounded-2xl bg-white border border-[#E8E2D8] flex flex-col gap-1.5 text-xs">
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-[#E1EDE3] text-[#1A3E26]">
                  {currentStep.name}
                </span>
                <span className="text-[10px] sm:text-[11px] font-medium text-[#5A6778] line-clamp-1">
                  {currentStep.description}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowTipDetails(!showTipDetails)}
                className="text-[10px] text-[#5A6778] hover:text-[#1A2E3B] flex items-center gap-0.5 shrink-0"
              >
                <span>{showTipDetails ? "Сховати" : "Деталі"}</span>
                {showTipDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>

            {showTipDetails && (
              <div className="flex items-start gap-1.5 text-[10px] sm:text-[11px] text-[#2E7D32] bg-[#F4F9F5] p-1.5 rounded-xl border border-[#D4EDDA]">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="italic leading-tight">{currentStep.constructionTip}</span>
              </div>
            )}

            {/* Real-time Installed Elements Metric Badges - Single 4-column responsive grid */}
            <div className="grid grid-cols-4 gap-1 pt-0.5">
              <div className="px-1.5 py-1 rounded-xl bg-[#FAF7F2] border border-[#E8E2D8] flex flex-col items-center text-center">
                <span className="text-[8px] text-[#8C9BAE] uppercase">Янкери</span>
                <span className="font-mono font-bold text-[#1A2E3B] text-[10px] sm:text-[11px]">
                  {visibility.stats.installedAnchors} шт
                </span>
              </div>

              <div className="px-1.5 py-1 rounded-xl bg-[#FAF7F2] border border-[#E8E2D8] flex flex-col items-center text-center">
                <span className="text-[8px] text-[#8C9BAE] uppercase">Балки</span>
                <span className="font-mono font-bold text-[#2E7D32] text-[10px] sm:text-[11px]">
                  {visibility.stats.installedBeams}/{visibility.stats.totalBeams}
                </span>
              </div>

              <div className="px-1.5 py-1 rounded-xl bg-[#FAF7F2] border border-[#E8E2D8] flex flex-col items-center text-center">
                <span className="text-[8px] text-[#8C9BAE] uppercase">Панелі</span>
                <span className="font-mono font-bold text-[#DE7C5A] text-[10px] sm:text-[11px]">
                  {visibility.stats.installedPanels}/{visibility.stats.totalPanels}
                </span>
              </div>

              <div className="px-1.5 py-1 rounded-xl bg-[#FAF7F2] border border-[#E8E2D8] flex flex-col items-center text-center">
                <span className="text-[8px] text-[#8C9BAE] uppercase">Вага</span>
                <span className="font-mono font-bold text-[#4A7C9B] text-[10px] sm:text-[11px]">
                  {visibility.stats.installedWeightKg} кг
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
