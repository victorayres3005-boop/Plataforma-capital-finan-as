import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const path = resolve('lib/pdf/template.ts');
let content = readFileSync(path, 'utf8');

// Helper: replace first occurrence
const rep = (from, to) => { content = content.replace(from, to); };

// 1. Add fmtMoneyShort helper inside secSintese (after makeAlert def)
rep(
  `  // ── data extraction ────────────────────────────────────────────────────`,
  `  // ── fmtMoneyShort helper ──────────────────────────────────────────────
  const fmtMoneyShort = (v: number): string => {
    if (v >= 1_000_000_000) return "R\\$ " + (v/1_000_000_000).toFixed(1).replace(".",",") + "B";
    if (v >= 1_000_000) return "R\\$ " + (v/1_000_000).toFixed(1).replace(".",",") + "M";
    if (v >= 1_000) return "R\\$ " + (v/1_000).toFixed(0) + "k";
    return fmtMoney(v);
  };

  // ── data extraction ────────────────────────────────────────────────────`
);

// 2. tipoUnidade → naturezaJuridica (abbreviated)
rep(
  `    { l:"Tipo",         v: (data.cnpj?.tipoUnidade || "—").substring(0,14) },`,
  `    { l:"Tipo",         v: (data.cnpj?.naturezaJuridica || "—").substring(0,14) },`
);

// 3. data.cnpj?.cnae → remove fallback (cnaePrincipal is the correct field)
rep(
  `  const cnaeMain = data.cnpj?.cnaePrincipal || data.cnpj?.cnae || "";`,
  `  const cnaeMain = data.cnpj?.cnaePrincipal || "";`
);

// 4. cnaesSecundarios → cnaeSecundarios (correct field name per types)
rep(
  `  const cnaeSec  = (data.cnpj?.cnaesSecundarios || []).slice(0,5).join(" · ");`,
  `  const cnaeSec  = data.cnpj?.cnaeSecundarios || "";`
);

// 5. estruturaFisica → estruturaFisicaConfirmada
rep(
  `  const visitaStr = rvP?.estruturaFisica ? "Estrutura física confirmada em visita" : "";`,
  `  const visitaStr = rvP?.estruturaFisicaConfirmada ? "Estrutura física confirmada em visita" : "";`
);

// 6. data.qsa?.socios → data.qsa?.quadroSocietario (correct field)
rep(
  `  const socios = data.qsa?.socios || data.qsa?.quadroSocietario || [];
  const socRows = socios.map((s: Record<string,string>) => {
    const nome    = esc((s.nome||s.nomeSocio||"—").toUpperCase());
    const cpfCnpj = esc(s.cpf||s.cnpj||s.cpfCnpj||"—");
    const qual    = esc(s.qualificacao||s.cargo||"—");
    const part    = esc(s.participacao||s.quotaPct||"—");`,
  `  const socios = data.qsa?.quadroSocietario || [];
  const socRows = socios.map((s) => {
    const nome    = esc((s.nome||"—").toUpperCase());
    const cpfCnpj = esc(s.cpfCnpj||"—");
    const qual    = esc(s.qualificacao||"—");
    const part    = esc(s.participacao||"—");`
);

// 7. [...protGroups.values()] → Array.from(protGroups.values())
rep(
  `  const protItemsHtml = [...protGroups.values()].slice(0,4).map(g =>`,
  `  const protItemsHtml = Array.from(protGroups.values()).slice(0,4).map(g =>`
);

// 8. [...procGroups.values()] → Array.from(procGroups.values())
rep(
  `  const procItemsHtml = [...procGroups.values()].slice(0,4).map(g =>`,
  `  const procItemsHtml = Array.from(procGroups.values()).slice(0,4).map(g =>`
);

// 9. CCFBanco string issue in riskAlerts (protVal line) - ccfBancos is CCFBanco[], not string[]
rep(
  `  if (ccfQtdNum > 0) riskAlerts.push(makeAlert("alta", \`CCF: \${ccfQtdNum} ocorrência(s) — \${ccfBancos.slice(0,2).map((b:string)=>esc(b)).join(", ")}\`));`,
  `  if (ccfQtdNum > 0) riskAlerts.push(makeAlert("alta", \`CCF: \${ccfQtdNum} ocorrência(s) — \${ccfBancos.slice(0,2).map(b=>esc(b.banco)).join(", ")}\`));`
);

// 10. CCFBanco in ccfHtml inline
rep(
  `        : \`<span style="font-weight:700;color:\${PAL.r6};font-size:13px">\${ccfQtdNum} registro(s) · \${ccfBancos.map((b:string)=>esc(b)).join(", ")}</span>\`}`,
  `        : \`<span style="font-weight:700;color:\${PAL.r6};font-size:13px">\${ccfQtdNum} registro(s) · \${ccfBancos.map(b=>esc(b.banco)).join(", ")}</span>\`}`
);

