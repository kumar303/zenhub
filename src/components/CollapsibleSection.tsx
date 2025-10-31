import { useState } from "preact/hooks";
import { ComponentChildren } from "preact";

interface CollapsibleSectionProps {
  title: string;
  count: number;
  gradientClass?: string;
  defaultOpen?: boolean;
  isNavScrolled?: boolean;
  children: ComponentChildren;
}

export function CollapsibleSection({
  title,
  count,
  gradientClass = "text-gray-700",
  defaultOpen = true,
  isNavScrolled = false,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Adjust top position based on nav scroll state
  const topPosition = isNavScrolled ? "top-[53px]" : "top-[73px]";

  return (
    <section className="animate-fade-in">
      <div
        className={`sticky ${topPosition} z-40 bg-white py-3 mb-4 -mx-4 px-4 cursor-pointer select-none border-b border-gray-200`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between">
          <h2 className={`text-2xl font-bold ${gradientClass}`}>
            {title}{" "}
            {count > 0 && (
              <span className="text-lg font-normal text-gray-500">
                ({count})
              </span>
            )}
          </h2>
          <button
            className="text-gray-500 hover:text-gray-700 transition-colors duration-200 p-2"
            aria-label={isOpen ? "Collapse section" : "Expand section"}
          >
            <svg
              className={`w-5 h-5 transform transition-transform duration-200 ${
                isOpen ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>
      </div>

      {isOpen && <div className="space-y-4 mb-8">{children}</div>}
    </section>
  );
}
