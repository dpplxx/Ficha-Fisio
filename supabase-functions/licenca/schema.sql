-- Rode isso uma vez no SQL editor do painel do Supabase, antes de deployar a
-- function `licenca`. Guarda só a DATA de início do trial gratuito de cada
-- usuário — nenhum dado de paciente entra aqui.
--
-- Por que isso existe: antes, o início do trial só ficava no localStorage do
-- navegador (localStorage.setItem('fisio_trial_<uid>', ...)) — bastava limpar
-- os dados do navegador pra reiniciar o trial indefinidamente. Com a data
-- guardada aqui (escrita só pela function, nunca pelo cliente), isso deixa de
-- ser possível.

create table if not exists public.trial_starts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null default now()
);

alter table public.trial_starts enable row level security;

-- o usuário pode ler só a própria data de início (pra eventual UI futura),
-- mas NUNCA inserir/alterar via client — só a função `licenca`, que roda com
-- a service role (que ignora RLS), escreve aqui.
drop policy if exists trial_starts_select_own on public.trial_starts;
create policy trial_starts_select_own on public.trial_starts
  for select
  using (auth.uid() = user_id);
