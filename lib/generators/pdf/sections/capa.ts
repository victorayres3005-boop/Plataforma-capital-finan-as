/**
 * Seção 00 — CAPA
 * Background navy completo · Score circle · Badge decisão · Comitê
 */
import type { PdfCtx } from "../context";
import { newPage } from "../helpers";

export function renderCapa(ctx: PdfCtx): void {
  const { doc, params, data, W } = ctx;
  const { decision, finalRating, committeMembers } = params;

  newPage(ctx);

  // ── Paleta local ────────────────────────────────────────────────────────
  const navy900: [number,number,number] = [12,  27,  58];
  const navy800: [number,number,number] = [19,  41,  82];
  const green:   [number,number,number] = [115, 184, 21];
  const white:   [number,number,number] = [255, 255, 255];
  const muted:   [number,number,number] = [140, 170, 220];
  const muted2:  [number,number,number] = [100, 130, 185];

  const scoreNum = finalRating || 0;
  const scoreColor: [number,number,number] =
    scoreNum >= 6.5 ? [22,  163, 74]  :
    scoreNum >= 5   ? [217, 119, 6]   :
                      [220, 38,  38];

  const decText = (decision || "PENDENTE").replace(/_/g, " ").toUpperCase();
  const decAprov  = /APROV/i.test(decText) && !/CONDIC/i.test(decText);
  const decReprov = /REPROV/i.test(decText);
  const decColor: [number,number,number] = decAprov ? [22,163,74] : decReprov ? [220,38,38] : [217,119,6];
  const decBg:    [number,number,number] = decAprov ? [34,197,94]  : decReprov ? [239,68,68]  : [245,158,11];

  // ── Fundo total navy ────────────────────────────────────────────────────
  doc.setFillColor(...navy800);
  doc.rect(0, 0, 210, 297, "F");

  // Faixa verde topo
  doc.setFillColor(...green);
  doc.rect(0, 0, 210, 3, "F");

  // Círculos decorativos (estética)
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.15);
  doc.setGState(doc.GState({ opacity: 0.06 }));
  doc.circle(175, 55, 55);
  doc.circle(35, 255, 38);
  doc.circle(105, 280, 20);
  doc.setGState(doc.GState({ opacity: 1 }));

  // ── Logo ────────────────────────────────────────────────────────────────
  const logoY = 40;
  // Círculo logo
  doc.setDrawColor(...white);
  doc.setLineWidth(2);
  doc.circle(W / 2, logoY, 10);
  doc.setFillColor(...white);
  doc.circle(W / 2, logoY + 5, 1.8, "F");

  // "capital financas"
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...white);
  const capW = doc.getTextWidth("capital");
  const finW = doc.getTextWidth("financas");
  const totalW = capW + finW + 2;
  doc.text("capital", W / 2 - totalW / 2, logoY + 18);
  doc.setTextColor(...green);
  doc.text("financas", W / 2 - totalW / 2 + capW + 2, logoY + 18);

  // "ANÁLISE DE CRÉDITO"
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...muted);
  doc.text("ANÁLISE DE CRÉDITO", W / 2, logoY + 25, { align: "center" });

  // Linha verde separadora
  doc.setFillColor(...green);
  doc.rect(W / 2 - 25, logoY + 30, 50, 0.8, "F");

  // ── Nome da empresa ─────────────────────────────────────────────────────
  const empresa = (data.cnpj?.razaoSocial || "EMPRESA NÃO IDENTIFICADA").trim();
  const empMax  = 44;
  const empStr  = empresa.length > empMax ? empresa.substring(0, empMax - 1) + "…" : empresa;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...white);
  doc.text(empStr, W / 2, logoY + 50, { align: "center" });

  // Fantasia
  const fantasia = (data.cnpj?.nomeFantasia || "").trim();
  if (fantasia) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...muted);
    doc.text(fantasia.substring(0, 50), W / 2, logoY + 58, { align: "center" });
  }

  // CNPJ
  if (data.cnpj?.cnpj) {
    doc.setFont("courier", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...muted);
    doc.text(data.cnpj.cnpj, W / 2, logoY + (fantasia ? 67 : 61), { align: "center" });
  }

  // ── Score circle ─────────────────────────────────────────────────────────
  const circY   = 155;
  const circR   = 19;
  const circCx  = W / 2;

  // Fundo escuro do círculo
  doc.setFillColor(...navy900);
  doc.circle(circCx, circY, circR, "F");

  // Anel colorido externo
  doc.setDrawColor(...scoreColor);
  doc.setLineWidth(3.5);
  doc.circle(circCx, circY, circR, "S");

  // Anel interno mais fino (decorativo)
  doc.setDrawColor(...scoreColor);
  doc.setLineWidth(0.5);
  doc.setGState(doc.GState({ opacity: 0.3 }));
  doc.circle(circCx, circY, circR - 4, "S");
  doc.setGState(doc.GState({ opacity: 1 }));

  // Número do score
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...scoreColor);
  doc.text(scoreNum.toFixed(1), circCx, circY + 3.5, { align: "center" });

  // "/10"
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...muted);
  doc.text("/10", circCx, circY + 9.5, { align: "center" });

  // "Rating Capital"
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...muted2);
  doc.text("Rating Capital", circCx, circY + 25, { align: "center" });

  // ── Badge decisão ─────────────────────────────────────────────────────
  const badgeW = 60;
  const badgeH = 10;
  const badgeX = W / 2 - badgeW / 2;
  const badgeY = circY + 30;

  doc.setFillColor(...decBg);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 2.5, 2.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...decColor);
  doc.text(decText, W / 2, badgeY + 7, { align: "center" });

  // ── Dados inferiores ──────────────────────────────────────────────────
  const infoY = badgeY + 22;

  // Data
  const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...muted);
  doc.text(`Gerado em ${hoje}`, W / 2, infoY, { align: "center" });

  // Validade
  const validade = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const validadeStr = validade.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  doc.setFontSize(7);
  doc.setTextColor(...muted2);
  doc.text(`Válido até ${validadeStr} · 90 dias`, W / 2, infoY + 6, { align: "center" });

  // Código de verificação
  const rawCnpj = (data.cnpj?.cnpj || "").replace(/\D/g, "");
  const verCode = rawCnpj
    ? `CF-${rawCnpj.substring(0, 4)}-${new Date().getFullYear()}`
    : `CF-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  doc.setFontSize(6.5);
  doc.setTextColor(...muted2);
  doc.text(`Cód. verificação: ${verCode}`, W / 2, infoY + 12, { align: "center" });

  // ── Linha divisória ──────────────────────────────────────────────────
  doc.setDrawColor(...white);
  doc.setLineWidth(0.15);
  doc.setGState(doc.GState({ opacity: 0.15 }));
  doc.line(W / 2 - 40, infoY + 17, W / 2 + 40, infoY + 17);
  doc.setGState(doc.GState({ opacity: 1 }));

  // ── Comitê de crédito ────────────────────────────────────────────────
  const committeY = infoY + 22;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...muted2);
  doc.text("COMITÊ DE CRÉDITO", W / 2, committeY, { align: "center" });

  const membros = (committeMembers || "").trim()
    ? (committeMembers as string).split(/[,;\/\n]/).map(m => m.trim()).filter(Boolean)
    : ["Débora Ayres", "Capital Finanças"];

  membros.slice(0, 4).forEach((m, i) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...muted);
    doc.text(m, W / 2, committeY + 6 + i * 5.5, { align: "center" });
  });

  // ── Rodapé ───────────────────────────────────────────────────────────
  // Faixa verde baixo
  doc.setFillColor(...green);
  doc.rect(0, 294, 210, 3, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...muted2);
  doc.text("DOCUMENTO CONFIDENCIAL — USO RESTRITO DO COMITÊ", W / 2, 288, { align: "center" });
  doc.text("Capital Finanças © " + new Date().getFullYear(), W / 2, 293, { align: "center" });
}
