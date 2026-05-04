import { Construction } from "lucide-react";

// Banner amarelo no topo de páginas em desenvolvimento (/v2, /admin/*).
// Avisa Victor de que pode haver bugs ou dados parciais.
export default function DevBanner({ message }: { message?: string }) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900"
    >
      <Construction className="h-4 w-4 shrink-0" />
      <span>
        {message ?? "Esta página está em desenvolvimento — dados podem estar incompletos ou apresentar bugs."}
      </span>
    </div>
  );
}
