import { PDFDocument, StandardFonts } from "pdf-lib";

/**
 * Gera um PDF mínimo (1 página A4, texto monoespaçado) e retorna o buffer.
 * Usado em cenários de upload pra evitar dependência de PDFs reais com
 * dados sensíveis. Como o stub do /api/extract intercepta a chamada
 * antes do Gemini, o conteúdo do PDF não importa — ele só precisa ser
 * um PDF válido que passe pela validação `application/pdf`.
 */
export async function makeMinimalPdf(opts: { title?: string; body?: string } = {}): Promise<Uint8Array> {
  const title = opts.title ?? "E2E Stub Document";
  const body  = opts.body  ?? "Este PDF é gerado em runtime para testes E2E. Conteúdo irrelevante.";

  const pdf  = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Courier);

  page.drawText(title, { x: 50, y: 800, size: 18, font });
  page.drawText(body,  { x: 50, y: 760, size: 11, font });
  page.drawText("CNPJ: 12.345.678/0001-90", { x: 50, y: 720, size: 11, font });
  page.drawText("Razão social: Empresa E2E Stub LTDA", { x: 50, y: 700, size: 11, font });

  return await pdf.save();
}
