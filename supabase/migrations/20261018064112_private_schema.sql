-- Helpers live here, out of reach of the public API
create schema if not exists private;
grant usage on schema private to anon, authenticated;
