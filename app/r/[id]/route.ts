import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const SECTIONS = ["fortes", "fracos", "alertas"] as const;
type Section = typeof SECTIONS[number];

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderItems(arr: string[]): string {
  if (!arr || arr.length === 0) {
    return '<div class="ana-item ana-item-empty" data-edit-empty style="color:var(--x4)">—</div>';
  }
  return arr.map(x => `<div class="ana-item" data-edit-item>${esc(x)}</div>`).join("");
}

function applyOverrides(html: string, overrides: Partial<Record<Section, string[]>>): string {
  let out = html;
  for (const sec of SECTIONS) {
    const arr = overrides[sec];
    if (!Array.isArray(arr)) continue;
    const re = new RegExp(`<!--EDIT:${sec}:START-->[\\s\\S]*?<!--EDIT:${sec}:END-->`);
    out = out.replace(re, `<!--EDIT:${sec}:START-->${renderItems(arr)}<!--EDIT:${sec}:END-->`);
  }
  return out;
}

// Percepção: texto livre, preserva quebras de linha como <br>. Sanitiza HTML.
function applyPercepcao(html: string, texto: string): string {
  const safe = esc(texto).replace(/\n/g, "<br>");
  const re = /<!--EDIT:percepcao:START-->[\s\S]*?<!--EDIT:percepcao:END-->/;
  return html.replace(re, `<!--EDIT:percepcao:START--><div class="perc-text" data-edit-percepcao style="text-align:justify">${safe}</div><!--EDIT:percepcao:END-->`);
}

// Caixa de percepção por seção (DRE, Faturamento, Balanço). O wrapper
// .perc-box mantém o estilo visual do template; só o conteúdo é substituído.
// Quando há texto, remove o placeholder.
function applyTextSection(html: string, key: "dre" | "faturamento" | "balanco", texto: string): string {
  const safe = esc(texto).replace(/\n/g, "<br>");
  const re = new RegExp(`<!--EDIT:${key}:START-->[\\s\\S]*?<!--EDIT:${key}:END-->`);
  return html.replace(
    re,
    `<!--EDIT:${key}:START--><div class="perc-box-content" data-edit-text="${key}">${safe}</div><!--EDIT:${key}:END-->`,
  );
}

