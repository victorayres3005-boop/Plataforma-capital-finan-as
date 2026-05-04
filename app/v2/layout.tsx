import SidebarV2 from "./_components/SidebarV2";
import DevBanner from "@/components/DevBanner";
import { T } from "./theme";

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", height: "100vh", background: T.bgPage, overflow: "hidden" }}>
      <SidebarV2 />
      <main style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
        <DevBanner message="Versão V2 em desenvolvimento — use as páginas oficiais (/historico, /pareceres) para fluxo de produção." />
        {children}
      </main>
    </div>
  );
}
