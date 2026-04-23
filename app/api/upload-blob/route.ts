import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Tipos de arquivo permitidos por extensão
const ALLOWED_EXTS = ["pdf", "jpg", "jpeg", "png", "docx", "xlsx"];

export async function POST(request: NextRequest): Promise<NextResponse> {
  let bodyJson: HandleUploadBody | null = null;
  try {
    bodyJson = (await request.json()) as HandleUploadBody;
    const bodyType = (bodyJson as { type?: string }).type;
    console.log("[upload-blob] type=", bodyType);

    const jsonResponse = await handleUpload({
      body: bodyJson,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        console.log("[upload-blob] onBeforeGenerateToken pathname=", pathname, "clientPayload=", clientPayload);
        // Autenticação
        const supabase = createServerSupabase();
        const { data } = await supabase.auth.getUser();
        if (!data.user) {
          throw new Error("Não autenticado");
        }

        // Validação leniente de extensão — só bloqueia formatos claramente inválidos.
        // Vercel Blob adiciona sufixo aleatório, então a extensão fica sempre no final.
        const lastDot = pathname.lastIndexOf(".");
        const ext = lastDot >= 0 ? pathname.slice(lastDot + 1).toLowerCase() : "";
        if (ext && !ALLOWED_EXTS.includes(ext)) {
          console.warn(`[upload-blob] ext "${ext}" rejeitada (pathname=${pathname})`);
          throw new Error(`Formato .${ext} não permitido`);
        }

        return {
          allowedContentTypes: [
            "application/pdf",
            "image/jpeg", "image/jpg", "image/png",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/octet-stream", // fallback pra browsers que não detectam MIME
          ],
          tokenPayload: JSON.stringify({ userId: data.user.id }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log("[upload-blob] completed:", blob.url);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[upload-blob] ERRO type=", (bodyJson as { type?: string })?.type, "msg=", msg, "stack=", stack);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
