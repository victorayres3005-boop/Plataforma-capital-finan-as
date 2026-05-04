"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export type BreadcrumbItem = {
  label: string;
  href?: string;
  current?: boolean;
};

type BreadcrumbProps = {
  items: BreadcrumbItem[];
  showHome?: boolean;
  className?: string;
};

// Breadcrumb compacto para uso em /parecer, /perfil, /configuracoes,
// /custos, /metricas, /admin/*. O primeiro item geralmente é o ícone Home
// linkando para "/".
export function Breadcrumb({ items, showHome = true, className }: BreadcrumbProps) {
  const allItems = showHome ? [{ label: "Início", href: "/" }, ...items] : items;

  return (
    <nav aria-label="Navegação" className={cn("flex items-center text-sm", className)}>
      <ol className="flex items-center gap-1.5 flex-wrap">
        {allItems.map((item, idx) => {
          const isLast = idx === allItems.length - 1;
          const isCurrent = item.current || isLast;
          return (
            <li key={`${item.label}-${idx}`} className="flex items-center gap-1.5">
              {idx > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
              {isCurrent || !item.href ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5",
                    isCurrent ? "text-cf-text-1 font-medium" : "text-cf-text-3",
                  )}
                  aria-current={isCurrent ? "page" : undefined}
                >
                  {idx === 0 && showHome && <Home className="h-3.5 w-3.5" />}
                  {!(idx === 0 && showHome) && item.label}
                  {idx === 0 && showHome && <span className="sr-only">{item.label}</span>}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="inline-flex items-center gap-1.5 text-cf-text-3 hover:text-cf-navy transition-colors"
                >
                  {idx === 0 && showHome && <Home className="h-3.5 w-3.5" />}
                  {!(idx === 0 && showHome) && item.label}
                  {idx === 0 && showHome && <span className="sr-only">{item.label}</span>}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
