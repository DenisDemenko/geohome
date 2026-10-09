import React from "react";
import {
  Menu,
  X,
  ChevronDown,
  Check,
  Box,
  Ruler,
  Disc,
  Layers,
  Compass,
  Activity,
  Boxes,
  Coins,
  Download,
  FolderTree
} from "lucide-react";

export type TabId =
  | "3d"
  | "beams"
  | "connectors"
  | "sheathing"
  | "foundation"
  | "loads"
  | "packaging"
  | "cost"
  | "export";

export interface NavigationTab {
  id: TabId;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  group: "frame" | "assembly" | "export";
  desc: string;
}

export const NAVIGATION_TABS: readonly NavigationTab[] = [
  // Група 1: Каркас та Геометрія
  {
    id: "3d",
    label: "3D Конструктор",
    shortLabel: "3D",
    icon: Box,
    color: "#5B9279",
    group: "frame",
    desc: "Інтерактивна модель, параметри частоти та радіусу"
  },
  {
    id: "beams",
    label: "Креслення балок",
    shortLabel: "Балки",
    icon: Ruler,
    color: "#DE7C5A",
    group: "frame",
    desc: "Специфікація торцювання, кути зрізу A/B/C"
  },
  {
    id: "connectors",
    label: "Розкрій конекторів",
    shortLabel: "Конектори",
    icon: Disc,
    color: "#4A7C9B",
    group: "frame",
    desc: "Пелюсткові та трубні вузли з розгортками DXF"
  },

  // Група 2: Обшивка, Основа та Розрахунки
  {
    id: "sheathing",
    label: "Розкрій обшивки та утеплення",
    shortLabel: "Обшивка & Утеплення",
    icon: Layers,
    color: "#DDA843",
    group: "assembly",
    desc: "Нестинг обшивки, розрахунок утеплювача (пінопласт, мінвата) та теплоємності"
  },
  {
    id: "foundation",
    label: "Розмітка фундамента",
    shortLabel: "Фундамент",
    icon: Compass,
    color: "#2E7D32",
    group: "assembly",
    desc: "Радіальні координати опорних вузлів та анкерів"
  },
  {
    id: "loads",
    label: "Навантаження D3",
    shortLabel: "Навантаження",
    icon: Activity,
    color: "#DE7C5A",
    group: "assembly",
    desc: "Діаграма зусиль, снігові та вітрові фактори"
  },

  // Група 3: Логістика, Кошторис та Експорт
  {
    id: "packaging",
    label: "Упаковка та палети",
    shortLabel: "Упаковка",
    icon: Boxes,
    color: "#2E7D32",
    group: "export",
    desc: "Розрахунок ваги, об'єму та схеми вкладання в палети"
  },
  {
    id: "cost",
    label: "Кошторис",
    shortLabel: "Кошторис",
    icon: Coins,
    color: "#DDA843",
    group: "export",
    desc: "Повна відомість матеріалів (BOM) та витрат"
  },
  {
    id: "export",
    label: "Експорт CAD / CAM",
    shortLabel: "Експорт",
    icon: Download,
    color: "#5B9279",
    group: "export",
    desc: "Завантаження STEP, STL, OBJ та виробничих DXF"
  }
] as const;

export interface TabGroupInfo {
  id: "frame" | "assembly" | "export";
  title: string;
  badge: string;
}

export const TAB_GROUPS: TabGroupInfo[] = [
  { id: "frame", title: "Каркас та геометрія", badge: "3 розділи" },
  { id: "assembly", title: "Обшивка, фундамент та навантаження", badge: "3 розділи" },
  { id: "export", title: "Логістика, кошторис та експорт", badge: "3 розділи" }
];

export interface MobileNavigationProps {
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  tabs?: readonly NavigationTab[];
}

/**
 * Mobile Navigation Component with toggleable hamburger menu and grouped tab dropdown.
 * Also exported as IsMobileMenuOpen for direct named-component compatibility.
 */
