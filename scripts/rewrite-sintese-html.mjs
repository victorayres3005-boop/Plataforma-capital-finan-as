import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const path = resolve('lib/pdf/template.ts');
const content = readFileSync(path, 'utf8');
const lines = content.split('\n');

// secSintese spans lines 486-1027 (1-indexed) = indices 485-1026 (0-indexed)
const before = lines.slice(0, 485);  // lines 1-485
const after  = lines.slice(1027);    // line 1028+

const newFn = `function secSintese(p: PDFReportParams): string {
  const { data, finalRating, decision, pontosFortes, pontosFracos, resumoExecutivo, companyAge } = p;

  const PAL = {
    n9:"#0c1b3a", n8:"#132952", n7:"#1a3a6b", n1:"#dce6f5", n0:"#eef3fb",
    a5:"#d4940a", a1:"#fdf3d7", a0:"#fef9ec",
    r6:"#c53030", r1:"#fee2e2", r0:"#fef2f2",
    g6:"#16653a", g1:"#d1fae5", g0:"#ecfdf5",
    x9:"#111827", x7:"#374151", x5:"#6b7280", x4:"#9ca3af",
    x3:"#d1d5db", x2:"#e5e7eb", x1:"#f3f4f6", x0:"#f9fafb",
  };

  const score = finalRating || 0;
  const scoreColor = score >= 6.5 ? PAL.g6 : score >= 5 ? PAL.a5 : PAL.r6;
  const scoreLabel = score >= 8 ? "EXCELENTE" : score >= 6.5 ? "SATISFATÓRIO" : score >= 5 ? "MODERADO" : "ALTO RISCO";
  const dec = (decision || "—").replace(/_/g, " ").toUpperCase();
  const decAprov = /APROV/i.test(dec) && !/CONDIC/i.test(dec);
  const decReprov = /REPROV/i.test(dec);
  const decBg = decAprov ? PAL.g6 : decReprov ? PAL.r6 : PAL.a5;

  // ── helpers ────────────────────────────────────────────────────────────
  const stitle = (txt: string) =>
    \`<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:\${PAL.x5};margin:20px 0 10px;display:flex;align-items:center;gap:8px">
      \${esc(txt)}<div style="flex:1;height:1px;background:\${PAL.x2}"></div>
    </div>\`;

  const makeAlert = (sev: "alta"|"mod"|"info", msg: string) => {
    const bg  = sev==="alta"?PAL.r0:sev==="mod"?PAL.a0:PAL.n0;
    const brd = sev==="alta"?PAL.r1:sev==="mod"?PAL.a1:PAL.n1;
    const fg  = sev==="alta"?PAL.r6:sev==="mod"?PAL.a5:PAL.n7;
    const tag = sev==="alta"?"ALTA":sev==="mod"?"MOD":"INFO";
    const tagBg = sev==="alta"?PAL.r1:sev==="mod"?PAL.a1:PAL.n1;
    return \`<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;background:\${bg};border:1px solid \${brd};color:\${fg};font-size:11px;margin-bottom:6px">
      <span style="font-size:8px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:3px;background:\${tagBg};flex-shrink:0">\${tag}</span>
      \${esc(msg)}
    </div>\`;
  };

  // ── data extraction ────────────────────────────────────────────────────
  const allMesesSorted = sortMeses(data.faturamento?.meses || []).filter(m => m?.mes && m?.valor);
  const last12 = allMesesSorted.slice(-12);
  const fmmNum = computeFmm(data.faturamento);
  const fatTotal12 = last12.reduce((s, m) => s + numVal(m.valor), 0);

  const protQtd = p.protestosVigentes || 0;
  const protVal = numVal(data.protestos?.vigentesValor || "0");
  const ccfQtd = data.ccf?.qtdRegistros ?? null;
  const ccfQtdNum = typeof ccfQtd === "number" ? ccfQtd : parseInt(String(ccfQtd ?? "0")) || 0;
  const scrTotalAt = numVal(data.scr?.totalDividasAtivas || "0");
  const scrVenc = p.vencidosSCR || 0;
  const scrVencPct = scrTotalAt > 0 ? (scrVenc / scrTotalAt) * 100 : 0;
  const alav = p.alavancagem ?? 0;
  const dividaAtivaVal = p.dividaAtiva || 0;
  const scrInstit = parseInt(data.scr?.qtdeInstituicoes || "0") || 0;

  const FIDC_RE = /\\b(fidc|fundo)\\b/i;
  const protDetalhes = data.protestos?.detalhes || [];
  const protAtivos = protDetalhes.filter(pr => !pr.regularizado);
  const protRecente = [...protAtivos].sort((a, b) => (b.data || "").localeCompare(a.data || ""))[0] ?? null;
  const protTemFIDC = protAtivos.some(pr => FIDC_RE.test((pr.credor||"")+" "+(pr.apresentante||"")));

  const procRaw = data.processos as unknown as Record<string, unknown>;
  const procPassivo = parseInt(String(procRaw?.poloPassivoQtd || data.processos?.passivosTotal || "0")) || 0;
  const procAtivo  = parseInt(String(procRaw?.poloAtivoQtd  || data.processos?.ativosTotal  || "0")) || 0;
  const top10Rec   = Array.isArray(procRaw?.top10Recentes) ? procRaw.top10Recentes as Array<Record<string,string>> : [];
  const bancarios  = Array.isArray(procRaw?.bancarios) ? procRaw.bancarios as Array<Record<string,string>> : [];
  const procTemFIDC = bancarios.some(pr => FIDC_RE.test(pr.nome||"")) || top10Rec.some(pr => FIDC_RE.test(pr.nome||""));
  const procTotal  = Math.max(procPassivo + procAtivo, top10Rec.length);

  const ccfBancos = (data.ccf?.bancos || []).slice(0, 4);

  const cnpjEnr = data.cnpj as unknown as Record<string,string|undefined>;
  const funcionarios = cnpjEnr.funcionarios || "";
  const regimeTrib   = cnpjEnr.regimeTributario || "";

  const rvP = data.relatorioVisita;
  const pleitoVal = rvP?.limiteTotal ? numVal(rvP.limiteTotal) : 0;
  const pleitoFmmRatio = fmmNum > 0 && pleitoVal > 0 ? pleitoVal / fmmNum : 0;

  let scoreExt: number | null = null;
  if (data.score) {
    const s = data.score as Record<string, unknown>;
    for (const key of ["credithub","serasa","quod"]) {
      const v = s[key];
      if (typeof v === "number" && isFinite(v)) { scoreExt = v; break; }
      if (typeof v === "string") { const n = parseFloat(v.replace(",",".")); if (!isNaN(n)) { scoreExt = n; break; } }
      if (v && typeof v === "object") {
        const o = v as Record<string,unknown>;
        for (const f of ["score","pontuacao","valor"]) {
          if (typeof o[f]==="number" && isFinite(o[f] as number)) { scoreExt = o[f] as number; break; }
        }
        if (scoreExt !== null) break;
      }
    }
  }

  const irMap = new Map<string,string>(
    (data.irSocios||[]).filter(ir=>ir?.nomeSocio)
      .map(ir=>[ir.nomeSocio.toLowerCase().replace(/\\s+/g," ").trim(), ir.patrimonioLiquido||ir.totalBensDireitos||""])
  );

  const razao    = esc(data.cnpj?.razaoSocial || "—");
  const fantasia = esc(data.cnpj?.nomeFantasia || "");
  const cnpjFmt  = fmtCnpj(data.cnpj?.cnpj);
  const situacao = (data.cnpj?.situacaoCadastral || "").toUpperCase().trim();
  const situAtiva = situacao.includes("ATIVA");
  const situBg = situAtiva ? PAL.g1 : PAL.a1;
  const situFg = situAtiva ? PAL.g6 : PAL.a5;

  const extractLocal = (endereco: string|undefined): string => {
    if (!endereco) return "—";
    const m = endereco.match(/([A-Za-zÁÂÃÇÉÍÓÔÚáâãçéíóôú \\-']{3,})[\\s/-]+([A-Z]{2})\\b/);
    if (m) return \`\${m[1].trim()}/\${m[2]}\`;
    const parts = endereco.split(/[,\\-/]/).map(s=>s.trim()).filter(Boolean);
    return parts.slice(-2).join("/") || endereco.substring(0,22);
  };

  const capSocRaw = data.cnpj?.capitalSocialCNPJ || data.qsa?.capitalSocial || "";
  const capSoc    = capSocRaw ? fmtMoneyRound(capSocRaw) : "—";
  const natJur    = (data.cnpj?.naturezaJuridica || data.cnpj?.tipoEmpresa || "—").substring(0, 20);
  const localStr  = extractLocal(data.cnpj?.endereco);

  // ── BLOCO 1 — Empresa + Rating ─────────────────────────────────────────
  const block1 = \`
  <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:1px solid \${PAL.x2};margin-bottom:20px">
    <div>
      <div style="font-size:18px;font-weight:700;color:\${PAL.n9};margin-bottom:3px">\${razao}</div>
      \${fantasia ? \`<div style="font-size:11px;color:\${PAL.x5};margin-bottom:6px">\${fantasia}</div>\` : ""}
      <div style="font-size:12px;color:\${PAL.x5}">CNPJ: <b style="color:\${PAL.x7};font-family:monospace">\${esc(cnpjFmt)}</b>
        \${situacao ? \`<span style="display:inline-block;padding:2px 10px;border-radius:4px;font-size:10px;font-weight:600;background:\${situBg};color:\${situFg};margin-left:8px">\${esc(situacao.substring(0,14))}</span>\` : ""}
      </div>
    </div>
    <div style="text-align:center;min-width:110px">
      <div style="width:72px;height:72px;border-radius:50%;border:3px solid \${scoreColor};display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0 auto 6px">
        <div style="font-size:26px;font-weight:700;color:\${scoreColor};line-height:1">\${score.toFixed(1).replace(".",",")}</div>
        <div style="font-size:10px;color:\${PAL.x4}">/10</div>
      </div>
      <div style="font-size:10px;font-weight:700;color:\${scoreColor}">\${scoreLabel}</div>
      <div style="display:inline-block;padding:4px 14px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;background:\${decBg};color:#fff;margin-top:4px">\${esc(dec)}</div>
      \${scoreExt !== null ? \`<div style="font-size:10px;color:\${PAL.x4};margin-top:3px">Bureau: \${Math.round(scoreExt)}</div>\` : ""}
    </div>
  </div>\`;

  // ── BLOCO 2 — Info Strip 6 chips ──────────────────────────────────────
  const chips = [
    { l:"Fundação",     v: data.cnpj?.dataAbertura || "—" },
    { l:"Idade",        v: companyAge || "—" },
    { l:"Porte",        v: (data.cnpj?.porte || "—").substring(0,14) },
    { l:"Capital Social", v: capSoc, mono:true },
    { l:"Tipo",         v: (data.cnpj?.tipoUnidade || "—").substring(0,14) },
    { l:"Local",        v: localStr },
  ];
  const block2 = \`<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:18px">\${
    chips.map(c=>\`<div style="padding:10px 12px;background:\${PAL.x0};border-radius:6px;border:1px solid \${PAL.x1}">
      <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:\${PAL.x4};margin-bottom:4px">\${esc(c.l)}</div>
      <div style="font-size:13px;font-weight:600;color:\${PAL.x9}\${c.mono?";font-family:monospace":""}">
        \${esc(String(c.v))}
      </div>
    </div>\`).join("")
  }</div>\`;

  // ── BLOCO 3 — CNAE ────────────────────────────────────────────────────
  const cnaeMain = data.cnpj?.cnaePrincipal || data.cnpj?.cnae || "";
  const cnaeSec  = (data.cnpj?.cnaesSecundarios || []).slice(0,5).join(" · ");
  const block3 = cnaeMain ? \`<div style="padding:12px 16px;background:\${PAL.n0};border-radius:6px;border:1px solid \${PAL.n1};margin-bottom:18px;font-size:12px;color:\${PAL.n7}">
    <b style="color:\${PAL.n9}">CNAE \${esc(cnaeMain)}</b>
    \${cnaeSec ? \`<div style="font-size:10px;color:\${PAL.x5};margin-top:4px">CNAEs sec.: \${esc(cnaeSec)}</div>\` : ""}
  </div>\` : "";

  // ── BLOCO 4 — Localização (Street View + Endereço) ───────────────────
  const endStr  = data.cnpj?.endereco || "";
  const visitaStr = rvP?.estruturaFisica ? "Estrutura física confirmada em visita" : "";
  const block4 = \`\${stitle("Localização")}
  <div style="display:grid;grid-template-columns:3fr 2fr;gap:14px;margin-bottom:18px">
    <div style="border-radius:8px;overflow:hidden;border:1px solid \${PAL.x2};height:180px;background:\${PAL.x1};display:flex;align-items:center;justify-content:center">
      \${(p as unknown as Record<string,unknown>).streetViewBase64
        ? \`<img src="\${(p as unknown as Record<string,unknown>).streetViewBase64}" style="width:100%;height:100%;object-fit:cover">\`
        : \`<span style="font-size:11px;color:\${PAL.x4}">Street View indisponível</span>\`}
    </div>
    <div style="padding:16px;background:\${PAL.x0};border-radius:8px;border:1px solid \${PAL.x1};display:flex;flex-direction:column;justify-content:center">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:\${PAL.x4};margin-bottom:8px">Endereço</div>
      <div style="font-size:13px;color:\${PAL.x7};line-height:1.6">\${esc(endStr||"—")}</div>
      \${visitaStr ? \`<div style="font-size:10px;color:\${PAL.x5};margin-top:10px">\${esc(visitaStr)}</div>\` : ""}
    </div>
  </div>\`;

  // ── BLOCO 5 — Sócios ─────────────────────────────────────────────────
  const socios = data.qsa?.socios || data.qsa?.quadroSocietario || [];
  const socRows = socios.map((s: Record<string,string>) => {
    const nome    = esc((s.nome||s.nomeSocio||"—").toUpperCase());
    const cpfCnpj = esc(s.cpf||s.cnpj||s.cpfCnpj||"—");
    const qual    = esc(s.qualificacao||s.cargo||"—");
    const part    = esc(s.participacao||s.quotaPct||"—");
    const irKey   = (s.nome||"").toLowerCase().replace(/\\s+/g," ").trim();
    const patrim  = irMap.get(irKey)||"—";
    const patrimFmt = patrim !== "—" ? fmtMoneyRound(patrim) : "—";
    return \`<tr>
      <td style="padding:10px 14px;border-bottom:1px solid \${PAL.x1};color:\${PAL.x7}"><b>\${nome}</b></td>
      <td style="padding:10px 14px;border-bottom:1px solid \${PAL.x1};color:\${PAL.x7};font-family:monospace;font-size:11px">\${cpfCnpj}</td>
      <td style="padding:10px 14px;border-bottom:1px solid \${PAL.x1};color:\${PAL.x7}">\${qual}</td>
      <td style="padding:10px 14px;border-bottom:1px solid \${PAL.x1};color:\${PAL.x4}">\${part}</td>
      <td style="padding:10px 14px;border-bottom:1px solid \${PAL.x1};color:\${PAL.x7}"><b>\${patrimFmt}</b></td>
    </tr>\`;
  }).join("");
  const grupoQtd = (data.grupoEconomico?.empresas||[]).length;
  const block5 = \`\${stitle("Quadro societário")}
  <table style="width:100%;border-collapse:separate;border-spacing:0;font-size:12px;border:1px solid \${PAL.x2};border-radius:8px;overflow:hidden;margin-bottom:6px">
    <thead><tr>
      <th style="background:\${PAL.n9};color:rgba(255,255,255,0.85);font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:10px 14px;text-align:left">Sócio</th>
      <th style="background:\${PAL.n9};color:rgba(255,255,255,0.85);font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:10px 14px;text-align:left">CPF/CNPJ</th>
      <th style="background:\${PAL.n9};color:rgba(255,255,255,0.85);font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:10px 14px;text-align:left">Qualificação</th>
      <th style="background:\${PAL.n9};color:rgba(255,255,255,0.85);font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:10px 14px;text-align:left">Part.</th>
      <th style="background:\${PAL.n9};color:rgba(255,255,255,0.85);font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:10px 14px;text-align:left">Patrim. (IR)</th>
    </tr></thead>
    <tbody>\${socRows||(\`<tr><td colspan="5" style="padding:12px 14px;color:\${PAL.x4};text-align:center">Dados societários não disponíveis</td></tr>\`)}</tbody>
  </table>
  <div style="font-size:11px;color:\${PAL.x5};margin-bottom:18px">
    Capital Social: <b style="color:\${PAL.x9}">\${capSoc}</b>
    \${grupoQtd > 0 ? \` · Grupo Econômico: <b style="color:\${PAL.x9}">\${grupoQtd} empresa(s)</b>\` : " · Grupo Econômico: <b>Não identificado</b>"}
  </div>\`;

  // ── BLOCO 6 — Risco Consolidado ───────────────────────────────────────
  // classify helpers
  const classifyProt = (pr: Record<string,string>): {tag:string;cls:string} => {
    const esp = (pr.especie||"").toLowerCase();
    const cred = ((pr.credor||"")+(pr.apresentante||"")).toLowerCase();
    if (/susta/i.test(esp)) return {tag:"Sustação",cls:"sust"};
    if (/promiss|^\\s*np\\s*$/i.test(esp)) return {tag:"Nota Prom.",cls:"np"};
    if (FIDC_RE.test(cred)) return {tag:"FIDC",cls:"fidc"};
    if (/banco|financ|bradesco|itau|santander|bndes|caixa|bb\\b/i.test(cred)) return {tag:"Banco",cls:"banco"};
    if (/execu/i.test(esp)) return {tag:"Execução",cls:"exec"};
    return {tag:"Outros",cls:"np"};
  };
  const classifyProc = (pr: Record<string,string>): {tag:string;cls:string} => {
    const tipo = ((pr.tipo||"")+(pr.nome||"")).toLowerCase();
    if (/fiscal|sefaz|receita/i.test(tipo)) return {tag:"Exec. Fiscal",cls:"exec"};
    if (FIDC_RE.test(tipo)||/banco|financ|bradesco|itau|santander|caixa|bndes/i.test(tipo)) return {tag:"Banco/FIDC",cls:"banco"};
    if (/trabalhist|reclamação trab/i.test(tipo)) return {tag:"Trabalhista",cls:"np"};
    return {tag:"Outros",cls:"sust"};
  };

  const tagStyle = (cls:string) => {
    const map: Record<string,string> = {
      exec:"background:#e8d5f5;color:#6b21a8",
      sust:\`background:\${PAL.a1};color:\${PAL.a5}\`,
      np:\`background:\${PAL.n1};color:\${PAL.n7}\`,
      banco:"background:#dbeafe;color:#1d4ed8",
      fidc:\`background:\${PAL.g1};color:\${PAL.g6}\`,
    };
    return map[cls]||map["np"];
  };

  // group protests by type
  type ProtGroup = { tag:string; cls:string; count:number; totalVal:number };
  const protGroups = new Map<string,ProtGroup>();
  protAtivos.forEach(pr => {
    const {tag,cls} = classifyProt(pr as unknown as Record<string,string>);
    const k = tag;
    const existing = protGroups.get(k);
    if (existing) { existing.count++; existing.totalVal += numVal((pr as unknown as Record<string,string>).valor||"0"); }
    else protGroups.set(k, {tag,cls,count:1,totalVal:numVal((pr as unknown as Record<string,string>).valor||"0")});
  });

  // group processes by type
  type ProcGroup = { tag:string; cls:string; count:number };
  const procGroups = new Map<string,ProcGroup>();
  top10Rec.forEach(pr => {
    const {tag,cls} = classifyProc(pr);
    const k = tag;
    const existing = procGroups.get(k);
    if (existing) { existing.count++; }
    else procGroups.set(k, {tag,cls,count:1});
  });

  const scrTotalFmt = scrTotalAt > 0 ? fmtMoneyShort(scrTotalAt) : "—";
  const scrVencFmt  = scrVenc   > 0 ? fmtMoneyShort(scrVenc)    : "—";
  const scrVencFg   = scrVenc === 0 ? PAL.g6 : PAL.r6;
  const scrVencPctFmt = scrVenc === 0 ? "0,0%" : scrVencPct.toFixed(1).replace(".",",") + "%";
  const alavFmt = alav > 0 ? alav.toFixed(1).replace(".",",")+"x" : "—";

  const scrStrip = \`<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:10px">
    <div style="padding:8px 10px;background:#fff;border-radius:6px;border:1px solid \${PAL.x2}">
      <div style="font-size:8px;font-weight:600;text-transform:uppercase;color:\${PAL.x4};margin-bottom:3px">SCR Total</div>
      <div style="font-size:14px;font-weight:700;color:\${PAL.n9};font-family:monospace">\${scrTotalFmt}</div>
    </div>
    <div style="padding:8px 10px;background:#fff;border-radius:6px;border:1px solid \${PAL.x2}">
      <div style="font-size:8px;font-weight:600;text-transform:uppercase;color:\${PAL.x4};margin-bottom:3px">SCR Vencido</div>
      <div style="font-size:14px;font-weight:700;color:\${scrVencFg};font-family:monospace">\${scrVencFmt}</div>
    </div>
    <div style="padding:8px 10px;background:#fff;border-radius:6px;border:1px solid \${PAL.x2}">
      <div style="font-size:8px;font-weight:600;text-transform:uppercase;color:\${PAL.x4};margin-bottom:3px">% Vencido</div>
      <div style="font-size:14px;font-weight:700;color:\${scrVencFg}">\${scrVencPctFmt}</div>
    </div>
    <div style="padding:8px 10px;background:#fff;border-radius:6px;border:1px solid \${PAL.x2}">
      <div style="font-size:8px;font-weight:600;text-transform:uppercase;color:\${PAL.x4};margin-bottom:3px">Alavancagem</div>
      <div style="font-size:14px;font-weight:700;color:\${alav>0?PAL.n9:PAL.x4}">\${alavFmt}</div>
    </div>
    <div style="padding:8px 10px;background:#fff;border-radius:6px;border:1px solid \${PAL.x2}">
      <div style="font-size:8px;font-weight:600;text-transform:uppercase;color:\${PAL.x4};margin-bottom:3px">Nº IFs</div>
      <div style="font-size:14px;font-weight:700;color:\${PAL.n9}">\${scrInstit||"—"}</div>
    </div>
  </div>\`;

  // protests block
  const protItemsHtml = [...protGroups.values()].slice(0,4).map(g => \`
    <div style="font-size:10px;color:\${PAL.x7};padding:5px 0;border-bottom:1px solid \${PAL.x1};display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      <span style="display:inline-block;font-size:8px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:3px;\${tagStyle(g.cls)}">\${esc(g.tag)}</span>
      <span style="flex:1;color:\${PAL.x5}">\${g.count} ocorrência(s)</span>
      <span style="font-family:monospace;font-size:10px;color:\${g.totalVal>0?PAL.r6:PAL.x5}">\${g.totalVal>0?fmtMoneyShort(g.totalVal):"—"}</span>
    </div>\`).join("");
  const protRecenteHtml = protRecente ? \`
    <div style="height:1px;background:\${PAL.x1};margin:6px 0"></div>
    <div style="font-size:11px;color:\${PAL.x7};padding:4px 0;display:flex;justify-content:space-between"><span style="color:\${PAL.x5}">Último protesto</span><span style="font-weight:600">\${esc((protRecente as unknown as Record<string,string>).data||"—")}</span></div>
    <div style="font-size:11px;color:\${PAL.x7};padding:4px 0;display:flex;justify-content:space-between"><span style="color:\${PAL.x5}">Apresentante</span><span style="font-size:10px">\${esc((protRecente as unknown as Record<string,string>).apresentante||"—")}</span></div>
    <div style="font-size:11px;color:\${PAL.x7};padding:4px 0;display:flex;justify-content:space-between"><span style="color:\${PAL.x5}">Valor</span><span style="font-weight:600;color:\${PAL.r6}">\${fmtMoney(numVal((protRecente as unknown as Record<string,string>).valor||"0"))}</span></div>\` : "";
  const protBlock = \`<div style="background:#fff;border-radius:8px;border:1px solid \${PAL.x2};overflow:hidden">
    <div style="padding:10px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid \${PAL.x1}">
      <div>
        <div style="font-size:12px;font-weight:700;color:\${PAL.n9}">Protestos</div>
        <div style="font-size:10px;color:\${PAL.x5}">\${protVal>0?fmtMoneyShort(protVal)+" vigentes":"Sem valor"}</div>
      </div>
      <div style="font-size:22px;font-weight:700;color:\${protQtd>0?PAL.r6:PAL.g6}">\${protQtd}</div>
    </div>
    <div style="padding:12px 14px">
      <div style="font-size:11px;color:\${PAL.x5};padding:4px 0">Por tipo</div>
      \${protItemsHtml||(\`<div style="font-size:11px;color:\${PAL.g6};padding:6px 0">Sem protestos vigentes</div>\`)}
      \${protRecenteHtml}
    </div>
  </div>\`;

  // processes block
  const procItemsHtml = [...procGroups.values()].slice(0,4).map(g => \`
    <div style="font-size:10px;color:\${PAL.x7};padding:5px 0;border-bottom:1px solid \${PAL.x1};display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      <span style="display:inline-block;font-size:8px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:3px;\${tagStyle(g.cls)}">\${esc(g.tag)}</span>
      <span style="flex:1;color:\${PAL.x5}">\${g.count} proc.</span>
      <span style="font-family:monospace;font-size:10px;color:\${PAL.r6}">\${g.count} proc.</span>
    </div>\`).join("");
  const procRecenteHtml = top10Rec[0] ? \`
    <div style="height:1px;background:\${PAL.x1};margin:6px 0"></div>
    <div style="font-size:11px;color:\${PAL.x7};padding:4px 0;display:flex;justify-content:space-between"><span style="color:\${PAL.x5}">Último processo</span><span style="font-weight:600">\${esc(top10Rec[0].dataDistribuicao||top10Rec[0].data||"—")}</span></div>
    <div style="font-size:11px;color:\${PAL.x7};padding:4px 0;display:flex;justify-content:space-between"><span style="color:\${PAL.x5}">Tipo</span><span style="font-size:10px">\${esc(top10Rec[0].tipo||top10Rec[0].nome||"—")}</span></div>
    <div style="font-size:11px;color:\${PAL.x7};padding:4px 0;display:flex;justify-content:space-between"><span style="color:\${PAL.x5}">Vara</span><span style="font-size:10px">\${esc(top10Rec[0].vara||top10Rec[0].tribunal||"—")}</span></div>\` : "";
  const procBlock = \`<div style="background:#fff;border-radius:8px;border:1px solid \${PAL.x2};overflow:hidden">
    <div style="padding:10px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid \${PAL.x1}">
      <div>
        <div style="font-size:12px;font-weight:700;color:\${PAL.n9}">Processos Judiciais</div>
        <div style="font-size:10px;color:\${PAL.x5}">Passivo: \${procPassivo} · Ativo: \${procAtivo}</div>
      </div>
      <div style="font-size:22px;font-weight:700;color:\${procTotal>0?PAL.r6:PAL.g6}">\${procTotal}</div>
    </div>
    <div style="padding:12px 14px">
      <div style="font-size:11px;color:\${PAL.x5};padding:4px 0">Por tipo</div>
      \${procItemsHtml||(\`<div style="font-size:11px;color:\${PAL.g6};padding:6px 0">Sem processos identificados</div>\`)}
      \${procRecenteHtml}
    </div>
  </div>\`;

  // CCF inline
  const ccfHtml = \`<div style="font-size:11px;color:\${PAL.x7};padding:6px 0;display:flex;justify-content:space-between;align-items:center">
    <span style="color:\${PAL.x5}">CCF (Cheques sem Fundo)</span>
    \${ccfQtd === null
      ? \`<span style="color:\${PAL.x4}">Não consultado</span>\`
      : ccfQtdNum === 0
        ? \`<span style="font-weight:600;color:\${PAL.g6};font-size:13px">0 — limpo</span>\`
        : \`<span style="font-weight:700;color:\${PAL.r6};font-size:13px">\${ccfQtdNum} registro(s) · \${ccfBancos.map((b:string)=>esc(b)).join(", ")}</span>\`}
  </div>\`;

  // alerts
  const riskAlerts: string[] = [];
  if (protQtd > 0) {
    const protRatio = fmmNum > 0 ? (protVal/fmmNum*100).toFixed(0)+"% do FMM" : "";
    riskAlerts.push(makeAlert("alta", \`\${protQtd} protesto(s) vigente(s)\${protVal>0?" — "+fmtMoneyShort(protVal)+(protRatio?" ("+protRatio+")":""):""}\`));
  }
  if (procPassivo >= 5) riskAlerts.push(makeAlert("alta", \`\${procPassivo} processos no polo passivo\`));
  if (ccfQtdNum > 0) riskAlerts.push(makeAlert("alta", \`CCF: \${ccfQtdNum} ocorrência(s) — \${ccfBancos.slice(0,2).map((b:string)=>esc(b)).join(", ")}\`));
  if (dividaAtivaVal > 0) riskAlerts.push(makeAlert("alta", \`Dívida ativa de \${fmtMoneyShort(dividaAtivaVal)} — verificar certidão antes da aprovação\`));
  if (protTemFIDC || procTemFIDC) riskAlerts.push(makeAlert("mod", "Alertas de FIDC/Fundo identificados nos apontamentos"));
  if (scrVencPct > 10) riskAlerts.push(makeAlert("mod", \`SCR vencido: \${scrVencPct.toFixed(1).replace(".",",")}% da dívida ativa\`));

  const block6 = \`\${stitle("Risco consolidado")}
  <div style="background:\${PAL.x0};border-radius:10px;border:1px solid \${PAL.x2};padding:20px;margin-bottom:18px">
    \${scrStrip}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
      \${protBlock}
      \${procBlock}
    </div>
    \${ccfHtml}
    \${riskAlerts.length>0?(\`<div style="margin-top:10px">\${riskAlerts.join("")}</div>\`):""}
  </div>\`;

  // ── BLOCO 7 — Faturamento + SCR ───────────────────────────────────────
  const maxVal = Math.max(1, ...last12.map(m => numVal(m.valor)));
  const currentYear = new Date().getFullYear();
  const barsHtml = last12.map(m => {
    const v = numVal(m.valor);
    const pct = Math.max(2, Math.round((v/maxVal)*100));
    const mes  = (m.mes||"").split("/")[0].substring(0,3);
    const mesY = parseInt((m.mes||"").split("/")[1]||"0") || 0;
    const isRecent = mesY >= currentYear - 1;
    const barColor = isRecent ? "#dce6f5" : "#132952";
    return \`<div style="flex:1;display:flex;flex-direction:column;align-items:center">
      <div style="width:100%;border-radius:3px 3px 0 0;min-height:2px;position:relative;background:\${barColor};height:\${pct}px">
        <div style="position:absolute;top:-14px;left:50%;transform:translateX(-50%);font-size:7px;color:\${PAL.x5};white-space:nowrap;font-family:monospace">\${fmtMoneyShort(v)}</div>
      </div>
      <div style="font-size:8px;color:\${PAL.x4};margin-top:5px">\${esc(mes)}</div>
    </div>\`;
  }).join("");

  const fat3 = last12.slice(-3).map(m=>numVal(m.valor));
  const fatPrev3 = last12.slice(-6,-3).map(m=>numVal(m.valor));
  const fat3Avg = fat3.length ? fat3.reduce((a,b)=>a+b,0)/fat3.length : 0;
  const fatPrev3Avg = fatPrev3.length ? fatPrev3.reduce((a,b)=>a+b,0)/fatPrev3.length : 0;
  const tendPct = fatPrev3Avg > 0 ? ((fat3Avg - fatPrev3Avg)/fatPrev3Avg*100) : 0;
  const tendFg  = tendPct >= 0 ? PAL.g6 : PAL.r6;
  const tendStr = (tendPct >= 0 ? "↑ +" : "↓ ") + tendPct.toFixed(0).replace("-","") + "%";

  const fatBox = \`<div style="background:\${PAL.x0};border-radius:8px;border:1px solid \${PAL.x1};padding:16px">
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:\${PAL.x5};margin-bottom:12px">Faturamento mensal — últimos 12 meses</div>
    <div style="display:flex;align-items:flex-end;gap:5px;height:100px;margin-bottom:8px">\${barsHtml}</div>
    <div style="display:flex;gap:16px;font-size:11px;color:\${PAL.x5};padding-top:8px;border-top:1px solid \${PAL.x1};margin-top:8px">
      <span>FMM: <b style="color:\${PAL.n9}">\${fmmNum>0?fmtMoneyShort(fmmNum):"—"}</b></span>
      <span>Total 12M: <b style="color:\${PAL.n9}">\${fmtMoneyShort(fatTotal12)}</b></span>
      \${fat3.length ? \`<span>Tendência: <span style="color:\${tendFg};font-weight:600">\${tendStr}</span></span>\` : ""}
    </div>
  </div>\`;

  // SCR comparative table
  const scrComp = data.scr?.comparativo as Record<string,unknown>|undefined;
  const scrAtual = (scrComp?.atual || scrComp?.periodoAtual || {}) as Record<string,string>;
  const scrAnt   = (scrComp?.anterior || scrComp?.periodoAnterior || {}) as Record<string,string>;
  const scrPeriodoAt = scrComp?.periodoAtualLabel || data.scr?.ultimoPeriodo || "Atual";
  const scrPeriodoAn = scrComp?.periodoAnteriorLabel || data.scr?.penultimoPeriodo || "Anterior";

  const varPct = (cur:number, ant:number): {txt:string;cls:string} => {
    if (!ant || !isFinite(ant/cur)) return {txt:"—",cls:"neutral"};
    const p = ((cur-ant)/Math.abs(ant)*100);
    const isRed = p > 5; // increase in debt = bad
    return {txt:(p>=0?"↑ +":"↓ ")+Math.abs(p).toFixed(0)+"%", cls: isRed?"up":"down"};
  };

  const scrRows = [
    ["Curto Prazo", "cpAtual","cpAnterior"],
    ["Longo Prazo", "lpAtual","lpAnterior"],
    ["Vencidos",    "vencidosAtual","vencidosAnterior"],
    ["Prejuízos",   "prejuizosAtual","prejuizosAnterior"],
    ["Limite Crédito","limiteCreditoAtual","limiteCreditoAnterior"],
  ].map(([label, kAt, kAn]) => {
    const vAt = numVal(String(scrAtual[kAt]||"0"));
    const vAn = numVal(String(scrAnt[kAn]||"0"));
    const {txt,cls} = varPct(vAt, vAn);
    const fAt = vAt > 0 ? fmtMoneyShort(vAt) : "—";
    const fAn = vAn > 0 ? fmtMoneyShort(vAn) : "—";
    const varFg = cls==="down"?PAL.g6:cls==="up"?PAL.r6:PAL.x4;
    return \`<tr>
      <td style="padding:7px 10px;border-bottom:1px solid \${PAL.x1};color:\${PAL.x7};font-size:11px">\${label}</td>
      <td style="padding:7px 10px;border-bottom:1px solid \${PAL.x1};text-align:right;font-family:monospace;font-size:10px">\${fAt}</td>
      <td style="padding:7px 10px;border-bottom:1px solid \${PAL.x1};text-align:right;font-family:monospace;font-size:10px">\${fAn}</td>
      <td style="padding:7px 10px;border-bottom:1px solid \${PAL.x1};text-align:right;font-size:10px;font-weight:600;color:\${varFg}">\${txt}</td>
    </tr>\`;
  }).join("");
  const scrTotalAt2 = numVal(String(scrAtual.totalAtual || scrAtual.totalDividasAtivas || "0")) || scrTotalAt;
  const scrTotalAn2 = numVal(String(scrAnt.totalAnterior || scrAnt.totalDividasAtivas || "0"));
  const {txt:vt,cls:vtC} = varPct(scrTotalAt2, scrTotalAn2);
  const vtFg = vtC==="down"?PAL.g6:vtC==="up"?PAL.r6:PAL.x4;
  const scrOps  = data.scr?.qtdeOperacoes || "";

  const scrBox = \`<div style="background:\${PAL.x0};border-radius:8px;border:1px solid \${PAL.x1};padding:16px">
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:\${PAL.x5};margin-bottom:12px">SCR comparativo — \${esc(String(scrPeriodoAn))} → \${esc(String(scrPeriodoAt))}</div>
    <table style="width:100%;border-collapse:separate;border-spacing:0;font-size:11px">
      <thead><tr>
        <th style="background:\${PAL.n9};color:rgba(255,255,255,0.85);font-size:8px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;padding:8px 10px;text-align:left">Métrica</th>
        <th style="background:\${PAL.n9};color:rgba(255,255,255,0.85);font-size:8px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;padding:8px 10px;text-align:right">Atual</th>
        <th style="background:\${PAL.n9};color:rgba(255,255,255,0.85);font-size:8px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;padding:8px 10px;text-align:right">Anterior</th>
        <th style="background:\${PAL.n9};color:rgba(255,255,255,0.85);font-size:8px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;padding:8px 10px;text-align:right">Var.</th>
      </tr></thead>
      <tbody>
        \${scrRows}
        <tr style="font-weight:700;background:\${PAL.x0}">
          <td style="padding:7px 10px;color:\${PAL.n9};font-size:11px">Total Dívidas</td>
          <td style="padding:7px 10px;text-align:right;font-family:monospace;font-size:10px">\${scrTotalAt2>0?fmtMoneyShort(scrTotalAt2):"—"}</td>
          <td style="padding:7px 10px;text-align:right;font-family:monospace;font-size:10px">\${scrTotalAn2>0?fmtMoneyShort(scrTotalAn2):"—"}</td>
          <td style="padding:7px 10px;text-align:right;font-size:10px;color:\${vtFg}">\${vt}</td>
        </tr>
      </tbody>
    </table>
    <div style="font-size:9px;color:\${PAL.x4};margin-top:6px">Instituições financeiras: \${scrInstit||"—"}\${scrOps?" · Operações: "+esc(String(scrOps)):""}</div>
  </div>\`;

  const block7 = \`\${stitle("Faturamento & SCR")}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px">
    \${fatBox}
    \${scrBox}
  </div>\`;

  // ── BLOCO 8 — Curva ABC ────────────────────────────────────────────────
  const abcClientes = (data.curvaAbc?.clientes || []).slice(0,3);
  const abcTop3Pct = abcClientes.reduce((s:number, c:Record<string,string>) => s + numVal(c.participacaoPct||"0"), 0);
  const abcTop5 = (data.curvaAbc?.clientes||[]).slice(0,5).reduce((s:number, c:Record<string,string>)=>s+numVal(c.participacaoPct||"0"),0);
  const abcTotal = (data.curvaAbc?.clientes||[]).length;
  const abcMaxFat = Math.max(1, ...abcClientes.map((c:Record<string,string>)=>numVal(c.faturamento||c.valor||"0")));

  const abcClCss = (cl:string) => {
    const k = (cl||"A").toUpperCase();
    if (k==="A") return \`background:\${PAL.r1};color:\${PAL.r6}\`;
    if (k==="B") return \`background:\${PAL.a1};color:\${PAL.a5}\`;
    return \`background:\${PAL.x1};color:\${PAL.x5}\`;
  };

  let abcAccum = 0;
  const abcRows = abcClientes.map((c:Record<string,string>, i:number) => {
    const fat = numVal(c.faturamento||c.valor||"0");
    const pct = numVal(c.participacaoPct||"0");
    abcAccum += pct;
    const barW = Math.round((fat/abcMaxFat)*100);
    const cl   = c.classe||c.curva||"A";
    return \`<tr>
      <td style="padding:9px 12px;border-bottom:1px solid \${PAL.x1}">
        <div style="display:inline-flex;width:22px;height:22px;border-radius:50%;background:\${PAL.n8};color:#fff;font-size:10px;font-weight:700;align-items:center;justify-content:center">\${i+1}</div>
      </td>
      <td style="padding:9px 12px;border-bottom:1px solid \${PAL.x1}">
        <b style="font-size:12px">\${esc(c.cliente||c.nome||"—")}</b>
        <div style="height:5px;border-radius:3px;background:\${PAL.n8};display:block;margin-top:3px;width:\${barW}%"></div>
      </td>
      <td style="padding:9px 12px;border-bottom:1px solid \${PAL.x1};text-align:right;font-family:monospace;font-size:11px">\${fmtMoney(fat)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid \${PAL.x1};text-align:right;font-weight:600;font-size:11px">\${pct.toFixed(1).replace(".",",")}%</td>
      <td style="padding:9px 12px;border-bottom:1px solid \${PAL.x1};text-align:right;font-weight:600;font-size:11px">\${abcAccum.toFixed(1).replace(".",",")}%</td>
      <td style="padding:9px 12px;border-bottom:1px solid \${PAL.x1}"><span style="padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;\${abcClCss(cl)}">\${esc(cl)}</span></td>
    </tr>\`;
  }).join("");

  const abcConcentrAlert = abcClientes[0] && numVal((abcClientes[0] as Record<string,string>).participacaoPct||"0") >= 20
    ? makeAlert("alta", \`\${esc((abcClientes[0] as Record<string,string>).cliente||(abcClientes[0] as Record<string,string>).nome||"Top cliente")} concentra \${numVal((abcClientes[0] as Record<string,string>).participacaoPct||"0").toFixed(0)}% da receita — limite recomendado: 20%\`)
    : "";

  const block8 = abcClientes.length ? \`\${stitle("Concentração de clientes")}
  <div style="background:\${PAL.x0};border-radius:10px;border:1px solid \${PAL.x2};padding:16px;margin-bottom:18px">
    <table style="width:100%;border-collapse:separate;border-spacing:0;font-size:11px;margin-bottom:8px">
      <thead><tr>
        <th style="width:40px;background:\${PAL.n9};color:rgba(255,255,255,0.85);font-size:8px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;padding:9px 12px;text-align:left">#</th>
        <th style="background:\${PAL.n9};color:rgba(255,255,255,0.85);font-size:8px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;padding:9px 12px;text-align:left">Cliente</th>
        <th style="background:\${PAL.n9};color:rgba(255,255,255,0.85);font-size:8px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;padding:9px 12px;text-align:right">Faturamento</th>
        <th style="background:\${PAL.n9};color:rgba(255,255,255,0.85);font-size:8px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;padding:9px 12px;text-align:right">% Rec.</th>
        <th style="background:\${PAL.n9};color:rgba(255,255,255,0.85);font-size:8px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;padding:9px 12px;text-align:right">% Acum.</th>
        <th style="width:50px;background:\${PAL.n9};color:rgba(255,255,255,0.85);font-size:8px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;padding:9px 12px">Cl.</th>
      </tr></thead>
      <tbody>\${abcRows}</tbody>
    </table>
    <div style="font-size:11px;color:\${PAL.x5}">Top 3: <b style="color:\${PAL.x9}">\${abcTop3Pct.toFixed(0)}%</b> · Top 5: <b style="color:\${PAL.x9}">\${abcTop5.toFixed(0)}%</b> · Total clientes: <b style="color:\${PAL.x9}">\${abcTotal}</b></div>
    \${abcConcentrAlert}
  </div>\` : "";

  // ── BLOCO 9 — Pleito ─────────────────────────────────────────────────
  const modalidade  = esc(rvP?.modalidade || data.relatorioVisita?.modalidade || "—");
  const prazoMax    = esc(rvP?.prazoMaximo || "—");
  const taxaJuros   = esc(rvP?.taxaJuros || "—");
  const pleitoFmt   = pleitoVal > 0 ? fmtMoney(pleitoVal) : "—";
  const ratioColor  = pleitoFmmRatio >= 4 ? PAL.r6 : pleitoFmmRatio >= 2 ? PAL.a5 : PAL.g6;

  const block9 = \`\${stitle("Pleito")}
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:18px">
    <div style="padding:12px 14px;background:\${PAL.n0};border-radius:6px;border:1px solid \${PAL.n1}">
      <div style="font-size:8px;font-weight:700;text-transform:uppercase;color:\${PAL.x4};margin-bottom:4px">Valor Pleiteado</div>
      <div style="font-size:14px;font-weight:700;color:\${pleitoVal>0?PAL.n9:PAL.x4}">\${pleitoFmt}</div>
    </div>
    <div style="padding:12px 14px;background:\${PAL.n0};border-radius:6px;border:1px solid \${PAL.n1}">
      <div style="font-size:8px;font-weight:700;text-transform:uppercase;color:\${PAL.x4};margin-bottom:4px">Modalidade</div>
      <div style="font-size:14px;font-weight:700;color:\${PAL.n9}">\${modalidade}</div>
    </div>
    <div style="padding:12px 14px;background:\${PAL.n0};border-radius:6px;border:1px solid \${PAL.n1}">
      <div style="font-size:8px;font-weight:700;text-transform:uppercase;color:\${PAL.x4};margin-bottom:4px">Prazo Máx.</div>
      <div style="font-size:14px;font-weight:700;color:\${PAL.n9}">\${prazoMax}</div>
    </div>
    <div style="padding:12px 14px;background:\${PAL.n0};border-radius:6px;border:1px solid \${PAL.n1}">
      <div style="font-size:8px;font-weight:700;text-transform:uppercase;color:\${PAL.x4};margin-bottom:4px">Taxa</div>
      <div style="font-size:14px;font-weight:700;color:\${PAL.n9}">\${taxaJuros}</div>
    </div>
  </div>\`;

  // ── BLOCO 10 — Análise (Fortes / Fracos / Alertas) ───────────────────
  const pf  = (pontosFortes||[]).slice(0,6);
  const pfr = (pontosFracos||[]).slice(0,6);
  const alertsArr = (p.alerts||p.alertsHigh||[]).slice(0,5);
  const mkItems = (arr:string[], fg:string) =>
    arr.map(it=>\`<div style="font-size:11px;color:\${PAL.x7};padding:3px 0;line-height:1.5">
      <span style="color:\${fg};font-weight:700;margin-right:6px">•</span>\${esc(it)}
    </div>\`).join("");

  const block10 = (pf.length || pfr.length || alertsArr.length) ? \`\${stitle("Análise")}
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:18px">
    <div style="border-radius:8px;padding:14px 16px;background:\${PAL.g0};border:1px solid \${PAL.g1}">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:\${PAL.g6};margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(0,0,0,0.06)">Pontos Fortes</div>
      \${mkItems(pf.length?pf:["Não disponível"], PAL.g6)}
    </div>
    <div style="border-radius:8px;padding:14px 16px;background:\${PAL.r0};border:1px solid \${PAL.r1}">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:\${PAL.r6};margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(0,0,0,0.06)">Pontos Fracos</div>
      \${mkItems(pfr.length?pfr:["Não disponível"], PAL.r6)}
    </div>
    <div style="border-radius:8px;padding:14px 16px;background:\${PAL.a0};border:1px solid \${PAL.a1}">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:\${PAL.a5};margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(0,0,0,0.06)">Alertas</div>
      \${mkItems(alertsArr.length?alertsArr:["Sem alertas"], PAL.a5)}
    </div>
  </div>\` : "";

  // ── BLOCO 11 — Percepção do analista ─────────────────────────────────
  const resumo = resumoExecutivo || "";
  const block11 = resumo ? \`\${stitle("Percepção do analista")}
  <div style="padding:16px 18px;background:\${PAL.x0};border-radius:8px;border:1px solid \${PAL.x2}">
    <div style="font-size:12px;color:\${PAL.x7};line-height:1.7">\${esc(resumo)}</div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid \${PAL.x2};font-size:11px;color:\${PAL.x5}">
      Recomendação:
      <span style="display:inline-block;padding:4px 14px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;background:\${decBg};color:#fff">\${esc(dec)}</span>
      <span style="color:\${PAL.x4};font-size:10px">· Ver parecer completo na seção 02</span>
    </div>
  </div>\` : "";

  return \`<div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:12px;color:#111827;padding:0">
  \${block1}
  \${block2}
  \${block3}
  \${block4}
  \${block5}
  \${block6}
  \${block7}
  \${block8}
  \${block9}
  \${block10}
  \${block11}
</div>\`;
}`;

const result = [...before, ...newFn.split('\n'), ...after].join('\n');
writeFileSync(path, result, 'utf8');
console.log('Done. New line count:', result.split('\n').length);
