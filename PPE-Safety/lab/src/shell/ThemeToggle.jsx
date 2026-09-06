import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { flip, loadTheme, saveTheme } from "../state/theme.js";

/**
 * Dark or light, remembered.
 *
 * The choice is applied to <html data-theme="..."> — index.html's own inline
 * script sets that attribute before the first paint from the same stored
 * value this component reads, so there is nothing to reconcile here beyond
 * keeping the two in step from then on. theme.css defines the whole palette
 * under `:root` (light) and `:root[data-theme="dark"]`, so flipping the
 * attribute is the entire mechanism.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState(loadTheme);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.dataset.theme = "dark";
    } else {
      delete document.documentElement.dataset.theme;
    }
    saveTheme(theme);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme(flip)}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-panel-raised hover:text-ink"
    >
      {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
