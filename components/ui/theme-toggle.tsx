"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ThemeToggle — segmented control 3-way (light/system/dark)
 *
 * Algorithme:
 * - Évite hydration mismatch via mount-gate
 * - Indicateur animé positionné via CSS transform (GPU accelerated)
 * - Index calculé en O(1) par lookup map
 */

const THEMES = [
  { value: "light", icon: Sun, label: "Clair" },
  { value: "system", icon: Monitor, label: "Système" },
  { value: "dark", icon: Moon, label: "Sombre" },
] as const;

const THEME_INDEX: Record<string, number> = {
  light: 0,
  system: 1,
  dark: 2,
};

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => setMounted(true), []);

  const currentIndex = mounted ? (THEME_INDEX[theme ?? "system"] ?? 1) : 1;

  return (
    <div
      role="radiogroup"
      aria-label="Sélecteur de thème"
      className={cn(
        "relative inline-flex items-center rounded-full border border-border/60",
        "bg-card/40 backdrop-blur-md p-1 gap-0",
        className,
      )}
    >
      {/* Indicateur animé */}
      <div
        aria-hidden
        className="absolute top-1 bottom-1 w-9 rounded-full bg-primary shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{
          left: "0.25rem",
          transform: `translateX(${currentIndex * 2.25}rem)`,
        }}
      />

      {THEMES.map(({ value, icon: Icon, label }) => {
        const isActive = mounted && (theme ?? "system") === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={isActive}
            aria-label={label}
            onClick={() => setTheme(value)}
            className={cn(
              "relative z-10 flex items-center justify-center w-9 h-8 rounded-full",
              "transition-colors duration-200",
              isActive
                ? "text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="w-4 h-4" strokeWidth={2.2} />
          </button>
        );
      })}
    </div>
  );
}
