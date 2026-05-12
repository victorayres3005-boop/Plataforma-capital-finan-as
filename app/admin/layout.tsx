import DevBanner from "@/components/DevBanner";
import SchemaHealthBanner from "@/components/SchemaHealthBanner";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SchemaHealthBanner />
      <DevBanner message="Área administrativa — em desenvolvimento. Métricas e dados podem estar incompletos." />
      {children}
    </>
  );
}
