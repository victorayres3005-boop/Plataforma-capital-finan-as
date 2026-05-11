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
  // Etapa 1: campos críticos + edit_token. Migrations 15-17 cobrem todas.
  let { data: base, error } = await supabase
    .from("shared_reports")
    .select("html, expires_at, company, pontos_fortes, pontos_fracos, alertas, percepcao, edit_token, pleito_comite")
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

  // Etapa 2: enriquece com as 3 percepções por seção (migration 18).
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


  // Cache-Control: no-store quando há edição em andamento OU pleito preenchido
  // (Pleito Comitê é editável sem token e qualquer leitura precisa refletir o
  // último save). Senão, cache normal de 1h.
  const hasPleitoComite = !!data.pleito_comite && Object.values(data.pleito_comite as Record<string, unknown>).some(v => typeof v === "string" && v.trim());

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": (editing || hasPleitoComite)
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
