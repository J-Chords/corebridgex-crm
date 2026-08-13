-- Foundation migration set, part 1/4 (Supabase Foundation A — Auth/Profile + Companies slice).
-- Idempotent: safe to run against a database that already has pgcrypto (most Supabase-hosted
-- projects do by default). Needed for gen_random_uuid() as the default for every uuid PK below.
create extension if not exists pgcrypto;