// 11. Fix SCR comparative: comparativo doesn't exist, use scrAnterior
rep(
  `  // SCR comparative table
  const scrComp = data.scr?.comparativo as Record<string,unknown>|undefined;
  const scrAtual = (scrComp?.atual || scrComp?.periodoAtual || {}) as Record<string,string>;
  const scrAnt   = (scrComp?.anterior || scrComp?.periodoAnterior || {}) as Record<string,string>;
  const scrPeriodoAt = scrComp?.periodoAtualLabel || data.scr?.ultimoPeriodo || "Atual";
  const scrPeriodoAn = scrComp?.periodoAnteriorLabel || data.scr?.penultimoPeriodo || "Anterior";`,
  `  // SCR comparative table
  const scrAtual = data.scr as unknown as Record<string,string>;
  const scrAnt   = (data.scrAnterior || {}) as unknown as Record<string,string>;
  const scrPeriodoAt = data.scr?.periodoReferencia || "Atual";
  const scrPeriodoAn = data.scrAnterior?.periodoReferencia || "Anterior";`
);

// 12. Fix SCR row field names (use the actual SCRData fields)
rep(
  `  const scrRows = [
    ["Curto Prazo", "cpAtual","cpAnterior"],
    ["Longo Prazo", "lpAtual","lpAnterior"],
    ["Vencidos",    "vencidosAtual","vencidosAnterior"],
    ["Prejuízos",   "prejuizosAtual","prejuizosAnterior"],
    ["Limite Crédito","limiteCreditoAtual","limiteCreditoAnterior"],
  ].map(([label, kAt, kAn]) => {
    const vAt = numVal(String(scrAtual[kAt]||"0"));
    const vAn = numVal(String(scrAnt[kAn]||"0"));`,
  `  const scrRows = [
    ["Curto Prazo", "carteiraCurtoPrazo","carteiraCurtoPrazo"],
    ["Longo Prazo", "carteiraLongoPrazo","carteiraLongoPrazo"],
    ["Vencidos",    "vencidos","vencidos"],
    ["Prejuízos",   "prejuizos","prejuizos"],
    ["Limite Crédito","limiteCredito","limiteCredito"],
  ].map(([label, kAt, kAn]) => {
    const vAt = numVal(String(scrAtual[kAt]||"0"));
    const vAn = numVal(String(scrAnt[kAn]||"0"));`
);

// 13. Fix scrTotalAt2/scrTotalAn2 field names
rep(
  `  const scrTotalAt2 = numVal(String(scrAtual.totalAtual || scrAtual.totalDividasAtivas || "0")) || scrTotalAt;
  const scrTotalAn2 = numVal(String(scrAnt.totalAnterior || scrAnt.totalDividasAtivas || "0"));`,
  `  const scrTotalAt2 = numVal(String(scrAtual.totalDividasAtivas || "0")) || scrTotalAt;
  const scrTotalAn2 = numVal(String(scrAnt.totalDividasAtivas || "0"));`
);

// 14. Fix curvaAbc → curvaABC
content = content.replace(/data\.curvaAbc\b/g, 'data.curvaABC');

// 15. Fix ClienteCurvaABC field names in abcRows
rep(
  `  let abcAccum = 0;
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
        <b style="font-size:12px">\${esc(c.cliente||c.nome||"—")}</b>`,
  `  let abcAccum = 0;
  const abcRows = abcClientes.map((c, i: number) => {
    const fat = numVal(c.valorFaturado||"0");
    const pct = numVal(c.percentualReceita||"0");
    abcAccum += pct;
    const barW = Math.round((fat/abcMaxFat)*100);
    const cl   = c.classe||"A";
    return \`<tr>
      <td style="padding:9px 12px;border-bottom:1px solid \${PAL.x1}">
        <div style="display:inline-flex;width:22px;height:22px;border-radius:50%;background:\${PAL.n8};color:#fff;font-size:10px;font-weight:700;align-items:center;justify-content:center">\${i+1}</div>
      </td>
      <td style="padding:9px 12px;border-bottom:1px solid \${PAL.x1}">
        <b style="font-size:12px">\${esc(c.nome||"—")}</b>`
);

// 16. Fix abcClientes field names in stats
rep(
  `  const abcTop3Pct = abcClientes.reduce((s:number, c:Record<string,string>) => s + numVal(c.participacaoPct||"0"), 0);
  const abcTop5 = (data.curvaABC?.clientes||[]).slice(0,5).reduce((s:number, c:Record<string,string>)=>s+numVal(c.participacaoPct||"0"),0);
  const abcTotal = (data.curvaABC?.clientes||[]).length;
  const abcMaxFat = Math.max(1, ...abcClientes.map((c:Record<string,string>)=>numVal(c.faturamento||c.valor||"0")));`,
  `  const abcTop3Pct = abcClientes.reduce((s, c) => s + numVal(c.percentualReceita||"0"), 0);
  const abcTop5 = (data.curvaABC?.clientes||[]).slice(0,5).reduce((s, c)=>s+numVal(c.percentualReceita||"0"),0);
  const abcTotal = (data.curvaABC?.clientes||[]).length;
  const abcMaxFat = Math.max(1, ...abcClientes.map(c=>numVal(c.valorFaturado||"0")));`
);