// Hidrata os inputs do Pleito Comitê (data-pc-key="...") com valores salvos.
// Edição é livre (sem token) — segue decisão de produto da sessão Pleito Comitê.
function injectPleitoComite(html: string, raw: unknown): string {
  if (!raw || typeof raw !== "object") return html;
  const values = raw as Record<string, unknown>;
  const hasAny = Object.values(values).some(v => typeof v === "string" && v.trim());
  if (!hasAny) return html;
  return html.replace(
    /(data-pc-key=")([a-zA-Z]+)(" value=")("\s)/g,
    (match, p1, key, p3, p4) => {
      const v = values[key];
      if (typeof v !== "string" || !v.trim()) return match;
      return `${p1}${key}${p3}${esc(v)}${p4}`;
    }
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  if (!id || !/^[a-z0-9]{8,16}$/.test(id)) {
    return new Response("Link inválido.", { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return new Response("Configuração de banco indisponível.", { status: 500 });
  }

  const supabase = createClient(url, key);

  // FALLBACK GRACIOSO 2026-05-11: tenta SELECT com todas as colunas
  // (incluindo as das migrations 16/17/18). Se alguma coluna não existir
  // no schema cache (PGRST204), retenta com só as colunas base (mig. 15).
  // Sem isso, qualquer leitura de relatório retornava "não encontrado"
  // quando as migrations não rodaram — porque PostgREST falha no SELECT.
  type SharedRow = {
    html: string;
    expires_at: string | null;
    company: string | null;
    pontos_fortes?: unknown;
    pontos_fracos?: unknown;
    alertas?: unknown;
    percepcao?: string | null;
    percepcao_dre?: string | null;
    percepcao_faturamento?: string | null;
    percepcao_balanco?: string | null;
    edit_token?: string | null;
    pleito_comite?: unknown;
  };

  // FIX 2026-05-11 (segundo passo): SELECT dividido em 2 etapas pra
  // garantir que edit_token SEMPRE chega quando existe no banco. Antes,
  // pedíamos 12 colunas num único SELECT — se UMA delas estivesse fora
  // do schema cache (PGRST204 por migration recém-rodada e cache stale
  // do PostgREST), o SELECT inteiro falhava e caía no fallback de 3
  // colunas, deixando edit_token undefined. Resultado: modo edição
  // nunca ativava mesmo com ?k= correto. Agora pedimos primeiro os
  // campos críticos + edit_token (migrations 15-17 — colunas antigas
  // e estáveis), depois enriquecemos com campos novos (migration 18).
  const isColMissing = (e: { code?: string; message?: string } | null): boolean => {
    if (!e) return false;
    return e.code === "42703" || e.code === "PGRST204" ||
      /could not find the .* column/i.test(e.message ?? "") ||
      /column .* does not exist/i.test(e.message ?? "");
  };

  let data: SharedRow | null = null;
  // Etapa 1: campos críticos + edit_token + listas editáveis (migrations 15-16).
  // OBS 2026-05-12: 'percepcao' (mig. 17a) foi MOVIDA pra etapa 2 silenciosa
  // porque a coluna ficou pendente em prod — pedir ela aqui derrubava o SELECT
  // inteiro (42703) e o fallback de emergência perdia as listas editáveis,
  // resultando em applyOverrides nunca rodar (sintoma: edições somem ao reabrir).
  let { data: base, error } = await supabase
    .from("shared_reports")
    .select("html, expires_at, company, pontos_fortes, pontos_fracos, alertas, edit_token, pleito_comite")
    .eq("id", id)
    .single<SharedRow>();

  if (isColMissing(error)) {
    console.warn(`[/r/${id}] etapa 1 caiu — schema cache pendente, retentando com base mínima`);
    const retry = await supabase
      .from("shared_reports")
      .select("html, expires_at, company, edit_token")
      .eq("id", id)
      .single<SharedRow>();
    base = retry.data;
    error = retry.error;
  }
  data = base;

  // Etapa 2a: percepção principal (migration 17a). Silenciosa se coluna ausente.
  if (data && !error) {
    const pe = await supabase
      .from("shared_reports")
      .select("percepcao")
      .eq("id", id)
      .single<Pick<SharedRow, "percepcao">>();
    if (pe.data && !pe.error) {
      data = { ...data, ...pe.data };
    }
  }

  // Etapa 2b: as 3 percepções por seção (migration 18).
  // Falha silenciosa: se PostgREST ainda não viu as colunas (cache stale),
  // segue sem essas percepções — o resto do relatório renderiza igual.
  if (data && !error) {
    const extra = await supabase
      .from("shared_reports")
      .select("percepcao_dre, percepcao_faturamento, percepcao_balanco")
      .eq("id", id)
      .single<Pick<SharedRow, "percepcao_dre" | "percepcao_faturamento" | "percepcao_balanco">>();
    if (extra.data && !extra.error) {
      data = { ...data, ...extra.data };
    }
  }

  if (error || !data) {
    return new Response(notFoundPage(id), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return new Response(expiredPage(), {
      status: 410,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  let html = data.html as string;

  // HOTFIX 2026-05-11: corrige regex quebrada no JS embutido de relatórios
  // antigos. O template.ts gerava /\/r\/(...)/  dentro de uma template literal
  // — \/ é resolvido pra / no momento do build, então o HTML salvo no banco
  // chegou no browser como //r/(...)/ (o // virava comentário de linha JS e
  // matava o script inteiro do modo edição). Fix no template já foi aplicado
  // pra relatórios futuros; este replace conserta os já armazenados.
  html = html.replace(
    "location.pathname.match(//r/([a-z0-9]{8,16})/)",
    "location.pathname.match(/\\/r\\/([a-z0-9]{8,16})/)"
  );

  // HOTFIX 2026-05-11 (segundo bug do mesmo padrão): comentários JS com
  // \n literal viravam quebras de linha reais no output, deixando )
  // órfãos na linha seguinte → SyntaxError "Unexpected token ')'" que
  // matava o script de edição depois do step 1. Mesmo bug da regex /\/r\/
  // mas em comentário em vez de regex.
  html = html.replace(
    "// Percepção: pega texto livre (preserva quebras como \n)",
    "// Percepção: pega texto livre (preserva quebras como newline)"
  );
  html = html.replace(
    "// Substitui <br> por \n antes de pegar textContent",
    "// Substitui <br> por newline antes de pegar textContent"
  );

  // E o terceiro caso do mesmo bug: br.replaceWith('\n') no source virou
  // br.replaceWith('<newline real>') no HTML, que é literal string inválida
  // em ECMAScript. Substitui pelos escapes corretos.
  html = html.split("br.replaceWith('\n');").join("br.replaceWith('\\n');");

  // Renomeia título "Pleito" → "Pleito do cedente" na seção 9 (relatórios
  // antigos foram gerados com o texto curto).
  html = html.replace(
    '<!-- 9. Pleito -->\n    <div class="stitle">Pleito <div class="line"></div></div>',
    '<!-- 9. Pleito -->\n    <div class="stitle">Pleito do cedente <div class="line"></div></div>'
  );

  // Injeta seção "Pleito do Comitê" (tabela editável + autosave) em relatórios
  // que foram gerados sem ela. Detecta pela ausência do marcador data-pc-key.
  if (!html.includes("data-pc-key=")) {
    const fields: Array<[string, string]> = [
      ["Limite Global",               "limiteTotal"],
      ["Tranche Limite Global",       "tranche"],
      ["Limite Convencional",         "limiteConvencional"],
      ["Limite Comissária",           "limiteComissaria"],
      ["Limite Sacados Pulverizados", "limitePorSacado"],
      ["Limite Principais Sacados",   "limitePrincipaisSacados"],
      ["Taxa Convencional",           "taxaConvencional"],
      ["Taxa Comissária",             "taxaComissaria"],
      ["Boleto",                      "valorCobrancaBoleto"],
      ["Prazo Máximo",                "prazoMaximoOp"],
      ["TAC",                         "cobrancaTAC"],
      ["Prazo de Recompra",           "prazoRecompraCedente"],
      ["Prazo de Cartório",           "prazoEnvioCartorio"],
      ["Tranche Checagem",            "trancheChecagem"],
      ["Prazo Tranche",               "prazoTranche"],
    ];
    const halfIdx = Math.ceil(fields.length / 2);
    const renderCol = (rows: Array<[string, string]>) => rows.map(([lbl, key]) =>
      `<tr><td style="width:58%;color:var(--x5);font-size:var(--fs-body);padding:5px 8px">${lbl}</td>` +
      `<td style="text-align:right;padding:5px 8px"><input class="pc-input" data-pc-key="${key}" value="" placeholder="—" /></td></tr>`
    ).join("");
    const pcStyle = `<style>
.pc-input{width:100%;padding:3px 6px;border:1px solid var(--n2);border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:var(--fs-body);text-align:right;color:var(--n9);background:#fff;outline:none;box-sizing:border-box}
.pc-input:hover{border-color:#1a2b5e}
.pc-input:focus{border-color:#1a2b5e;box-shadow:0 0 0 2px rgba(26,43,94,.08)}
.pc-input.saving{border-color:#f59e0b;background:#fffbeb}
.pc-input.saved{border-color:#10b981;background:#ecfdf5}
.pc-input.error{border-color:#ef4444;background:#fef2f2}
@media print{.pc-input{border:none!important;background:transparent!important;box-shadow:none!important;padding:0!important}}
.pc-download-btn,.pc-view-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:5px;font-size:11px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;transition:background .15s,transform .1s,border-color .15s}
.pc-download-btn{background:#1a2b5e;color:#fff;border:1px solid #1a2b5e;box-shadow:0 1px 3px rgba(15,23,42,.1)}
.pc-download-btn:hover{background:#243a80;border-color:#243a80;transform:translateY(-1px)}
.pc-download-btn:active{transform:translateY(0)}
.pc-download-btn:disabled,.pc-view-btn:disabled{opacity:.6;cursor:not-allowed;transform:none}
.pc-view-btn{background:#fff;color:#1a2b5e;border:1px solid #cbd5e1}
.pc-view-btn:hover{background:#f1f5f9;border-color:#1a2b5e;transform:translateY(-1px)}
.pc-view-btn:active{transform:translateY(0)}
@media print{.pc-download-btn,.pc-view-btn{display:none!important}}
</style>`;
    const pcMarkup = `${pcStyle}
    <!-- 9.5 Pleito do Comitê (injetado em runtime) -->
    <div class="stitle">Pleito do Comitê <div class="line"></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:6px">
      <table class="tbl" style="margin:0"><tbody>${renderCol(fields.slice(0, halfIdx))}</tbody></table>
      <table class="tbl" style="margin:0"><tbody>${renderCol(fields.slice(halfIdx))}</tbody></table>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:12px">
      <div style="display:flex;gap:6px;align-items:center">
        <button type="button" id="pcDownloadBtn" class="pc-download-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Baixar PDF
        </button>
        <button type="button" id="pcViewBtn" class="pc-view-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          Ver em HTML
        </button>
      </div>
      <div id="pcStatus" style="font-size:11px;color:var(--x4);min-height:14px"></div>
    </div>

    `;
    html = html.replace(
      "<!-- 9b. Sugestão do Analista",
      pcMarkup + "<!-- 9b. Sugestão do Analista"
    );

    const pcAutosaveScript = `<script>
(function(){
  var m = location.pathname.match(/\\/r\\/([a-z0-9]{8,16})/);
  if (!m) return;
  var REPORT_ID = m[1];
  var inputs = document.querySelectorAll('.pc-input');
  if (inputs.length === 0) return;
  var status = document.getElementById('pcStatus');
  var saveTimer = null;
  function setState(cls){
    inputs.forEach(function(el){ el.classList.remove('saving','saved','error'); if (cls) el.classList.add(cls); });
  }
  function pad(n){ return n < 10 ? '0' + n : '' + n; }
  function fmtNow(){ var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function collect(){
    var v = {};
    inputs.forEach(function(el){
      var k = el.getAttribute('data-pc-key');
      var val = (el.value || '').trim();
      if (k && val) v[k] = val;
    });
    return v;
  }
  function save(){
    setState('saving');
    if (status) status.textContent = 'Salvando…';
    fetch('/api/r/' + REPORT_ID + '/pleito-comite', {
      method: 'PATCH',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ values: collect() })
    }).then(function(r){
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function(){
      setState('saved');
      if (status) status.textContent = 'Salvo às ' + fmtNow();
      setTimeout(function(){ setState(''); }, 1500);
    }).catch(function(err){
      setState('error');
      if (status) status.textContent = 'Erro ao salvar: ' + err.message;
    });
  }
  inputs.forEach(function(el){
    el.addEventListener('input', function(){
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 800);
    });
  });

  // Botões "Baixar PDF" e "Ver em HTML" — ambos chamam endpoints do parecer
  // server-side (parecer-pdf / parecer-html). ensureSaved() garante que o
  // último valor digitado foi persistido antes da geração.
  function ensureSaved(){
    return saveTimer
      ? new Promise(function(res){ clearTimeout(saveTimer); save(); setTimeout(res, 600); })
      : Promise.resolve();
  }

  var dl = document.getElementById('pcDownloadBtn');
  if (dl) {
    dl.addEventListener('click', function(){
      dl.disabled = true;
      var orig = dl.innerHTML;
      dl.textContent = 'Gerando...';
      ensureSaved().then(function(){
        return fetch('/api/r/' + REPORT_ID + '/parecer-pdf', { method: 'POST' });
      }).then(function(r){
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.blob();
      }).then(function(blob){
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'parecer-' + REPORT_ID + '.pdf';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(function(){ URL.revokeObjectURL(url); }, 10000);
      }).catch(function(err){
        alert('Erro ao gerar PDF: ' + err.message);
      }).finally(function(){
        dl.disabled = false;
        dl.innerHTML = orig;
      });
    });
  }

  var vw = document.getElementById('pcViewBtn');
  if (vw) {
    vw.addEventListener('click', function(){
      vw.disabled = true;
      var orig = vw.innerHTML;
      vw.textContent = 'Abrindo...';
      ensureSaved().then(function(){
        window.open('/api/r/' + REPORT_ID + '/parecer-html', '_blank');
      }).finally(function(){
        vw.disabled = false;
        vw.innerHTML = orig;
      });
    });
  }
})();
</script>
</body>`;
    html = html.replace("</body>", pcAutosaveScript);
  }

  // Adiciona autores novos (Débora, Nayara, Gleyso, Luiz) em relatórios
  // já armazenados — o template.ts só tinha Victor/Vanessa quando foram
  // gerados. Mantém a ordem original.
  html = html.replace(
    '<option value="Vanessa">Vanessa</option>\n  </select>',
    '<option value="Vanessa">Vanessa</option>\n    <option value="Débora">Débora</option>\n    <option value="Nayara">Nayara</option>\n    <option value="Gleyso">Gleyso</option>\n    <option value="Luiz">Luiz</option>\n  </select>'
  );

  // Aplica overrides salvos pela edição inline (fortes/fracos/alertas — listas).
  const overrides: Partial<Record<Section, string[]>> = {};
  if (Array.isArray(data.pontos_fortes)) overrides.fortes = data.pontos_fortes as string[];
  if (Array.isArray(data.pontos_fracos)) overrides.fracos = data.pontos_fracos as string[];
  if (Array.isArray(data.alertas))       overrides.alertas = data.alertas       as string[];
  if (Object.keys(overrides).length > 0) {
    html = applyOverrides(html, overrides);
  }

  // Percepção é texto livre (não lista) — substitui inteiro entre os marcadores.
  if (typeof data.percepcao === "string" && data.percepcao.trim()) {
    html = applyPercepcao(html, data.percepcao);
  }
  // Percepções por seção (DRE, Faturamento, Balanço) — mesma lógica
  // de texto livre, marcadores próprios. Vazio = mantém placeholder do template.
  if (typeof data.percepcao_dre === "string" && data.percepcao_dre.trim()) {
    html = applyTextSection(html, "dre", data.percepcao_dre);
  }
  if (typeof data.percepcao_faturamento === "string" && data.percepcao_faturamento.trim()) {
    html = applyTextSection(html, "faturamento", data.percepcao_faturamento);
  }
  if (typeof data.percepcao_balanco === "string" && data.percepcao_balanco.trim()) {
    html = applyTextSection(html, "balanco", data.percepcao_balanco);
  }

  // Pleito Comitê: edição livre; injeta valores salvos sempre que houver.
  html = injectPleitoComite(html, data.pleito_comite);

  // Modo edição (fortes/fracos/alertas): substitui __EDIT_TOKEN__ pelo token real
  // apenas se ?k= bate. Sem ?k= ou com ?k= incorreto, remove o placeholder
  // (JS do editor de fortes/fracos/alertas não ativa).
  const k = req.nextUrl.searchParams.get("k") || "";
  const editing = !!data.edit_token && k && k === data.edit_token;
  html = html.replace("__EDIT_TOKEN__", editing ? (data.edit_token as string) : "");

  // DEBUG/WORKAROUND 2026-05-11: relatório verdn4lkaw retorna HTML correto
  // mas Victor não vê a barra de edição. Inserir logs de console pra revelar
  // onde o script para no navegador dele + atalho Ctrl+Alt+E como workaround
  // imediato pra forçar a barra a aparecer.
  if (editing) {
    // Logs de progresso dentro do script de edição.
    html = html.replace(
      "if (!TOKEN || TOKEN === \"__\" + \"EDIT_TOKEN__\") return;",
      "console.log('[edit:debug] step 0 — TOKEN length=', TOKEN.length, 'value=', TOKEN.slice(0,4)+'...');\n  if (!TOKEN || TOKEN === \"__\" + \"EDIT_TOKEN__\") { console.warn('[edit:debug] aborted — token vazio ou placeholder'); return; }"
    );
    html = html.replace(
      "if (!m) return;",
      "console.log('[edit:debug] step 1 — pathname match=', m);\n  if (!m) { console.warn('[edit:debug] aborted — path regex não bateu, pathname=', location.pathname); return; }"
    );
    html = html.replace(
      "bar.classList.add('show');",
      "console.log('[edit:debug] step 2 — bar element=', bar, 'btnTog=', btnTog);\n  if (!bar) { console.error('[edit:debug] FATAL — editBar não existe no DOM'); return; }\n  bar.classList.add('show');\n  console.log('[edit:debug] step 3 — show adicionado, classList=', bar.className, 'computed display=', getComputedStyle(bar).display);"
    );

    // HOTFIX 2026-05-12: instrumenta collect/decorate/+Adicionar com logs e
    // aplica fix do placeholder + cursor pra QUALQUER relatório antigo
    // (sem precisar regerar). Mesma lógica do template.ts atualizado em f2c97bd.
    html = html.replace(
      "function decorate(list){\n    Array.prototype.forEach.call(list.querySelectorAll('[data-edit-item]'), function(item){",
      "function decorate(list){\n    Array.prototype.forEach.call(list.querySelectorAll('[data-edit-empty]'), function(ph){ ph.remove(); });\n    console.log('[edit:collect-debug] decorate('+(list.getAttribute('data-edit-list'))+') items existentes:', list.querySelectorAll('[data-edit-item]').length);\n    Array.prototype.forEach.call(list.querySelectorAll('[data-edit-item]'), function(item){"
    );

    html = html.replace(
      "function collect(){\n    var out = {};\n    lists().forEach(function(p){\n      var sec = p[0], list = p[1];\n      if (!list) { out[sec] = []; return; }\n      var items = list.querySelectorAll('[data-edit-item]');\n      var arr = [];\n      Array.prototype.forEach.call(items, function(item){\n        var clone = item.cloneNode(true);\n        var rm = clone.querySelector('.edit-rm'); if (rm) rm.remove();\n        var t = (clone.textContent || '').trim();\n        if (t) arr.push(t);\n      });",
      "function collect(){\n    var out = {};\n    lists().forEach(function(p){\n      var sec = p[0], list = p[1];\n      if (!list) { console.warn('[edit:collect-debug] '+sec+': list element NÃO existe no DOM → gravando []'); out[sec] = []; return; }\n      var items = list.querySelectorAll('[data-edit-item]');\n      console.log('[edit:collect-debug] '+sec+': '+items.length+' item(s) no DOM');\n      var arr = [];\n      Array.prototype.forEach.call(items, function(item, idx){\n        var clone = item.cloneNode(true);\n        var rm = clone.querySelector('.edit-rm'); if (rm) rm.remove();\n        var t = (clone.textContent || '').trim();\n        console.log('[edit:collect-debug]   '+sec+'['+idx+']: textContent='+JSON.stringify(t)+' raw='+JSON.stringify((item.textContent||'').slice(0,80)));\n        if (t) arr.push(t);\n      });"
    );

    html = html.replace(
      "function saveEdit(){\n    var data = collect();",
      "function saveEdit(){\n    var data = collect();\n    console.log('[edit:collect-debug] PAYLOAD:', JSON.stringify({fortes:data.fortes,fracos:data.fracos,alertas:data.alertas,percepcao_len:(data.percepcao||'').length,percepcaoDre_len:(data.percepcaoDre||'').length,percepcaoFaturamento_len:(data.percepcaoFaturamento||'').length,percepcaoBalanco_len:(data.percepcaoBalanco||'').length}));"
    );

    // HOTFIX 2026-05-12: × button antes era click → item.remove() instantâneo.
    // Sintoma: usuário clicava por engano achando que ia editar → item sumia
    // silenciosamente → save grava []. Agora exige confirmação (1º click vira
    // "Confirmar?" pulsante, 2º click em até 3s remove). Reverte sozinho.
    html = html.replace(
      "rm.addEventListener('click', function(e){ e.preventDefault(); item.remove(); });",
      "var confirmTimer = null;\n        rm.addEventListener('click', function(e){\n          e.preventDefault(); e.stopPropagation();\n          console.log('[edit:collect-debug] × clicado em', (item.textContent||'').slice(0,40), 'confirming=', rm.classList.contains('confirming'));\n          if (rm.classList.contains('confirming')) {\n            if (confirmTimer) clearTimeout(confirmTimer);\n            console.log('[edit:collect-debug] × REMOVENDO item');\n            item.remove();\n            return;\n          }\n          rm.classList.add('confirming');\n          rm.textContent = 'Confirmar?';\n          confirmTimer = setTimeout(function(){\n            rm.classList.remove('confirming');\n            rm.textContent = '\\u00d7';\n          }, 3000);\n        });"
    );
    // Estilo da pílula "Confirmar?" injetado também (CSS adicional via <style> antes do </head>).
    html = html.replace(
      "</style>",
      ".edit-rm.confirming{background:#dc2626;color:#fff;width:auto;padding:0 8px;border-radius:9px;font-size:10px;font-weight:700;animation:rmPulse 1.5s ease-in-out infinite}\n@keyframes rmPulse{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.4)}50%{box-shadow:0 0 0 6px rgba(220,38,38,0)}}\n</style>"
    );

    // Workaround independente: script extra antes de </body> que registra
    // window.__forcarBarra() e atalho Ctrl+Alt+E. Roda mesmo se o script
    // principal de edição falhar antes do bar.classList.add('show').
    const workaroundScript = `<script>
(function(){
  window.__forcarBarra = function(){
    var bar = document.getElementById('editBar');
    if (!bar) { console.error('[forcar] editBar não existe no DOM — relatório foi gerado sem o markup de edição'); return; }
    bar.classList.add('show');
    bar.setAttribute('style', 'position:fixed!important;top:16px!important;right:16px!important;z-index:99999!important;display:flex!important;align-items:center!important;gap:8px!important;padding:8px 12px!important;background:#fff!important;border:2px solid #1a2b5e!important;border-radius:10px!important;box-shadow:0 6px 24px rgba(15,23,42,.25)!important;font-family:sans-serif!important;font-size:12px!important;visibility:visible!important;opacity:1!important');
    console.log('[forcar] barra forçada — display=', getComputedStyle(bar).display, 'visibility=', getComputedStyle(bar).visibility);
  };
  document.addEventListener('keydown', function(e){
    if (e.ctrlKey && e.altKey && (e.key === 'e' || e.key === 'E' || e.code === 'KeyE')) {
      e.preventDefault();
      window.__forcarBarra();
    }
  });
  console.log('[edit-workaround] Pronto. Atalho Ctrl+Alt+E e window.__forcarBarra() registrados.');
  // Diagnóstico imediato: 500ms após load, relata estado da barra
  setTimeout(function(){
    var bar = document.getElementById('editBar');
    if (!bar) { console.error('[edit-diag] editBar AUSENTE no DOM'); return; }
    var cs = getComputedStyle(bar);
    console.log('[edit-diag] editBar status:', {
      className: bar.className,
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      position: cs.position,
      top: cs.top,
      right: cs.right,
      zIndex: cs.zIndex,
      rect: bar.getBoundingClientRect()
    });
  }, 500);
})();
</script>
</body>`;
    html = html.replace("</body>", workaroundScript);
  }


  // Cache-Control: no-store quando há edição em andamento, pleito preenchido,
  // OU overrides salvos (fortes/fracos/alertas/percepções). Sem isso, o CDN
  // cacheava a versão "vanilla IA" por 1h e leituras subsequentes em outra aba
  // sem ?k= ignoravam as edições salvas no banco — sintoma reportado 2026-05-12.
  const hasPleitoComite = !!data.pleito_comite && Object.values(data.pleito_comite as Record<string, unknown>).some(v => typeof v === "string" && v.trim());
  const hasOverrides =
    (Array.isArray(data.pontos_fortes) && data.pontos_fortes.length > 0) ||
    (Array.isArray(data.pontos_fracos) && data.pontos_fracos.length > 0) ||
    (Array.isArray(data.alertas)       && data.alertas.length > 0) ||
    (typeof data.percepcao === "string" && data.percepcao.trim().length > 0) ||
    (typeof data.percepcao_dre === "string" && data.percepcao_dre.trim().length > 0) ||
    (typeof data.percepcao_faturamento === "string" && data.percepcao_faturamento.trim().length > 0) ||
    (typeof data.percepcao_balanco === "string" && data.percepcao_balanco.trim().length > 0);

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": (editing || hasPleitoComite || hasOverrides)
        ? "no-store, no-cache, must-revalidate"
        : "public, max-age=3600, s-maxage=3600",
    },
  });
}

function notFoundPage(id: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório não encontrado</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;color:#334155}
.box{text-align:center;padding:40px;background:#fff;border-radius:12px;border:1px solid #e2e8f0;max-width:420px}
h1{font-size:20px;margin-bottom:8px;color:#1e293b}p{font-size:14px;color:#64748b;margin-bottom:4px}code{font-size:12px;color:#94a3b8}</style>
</head><body><div class="box"><h1>Relatório não encontrado</h1>
<p>O link que você acessou não existe ou foi removido.</p>
<code>${id}</code></div></body></html>`;
}

function expiredPage(): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Link expirado</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;color:#334155}
.box{text-align:center;padding:40px;background:#fff;border-radius:12px;border:1px solid #e2e8f0;max-width:420px}
h1{font-size:20px;margin-bottom:8px;color:#1e293b}p{font-size:14px;color:#64748b}</style>
</head><body><div class="box"><h1>Link expirado</h1>
<p>Este relatório não está mais disponível. Solicite um novo link à equipe que o enviou.</p></div></body></html>`;
}
