import { cn } from "@/lib/utils";

type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-slate-200/80", className)}
      {...props}
    />
  );
}

// Skeleton de tabela: configurável com colunas e linhas. Renderiza header
// "fantasma" + N linhas. Usado em /historico, /pareceres, /operacoes,
// /custos, /metricas enquanto o Supabase responde.
type TableSkeletonProps = {
  cols?: number;
  rows?: number;
  className?: string;
};

export function TableSkeleton({ cols = 5, rows = 6, className }: TableSkeletonProps) {
  return (
    <div className={cn("w-full overflow-hidden rounded-xl border border-slate-200 bg-white", className)}>
      <div className="grid border-b border-slate-200 bg-slate-50 p-3 gap-3"
           style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3" />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="grid p-3 gap-3"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={c}
                className={cn("h-4", c === 0 && "w-3/4", c === cols - 1 && "w-1/2")}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
