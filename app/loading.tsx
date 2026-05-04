// Loading skeleton mostrado pelo App Router enquanto a rota carrega.
// Mantém o shell visual (sidebar/topbar) já desenhados pelo LayoutShell —
// aqui só ocupamos o conteúdo principal com um pulse genérico.

export default function RouteLoading() {
  return (
    <div className="flex flex-col gap-4 p-6 animate-pulse">
      <div className="h-8 w-1/3 rounded-md bg-slate-200" />
      <div className="h-4 w-2/3 rounded bg-slate-100" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-white border border-slate-200 p-4">
            <div className="h-3 w-1/2 rounded bg-slate-200 mb-3" />
            <div className="h-6 w-2/3 rounded bg-slate-200" />
          </div>
        ))}
      </div>
      <div className="h-64 rounded-xl bg-white border border-slate-200 mt-2" />
    </div>
  );
}
