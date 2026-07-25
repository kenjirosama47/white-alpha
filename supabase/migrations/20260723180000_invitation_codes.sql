-- Système d'invitation à usage unique (PWA privée, distribution restreinte) :
-- une inscription ne peut aboutir qu'avec un code valide, généré par le
-- owner (aal2), consommé atomiquement dans la même transaction que la
-- création du compte (voir section 3 — extension de handle_new_user).
--
-- Décision d'architecture : `used_by`/`created_by` référencent auth.users(id)
-- directement (comme public.profiles.id lui-même, voir migration
-- 20260714190417), et non public.profiles(id). Justification : le trigger
-- handle_new_user réagit à `AFTER INSERT ON auth.users` — la ligne
-- auth.users(new.id) existe déjà et est visible dans la transaction au
-- moment où le code est consommé, donc aucune dépendance à la réussite de
-- l'insertion du profil n'est nécessaire pour cette FK précise. L'ordre reste
-- strict à l'intérieur du trigger : (1) auth.users déjà créé (c'est ce qui a
-- déclenché ce trigger) ; (2) insert public.profiles ; (3) validation et
-- consommation du code. Une exception à n'importe laquelle de ces étapes
-- annule la transaction entière (auth.users compris, comportement Postgres
-- standard pour un trigger AFTER INSERT qui échoue) : aucun code ne peut
-- donc jamais être marqué utilisé si la création du compte ou du profil
-- échoue, sans code de compensation applicatif à écrire.
--
-- Réversibilité (manuelle, jamais exécutée automatiquement) :
--   restaurer la définition précédente de handle_new_user (migration
--   20260714190417) ; drop function public.admin_create_invitation_code,
--   public.admin_list_invitation_codes, public.admin_revoke_invitation_code,
--   public.is_invitation_rate_limited, public.record_invitation_attempt,
--   public.is_invitation_code_usable, public.encode_invitation_code_base32 ;
--   drop table public.invitation_attempt_log, public.invitation_codes.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Table des codes d'invitation. RLS activée, AUCUNE policy créée : la
--    seule voie d'accès (lecture ou écriture) est authentifiée
--    fonction par fonction ci-dessous, jamais un SELECT/INSERT/UPDATE direct
--    depuis le navigateur, même pour le owner (revoke explicite en section 6
--    pour ne dépendre d'aucun GRANT implicite).
-- ---------------------------------------------------------------------------
create table public.invitation_codes (
  id uuid primary key default gen_random_uuid(),
  -- sha256 hexadécimal du code affiché (avec préfixe "WA-" et tirets inclus,
  -- normalisé en majuscules) : jamais le code brut stocké, à aucun moment
  -- après la réponse de création (section 4).
  code_hash text not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users (id),
  revoked_at timestamptz,
  max_uses integer not null default 1,
  use_count integer not null default 0,
  note text,
  constraint invitation_codes_max_uses_positive check (max_uses > 0 and max_uses <= 1000),
  constraint invitation_codes_use_count_non_negative check (use_count >= 0),
  constraint invitation_codes_use_count_within_max check (use_count <= max_uses),
  constraint invitation_codes_used_consistency check (
    (used_at is null and used_by is null) or (used_at is not null)
  ),
  constraint invitation_codes_expires_after_created check (expires_at > created_at)
);

comment on table public.invitation_codes is
  'Codes d''invitation à usage unique (par défaut) pour l''inscription privée. '
  'Aucune policy RLS directe : accès exclusivement via admin_create_invitation_code, '
  'admin_list_invitation_codes, admin_revoke_invitation_code (owner + aal2) et le '
  'trigger handle_new_user (validation/consommation). Seul code_hash est stocké, '
  'jamais le code en clair.';

create unique index invitation_codes_code_hash_idx on public.invitation_codes (code_hash);
create index invitation_codes_expires_at_idx on public.invitation_codes (expires_at);
create index invitation_codes_revoked_at_idx on public.invitation_codes (revoked_at) where revoked_at is not null;
create index invitation_codes_created_by_idx on public.invitation_codes (created_by);

alter table public.invitation_codes enable row level security;
revoke all on public.invitation_codes from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Journal des tentatives (rate limiting). Jamais d'IP ni de code en
--    clair : ip_hash est un HMAC-SHA256(secret_serveur, ip) calculé côté
--    Next.js (jamais en base, le secret ne doit jamais transiter jusqu'à
--    Postgres) ; code_hash_prefix est un préfixe tronqué (16 caractères
--    hexadécimal, jamais le hash complet) du même sha256 que code_hash,
--    suffisant pour grouper les tentatives sans permettre une recherche
--    exacte du code visé.
-- ---------------------------------------------------------------------------
create table public.invitation_attempt_log (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  code_hash_prefix text,
  attempted_at timestamptz not null default now(),
  success boolean not null default false
);

comment on table public.invitation_attempt_log is
  'Journal anonymisé des tentatives d''inscription (rate limiting uniquement) : '
  'ip_hash est un HMAC calculé côté serveur Next.js avec un secret jamais transmis '
  'à Postgres, jamais l''IP en clair. code_hash_prefix est un préfixe tronqué, '
  'jamais le hash complet ni le code brut. Purgé automatiquement au-delà de 24h '
  'par is_invitation_rate_limited (pas de job planifié requis).';

create index invitation_attempt_log_attempted_at_idx on public.invitation_attempt_log (attempted_at);
create index invitation_attempt_log_ip_hash_idx on public.invitation_attempt_log (ip_hash, attempted_at);
create index invitation_attempt_log_code_prefix_idx on public.invitation_attempt_log (code_hash_prefix, attempted_at);

alter table public.invitation_attempt_log enable row level security;
revoke all on public.invitation_attempt_log from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Encodage Crockford Base32 (5 bits/symbole, alphabet de 32 caractères
--    excluant I, L, O, U — jamais ambigu avec 1/1/0/V). 16 octets
--    (gen_random_bytes(16), Postgres/pgcrypto = source cryptographiquement
--    sûre) = 128 bits réels d'entropie, encodés SANS PERTE sur 26 caractères
--    (ceil(128/5), le dernier symbole complété par 2 bits de bourrage nuls
--    — pratique standard, n'affaiblit jamais l'entropie de la source).
--
--    Note sur le format : l'exemple illustratif initial ("WA-7K9P-X4DM-Q8TZ",
--    12 caractères) ne représenterait que ~59 bits avec cet alphabet
--    (12 × log2(32) ≈ 60 bits) — très inférieur à l'exigence explicite de
--    128 bits minimum. Le format retenu est donc plus long
--    ("WA-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX", 26 caractères après le
--    préfixe) pour satisfaire réellement cette exigence plutôt que de
--    respecter l'exemple au détriment du chiffre demandé — signalé
--    explicitement dans le rapport plutôt que fait silencieusement.
-- ---------------------------------------------------------------------------
create function public.encode_invitation_code_base32(p_bytes bytea)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_result text := '';
  v_bit_buffer bigint := 0;
  v_bit_count integer := 0;
  v_byte integer;
  v_index integer;
  i integer;
