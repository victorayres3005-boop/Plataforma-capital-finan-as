-- Cria usuário de teste pra suite E2E do Playwright.
-- Rodar no Supabase SQL Editor (não em produção real — usar projeto/branch de dev/teste).
--
-- Usuário gerado:
--   email:    e2e@capitalfinancas.test
--   password: e2e-test-2026
--
-- Depois de rodar, salvar no .env.local:
--   E2E_USER_EMAIL="e2e@capitalfinancas.test"
--   E2E_USER_PASSWORD="e2e-test-2026"
--
-- Idempotente: se já existir, não duplica. Se quiser resetar, descomente
-- o DELETE no início.

-- DELETE FROM auth.identities WHERE provider_id = 'e2e@capitalfinancas.test';
-- DELETE FROM auth.users      WHERE email       = 'e2e@capitalfinancas.test';

DO $$
DECLARE
  v_user_id  uuid;
  v_existing uuid;
BEGIN
  -- Já existe?
  SELECT id INTO v_existing FROM auth.users WHERE email = 'e2e@capitalfinancas.test' LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE NOTICE 'Usuário E2E já existe (id=%). Nada a fazer.', v_existing;
    RETURN;
  END IF;

  v_user_id := gen_random_uuid();

  -- 1) auth.users — credencial bcrypt
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    'e2e@capitalfinancas.test',
    crypt('e2e-test-2026', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"e2e","note":"usuário automatizado — não usar em produção"}'::jsonb
  );

  -- 2) auth.identities — necessário pro login com email/senha funcionar no Supabase moderno
  INSERT INTO auth.identities (
    id, user_id, provider_id, provider, identity_data,
    last_sign_in_at, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(),
    v_user_id,
    v_user_id::text,
    'email',
    jsonb_build_object(
      'sub',            v_user_id::text,
      'email',          'e2e@capitalfinancas.test',
      'email_verified', true,
      'phone_verified', false
    ),
    now(), now(), now()
  );

  RAISE NOTICE 'Usuário E2E criado com id=%.', v_user_id;
END $$;

-- Confirma criação
SELECT id, email, email_confirmed_at, role
FROM auth.users
WHERE email = 'e2e@capitalfinancas.test';
