import { redirect } from "next/navigation";

// URL amigável /parecer/<id> → redireciona para a página existente que lê
// `?id=` da querystring. Mantém um único componente fazendo o trabalho real
// e evita duplicar a lógica de hidratação/render.
export default function ParecerByIdPage({ params }: { params: { id: string } }) {
  redirect(`/parecer?id=${encodeURIComponent(params.id)}`);
}
