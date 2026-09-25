import React from "react";
import { DomeModel, NodeId } from "../core/types";
import { calculateConnector } from "../core/connectors";
import { calculateSheetNesting } from "../core/sheathing";
import {
  generateConnectorSVG,
  generateSheathingNestingSVG,
  generateSheathingCNC_DXF,
  generateBeamBlueprintsSVG,
  generateDome2DProjectionSVG,
  downloadFile
} from "../export/svgExport";
import { exportDomeOBJ } from "../export/objExport";
import { exportDomeSTEP } from "../export/stepExport";
import { exportDomeSTL } from "../export/stlExport";
import {
  exportDomeSpecificationPDF,
  exportSheathingNestingPDF
} from "../export/pdfExport";
import {
  Download,
  FileCode,
  Box,
  Layers,
  FileSpreadsheet,
  CheckCircle,
  FileText,
  Printer,
  Sparkles,
  Cpu,
  BookOpen
} from "lucide-react";

interface ExportPanelProps {
  model: DomeModel;
  selectedNodeId: NodeId | null;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({ model, selectedNodeId }) => {
  const activeNodeId = selectedNodeId !== null ? selectedNodeId : model.nodes[0]?.id || 0;
  const activeNode = model.nodes.find(n => n.id === activeNodeId) || model.nodes[0];

  // 1. Export Connector SVG
  const handleExportConnectorSVG = () => {
    if (!activeNode) return;
    const connector = calculateConnector(model, activeNode.id);
    const svg = generateConnectorSVG(connector, model);
    downloadFile(`connector_node_${activeNode.id}.svg`, svg);
  };

  // 2. Export Sheathing CNC SVG
  const handleExportSheathingSVG = () => {
    const nesting = calculateSheetNesting(model, 2800, 1250, 6);
    const svg = generateSheathingNestingSVG(nesting, 0);
    downloadFile(`sheathing_cnc_sheet_1_2800x1250_D6mm.svg`, svg);
  };

  // 2b. Export Sheathing CNC PDF Album
  const handleExportSheathingPDF = () => {
    const nesting = calculateSheetNesting(model, 2800, 1250, 6);
    exportSheathingNestingPDF(model, nesting);
  };

  // 2c. Export Sheathing CNC DXF
  const handleExportSheathingDXF = () => {
    const nesting = calculateSheetNesting(model, 2800, 1250, 6);
    const dxf = generateSheathingCNC_DXF(nesting, 0);
    downloadFile(`sheathing_cnc_sheet_1_2800x1250_D6mm.dxf`, dxf, "application/dxf");
  };

  // 3. Export Beam Blueprints SVG
  const handleExportBeamBlueprintsSVG = () => {
    const svg = generateBeamBlueprintsSVG(model);
    downloadFile(`beam_blueprints_${model.parameters.frequency}V.svg`, svg);
  };

  // 4. Export Plan Projection SVG
  const handleExportPlanSVG = () => {
    const svg = generateDome2DProjectionSVG(model);
    downloadFile(`dome_plan_projection_${model.parameters.frequency}V.svg`, svg);
  };

  // 5. Export 3D OBJ
  const handleExportOBJ = () => {
    const objContent = exportDomeOBJ(model);
    downloadFile(`geodesic_dome_${model.parameters.frequency}V.obj`, objContent, "text/plain");
  };

  // 6. Export 3D STEP
  const handleExportSTEP = () => {
    const stepContent = exportDomeSTEP(model);
    downloadFile(`geodesic_dome_${model.parameters.frequency}V.stp`, stepContent, "application/step");
  };

  // 7. Export 3D STL
  const handleExportSTL = () => {
    const stlContent = exportDomeSTL(model);
    downloadFile(`geodesic_dome_${model.parameters.frequency}V.stl`, stlContent, "application/sla");
  };

  // 8. Export CSV BOM
  const handleExportBOM = () => {
    const hubDiam = model.connectorParams.hubDiameter || 140;
    const hubRad = hubDiam / 2;
    const lines = [
      "Тип елемента;Марка;Кількість (шт);До вузла сходження (мм);Обрізаний під конектор (мм);Відступ кільця конектора (мм);Матеріал;Примітка",
      ...model.beamGroups.map(g => {
        const netCut = g.cutLength || Math.max(10, Math.round(g.length - hubDiam));
        return `Балка каркаса;Тип ${g.type};${g.count};${g.length};${netCut};-${hubRad} мм з торця (Ø${hubDiam});${model.beamProfile.name};${g.isBaseBeam ? "Основа Z=0" : "Сфера"}`;
      }),
      ...model.faceGroups.map(
        f => `Панель обшивки;Грань ${f.type};${f.count};${f.lengths.join("x")};${f.lengths.join("x")};—;Фанера / OSB;${f.area} м2/шт`
      ),
      `Конектори;Сталеві зірочки Thunder Domes;${model.nodes.length};Ø${hubDiam};Ø${hubDiam};Маточина Ø${hubDiam}мм;Сталь ${model.connectorParams.thickness}мм;Лазерний розкрій`,
      `Кріплення;Болти М${model.connectorParams.boltDiameter};${model.edges.length * 4};70;70;—;Оцинкована сталь DIN 933;З шайбами та гайками DIN 985`
    ];

    const csvContent = "\uFEFF" + lines.join("\n");
    downloadFile(`kupolgeo_bom_${model.parameters.frequency}V.csv`, csvContent, "text/csv;charset=utf-8");
  };

  return (
    <div className="flex flex-col gap-5 p-6 rounded-3xl tactile-card">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D8]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#E1EDE3] text-[#1A3E26]">
            <Download className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#1A2E3B]">Експорт креслень та CAD моделей</h2>
            <p className="text-xs text-[#5A6778]">
              2D векторний розкрій у SVG, 3D моделі в OBJ та STEP для CAD
            </p>
          </div>
        </div>

        {model.approved && (
          <span className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-xl bg-[#E1EDE3] text-[#1A3E26] border border-[#A6C7AE]">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Геометрія затверджена ({model.geometryVersion})</span>
          </span>
        )}
      </div>

      {/* Featured Primary Export: PDF Engineering Specification */}
      <div className="p-5 rounded-3xl bg-gradient-to-r from-[#FAF7F2] via-white to-[#F0FFF4] border border-[#A6C7AE] shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#E1EDE3] text-[#1A3E26] shadow-xs shrink-0">
            <Printer className="w-6 h-6 text-[#2E7D32]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-[#1A2E3B]">
                Інженерна специфікація та кошторис у PDF
              </h3>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#E1EDE3] text-[#1A3E26]">
                A4 Формат для друку
              </span>
            </div>
            <p className="text-xs text-[#5A6778] mt-1 max-w-xl">
              Повна розрахункова відомість: параметри купола, зведена таблиця розкрою балок (пог. м, об'єм м³, вага), тираж та кути конекторів Thunder Domes, специфікація болтів DIN 933/985 та розкладка листів обшивки.
            </p>
          </div>
        </div>

        <button
          onClick={() => exportDomeSpecificationPDF(model)}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold tactile-btn-mint flex items-center justify-center gap-2 whitespace-nowrap shadow-xs"
        >
          <Printer className="w-4 h-4" />
          <span>Сформувати та відкрити PDF</span>
        </button>
      </div>

      {/* 2D Exports Grid (SVG) */}
      <div>
        <h3 className="text-xs font-bold tracking-wide text-[#5A6778] mb-3 uppercase">
          2D Векторні креслення для ЧПК (SVG)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Connector Cut */}
          <div className="p-4 rounded-2xl tactile-inset-subtle border border-white/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#E1EDE3] text-[#1A3E26]">
                <FileCode className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#1A2E3B]">Розкрій конектора (SVG)</h4>
                <p className="text-[11px] text-[#5A6778]">
                  Вузол #{activeNodeId} з отворами під болти та лініями згину
                </p>
              </div>
            </div>
            <button
              onClick={handleExportConnectorSVG}
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl tactile-btn-mint whitespace-nowrap"
            >
              Завантажити SVG
            </button>
          </div>

          {/* Sheathing Nesting SVG */}
          <div className="p-4 rounded-2xl tactile-inset-subtle border border-white/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#FDF0E6] text-[#DE7C5A]">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#1A2E3B]">Карта розкрою обшивки (SVG)</h4>
                <p className="text-[11px] text-[#5A6778]">
                  ЧПУ розкладка трикутників на лист 2800×1250 мм (фреза Ø6мм)
                </p>
              </div>
            </div>
            <button
              onClick={handleExportSheathingSVG}
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl tactile-btn-peach whitespace-nowrap shadow-2xs"
            >
              Завантажити SVG
            </button>
          </div>

          {/* Sheathing Nesting PDF Album */}
          <div className="p-4 rounded-2xl tactile-inset-subtle border border-white/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#E1EDE3] text-[#1A3E26]">
                <BookOpen className="w-5 h-5 text-[#2E7D32]" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#1A2E3B]">Карта розкрою обшивки (PDF Альбом)</h4>
                <p className="text-[11px] text-[#5A6778]">
                  Повний технологічний паспорт та всі листи розкрою для цеху
                </p>
              </div>
            </div>
            <button
              onClick={handleExportSheathingPDF}
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl tactile-btn-mint whitespace-nowrap shadow-2xs"
            >
              Сформувати PDF
            </button>
          </div>

          {/* Sheathing DXF for CNC */}
          <div className="p-4 rounded-2xl tactile-inset-subtle border border-white/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#1A2E3B] text-white">
                <Cpu className="w-5 h-5 text-[#DE7C5A]" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#1A2E3B]">Розкрій обшивки для ЧПУ (DXF)</h4>
                <p className="text-[11px] text-[#5A6778]">
                  AutoCAD R12 контури деталей та листа для CAM верстата
                </p>
              </div>
            </div>
            <button
              onClick={handleExportSheathingDXF}
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-[#1A2E3B] text-white hover:bg-[#2D3748] whitespace-nowrap shadow-2xs"
            >
              Завантажити DXF
            </button>
          </div>

          {/* Beam Blueprints */}
          <div className="p-4 rounded-2xl tactile-inset-subtle border border-white/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#EBF3F8] text-[#4A7C9B]">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#1A2E3B]">Креслення балок (SVG)</h4>
                <p className="text-[11px] text-[#5A6778]">
                  Довжини, торцеві зпили, кути фасок та отвори
                </p>
              </div>
            </div>
            <button
              onClick={handleExportBeamBlueprintsSVG}
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl tactile-btn whitespace-nowrap text-[#1A2E3B]"
            >
              Завантажити SVG
            </button>
          </div>

          {/* Dome Plan */}
          <div className="p-4 rounded-2xl tactile-inset-subtle border border-white/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#FAF2DE] text-[#DDA843]">
                <Box className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#1A2E3B]">План купола 2D (SVG)</h4>
                <p className="text-[11px] text-[#5A6778]">
                  Ортогональна проекція зверху з маркуванням балок
                </p>
              </div>
            </div>
            <button
              onClick={handleExportPlanSVG}
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl tactile-btn whitespace-nowrap text-[#1A2E3B]"
            >
              Завантажити SVG
            </button>
          </div>
        </div>
      </div>

      {/* 3D Exports Grid (OBJ & STEP & STL) */}
      <div>
        <h3 className="text-xs font-bold tracking-wide text-[#5A6778] mb-3 uppercase">
          3D Об'єкти для CAD та 3D Друк (OBJ / STEP / STL)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* STEP */}
          <div className="p-4 rounded-2xl tactile-card-mint border border-white/80 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-mono font-bold text-[#1A3E26]">ISO 10303-21</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/70 text-[#1A3E26]">
                  CAD B-Rep
                </span>
              </div>
              <h4 className="text-sm font-bold text-[#1A2E3B]">3D Модель STEP (.stp)</h4>
              <p className="text-[11px] text-[#3D6B5D] mt-1">
                Для Autodesk Fusion 360, FreeCAD, SolidWorks, Rhino. Повна твердотільна структура.
              </p>
            </div>
            <button
              onClick={handleExportSTEP}
              className="w-full py-2 text-xs font-bold rounded-xl tactile-btn-mint text-center"
            >
              Експорт STEP (.stp)
            </button>
          </div>

          {/* OBJ */}
          <div className="p-4 rounded-2xl tactile-card-sky border border-white/80 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-mono font-bold text-[#1A2E3B]">Wavefront</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/70 text-[#1A2E3B]">
                  Полігональний
                </span>
              </div>
              <h4 className="text-sm font-bold text-[#1A2E3B]">3D Модель OBJ (.obj)</h4>
              <p className="text-[11px] text-[#4A5568] mt-1">
                Повна геометрія вершин, нормалей та граней для Blender, 3ds Max, Unity, WebGL.
              </p>
            </div>
            <button
              onClick={handleExportOBJ}
              className="w-full py-2 text-xs font-bold rounded-xl tactile-btn text-center text-[#1A2E3B]"
            >
              Експорт OBJ (.obj)
            </button>
          </div>

          {/* STL */}
          <div className="p-4 rounded-2xl tactile-card-peach border border-white/80 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-mono font-bold text-[#9A3412]">3D Друк</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/70 text-[#9A3412]">
                  Фасети STL
                </span>
              </div>
              <h4 className="text-sm font-bold text-[#1A2E3B]">3D Модель STL (.stl)</h4>
              <p className="text-[11px] text-[#7C2D12] mt-1">
                Готовий файл для слайсерів 3D принтерів (Cura, PrusaSlicer, Bambu Studio).
              </p>
            </div>
            <button
              onClick={handleExportSTL}
              className="w-full py-2 text-xs font-bold rounded-xl tactile-btn-peach text-center"
            >
              Експорт STL (.stl)
            </button>
          </div>
        </div>
      </div>

      {/* BOM Specification */}
      <div className="p-4 rounded-2xl tactile-inset-subtle border border-white/60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#EAE4D9] text-[#1A2E3B]">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#1A2E3B]">
              Специфікація матеріалів (BOM Excel / CSV)
            </h4>
            <p className="text-[11px] text-[#5A6778]">
              Повний перелік балок, конекторів, обшивки та болтів для закупівлі й кошторису
            </p>
          </div>
        </div>
        <button
          onClick={handleExportBOM}
          className="px-4 py-2 text-xs font-bold rounded-xl tactile-btn text-[#1A2E3B]"
        >
          Завантажити CSV
        </button>
      </div>
    </div>
  );
};
