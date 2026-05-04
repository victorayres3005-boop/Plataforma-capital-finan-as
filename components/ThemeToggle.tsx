"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/useTheme";

// Botão flutuante no canto inferior direito que alterna dark/light.
// Posicionamento fixed para não exigir alteração nas headers de cada página.
// Sidebar/Topbar com inline styles seguem em modo claro até overhaul dedicado;
// páginas que usam classes Tailwind respeitam o `dark:` correto.
export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "Alternar para tema claro" : "Alternar para tema escuro"}
      aria-label={isDark ? "Alternar para tema claro" : "Alternar para tema escuro"}
      className="fixed bottom-4 right-4 z-30 w-10 h-10 rounded-full border border-slate-200 bg-white text-slate-600 hover:text-cf-navy hover:border-slate-300 shadow-md transition-colors flex items-center justify-center dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:text-amber-300"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