begin
  for i in 0 .. length(p_bytes) - 1 loop
    v_byte := get_byte(p_bytes, i);
    v_bit_buffer := (v_bit_buffer << 8) | v_byte;
    v_bit_count := v_bit_count + 8;
    while v_bit_count >= 5 loop
      v_index := (v_bit_buffer >> (v_bit_count - 5)) & 31;
      v_result := v_result || substr(v_alphabet, v_index + 1, 1);
      v_bit_count := v_bit_count - 5;
    end loop;
  end loop;

  if v_bit_count > 0 then
    v_index := (v_bit_buffer << (5 - v_bit_count)) & 31;
    v_result := v_result || substr(v_alphabet, v_index + 1, 1);
  end if;

  return v_result;
end;
$$;

comment on function public.encode_invitation_code_base32(bytea) is
  'Encodage Crockford Base32 sans perte (5 bits/symbole, alphabet de 32 '
  'caractères sans ambiguïté). Usage interne uniquement (aucun GRANT '
  'client) : appelée par admin_create_invitation_code.';

revoke execute on function public.encode_invitation_code_base32(bytea) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Génération (owner + aal2 uniquement). Le code brut n'est retourné
--    qu'ici, une seule fois, jamais stocké ni journalisé nulle part.
-- ---------------------------------------------------------------------------
create function public.admin_create_invitation_code(
  p_expires_in_days integer default 7,
  p_max_uses integer default 1,
  p_note text default null
)
returns table (
  id uuid,
  code text,
  expires_at timestamptz,
  max_uses integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_code_body text;
  v_code text;
  v_code_hash text;
  v_id uuid;
  v_created_at timestamptz := now();
  v_expires_at timestamptz;
begin
  if not public.is_owner_aal2() then
    raise exception 'Accès réservé au propriétaire, avec authentification multifacteur vérifiée.';
  end if;

  if p_expires_in_days is null or p_expires_in_days <= 0 or p_expires_in_days > 365 then
    raise exception 'Durée de validité invalide (1 à 365 jours).';
  end if;
  if p_max_uses is null or p_max_uses <= 0 or p_max_uses > 1000 then
    raise exception 'Nombre d''utilisations invalide (1 à 1000).';
  end if;

  v_code_body := public.encode_invitation_code_base32(gen_random_bytes(16));
  v_code := 'WA-' || substr(v_code_body, 1, 4) || '-' || substr(v_code_body, 5, 4) || '-'
            || substr(v_code_body, 9, 4) || '-' || substr(v_code_body, 13, 4) || '-'
            || substr(v_code_body, 17, 4) || '-' || substr(v_code_body, 21, 4) || '-'
            || substr(v_code_body, 25, 2);
  v_code_hash := encode(digest(v_code, 'sha256'), 'hex');
  v_expires_at := v_created_at + make_interval(days => p_expires_in_days);

  insert into public.invitation_codes (code_hash, created_by, created_at, expires_at, max_uses, note)
  values (v_code_hash, auth.uid(), v_created_at, v_expires_at, p_max_uses, nullif(trim(coalesce(p_note, '')), ''))
  returning invitation_codes.id into v_id;

  return query select v_id, v_code, v_expires_at, p_max_uses, v_created_at;
end;
$$;

comment on function public.admin_create_invitation_code(integer, integer, text) is
  'Génère un code d''invitation (128 bits, gen_random_bytes) réservé au owner '
  'en aal2. Retourne le code brut UNE SEULE FOIS dans la réponse ; seul son '
  'hash sha256 est stocké. Jamais rappelable ensuite (voir '
  'admin_list_invitation_codes, qui ne renvoie jamais code_hash).';

revoke execute on function public.admin_create_invitation_code(integer, integer, text) from public, anon;
grant execute on function public.admin_create_invitation_code(integer, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Liste (owner + aal2 uniquement). Ne renvoie jamais code_hash ni le code
--    brut ; l'utilisateur lié n'est exposé que par son username (public par
--    conception ailleurs dans l'app), jamais par email.
-- ---------------------------------------------------------------------------
create function public.admin_list_invitation_codes()
returns table (
  id uuid,
  status text,
  created_at timestamptz,
  expires_at timestamptz,
  used_at timestamptz,
  used_by_username text,
  revoked_at timestamptz,
  max_uses integer,
  use_count integer,
  note text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_owner_aal2() then
    raise exception 'Accès réservé au propriétaire, avec authentification multifacteur vérifiée.';
  end if;

  return query
    select
      ic.id,
      case
        when ic.revoked_at is not null then 'revoked'
        when ic.use_count >= ic.max_uses then 'used'
        when ic.expires_at < now() then 'expired'
        else 'active'
      end as status,
      ic.created_at,
      ic.expires_at,
      ic.used_at,
      p.username as used_by_username,
      ic.revoked_at,
      ic.max_uses,
      ic.use_count,
      ic.note
    from public.invitation_codes ic
    left join public.profiles p on p.id = ic.used_by
    order by ic.created_at desc;
end;
$$;

comment on function public.admin_list_invitation_codes() is
  'Liste les codes d''invitation (statut dérivé, jamais stocké en dur) pour '
  'le owner en aal2. Ne renvoie jamais code_hash ni le code brut. '
  'used_by_username plutôt que l''email (jamais exposé inutilement).';

revoke execute on function public.admin_list_invitation_codes() from public, anon;
grant execute on function public.admin_list_invitation_codes() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Révocation (owner + aal2 uniquement). Idempotent-safe : ne révoque
--    qu'un code pas déjà révoqué, erreur explicite sinon.
-- ---------------------------------------------------------------------------
create function public.admin_revoke_invitation_code(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_owner_aal2() then
    raise exception 'Accès réservé au propriétaire, avec authentification multifacteur vérifiée.';
  end if;

  update public.invitation_codes
  set revoked_at = now()
  where id = p_id and revoked_at is null;

  if not found then
    raise exception 'Code introuvable ou déjà révoqué.';
  end if;
end;
$$;

comment on function public.admin_revoke_invitation_code(uuid) is
  'Révoque immédiatement un code d''invitation (owner + aal2). Un code révoqué '
  'échoue ensuite dans handle_new_user avec le même message générique qu''un '
  'code expiré/déjà utilisé/inconnu — aucune fuite de la raison exacte.';

revoke execute on function public.admin_revoke_invitation_code(uuid) from public, anon;
grant execute on function public.admin_revoke_invitation_code(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Rate limiting. Anon + authenticated (l'inscription se fait avant toute
--    session) : fenêtre de 15 minutes, 5 tentatives max par IP hachée et 5
--    tentatives max par préfixe de code visé, purge automatique des lignes
--    de plus de 24h à chaque appel (pas de pg_cron requis). Ne révèle jamais
--    si un code existe : le blocage renvoie le même signal "refuser" que
--    n'importe quel code invalide côté appelant (message générique construit
--    côté Next.js, jamais ici).
-- ---------------------------------------------------------------------------
create function public.is_invitation_rate_limited(p_ip_hash text, p_code_hash_prefix text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window interval := interval '15 minutes';
  v_max_per_ip integer := 5;
  v_max_per_code integer := 5;
  v_ip_count integer;
  v_code_count integer;
begin
  delete from public.invitation_attempt_log where attempted_at < now() - interval '24 hours';

  select count(*) into v_ip_count
  from public.invitation_attempt_log
  where ip_hash = p_ip_hash and attempted_at > now() - v_window;

  if v_ip_count >= v_max_per_ip then
    return true;
  end if;

  if p_code_hash_prefix is not null then
    select count(*) into v_code_count
    from public.invitation_attempt_log
    where code_hash_prefix = p_code_hash_prefix and attempted_at > now() - v_window;

    if v_code_count >= v_max_per_code then
      return true;
    end if;
  end if;

  return false;
end;
$$;

comment on function public.is_invitation_rate_limited(text, text) is
  'Vrai si la fenêtre de 15 minutes dépasse 5 tentatives pour cette IP hachée '
  'OU 5 tentatives pour ce préfixe de code — purge aussi les entrées de plus '
  'de 24h à chaque appel. Ne distingue jamais "code inexistant" de "trop de '
  'tentatives" : le message final reste générique côté appelant.';

create function public.record_invitation_attempt(p_ip_hash text, p_code_hash_prefix text, p_success boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.invitation_attempt_log (ip_hash, code_hash_prefix, success)
  values (p_ip_hash, p_code_hash_prefix, coalesce(p_success, false));
end;
$$;

comment on function public.record_invitation_attempt(text, text, boolean) is
  'Enregistre le résultat (succès/échec) d''une tentative, pour alimenter '
  'is_invitation_rate_limited. Jamais d''IP ni de code en clair.';

revoke execute on function public.is_invitation_rate_limited(text, text) from public;
grant execute on function public.is_invitation_rate_limited(text, text) to anon, authenticated;

revoke execute on function public.record_invitation_attempt(text, text, boolean) from public;
grant execute on function public.record_invitation_attempt(text, text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7bis. Pré-vérification en lecture seule de l'utilisabilité d'un code
--   (ajoutée après découverte en session : l'API publique `/signup` de
--   GoTrue enveloppe toute exception levée par le trigger handle_new_user
--   dans un message générique "Database error saving new user" — jamais le
--   message Postgres brut pour un vrai visiteur, contrairement à l'API
--   Admin. `web/app/inscription/actions.ts` ne peut donc pas fiablement
--   distinguer un rejet lié au code d'une autre erreur signUp en lisant
--   error.message : cette fonction devient la source de vérité, appelée
--   AVANT signUp, jamais après). `stable`, aucun verrou, ne consomme rien :
--   la validation et la consommation atomiques réelles restent
--   exclusivement dans handle_new_user (section 8) — un appel ici ne fait
--   jamais foi à lui seul pour créer un compte. Un seul booléen renvoyé,
--   jamais un statut détaillé : ne distingue jamais "inconnu" de "expiré",
--   "révoqué" ou "déjà utilisé" (anti-énumération).
-- ---------------------------------------------------------------------------
create function public.is_invitation_code_usable(p_code_hash text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitation record;
begin
  select ic.revoked_at, ic.expires_at, ic.max_uses, ic.use_count
  into v_invitation
  from public.invitation_codes ic
  where ic.code_hash = p_code_hash;

  if not found then
    return false;
  end if;

  return v_invitation.revoked_at is null
     and v_invitation.expires_at > now()
     and v_invitation.use_count < v_invitation.max_uses;
end;
$$;

comment on function public.is_invitation_code_usable(text) is
  'Pré-vérification en lecture seule (jamais de verrou/consommation) : vrai '
  'si le code existe, n''est pas révoqué, n''est pas expiré et n''a pas '
  'atteint max_uses. Un seul booléen, jamais le détail de la raison. Source '
  'de vérité pour web/app/inscription/actions.ts avant signUp, car GoTrue '
  'n''expose pas le message brut de handle_new_user pour un vrai visiteur.';

revoke execute on function public.is_invitation_code_usable(text) from public;
grant execute on function public.is_invitation_code_usable(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Extension de handle_new_user (Phase 2/5.1, migration 20260714190417) :
--    même fonction, CREATE OR REPLACE (signature de retour inchangée,
--    contrairement aux migrations qui ajoutent des colonnes de sortie à une
--    RETURNS TABLE — ici c'est toujours RETURNS TRIGGER, donc pas de
--    DROP nécessaire).
--
--    Le code brut voyage UNIQUEMENT dans raw_user_meta_data (jamais une URL,
--    jamais un paramètre de requête — c'est le client, web/app/inscription/
--    actions.ts, qui le place dans options.data.invitation_code de
--    supabase.auth.signUp). Il n'est JAMAIS recopié vers public.profiles
--    (qui n'a d'ailleurs aucune colonne pour ça) : lu une seule fois ici pour
--    calculer son hash. Effacé activement de auth.users.raw_user_meta_data
--    juste après consommation (UPDATE, pas ALTER TABLE) : testé en local via
--    l'API HTTP réelle de signUp — SANS cet effacement, le code en clair
--    persistait indéfiniment et était RENVOYÉ au client dans user_metadata à
--    chaque signUp/getUser/getSession suivant, une fuite confirmée, pas
--    seulement théorique.
--
--    Aucun contournement possible par un appel direct à l'API Auth (REST ou
--    SDK) : ce trigger réagit à TOUT INSERT sur auth.users, quel que soit
--    l'appelant — la vérification n'est jamais dans le chemin applicatif
--    Next.js, qui pourrait être court-circuité.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  chosen_username text;
  v_raw_code text;
  v_code_hash text;
  v_invitation record;
begin
  chosen_username := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));

  if chosen_username !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'Nom d''utilisateur invalide (attendu : 3 à 24 caractères, lettres minuscules, chiffres ou underscore).';
  end if;

  -- (1) auth.users existe déjà (ce trigger réagit à son propre INSERT).
  -- (2) Profil créé ici :
  insert into public.profiles (id, username, display_name)
  values (new.id, chosen_username, chosen_username);

  -- (3) Validation puis consommation définitive du code, seulement après
  -- le succès de (1) et (2) — toute exception ci-dessous annule la
  -- transaction entière, profil et compte auth compris.
  --
  -- Bootstrap (ajouté après découverte via `supabase test db`, cf. rapport
  -- de session) : ce garde-fou ne s'applique JAMAIS aux insertions faites
  -- avec `session_user = 'postgres'` (SQL Editor Studio, migrations,
  -- fixtures `supabase test db`) — uniquement accessible avec un accès
  -- direct à la base, jamais depuis l'app publique. C'est le mécanisme de
  -- bootstrap du tout premier compte owner et de tout compte créé
  -- administrativement, cohérent avec la façon dont le rôle owner
  -- lui-même est attribué ailleurs (UPDATE direct en `postgres`, jamais
  -- via l'app — voir migration 20260717150000). Le flux public (formulaire
  -- d'inscription, ou tout appel direct à l'API Auth REST/SDK) passe
  -- TOUJOURS par GoTrue, qui se connecte avec le rôle dédié
  -- `supabase_auth_admin` — jamais `postgres` — vérifié empiriquement
  -- (`GOTRUE_DB_DATABASE_URL`) : ce contournement est donc strictement
  -- inatteignable depuis l'app.
  --
  -- IMPORTANT — `session_user`, jamais `current_user` : cette fonction est
  -- `security definer`, donc `current_user` devient TOUJOURS son
  -- propriétaire (postgres) pendant son exécution, quel que soit
  -- l'appelant réel (vérifié empiriquement : un appel en `set role
  -- authenticated` puis SECURITY DEFINER renvoie quand même `current_user
  -- = postgres` à l'intérieur) — un contournement total et silencieux du
  -- garde-fou pour absolument tout appelant si on l'avait testé sur
  -- `current_user`. `session_user` reflète le rôle de connexion réel,
  -- jamais modifié par SECURITY DEFINER ni par `SET ROLE`.
  if session_user <> 'postgres' then
    v_raw_code := new.raw_user_meta_data ->> 'invitation_code';

    if v_raw_code is null or length(trim(v_raw_code)) = 0 then
      raise exception 'Code d''invitation invalide.';
    end if;

    v_code_hash := encode(digest(upper(trim(v_raw_code)), 'sha256'), 'hex');

    select ic.id, ic.expires_at, ic.revoked_at, ic.max_uses, ic.use_count
    into v_invitation
    from public.invitation_codes ic
    where ic.code_hash = v_code_hash
    for update;

    if not found
       or v_invitation.revoked_at is not null
       or v_invitation.expires_at < now()
       or v_invitation.use_count >= v_invitation.max_uses then
      raise exception 'Code d''invitation invalide.';
    end if;

    update public.invitation_codes
    set use_count = use_count + 1,
        used_at = now(),
        used_by = new.id
    where id = v_invitation.id;

    -- Efface le code brut de auth.users.raw_user_meta_data : vérifié
    -- empiriquement (build 21, tests locaux) que sans cette étape, le code
    -- en clair persiste indéfiniment et est RERETOURNÉ au client dans
    -- user_metadata à chaque signUp/getUser/getSession suivant (fuite
    -- réelle, pas seulement théorique) — violerait directement "aucune
    -- fuite du code dans... une réponse ultérieure". Un UPDATE simple sur
    -- auth.users (pas un ALTER TABLE) fonctionne avec les privilèges du
    -- propriétaire de cette fonction SECURITY DEFINER, vérifié localement.
    update auth.users
    set raw_user_meta_data = raw_user_meta_data - 'invitation_code'
    where id = new.id;
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Crée le profil (username validé) PUIS valide/consomme le code '
  'd''invitation (raw_user_meta_data.invitation_code, jamais recopié vers '
  'profiles) dans la même transaction que la création du compte auth.users : '
  'échec à n''importe quelle étape = rollback complet, aucun code marqué '
  'utilisé sans compte ni profil créés avec succès. Verrouillage '
  '(SELECT ... FOR UPDATE) empêchant deux inscriptions simultanées de '
  'consommer le même code à usage unique. Le garde-fou code d''invitation '
  'est ignoré pour les insertions faites en rôle postgres (bootstrap du '
  'premier owner, migrations, fixtures de test) : jamais atteignable '
  'depuis l''app publique, qui passe toujours par GoTrue (supabase_auth_admin).';
