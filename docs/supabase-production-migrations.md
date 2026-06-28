# Supabase Production Migrations

Use this runbook when a production Supabase schema change needs to be applied or repaired.

## Quick Path

1. Create a new migration under `supabase/migrations/`.
   If production may have already recorded an older migration, add a forward repair migration instead of editing the old file.
2. Apply migrations locally:

   ```bash
   supabase migration up
   ```

3. Dry-run the linked production push and verify important RPCs or database objects:

   ```bash
   scripts/supabase-production-migrations.sh \
     --expect-project-ref hvnmuknbfzcmdkzliihj \
     --verify-function "public.delete_tour_scene(p_project_id uuid, p_scene_id uuid)"
   ```

4. Push to production only after the dry-run looks right:

   ```bash
   scripts/supabase-production-migrations.sh \
     --expect-project-ref hvnmuknbfzcmdkzliihj \
     --push \
     --verify-function "public.delete_tour_scene(p_project_id uuid, p_scene_id uuid)"
   ```

## Why This Exists

Production once had migration `20260607000001_tours_scene_deletion.sql` recorded as applied, but `public.delete_tour_scene(p_project_id, p_scene_id)` was missing from `pg_proc`. PostgREST then returned:

```text
Could not find the function public.delete_tour_scene(p_project_id, p_scene_id) in the schema cache
```

The fix was a new repair migration that recreated the function, restored grants, and ran:

```sql
select pg_notify('pgrst', 'reload schema');
```

Do not trust `supabase migration list --linked` by itself when production reports a missing function, table, policy, or column. Query the remote catalog too.

## Useful Checks

Check pending production migrations without applying them:

```bash
supabase db push --linked --dry-run
```

Check a remote function exists with exact argument names and types:

```bash
supabase db query --linked --output table "
select
  n.nspname as schema,
  p.proname as name,
  pg_get_function_identity_arguments(p.oid) as args,
  pg_get_function_result(p.oid) as result,
  p.proacl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'delete_tour_scene';
"
```

For PostgREST RPCs, verify:

- The function is in an exposed schema, usually `public`.
- Argument names match the app's `supabase.rpc()` payload keys.
- The expected role has `execute` on the function.
- The schema cache was reloaded after creating or replacing the function.

## Repair Pattern

When a migration is marked applied remotely but the object is absent or wrong:

1. Add a new timestamped migration that uses idempotent SQL where practical, such as `create or replace function`, `drop policy if exists`, and `create policy`.
2. Include explicit grants for RPCs:

   ```sql
   revoke all on function public.some_rpc(uuid) from public;
   revoke all on function public.some_rpc(uuid) from anon;
   grant execute on function public.some_rpc(uuid) to authenticated;
   ```

3. Reload PostgREST when changing RPCs:

   ```sql
   select pg_notify('pgrst', 'reload schema');
   ```

4. Run the helper script with `--verify-function` before and after `--push`.
