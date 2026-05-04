import DevBanner from "@/components/DevBanner";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DevBanner message="Área administrativa — em desenvolvimento. Métricas e dados podem estar incompletos." />
      {children}
    </>
  );
}
