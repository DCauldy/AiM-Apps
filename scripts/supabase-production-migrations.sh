#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/supabase-production-migrations.sh [options]

Options:
  --push                         Apply pending migrations to the linked remote project.
  --expect-project-ref <ref>     Refuse to run if the linked Supabase project ref differs.
  --verify-function <spec>       Verify a remote Postgres function exists after checks/push.
                                 Spec format: public.function_name or
                                 public.function_name(arg_name type, arg_name type)
  -h, --help                     Show this help.

Default behavior is safe: run local migrations, show linked remote migration state,
and dry-run the production push. Production changes require --push.
EOF
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

push_remote=false
expected_project_ref=""
verify_functions=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --push)
      push_remote=true
      shift
      ;;
    --expect-project-ref)
      [[ $# -ge 2 ]] || die "--expect-project-ref needs a value"
      expected_project_ref="$2"
      shift 2
      ;;
    --verify-function)
      [[ $# -ge 2 ]] || die "--verify-function needs a value"
      verify_functions+=("$2")
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

command -v supabase >/dev/null 2>&1 || die "Supabase CLI is not installed or not on PATH"

linked_project_ref="unknown"
if [[ -f supabase/.temp/project-ref ]]; then
  linked_project_ref="$(tr -d '[:space:]' < supabase/.temp/project-ref)"
fi

echo "Linked Supabase project ref: ${linked_project_ref}"
if [[ -n "${expected_project_ref}" && "${linked_project_ref}" != "${expected_project_ref}" ]]; then
  die "Linked project ref is ${linked_project_ref}; expected ${expected_project_ref}"
fi

echo
echo "== Remote migration state =="
supabase migration list --linked

echo
echo "== Apply local migrations =="
supabase migration up

echo
if [[ "${push_remote}" == "true" ]]; then
  echo "== Push pending migrations to linked remote =="
  supabase db push --linked --yes
else
  echo "== Dry-run pending remote migrations =="
  supabase db push --linked --dry-run
  echo
  echo "Dry-run only. Re-run with --push to apply production migrations."
fi

verify_function() {
  local spec="$1"
  local schema="public"
  local name_part="${spec}"
  local args=""

  if [[ "${spec}" == *"("*")" ]]; then
    name_part="${spec%%(*}"
    args="${spec#*(}"
    args="${args%)}"
  fi

  local function_name="${name_part}"
  if [[ "${name_part}" == *.* ]]; then
    schema="${name_part%%.*}"
    function_name="${name_part#*.}"
  fi

  [[ -n "${schema}" && -n "${function_name}" ]] || die "Invalid function spec: ${spec}"

  local schema_sql function_sql args_sql where_sql count
  schema_sql="$(sql_escape "${schema}")"
  function_sql="$(sql_escape "${function_name}")"
  where_sql="n.nspname = '${schema_sql}' and p.proname = '${function_sql}'"

  if [[ -n "${args}" ]]; then
    args_sql="$(sql_escape "${args}")"
    where_sql="${where_sql} and pg_get_function_identity_arguments(p.oid) = '${args_sql}'"
  fi

  count="$(
    supabase db query --linked --output csv \
      "select count(*) as matching_functions from pg_proc p join pg_namespace n on n.oid = p.pronamespace where ${where_sql};" |
      awk '/^[0-9]+$/ { value = $1 } END { print value + 0 }'
  )"

  if [[ "${count}" -lt 1 ]]; then
    die "Remote function not found: ${spec}"
  fi

  echo "OK: remote function exists: ${spec}"
  supabase db query --linked --output table \
    "select n.nspname as schema, p.proname as name, pg_get_function_identity_arguments(p.oid) as args, pg_get_function_result(p.oid) as result, p.proacl from pg_proc p join pg_namespace n on n.oid = p.pronamespace where ${where_sql} order by args;"
}

if [[ "${#verify_functions[@]}" -gt 0 ]]; then
  echo
  echo "== Verify remote functions =="
  for function_spec in "${verify_functions[@]}"; do
    verify_function "${function_spec}"
  done
fi
