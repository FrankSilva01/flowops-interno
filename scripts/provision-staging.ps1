param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRef,
  [string]$ProductionRef = "djvrhvzjvnyensbobtby"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$versions = Get-ChildItem "$root/supabase/migrations/*.sql" |
  ForEach-Object { $_.BaseName.Split('_')[0] }

try {
  npx supabase link --project-ref $ProjectRef
  npx supabase db query --linked --file "$root/supabase/baseline/20260713_public_schema.sql"
  npx supabase migration repair --linked --status applied @versions
  npx supabase db query --linked --file "$root/supabase/migrations/20260713230000_fiscal_document_vault.sql"
  npx supabase db query --linked --file "$root/supabase/seed.sql"
  npx supabase functions deploy --project-ref $ProjectRef
  npx supabase db query --linked "select count(*) as public_tables from information_schema.tables where table_schema='public';"
} finally {
  npx supabase link --project-ref $ProductionRef
}
