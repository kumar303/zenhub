import { ComponentChildren } from "preact";

interface CollapsibleSectionProps {
  title: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  isNavScrolled?: boolean;
  children: ComponentChildren;
}

export function CollapsibleSection({
  title,
  count,
  isOpen,
  onToggle,
  isNavScrolled = false,
  children,
}: CollapsibleSectionProps) {
  // Adjust top position based on nav scroll state
  const topPosition = isNavScrolled ? "top-[53px]" : "top-[73px]";

  return (
    <section className={`animate-fade-in ${isOpen ? "section-expanding" : ""}`}>
      <div
        className={`sticky ${topPosition} z-40 bg-black/80 backdrop-blur-sm py-3 mb-4 -mx-4 px-4 cursor-pointer select-none border-b-2 border-cyan-500`}
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <h2 className={`text-2xl font-bold vhs-text section-header`}>
            {title.toUpperCase()}{" "}
            {count > 0 && (
              <span className="text-lg font-normal">
                [{count}]
              </span>
            )}
          </h2>
          <button
            className="text-cyan-500 hover:text-magenta-500 transition-colors duration-200 p-2"
            aria-label={isOpen ? "Collapse section" : "Expand section"}
          >
            <span className="vhs-text text-2xl font-bold">
              {isOpen ? "[-]" : "[+]"}
            </span>
          </button>
        </div>
      </div>

      {isOpen && <div className="space-y-4 mb-8">{children}</div>}
    </section>
  );
}