// 17. Fix abcConcentrAlert field names
rep(
  `  const abcConcentrAlert = abcClientes[0] && numVal((abcClientes[0] as Record<string,string>).participacaoPct||"0") >= 20
    ? makeAlert("alta", \`\${esc((abcClientes[0] as Record<string,string>).cliente||(abcClientes[0] as Record<string,string>).nome||"Top cliente")} concentra \${numVal((abcClientes[0] as Record<string,string>).participacaoPct||"0").toFixed(0)}% da receita — limite recomendado: 20%\`)
    : "";`,
  `  const abcConcentrAlert = abcClientes[0] && numVal(abcClientes[0].percentualReceita||"0") >= 20
    ? makeAlert("alta", \`\${esc(abcClientes[0].nome||"Top cliente")} concentra \${numVal(abcClientes[0].percentualReceita||"0").toFixed(0)}% da receita — limite recomendado: 20%\`)
    : "";`
);

// 18. Fix prazoMaximo → prazoMaximoOp
rep(
  `  const prazoMax    = esc(rvP?.prazoMaximo || "—");`,
  `  const prazoMax    = esc(rvP?.prazoMaximoOp || "—");`
);

// 19. Fix taxaJuros → taxaConvencional or taxaComissaria
rep(
  `  const taxaJuros   = esc(rvP?.taxaJuros || "—");`,
  `  const taxaJuros   = esc(rvP?.taxaConvencional || rvP?.taxaComissaria || "—");`
);

// 20. Fix Alert[] type for p.alerts
rep(
  `  const alertsArr = (p.alerts||p.alertsHigh||[]).slice(0,5);`,
  `  const alertsArr = ((p.alerts||p.alertsHigh||[]) as Array<string|{message:string}>).slice(0,5).map(a=>typeof a==="string"?a:(a as {message:string}).message);`
);

// 21. Remove unused natJur variable (it was from old code but now unused since we use natJur inline for tipoUnidade fix)
// Actually we did use natJur for the Tipo chip - let me check
// We changed tipoUnidade to naturezaJuridica directly, so natJur is unused. Let's remove it.
rep(
  `  const natJur    = (data.cnpj?.naturezaJuridica || data.cnpj?.tipoEmpresa || "—").substring(0, 20);
  const localStr  = extractLocal(data.cnpj?.endereco);`,
  `  const localStr  = extractLocal(data.cnpj?.endereco);`
);

// 22. Fix abcRows percentualAcumulado field
rep(
  `      <td style="padding:9px 12px;border-bottom:1px solid \${PAL.x1};text-align:right;font-weight:600;font-size:11px">\${pct.toFixed(1).replace(".",",")}%</td>
      <td style="padding:9px 12px;border-bottom:1px solid \${PAL.x1};text-align:right;font-weight:600;font-size:11px">\${abcAccum.toFixed(1).replace(".",",")}%</td>
      <td style="padding:9px 12px;border-bottom:1px solid \${PAL.x1}"><span style="padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;\${abcClCss(cl)}">\${esc(cl)}</span></td>
    </tr>\`;
  }).join("");`,
  `      <td style="padding:9px 12px;border-bottom:1px solid \${PAL.x1};text-align:right;font-weight:600;font-size:11px">\${pct.toFixed(1).replace(".",",")}%</td>
      <td style="padding:9px 12px;border-bottom:1px solid \${PAL.x1};text-align:right;font-weight:600;font-size:11px">\${numVal(c.percentualAcumulado||"0").toFixed(1).replace(".",",")}%</td>
      <td style="padding:9px 12px;border-bottom:1px solid \${PAL.x1}"><span style="padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;\${abcClCss(cl)}">\${esc(cl)}</span></td>
    </tr>\`;
  }).join("");`
);

// 23. Fix unused decAprov, decReprov variables (inline them)
rep(
  `  const decAprov = /APROV/i.test(dec) && !/CONDIC/i.test(dec);
  const decReprov = /REPROV/i.test(dec);
  const decBg = decAprov ? PAL.g6 : decReprov ? PAL.r6 : PAL.a5;`,
  `  const decBg = (/APROV/i.test(dec) && !/CONDIC/i.test(dec)) ? PAL.g6 : /REPROV/i.test(dec) ? PAL.r6 : PAL.a5;`
);

// 24. Fix unused funcionarios and regimeTrib variables
rep(
  `  const cnpjEnr = data.cnpj as unknown as Record<string,string|undefined>;
  const funcionarios = cnpjEnr.funcionarios || "";
  const regimeTrib   = cnpjEnr.regimeTributario || "";`,
  ``
);

writeFileSync(path, content, 'utf8');
console.log('Fixes applied. Lines:', content.split('\n').length);
