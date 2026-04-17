import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");
const templatePath = resolve(root, "lib/pdf/template.ts");

// ─────────────────────────────────────────────────────────────────────────────
// NEW secSintese — reference design (sintese-v3-esboco.html)
// ─────────────────────────────────────────────────────────────────────────────
const NEW_FN = `function secSintese(p: PDFReportParams): string {
  const { data, finalRating, decision, pontosFortes, pontosFracos, resumoExecutivo, companyAge } = p;

  const C = {
    n9:"#0c1b3a", n8:"#132952", n7:"#1a3a6b", n1:"#dce6f5", n0:"#eef3fb",
    a5:"#d4940a", a1:"#fdf3d7", a0:"#fef9ec",
    r6:"#c53030", r1:"#fee2e2", r0:"#fef2f2",
    g6:"#16653a", g1:"#d1fae5", g0:"#ecfdf5",
    x9:"#111827", x7:"#374151", x5:"#6b7280", x4:"#9ca3af",
    x3:"#d1d5db", x2:"#e5e7eb", x1:"#f3f4f6", x0:"#f9fafb",
  };

  const score = finalRating || 0;
  const scoreColor = score >= 6.5 ? C.g6 : score >= 5 ? C.a5 : C.r6;
  const scoreLabel = score >= 8 ? "EXCELENTE" : score >= 6.5 ? "SATISFATÓRIO" : score >= 5 ? "MODERADO" : "ALTO RISCO";
  const dec = (decision || "—").replace(/_/g, " ").toUpperCase();
  const decBg = (/APROV/i.test(dec) && !/CONDIC/i.test(dec)) ? C.g6 : /REPROV/i.test(dec) ? C.r6 : C.a5;

  // ─── inline helpers ────────────────────────────────────────────────────────
  const ms = (v: number): string => {
    if (v >= 1e9) return \`R$ \${(v/1e9).toFixed(1).replace(".",",")}B\`;
    if (v >= 1e6) return \`R$ \${(v/1e6).toFixed(1).replace(".",",")}M\`;
    if (v >= 1e3) return \`R$ \${Math.round(v/1e3)}k\`;
    return fmtMoney(v);
  };
  const stitle = (t: string) =>
    \`<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:\${C.x5};margin:20px 0 10px;display:flex;align-items:center;gap:8px">\${esc(t)}<div style="flex:1;height:1px;background:\${C.x2}"></div></div>\`;
  const mkAlert = (sev: "alta"|"mod"|"info", msg: string) => {
    const [bg,br,fg,tag] = sev==="alta"
      ? [C.r0,C.r1,C.r6,"ALTA"]
      : sev==="mod"
        ? [C.a0,C.a1,C.a5,"MOD"]
        : [C.n0,C.n1,C.n7,"INFO"];
    return \`<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;background:\${bg};border:1px solid \${br};color:\${fg};font-size:11px;margin-bottom:6px"><span style="font-size:8px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:3px;background:\${br};flex-shrink:0">\${tag}</span>\${esc(msg)}</div>\`;
  };

  // ─── data ──────────────────────────────────────────────────────────────────
  const last12 = sortMeses(data.faturamento?.meses || []).filter(m => m?.mes && m?.valor).slice(-12);
  const fmmNum = computeFmm(data.faturamento);
  const fatTotal12 = last12.reduce((s, m) => s + numVal(m.valor), 0);
  const protQtd = p.protestosVigentes || 0;
  const protVal = numVal(data.protestos?.vigentesValor || "0");
  const ccfQtd = data.ccf?.qtdRegistros ?? null;
  const ccfQtdNum = ccfQtd != null ? Number(ccfQtd) || 0 : 0;
  const scrTotalAt = numVal(data.scr?.totalDividasAtivas || "0");
  const scrVenc = p.vencidosSCR || 0;
  const scrVencPct = scrTotalAt > 0 ? (scrVenc / scrTotalAt) * 100 : 0;
  const alav = p.alavancagem ?? 0;
  const dividaAtivaVal = p.dividaAtiva || 0;
  const scrInstit = parseInt(data.scr?.qtdeInstituicoes || "0") || 0;
  const FIDC_RE = /\\b(fidc|fundo)\\b/i;
  const protAtivos = (data.protestos?.detalhes || []).filter(pr => !pr.regularizado);
  const protRecente = [...protAtivos].sort((a,b)=>(b.data||"").localeCompare(a.data||""))[0] ?? null;
  const protTemFIDC = protAtivos.some(pr => FIDC_RE.test((pr.credor||"")+" "+(pr.apresentante||"")));
  const procRaw = data.processos as unknown as Record<string,unknown>;
  const procPassivo = parseInt(String(procRaw?.poloPassivoQtd || data.processos?.passivosTotal || "0")) || 0;
  const procAtivo  = parseInt(String(procRaw?.poloAtivoQtd  || data.processos?.ativosTotal   || "0")) || 0;
  const top10Rec   = Array.isArray(procRaw?.top10Recentes) ? procRaw.top10Recentes as Array<Record<string,string>> : [];
  const bancarios  = Array.isArray(procRaw?.bancarios) ? procRaw.bancarios as Array<Record<string,string>> : [];
  const procTemFIDC = bancarios.some(pr=>FIDC_RE.test(pr.nome||"")) || top10Rec.some(pr=>FIDC_RE.test(pr.nome||""));
  const procTotal  = procPassivo + procAtivo || top10Rec.length;
  const ccfBancos  = (data.ccf?.bancos || []).slice(0, 4);
  const rvP = data.relatorioVisita;
  const pleitoVal = rvP?.limiteTotal ? numVal(rvP.limiteTotal) : 0;
  const pleitoFmmRatio = fmmNum > 0 && pleitoVal > 0 ? pleitoVal / fmmNum : 0;
  const irMap = new Map<string,string>(
    (data.irSocios||[]).filter(ir=>ir?.nomeSocio)
      .map(ir=>[ir.nomeSocio.toLowerCase().replace(/\\s+/g," ").trim(), ir.patrimonioLiquido||ir.totalBensDireitos||""])
  );
  const razao   = esc(data.cnpj?.razaoSocial || "—");
  const fantasia = esc(data.cnpj?.nomeFantasia || "");
  const cnpjFmt = fmtCnpj(data.cnpj?.cnpj);
  const situacao = (data.cnpj?.situacaoCadastral || "").toUpperCase().trim();
  const situAtiva = situacao.includes("ATIVA");
  const situBg = situAtiva ? C.g1 : C.a1;
  const situFg = situAtiva ? C.g6 : C.a5;
  const extractLocal = (e: string|undefined) => {
    if (!e) return "—";
    const m = e.match(/([A-Za-zÁÂÃÇÉÍÓÔÚáâãçéíóôú \\-']{3,})[\\s/-]+([A-Z]{2})\\b/);
    if (m) return \`\${m[1].trim()}/\${m[2]}\`;
    return e.split(/[,\\-/]/).map(s=>s.trim()).filter(Boolean).slice(-2).join("/") || e.substring(0,22);
  };
  const capSocRaw = data.qsa?.capitalSocial || data.cnpj?.capitalSocialCNPJ || "";
  const capSoc = capSocRaw ? fmtMoneyRound(capSocRaw) : "—";
  let scoreExt: number|null = null;
  if (data.score) {
    const s = data.score as Record<string,unknown>;
    for (const key of ["credithub","serasa","quod"]) {
      const v = s[key];
      if (typeof v==="number"&&isFinite(v)){scoreExt=v;break;}
      if (typeof v==="string"){const n=parseFloat(v.replace(",","."));if(!isNaN(n)){scoreExt=n;break;}}
      if (v&&typeof v==="object"){const o=v as Record<string,unknown>;for(const f of["score","pontuacao","valor"]){if(typeof o[f]==="number"&&isFinite(o[f] as number)){scoreExt=o[f] as number;break;}}if(scoreExt!==null)break;}
    }
  }

  // ─── BLOCO 1 — Empresa + Rating ───────────────────────────────────────────
  const B1 = \`<div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:1px solid \${C.x2};margin-bottom:20px">
    <div>
      <div style="font-size:18px;font-weight:700;color:\${C.n9};margin-bottom:3px">\${razao}</div>
      \${fantasia ? \`<div style="font-size:11px;color:\${C.x5};margin-bottom:6px">\${fantasia}</div>\` : ""}
      <div style="font-size:12px;color:\${C.x5}">CNPJ: <b style="color:\${C.x7};font-family:monospace">\${esc(cnpjFmt)}</b>\${situacao ? \` <span style="display:inline-block;padding:2px 10px;border-radius:4px;font-size:10px;font-weight:600;background:\${situBg};color:\${situFg};margin-left:8px">\${esc(situacao.substring(0,14))}</span>\` : ""}</div>
    </div>
    <div style="text-align:center;min-width:110px">
      <div style="width:72px;height:72px;border-radius:50%;border:3px solid \${scoreColor};display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0 auto 6px">
        <div style="font-size:26px;font-weight:700;color:\${scoreColor};line-height:1">\${score.toFixed(1).replace(".",",")}</div>
        <div style="font-size:10px;color:\${C.x4}">/10</div>
      </div>
      <div style="font-size:10px;font-weight:700;color:\${scoreColor}">\${scoreLabel}</div>
      <div style="display:inline-block;padding:4px 14px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;background:\${decBg};color:#fff;margin-top:4px">\${esc(dec)}</div>
      \${scoreExt!==null ? \`<div style="font-size:10px;color:\${C.x4};margin-top:3px">Bureau: \${Math.round(scoreExt)}</div>\` : ""}
    </div>
  </div>\`;

  // ─── BLOCO 2 — 6 chips ────────────────────────────────────────────────────
  const chips = [
    {l:"Fundação",      v:data.cnpj?.dataAbertura||"—"},
    {l:"Idade",         v:companyAge||"—"},
    {l:"Porte",         v:(data.cnpj?.porte||"—").substring(0,14)},
    {l:"Capital Social",v:capSoc,mono:true},
    {l:"Tipo",          v:(data.cnpj?.naturezaJuridica||"—").substring(0,14)},
    {l:"Local",         v:extractLocal(data.cnpj?.endereco)},
  ];
  const B2 = \`<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:18px">\${
    chips.map(c=>\`<div style="padding:10px 12px;background:\${C.x0};border-radius:6px;border:1px solid \${C.x1}"><div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:\${C.x4};margin-bottom:4px">\${esc(c.l)}</div><div style="font-size:13px;font-weight:600;color:\${C.x9}\${(c as {mono?:boolean}).mono?";font-family:monospace":""}">\${esc(String(c.v))}</div></div>\`).join("")
  }</div>\`;

  // ─── BLOCO 3 — CNAE ───────────────────────────────────────────────────────
  const cnaeMain = data.cnpj?.cnaePrincipal || "";
  const cnaeSec  = data.cnpj?.cnaeSecundarios || "";
  const B3 = cnaeMain ? \`<div style="padding:12px 16px;background:\${C.n0};border-radius:6px;border:1px solid \${C.n1};margin-bottom:18px;font-size:12px;color:\${C.n7}"><b style="color:\${C.n9}">CNAE \${esc(cnaeMain)}</b>\${cnaeSec?\`<div style="font-size:10px;color:\${C.x5};margin-top:4px">CNAEs sec.: \${esc(cnaeSec.substring(0,120))}</div>\`:""}</div>\` : "";

  // ─── BLOCO 4 — Localização ────────────────────────────────────────────────
  const endStr = data.cnpj?.endereco || "";
  const svB64  = (p as unknown as Record<string,unknown>).streetViewBase64;
  const svSrc  = typeof svB64==="string"&&svB64.length>100 ? (svB64.startsWith("data:")?svB64:\`data:image/jpeg;base64,\${svB64}\`) : null;
  const B4 = \`\${stitle("Localização")}<div style="display:grid;grid-template-columns:3fr 2fr;gap:14px;margin-bottom:18px">
    <div style="border-radius:8px;overflow:hidden;border:1px solid \${C.x2};height:180px;background:\${C.x1};display:flex;align-items:center;justify-content:center">\${svSrc?\`<img src="\${svSrc}" style="width:100%;height:100%;object-fit:cover">\`:\`<span style="font-size:11px;color:\${C.x4}">Street View indisponível</span>\`}</div>
    <div style="padding:16px;background:\${C.x0};border-radius:8px;border:1px solid \${C.x1};display:flex;flex-direction:column;justify-content:center"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:\${C.x4};margin-bottom:8px">Endereço</div><div style="font-size:13px;color:\${C.x7};line-height:1.6">\${esc(endStr||"—")}</div>\${rvP?.estruturaFisicaConfirmada?\`<div style="font-size:10px;color:\${C.x5};margin-top:10px">Estrutura física confirmada em visita</div>\`:""}</div>
  </div>\`;

  // ─── BLOCO 5 — Sócios ─────────────────────────────────────────────────────
  const socios = data.qsa?.quadroSocietario || [];
  const socRows = socios.map(s => {
    const irKey = (s.nome||"").toLowerCase().replace(/\\s+/g," ").trim();
    const patrim = irMap.get(irKey)||"—";
    return \`<tr><td style="padding:10px 14px;border-bottom:1px solid \${C.x1};color:\${C.x7}"><b>\${esc((s.nome||"—").toUpperCase())}</b></td><td style="padding:10px 14px;border-bottom:1px solid \${C.x1};font-family:monospace;font-size:11px;color:\${C.x7}">\${esc(s.cpfCnpj||"—")}</td><td style="padding:10px 14px;border-bottom:1px solid \${C.x1};color:\${C.x7}">\${esc(s.qualificacao||"—")}</td><td style="padding:10px 14px;border-bottom:1px solid \${C.x1};color:\${C.x4}">\${esc(s.participacao||"—")}</td><td style="padding:10px 14px;border-bottom:1px solid \${C.x1};color:\${C.x7}"><b>\${patrim!=="—"?fmtMoneyRound(patrim):"—"}</b></td></tr>\`;
  }).join("");
  const th9 = \`style="background:\${C.n9};color:rgba(255,255,255,.85);font-size:9px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:10px 14px;text-align:left"\`;
  const grupoQtd = (data.grupoEconomico?.empresas||[]).length;
  const B5 = \`\${stitle("Quadro societário")}<table style="width:100%;border-collapse:separate;border-spacing:0;font-size:12px;border:1px solid \${C.x2};border-radius:8px;overflow:hidden;margin-bottom:6px"><thead><tr><th \${th9}>Sócio</th><th \${th9}>CPF/CNPJ</th><th \${th9}>Qualificação</th><th \${th9}>Part.</th><th \${th9}>Patrim. (IR)</th></tr></thead><tbody>\${socRows||\`<tr><td colspan="5" style="padding:12px 14px;color:\${C.x4};text-align:center">Dados societários não disponíveis</td></tr>\`}</tbody></table><div style="font-size:11px;color:\${C.x5};margin-bottom:18px">Capital Social: <b style="color:\${C.x9}">\${capSoc}</b>\${grupoQtd>0?\` · Grupo Econômico: <b style="color:\${C.x9}">\${grupoQtd} empresa(s)</b>\`:" · Grupo Econômico: <b>Não identificado</b>"}</div>\`;

  // ─── BLOCO 6 — Risco Consolidado ──────────────────────────────────────────
  const protGroups = new Map<string,{tag:string;cls:string;count:number;val:number}>();
  protAtivos.forEach(pr => {
    const esp = (pr.especie||"").toLowerCase();
    const cred = ((pr.credor||"")+(pr.apresentante||"")).toLowerCase();
    const tag = /susta/i.test(esp)?"Sustação":/promiss|^\\s*np\\s*$/i.test(esp)?"Nota Prom.":FIDC_RE.test(cred)?"FIDC":/banco|bradesco|itau|santander|caixa|bndes/i.test(cred)?"Banco":/execu/i.test(esp)?"Execução":"Outros";
    const cls = tag==="Sustação"?"sust":tag==="Nota Prom."?"np":tag==="FIDC"?"fidc":tag==="Banco"?"banco":tag==="Execução"?"exec":"np";
    const ex = protGroups.get(tag);
    if (ex){ex.count++;ex.val+=numVal((pr as unknown as Record<string,string>).valor||"0");}
    else protGroups.set(tag,{tag,cls,count:1,val:numVal((pr as unknown as Record<string,string>).valor||"0")});
  });
  const procGroups = new Map<string,{tag:string;cls:string;count:number}>();
  top10Rec.forEach(pr => {
    const tipo = ((pr.tipo||"")+(pr.nome||"")).toLowerCase();
    const tag = /fiscal|sefaz|receita/i.test(tipo)?"Exec. Fiscal":FIDC_RE.test(tipo)||/banco|bradesco|itau|santander|caixa|bndes/i.test(tipo)?"Banco/FIDC":/trabalhist/i.test(tipo)?"Trabalhista":"Outros";
    const cls = tag==="Exec. Fiscal"?"exec":tag==="Banco/FIDC"?"banco":tag==="Trabalhista"?"np":"sust";
    const ex = procGroups.get(tag);
    if (ex)ex.count++;else procGroups.set(tag,{tag,cls,count:1});
  });
  const tagS = (cls:string) => ({exec:"background:#e8d5f5;color:#6b21a8",sust:\`background:\${C.a1};color:\${C.a5}\`,np:\`background:\${C.n1};color:\${C.n7}\`,banco:"background:#dbeafe;color:#1d4ed8",fidc:\`background:\${C.g1};color:\${C.g6}\`}[cls]||\`background:\${C.x1};color:\${C.x5}\`);
  const scrStrip = \`<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:10px">
    \${[
      {l:"SCR Total",   v:scrTotalAt>0?ms(scrTotalAt):"—",   c:C.n9},
      {l:"SCR Vencido", v:scrVenc>0?ms(scrVenc):"—",         c:scrVenc===0?C.g6:C.r6},
      {l:"% Vencido",   v:scrVenc===0?"0,0%":scrVencPct.toFixed(1).replace(".",",")+"%", c:scrVenc===0?C.g6:C.r6},
      {l:"Alavancagem", v:alav>0?alav.toFixed(1).replace(".",",")+"x":"—", c:alav>0?C.n9:C.x4},
      {l:"Nº IFs",      v:scrInstit>0?String(scrInstit):"—", c:C.n9},
    ].map(c=>\`<div style="padding:8px 10px;background:#fff;border-radius:6px;border:1px solid \${C.x2}"><div style="font-size:8px;font-weight:600;text-transform:uppercase;color:\${C.x4};margin-bottom:3px">\${c.l}</div><div style="font-size:14px;font-weight:700;color:\${c.c};font-family:monospace">\${c.v}</div></div>\`).join("")}
  </div>\`;
  const protItems = Array.from(protGroups.values()).slice(0,4).map(g=>\`<div style="font-size:10px;padding:5px 0;border-bottom:1px solid \${C.x1};display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span style="display:inline-block;font-size:8px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:3px;\${tagS(g.cls)}">\${esc(g.tag)}</span><span style="flex:1;color:\${C.x5}">\${g.count} ocor.</span>\${g.val>0?\`<span style="font-family:monospace;color:\${C.r6}">\${ms(g.val)}</span>\`:""}</div>\`).join("");
  const protRecHtml = protRecente ? \`<div style="height:1px;background:\${C.x1};margin:6px 0"></div><div style="font-size:11px;padding:4px 0;display:flex;justify-content:space-between"><span style="color:\${C.x5}">Último</span><span style="font-weight:600">\${esc((protRecente as unknown as Record<string,string>).data||"—")}</span></div><div style="font-size:11px;padding:4px 0;display:flex;justify-content:space-between"><span style="color:\${C.x5}">Apresentante</span><span style="font-size:10px">\${esc((protRecente as unknown as Record<string,string>).apresentante||"—")}</span></div>\` : "";
  const protBlock = \`<div style="background:#fff;border-radius:8px;border:1px solid \${C.x2};overflow:hidden"><div style="padding:10px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid \${C.x1}"><div><div style="font-size:12px;font-weight:700;color:\${C.n9}">Protestos</div><div style="font-size:10px;color:\${C.x5}">\${protVal>0?ms(protVal)+" vigentes":"Sem valor"}</div></div><div style="font-size:22px;font-weight:700;color:\${protQtd>0?C.r6:C.g6}">\${protQtd}</div></div><div style="padding:12px 14px"><div style="font-size:11px;color:\${C.x5};padding:4px 0">Por tipo</div>\${protItems||\`<div style="font-size:11px;color:\${C.g6};padding:6px 0">Sem protestos vigentes</div>\`}\${protRecHtml}</div></div>\`;
  const procItems = Array.from(procGroups.values()).slice(0,4).map(g=>\`<div style="font-size:10px;padding:5px 0;border-bottom:1px solid \${C.x1};display:flex;align-items:center;gap:6px"><span style="display:inline-block;font-size:8px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:3px;\${tagS(g.cls)}">\${esc(g.tag)}</span><span style="flex:1;color:\${C.x5}">\${g.count} proc.</span></div>\`).join("");
  const procRecHtml = top10Rec[0] ? \`<div style="height:1px;background:\${C.x1};margin:6px 0"></div><div style="font-size:11px;padding:4px 0;display:flex;justify-content:space-between"><span style="color:\${C.x5}">Último</span><span style="font-weight:600">\${esc(top10Rec[0].dataDistribuicao||top10Rec[0].data||"—")}</span></div><div style="font-size:11px;padding:4px 0;display:flex;justify-content:space-between"><span style="color:\${C.x5}">Tipo</span><span style="font-size:10px">\${esc(top10Rec[0].tipo||top10Rec[0].nome||"—")}</span></div>\` : "";
  const procBlock = \`<div style="background:#fff;border-radius:8px;border:1px solid \${C.x2};overflow:hidden"><div style="padding:10px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid \${C.x1}"><div><div style="font-size:12px;font-weight:700;color:\${C.n9}">Processos Judiciais</div><div style="font-size:10px;color:\${C.x5}">Passivo: \${procPassivo} · Ativo: \${procAtivo}</div></div><div style="font-size:22px;font-weight:700;color:\${procTotal>0?C.r6:C.g6}">\${procTotal||0}</div></div><div style="padding:12px 14px"><div style="font-size:11px;color:\${C.x5};padding:4px 0">Por tipo</div>\${procItems||\`<div style="font-size:11px;color:\${C.g6};padding:6px 0">Sem processos identificados</div>\`}\${procRecHtml}</div></div>\`;
  const ccfHtml = \`<div style="font-size:11px;padding:6px 0;display:flex;justify-content:space-between;align-items:center;border-top:1px solid \${C.x2};margin-top:6px"><span style="color:\${C.x5}">CCF (Cheques sem Fundo)</span>\${ccfQtd==null?\`<span style="color:\${C.x4}">Não consultado</span>\`:ccfQtdNum===0?\`<span style="font-weight:600;color:\${C.g6}">0 — limpo</span>\`:\`<span style="font-weight:700;color:\${C.r6}">\${ccfQtdNum} registro(s) · \${ccfBancos.map(b=>esc(b.banco)).join(", ")}</span>\`}</div>\`;
  const rAlerts: string[] = [];
  if (protQtd>0) rAlerts.push(mkAlert("alta",\`\${protQtd} protesto(s) vigente(s)\${protVal>0?" — "+ms(protVal)+(fmmNum>0?" ("+Math.round(protVal/fmmNum*100)+"% do FMM)":""):""}\`));
  if (procPassivo>=5) rAlerts.push(mkAlert("alta",\`\${procPassivo} processos no polo passivo\`));
  if (ccfQtdNum>0) rAlerts.push(mkAlert("alta",\`CCF: \${ccfQtdNum} ocorrência(s) — \${ccfBancos.slice(0,2).map(b=>esc(b.banco)).join(", ")}\`));
  if (dividaAtivaVal>0) rAlerts.push(mkAlert("alta",\`Dívida ativa de \${ms(dividaAtivaVal)} — verificar certidão antes da aprovação\`));
  if (protTemFIDC||procTemFIDC) rAlerts.push(mkAlert("mod","Alertas de FIDC/Fundo identificados nos apontamentos"));
  if (scrVencPct>10) rAlerts.push(mkAlert("mod",\`SCR vencido: \${scrVencPct.toFixed(1).replace(".",",")}% da dívida ativa\`));
  const B6 = \`\${stitle("Risco consolidado")}<div style="background:\${C.x0};border-radius:10px;border:1px solid \${C.x2};padding:20px;margin-bottom:18px">\${scrStrip}<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:8px">\${protBlock}\${procBlock}</div>\${ccfHtml}\${rAlerts.length>0?\`<div style="margin-top:10px">\${rAlerts.join("")}</div>\`:""}</div>\`;

  // ─── BLOCO 7 — Faturamento + SCR ──────────────────────────────────────────
  const maxV = Math.max(1, ...last12.map(m=>numVal(m.valor)));
  const bars = last12.map(m=>{
    const v=numVal(m.valor);
    const pct=Math.max(2,Math.round(v/maxV*100));
    const mes=(m.mes||"").split("/")[0].substring(0,3);
    const yr=parseInt((m.mes||"").split("/")[1]||"0")||0;
    const navy=yr<new Date().getFullYear()-1?"#132952":"#dce6f5";
    return \`<div style="flex:1;display:flex;flex-direction:column;align-items:center"><div style="width:100%;border-radius:3px 3px 0 0;min-height:2px;background:\${navy};height:\${pct}px;position:relative"><div style="position:absolute;top:-14px;left:50%;transform:translateX(-50%);font-size:7px;color:\${C.x5};white-space:nowrap;font-family:monospace">\${ms(v)}</div></div><div style="font-size:8px;color:\${C.x4};margin-top:5px">\${esc(mes)}</div></div>\`;
  }).join("");
  const fat3=last12.slice(-3).map(m=>numVal(m.valor));
  const fp3=last12.slice(-6,-3).map(m=>numVal(m.valor));
  const t3=fat3.length?fat3.reduce((a,b)=>a+b,0)/fat3.length:0;
  const tp=fp3.length?fp3.reduce((a,b)=>a+b,0)/fp3.length:0;
  const tpct=tp>0?(t3-tp)/tp*100:0;
  const tFg=tpct>=0?C.g6:C.r6;
  const tStr=(tpct>=0?"↑ +":"↓ ")+Math.abs(tpct).toFixed(0)+"%";
  const fatBox = \`<div style="background:\${C.x0};border-radius:8px;border:1px solid \${C.x1};padding:16px"><div style="font-size:9px;font-weight:700;text-transform:uppercase;color:\${C.x5};margin-bottom:12px">Faturamento mensal — últimos 12 meses</div><div style="display:flex;align-items:flex-end;gap:5px;height:100px;margin-bottom:8px">\${bars}</div><div style="display:flex;gap:16px;font-size:11px;color:\${C.x5};padding-top:8px;border-top:1px solid \${C.x1}"><span>FMM: <b style="color:\${C.n9}">\${fmmNum>0?ms(fmmNum):"—"}</b></span><span>Total 12M: <b style="color:\${C.n9}">\${ms(fatTotal12)}</b></span>\${fat3.length?\`<span>Tendência: <span style="color:\${tFg};font-weight:600">\${tStr}</span></span>\`:""}</div></div>\`;
  const scrAtual = data.scr as unknown as Record<string,string>;
  const scrAnt   = (data.scrAnterior||{}) as unknown as Record<string,string>;
  const perAt = data.scr?.periodoReferencia||"Atual";
  const perAn = data.scrAnterior?.periodoReferencia||"Anterior";
  const vr=(a:number,b:number)=>{if(!b||!isFinite(b))return{t:"—",c:"neutral"};const p=(a-b)/Math.abs(b)*100;return{t:(p>=0?"↑ +":"↓ ")+Math.abs(p).toFixed(0)+"%",c:p>5?"up":"down"};};
  const scrFields=[
    ["Curto Prazo","carteiraCurtoPrazo"],["Longo Prazo","carteiraLongoPrazo"],
    ["Vencidos","vencidos"],["Prejuízos","prejuizos"],["Limite Crédito","limiteCredito"],
  ];
  const scrRows=scrFields.map(([lbl,k])=>{
    const a=numVal(String(scrAtual[k]||"0"));
    const b=numVal(String(scrAnt[k]||"0"));
    const {t,c}=vr(a,b);
    const fg=c==="down"?C.g6:c==="up"?C.r6:C.x4;
    return \`<tr><td style="padding:7px 10px;border-bottom:1px solid \${C.x1};font-size:11px">\${lbl}</td><td style="padding:7px 10px;border-bottom:1px solid \${C.x1};text-align:right;font-family:monospace;font-size:10px">\${a>0?ms(a):"—"}</td><td style="padding:7px 10px;border-bottom:1px solid \${C.x1};text-align:right;font-family:monospace;font-size:10px">\${b>0?ms(b):"—"}</td><td style="padding:7px 10px;border-bottom:1px solid \${C.x1};text-align:right;font-size:10px;font-weight:600;color:\${fg}">\${t}</td></tr>\`;
  }).join("");
  const ta=numVal(String(scrAtual.totalDividasAtivas||"0"))||scrTotalAt;
  const tb=numVal(String(scrAnt.totalDividasAtivas||"0"));
  const {t:vt,c:vtC}=vr(ta,tb);
  const vtFg=vtC==="down"?C.g6:vtC==="up"?C.r6:C.x4;
  const th8=\`style="background:\${C.n9};color:rgba(255,255,255,.85);font-size:8px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;padding:8px 10px"\`;
  const scrBox = \`<div style="background:\${C.x0};border-radius:8px;border:1px solid \${C.x1};padding:16px"><div style="font-size:9px;font-weight:700;text-transform:uppercase;color:\${C.x5};margin-bottom:12px">SCR comparativo — \${esc(perAn)} → \${esc(perAt)}</div><table style="width:100%;border-collapse:separate;border-spacing:0;font-size:11px"><thead><tr><th \${th8} style="text-align:left">Métrica</th><th \${th8} style="text-align:right">Atual</th><th \${th8} style="text-align:right">Anterior</th><th \${th8} style="text-align:right">Var.</th></tr></thead><tbody>\${scrRows}<tr style="font-weight:700;background:\${C.x0}"><td style="padding:7px 10px;color:\${C.n9}">Total Dívidas</td><td style="padding:7px 10px;text-align:right;font-family:monospace;font-size:10px">\${ta>0?ms(ta):"—"}</td><td style="padding:7px 10px;text-align:right;font-family:monospace;font-size:10px">\${tb>0?ms(tb):"—"}</td><td style="padding:7px 10px;text-align:right;font-size:10px;color:\${vtFg}">\${vt}</td></tr></tbody></table><div style="font-size:9px;color:\${C.x4};margin-top:6px">Instituições financeiras: \${scrInstit||"—"}</div></div>\`;
  const B7 = \`\${stitle("Faturamento & SCR")}<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px">\${fatBox}\${scrBox}</div>\`;

  // ─── BLOCO 8 — Curva ABC ──────────────────────────────────────────────────
  const abcList = (data.curvaABC?.clientes||[]).slice(0,3);
  const abcMaxF = Math.max(1,...abcList.map(c=>numVal(c.valorFaturado||"0")));
  const abcClCss=(cl:string)=>cl.toUpperCase()==="A"?\`background:\${C.r1};color:\${C.r6}\`:cl.toUpperCase()==="B"?\`background:\${C.a1};color:\${C.a5}\`:\`background:\${C.x1};color:\${C.x5}\`;
  let abcAcc=0;
  const abcRows=abcList.map((c,i)=>{
    const fat=numVal(c.valorFaturado||"0");
    const pct=numVal(c.percentualReceita||"0");
    abcAcc+=pct;
    const bw=Math.round(fat/abcMaxF*100);
    return \`<tr><td style="padding:9px 12px;border-bottom:1px solid \${C.x1}"><div style="display:inline-flex;width:22px;height:22px;border-radius:50%;background:\${C.n8};color:#fff;font-size:10px;font-weight:700;align-items:center;justify-content:center">\${i+1}</div></td><td style="padding:9px 12px;border-bottom:1px solid \${C.x1}"><b>\${esc(c.nome||"—")}</b><div style="height:5px;border-radius:3px;background:\${C.n8};margin-top:3px;width:\${bw}%"></div></td><td style="padding:9px 12px;border-bottom:1px solid \${C.x1};text-align:right;font-family:monospace;font-size:11px">\${fmtMoney(fat)}</td><td style="padding:9px 12px;border-bottom:1px solid \${C.x1};text-align:right;font-weight:600;font-size:11px">\${pct.toFixed(1).replace(".",",")}%</td><td style="padding:9px 12px;border-bottom:1px solid \${C.x1};text-align:right;font-weight:600;font-size:11px">\${numVal(c.percentualAcumulado||"0").toFixed(1).replace(".",",")}%</td><td style="padding:9px 12px;border-bottom:1px solid \${C.x1}"><span style="padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;\${abcClCss(c.classe||"A")}">\${esc(c.classe||"A")}</span></td></tr>\`;
  }).join("");
  const abcTop3=abcList.reduce((s,c)=>s+numVal(c.percentualReceita||"0"),0);
  const abcTop5=(data.curvaABC?.clientes||[]).slice(0,5).reduce((s,c)=>s+numVal(c.percentualReceita||"0"),0);
  const abcConc=abcList[0]&&numVal(abcList[0].percentualReceita||"0")>=20?mkAlert("alta",\`\${esc(abcList[0].nome||"Top cliente")} concentra \${numVal(abcList[0].percentualReceita||"0").toFixed(0)}% da receita — limite recomendado: 20%\`):"";
  const th8b=\`style="background:\${C.n9};color:rgba(255,255,255,.85);font-size:8px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;padding:9px 12px;text-align:left"\`;
  const B8 = abcList.length ? \`\${stitle("Concentração de clientes")}<div style="background:\${C.x0};border-radius:10px;border:1px solid \${C.x2};padding:16px;margin-bottom:18px"><table style="width:100%;border-collapse:separate;border-spacing:0;font-size:11px;margin-bottom:8px"><thead><tr><th \${th8b} style="width:40px">#</th><th \${th8b}>Cliente</th><th \${th8b} style="text-align:right">Faturamento</th><th \${th8b} style="text-align:right">% Rec.</th><th \${th8b} style="text-align:right">% Acum.</th><th \${th8b} style="width:50px">Cl.</th></tr></thead><tbody>\${abcRows}</tbody></table><div style="font-size:11px;color:\${C.x5}">Top 3: <b style="color:\${C.x9}">\${abcTop3.toFixed(0)}%</b> · Top 5: <b style="color:\${C.x9}">\${abcTop5.toFixed(0)}%</b> · Total: <b style="color:\${C.x9}">\${(data.curvaABC?.clientes||[]).length}</b></div>\${abcConc}</div>\` : "";

  // ─── BLOCO 9 — Pleito ─────────────────────────────────────────────────────
  const taxaJuros = rvP?.taxaConvencional||rvP?.taxaComissaria||"—";
  const plFmt = pleitoVal>0 ? fmtMoney(pleitoVal) : "—";
  const plCards = [
    {l:"Valor Pleiteado",  v:plFmt,                                color:pleitoVal>0?C.n9:C.x4},
    {l:"Modalidade",       v:esc(rvP?.modalidade||"—").toUpperCase(), color:C.n9},
    {l:"Prazo Máx.",       v:esc(rvP?.prazoMaximoOp||"—"),        color:C.n9},
    {l:"Taxa",             v:esc(taxaJuros),                       color:C.n9},
  ];
  const B9 = \`\${stitle("Pleito")}<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:18px">\${plCards.map(c=>\`<div style="padding:12px 14px;background:\${C.n0};border-radius:6px;border:1px solid \${C.n1}"><div style="font-size:8px;font-weight:700;text-transform:uppercase;color:\${C.x4};margin-bottom:4px">\${esc(c.l)}</div><div style="font-size:14px;font-weight:700;color:\${c.color}">\${c.v}</div></div>\`).join("")}</div>\`;

  // ─── BLOCO 10 — Análise ───────────────────────────────────────────────────
  const pf  = (pontosFortes||[]).slice(0,6);
  const pfr = (pontosFracos||[]).slice(0,6);
  const als = ((p.alerts||p.alertsHigh||[]) as Array<string|{message:string}>).slice(0,5).map(a=>typeof a==="string"?a:(a as {message:string}).message);
  const mkItems=(arr:string[],fg:string)=>arr.map(it=>\`<div style="font-size:11px;padding:3px 0;line-height:1.5"><span style="color:\${fg};font-weight:700;margin-right:6px">•</span>\${esc(it)}</div>\`).join("");
  const B10=(pf.length||pfr.length||als.length)?\`\${stitle("Análise")}<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:18px">
    <div style="border-radius:8px;padding:14px 16px;background:\${C.g0};border:1px solid \${C.g1}"><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:\${C.g6};margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(0,0,0,.06)">Pontos Fortes</div>\${mkItems(pf.length?pf:["Não disponível"],C.g6)}</div>
    <div style="border-radius:8px;padding:14px 16px;background:\${C.r0};border:1px solid \${C.r1}"><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:\${C.r6};margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(0,0,0,.06)">Pontos Fracos</div>\${mkItems(pfr.length?pfr:["Não disponível"],C.r6)}</div>
    <div style="border-radius:8px;padding:14px 16px;background:\${C.a0};border:1px solid \${C.a1}"><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:\${C.a5};margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(0,0,0,.06)">Alertas</div>\${mkItems(als.length?als:["Sem alertas"],C.a5)}</div>
  </div>\` : "";

  // ─── BLOCO 11 — Percepção ─────────────────────────────────────────────────
  const resumo = resumoExecutivo||"";
  const B11 = resumo?\`\${stitle("Percepção do analista")}<div style="padding:16px 18px;background:\${C.x0};border-radius:8px;border:1px solid \${C.x2}"><div style="font-size:12px;color:\${C.x7};line-height:1.7">\${esc(resumo)}</div><div style="display:flex;align-items:center;gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid \${C.x2};font-size:11px;color:\${C.x5}">Recomendação: <span style="display:inline-block;padding:4px 14px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;background:\${decBg};color:#fff">\${esc(dec)}</span><span style="color:\${C.x4};font-size:10px">· Ver parecer completo na seção 02</span></div></div>\` : "";

  return \`<div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:12px;color:#111827;padding:0">
\${B1}\${B2}\${B3}\${B4}\${B5}\${B6}\${B7}\${B8}\${B9}\${B10}\${B11}
</div>\`;
}`;

