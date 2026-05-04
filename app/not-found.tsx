import Link from "next/link";
import { FileQuestion, Home } from "lucide-react";
import Logo from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-cf-bg p-6">
      <div className="card max-w-md w-full p-8 text-center space-y-4">
        <Logo height={22} className="mx-auto" />
        <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto">
          <FileQuestion className="w-7 h-7 text-amber-600" />
        </div>
        <h2 className="text-xl font-bold text-cf-text-1">Página não encontrada</h2>
        <p className="text-sm text-cf-text-3">
          A URL acessada não existe ou foi removida. Verifique o endereço ou volte para a tela inicial.
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <Link href="/" className="btn-primary text-sm px-6 inline-flex items-center gap-2">
            <Home className="w-4 h-4" />
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}
