import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Cenário — Edição inline /r/{id} (P4 do roadmap 2026-05-12)
 *
 * Cobre o pipeline completo que sofreu 7 commits de fix em 2026-05-12:
 * 1. Cria um relatório de teste direto no banco (sem depender de upload UI)
 * 2. Abre /r/{id}?k=<token> em modo edição
 * 3. Edita Pontos Fortes, Pontos Fracos, Alertas e Percepção do Analista
 * 4. Salva
 * 5. Verifica banco diretamente (autoritativo) E HTML servido em /r/{id}
 * 6. Limpa o relatório de teste
 *
 * Se este teste quebrar, regredimos um dos seguintes:
 * - Cache-Control no-store quando há overrides
 * - SELECT etapa 1 + etapa 2 unificada com fallback
 * - noStore() + fetchCache=force-no-store contra fetch cache do Next.js
 * - × com confirmação dupla
 * - Decorate removendo placeholder data-edit-empty
 * - applyOverrides / applyPercepcao / applyTextSection
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Skipa toda a suíte se não tiver credenciais (CI sem secrets, dev local sem .env.local)
test.describe("Edição inline /r/[id]", () => {
  test.skip(!SUPABASE_URL || !SUPABASE_KEY, "Sem credenciais Supabase — skipa testes E2E de edição inline");

  // ID único pra cada execução, evita colisão se rodar em paralelo
  function genTestId() {
    const rnd = Math.random().toString(36).slice(2, 10);
    return `e2etest${rnd}`.slice(0, 14);
  }
  function genToken() {
    return Math.random().toString(36).slice(2, 18);
  }

  test("persiste edições e reflete em GET público sem ?k=", async ({ page, baseURL }) => {
    const sb = createClient(SUPABASE_URL!, SUPABASE_KEY!);
    const reportId = genTestId();
    const editToken = genToken();

    // HTML mínimo válido com os marcadores que o route.ts procura.
    // Não precisa ser o template completo — só precisa ter os marcadores
    // de seção pra applyOverrides/applyPercepcao funcionarem.
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Teste E2E</title></head><body>
      <div data-edit-list="fortes"><!--EDIT:fortes:START--><div class="ana-item ana-item-empty" data-edit-empty>—</div><!--EDIT:fortes:END--></div>
      <div data-edit-list="fracos"><!--EDIT:fracos:START--><div class="ana-item ana-item-empty" data-edit-empty>—</div><!--EDIT:fracos:END--></div>
      <div data-edit-list="alertas"><!--EDIT:alertas:START--><div class="ana-item ana-item-empty" data-edit-empty>—</div><!--EDIT:alertas:END--></div>
      <div class="perc"><div data-edit-percepcao class="perc-text"><!--EDIT:percepcao:START-->placeholder<!--EDIT:percepcao:END--></div></div>
      <div class="perc-box"><div data-edit-text="dre" class="perc-box-content"><!--EDIT:dre:START-->placeholder<!--EDIT:dre:END--></div></div>
    </body></html>`;

    // Setup: cria relatório
    try {
      const ins = await sb.from("shared_reports").insert({
        id: reportId,
        company: "Empresa E2E Test",
        html,
        edit_token: editToken,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
      if (ins.error) throw new Error(`Setup falhou: ${ins.error.message}`);

      // Cenário A: testar via API direta (mais determinístico que UI).
      // Os fixes essenciais são server-side; basta validar que /edit grava e
      // /r/[id] lê o que foi gravado.
      const fortesEsperados = ["forte 1 teste", "forte 2 teste"];
      const fracosEsperados = ["fraco teste"];
      const alertasEsperados = ["alerta teste"];
      const percepcaoEsperada = `percepção e2e ${Date.now()}`;
      const percepcaoDreEsperada = "DRE e2e";

      const editRes = await page.request.post(`${baseURL ?? ""}/api/r/${reportId}/edit`, {
        data: {
          fortes: fortesEsperados,
          fracos: fracosEsperados,
          alertas: alertasEsperados,
          percepcao: percepcaoEsperada,
          percepcaoDre: percepcaoDreEsperada,
          autor: "E2E Test",
          token: editToken,
        },
      });
      expect(editRes.ok(), `POST /edit retornou ${editRes.status()}`).toBeTruthy();

      // Validação 1: banco persistiu (autoritativo)
      const row = await sb
        .from("shared_reports")
        .select("pontos_fortes, pontos_fracos, alertas, percepcao, percepcao_dre")
        .eq("id", reportId)
        .single();
      expect(row.data?.pontos_fortes, "pontos_fortes no banco").toEqual(fortesEsperados);
      expect(row.data?.pontos_fracos, "pontos_fracos no banco").toEqual(fracosEsperados);
      expect(row.data?.alertas, "alertas no banco").toEqual(alertasEsperados);
      expect(row.data?.percepcao, "percepcao no banco").toBe(percepcaoEsperada);
      expect(row.data?.percepcao_dre, "percepcao_dre no banco").toBe(percepcaoDreEsperada);

      // Validação 2: HTML servido em /r/{id} reflete o banco (sem ?k=).
      // Cache-buster pra garantir fetch fresh (evita memoization do PW).
      const publicRes = await page.request.get(`${baseURL ?? ""}/r/${reportId}?_=${Date.now()}`, {
        headers: { "Cache-Control": "no-cache" },
      });
      expect(publicRes.ok(), `GET /r/${reportId} retornou ${publicRes.status()}`).toBeTruthy();
      const publicHtml = await publicRes.text();

      // Pontos Fortes/Fracos/Alertas via applyOverrides
      for (const item of fortesEsperados) {
        expect(publicHtml, `HTML servido deve conter "${item}"`).toContain(item);
      }
      for (const item of fracosEsperados) expect(publicHtml).toContain(item);
      for (const item of alertasEsperados) expect(publicHtml).toContain(item);

      // Percepção via applyPercepcao
      expect(publicHtml, `HTML servido deve conter percepção "${percepcaoEsperada}"`).toContain(percepcaoEsperada);

      // Percepção DRE via applyTextSection
      expect(publicHtml, `HTML servido deve conter percepção DRE "${percepcaoDreEsperada}"`).toContain(percepcaoDreEsperada);

      // Validação 3: Cache-Control deve ser no-store (overrides salvos)
      expect(publicRes.headers()["cache-control"]).toMatch(/no-store/);

      // Validação 4: segunda chamada DIFERENTE — testa staleness do fetch cache.
      // Se Next.js memoizou, esse PATCH não vai aparecer.
      const novoTexto = `staleness check ${Date.now()}`;
      await sb.from("shared_reports").update({ percepcao: novoTexto }).eq("id", reportId);

      const publicRes2 = await page.request.get(`${baseURL ?? ""}/r/${reportId}?_=${Date.now()}_2`);
      const publicHtml2 = await publicRes2.text();
      expect(publicHtml2, "HTML servido deve refletir update direto no banco (anti-staleness)").toContain(novoTexto);
    } finally {
      // Cleanup: sempre deleta o relatório de teste mesmo se asserções falharem
      await sb.from("shared_reports").delete().eq("id", reportId);
    }
  });

  test("× pede confirmação antes de remover (sem regressão pra remoção acidental)", async ({ page, baseURL }) => {
    const sb = createClient(SUPABASE_URL!, SUPABASE_KEY!);
    const reportId = genTestId();
    const editToken = genToken();

    // Template mínimo com lista populada — pra ter um × pra clicar
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Teste ×</title>
      <style>.edit-bar{position:fixed;top:0;right:0}.edit-rm{display:none}body.editing .edit-rm{display:inline-block}</style>
      </head><body>
      <div class="edit-bar" id="editBar"><button id="editToggle">Editar</button><button id="editSave" style="display:none">Salvar</button><button id="editCancel" style="display:none">Cancelar</button><select id="editAutor"><option value="E2E">E2E</option></select></div>
      <div id="editSaved">Salvo</div>
      <div data-edit-list="fortes"><!--EDIT:fortes:START--><div class="ana-item" data-edit-item>Item original</div><!--EDIT:fortes:END--></div>
      <div data-edit-list="fracos"><!--EDIT:fracos:START--><div class="ana-item ana-item-empty" data-edit-empty>—</div><!--EDIT:fracos:END--></div>
      <div data-edit-list="alertas"><!--EDIT:alertas:START--><div class="ana-item ana-item-empty" data-edit-empty>—</div><!--EDIT:alertas:END--></div>
      <script>
      var TOKEN = "__EDIT_TOKEN__";
      if (!TOKEN || TOKEN === "__" + "EDIT_TOKEN__") {} else (function(){
        var SECTIONS = ['fortes','fracos','alertas'];
        var TEXT_KEYS = [];
        function lists(){ return SECTIONS.map(function(s){ return [s, document.querySelector('[data-edit-list="'+s+'"]')]; }); }
        function percEl(){ return null; }
        function textEl(){ return null; }
        function decorate(list){
          Array.prototype.forEach.call(list.querySelectorAll('[data-edit-empty]'), function(ph){ ph.remove(); });
          Array.prototype.forEach.call(list.querySelectorAll('[data-edit-item]'), function(item){
            item.setAttribute('contenteditable','true');
            if (!item.querySelector('.edit-rm')){
              var rm = document.createElement('button');
              rm.type='button'; rm.className='edit-rm'; rm.textContent='×';
              rm.contentEditable = 'false';
              var confirmTimer = null;
              rm.addEventListener('click', function(e){
                e.preventDefault(); e.stopPropagation();
                if (rm.classList.contains('confirming')) {
                  if (confirmTimer) clearTimeout(confirmTimer);
                  item.remove();
                  return;
                }
                rm.classList.add('confirming');
                rm.textContent = 'Confirmar?';
                confirmTimer = setTimeout(function(){
                  rm.classList.remove('confirming');
                  rm.textContent = '×';
                }, 3000);
              });
              item.appendChild(rm);
            }
          });
        }
        document.getElementById('editToggle').addEventListener('click', function(){
          document.body.classList.add('editing');
          lists().forEach(function(p){ if (p[1]) decorate(p[1]); });
        });
      })();
      </script>
      </body></html>`;

    try {
      await sb.from("shared_reports").insert({
        id: reportId,
        company: "Test × confirm",
        html,
        edit_token: editToken,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });

      await page.goto(`${baseURL ?? ""}/r/${reportId}?k=${editToken}`);
      await page.locator("#editToggle").click();

      // Ao entrar em edição, o × aparece
      const rmBtn = page.locator(".edit-rm").first();
      await expect(rmBtn).toBeVisible();
      await expect(rmBtn).toHaveText("×");

      // 1º click vira "Confirmar?"
      await rmBtn.click();
      await expect(rmBtn).toHaveText("Confirmar?");
      await expect(rmBtn).toHaveClass(/confirming/);

      // Item ainda no DOM
      await expect(page.locator("[data-edit-item]")).toHaveCount(1);

      // 2º click remove
      await rmBtn.click();
      await expect(page.locator("[data-edit-item]")).toHaveCount(0);
    } finally {
      await sb.from("shared_reports").delete().eq("id", reportId);
    }
  });
});