// ─────────────────────────────────────────────────────────────────────────────
// Inject into template.ts
// ─────────────────────────────────────────────────────────────────────────────
let template = readFileSync(templatePath, "utf8");

const startMarker = "function secSintese(p: PDFReportParams): string {";
const startIdx = template.indexOf(startMarker);
if (startIdx === -1) {
  console.error("ERROR: could not find secSintese start in template.ts");
  process.exit(1);
}

const endMarker = "// SECTION 3.5: PARECER PRELIMINAR";
const endMarkerIdx = template.indexOf(endMarker, startIdx);
// Back up past the preceding comment line (═══...)
const endIdx = endMarkerIdx > 0 ? template.lastIndexOf("\n// ═", endMarkerIdx) : -1;
if (endMarkerIdx === -1 || endIdx === -1) {
  console.error("ERROR: could not find SECTION 3.5 end marker in template.ts");
  process.exit(1);
}

const before = template.slice(0, startIdx);
const after  = template.slice(endIdx);
const result = before + NEW_FN + "\n" + after;

writeFileSync(templatePath, result, "utf8");

const lineCount = result.split("\n").length;
console.log(`Done. New line count: ${lineCount}`);

// Verify
const verify = readFileSync(templatePath, "utf8");
const checks = [
  ["const C = {",          verify.includes("const C = {")],
  ["const B1 =",           verify.includes("const B1 =")],
  ["${B1}${B2}",           verify.includes("${B1}${B2}")],
  ["quadroSocietario",     verify.includes("quadroSocietario")],
  ["scrAnterior",          verify.includes("scrAnterior")],
  ["curvaABC?.clientes",   verify.includes("curvaABC?.clientes")],
  ["prazoMaximoOp",        verify.includes("prazoMaximoOp")],
];
let allOk = true;
for (const [label, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) allOk = false;
}
if (allOk) console.log("\n✓ All checks passed — template.ts updated successfully");
else console.error("\n✗ Some checks failed");