export function MobileNavigation({
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  activeTab,
  setActiveTab,
  tabs = NAVIGATION_TABS
}: MobileNavigationProps) {
  const activeTabObj = tabs.find(t => t.id === activeTab) || tabs[0];
  const ActiveIcon = activeTabObj.icon;

  const handleSelect = (id: TabId) => {
    setActiveTab(id);
    setIsMobileMenuOpen(false);
  };

  return (
    <nav
      className="md:hidden border-b border-[#E8E2D8] bg-[#FAF7F2] relative z-30"
      aria-label="Мобільна навігація проекту"
    >
      {/* Bar: Active Tab indicator + Hamburger toggle button */}
      <div className="px-4 py-2.5 flex items-center justify-between gap-3">
        {/* Active tab trigger (touching also toggles menu) */}
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(prev => !prev)}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-white border border-[#E8E2D8] text-[#1A2E3B] shadow-2xs text-xs font-bold transition-all text-left flex-1 min-w-0 cursor-pointer hover:border-[#1A2E3B]/30"
          aria-expanded={isMobileMenuOpen}
          aria-label="Поточний розділ проекту. Натисніть для вибору інших вкладок"
        >
          <div className="w-5 h-5 rounded-lg flex items-center justify-center shrink-0 bg-[#FAF7F2]">
            <ActiveIcon className="w-3.5 h-3.5 shrink-0" style={{ color: activeTabObj.color }} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] text-[#5A6778] block leading-tight font-medium">Активний розділ:</span>
            <span className="truncate text-xs font-extrabold text-[#1A2E3B] block leading-tight">
              {activeTabObj.label}
            </span>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-[#5A6778] ml-auto shrink-0 transition-transform duration-200 ${
              isMobileMenuOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {/* Hamburger Button */}
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(prev => !prev)}
          className={`p-2.5 rounded-xl border transition-all flex items-center justify-center shrink-0 cursor-pointer ${
            isMobileMenuOpen
              ? "bg-[#1A2E3B] text-white border-[#1A2E3B] shadow-xs"
              : "bg-white text-[#1A2E3B] border-[#E8E2D8] hover:bg-[#F5F0E8] shadow-2xs"
          }`}
          title={isMobileMenuOpen ? "Закрити меню вкладок" : "Відкрити меню розділів"}
          aria-label={isMobileMenuOpen ? "Закрити меню вкладок" : "Відкрити меню розділів"}
        >
          {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
      </div>

      {/* Grouped Dropdown List when opened */}
      {isMobileMenuOpen && (
        <div className="px-4 pb-5 pt-2 bg-[#FAF7F2] border-t border-[#E8E2D8]/70 shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between text-[11px] font-bold text-[#5A6778] pb-2 mb-3 border-b border-[#E8E2D8]/60">
            <span className="flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
              <FolderTree className="w-3 h-3 text-[#5B9279]" />
              Всі розділи розрахунку ({tabs.length})
            </span>
            <span className="text-[#5B9279] text-[10px] font-medium">Оберіть потрібну вкладку</span>
          </div>

          <div className="space-y-4">
            {TAB_GROUPS.map(group => {
              const groupTabs = tabs.filter(t => t.group === group.id);
              if (groupTabs.length === 0) return null;

              return (
                <div key={group.id} className="space-y-1.5">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#1A2E3B]">
                      {group.title}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#E8E2D8]/50 text-[#5A6778] font-mono font-medium">
                      {group.badge}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {groupTabs.map(tab => {
                      const Icon = tab.icon;
                      const isSelected = activeTab === tab.id;

                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => handleSelect(tab.id)}
                          className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left cursor-pointer border transition-all ${
                            isSelected
                              ? "bg-[#1A2E3B] text-white border-[#1A2E3B] shadow-xs ring-2 ring-[#1A2E3B]/20"
                              : "bg-white hover:bg-[#F5F0E8] text-[#2F3944] border-[#E8E2D8] shadow-2xs"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                isSelected ? "bg-white/15" : "bg-[#FAF7F2]"
                              }`}
                            >
                              <Icon
                                className="w-4 h-4"
                                style={{ color: isSelected ? "#FFFFFF" : tab.color }}
                              />
                            </div>
                            <div className="min-w-0">
                              <span
                                className={`block text-xs font-bold truncate ${
                                  isSelected ? "text-white" : "text-[#1A2E3B]"
                                }`}
                              >
                                {tab.label}
                              </span>
                              <span
                                className={`block text-[10px] truncate ${
                                  isSelected ? "text-white/80" : "text-[#718096]"
                                }`}
                              >
                                {tab.desc}
                              </span>
                            </div>
                          </div>

                          {isSelected && (
                            <Check className="w-4 h-4 text-[#5B9279] shrink-0 ml-2" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}

/**
 * Named alias matching the user prompt `isMobileMenuOpen` component
 */
export const IsMobileMenuOpen = MobileNavigation;
export default MobileNavigation;
