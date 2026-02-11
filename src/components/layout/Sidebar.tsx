import { Video, Film, Settings } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useUIStore, type ActiveView } from "@/stores/uiStore";

interface NavItem {
  id: ActiveView;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { id: "recorder", label: "Recorder", icon: <Video size={20} /> },
  { id: "editor", label: "Editor", icon: <Film size={20} /> },
];

function NavButton({
  item,
  isActive,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            onClick={onClick}
            className={`
              relative flex items-center justify-center w-10 h-10 rounded-lg
              transition-interactive
              ${
                isActive
                  ? "bg-blue-500/15 text-blue-400"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
              }
            `}
          >
            {isActive && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-500 rounded-r-full" />
            )}
            {item.icon}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="right"
            sideOffset={8}
            className="z-50 px-3 py-1.5 text-xs font-medium text-neutral-100 bg-neutral-800 border border-neutral-700 rounded-md shadow-lg"
          >
            {item.label}
            <Tooltip.Arrow className="fill-neutral-800" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

export default function Sidebar() {
  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);

  return (
    <aside className="flex flex-col items-center w-16 h-full bg-neutral-900 border-r border-neutral-800 py-3 no-select">
      {/* Logo */}
      <div className="flex items-center justify-center w-10 h-10 mb-6 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/20">
        <span className="text-sm font-bold text-white tracking-tight">AE</span>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col items-center gap-1 flex-1">
        {navItems.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            isActive={activeView === item.id}
            onClick={() => setActiveView(item.id)}
          />
        ))}
      </nav>

      {/* Settings */}
      <Tooltip.Provider delayDuration={300}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center justify-center w-10 h-10 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-interactive"
            >
              <Settings size={20} />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              side="right"
              sideOffset={8}
              className="z-50 px-3 py-1.5 text-xs font-medium text-neutral-100 bg-neutral-800 border border-neutral-700 rounded-md shadow-lg"
            >
              Settings
              <Tooltip.Arrow className="fill-neutral-800" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    </aside>
  );
}
