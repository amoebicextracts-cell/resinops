[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $BackupPath,

    [string] $ManifestPath,

    [string] $DockerImage = 'postgres:17-alpine'
)

$ErrorActionPreference = 'Stop'
$backup = Get-Item -LiteralPath $BackupPath
if (-not $ManifestPath) {
    $ManifestPath = [IO.Path]::ChangeExtension($backup.FullName, '.json')
}
$manifestFile = Get-Item -LiteralPath $ManifestPath
$manifest = Get-Content -Raw -LiteralPath $manifestFile.FullName | ConvertFrom-Json
$temporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) "resinops-restore-$([Guid]::NewGuid())"
$containerName = "resinops-restore-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
$localPassword = [Guid]::NewGuid().ToString('N')
$verified = $false

function Invoke-Docker {
    param([string[]] $Arguments)
    & docker @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker command failed: docker $($Arguments -join ' ')"
    }
}

try {
    & docker version --format '{{.Server.Version}}' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not running.' }

    if ($manifest.archive -ne $backup.Name) {
        throw 'The manifest does not reference the selected backup archive.'
    }
    if ($manifest.bytes -ne $backup.Length) {
        throw 'The backup size does not match its manifest.'
    }
    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $backup.FullName).Hash.ToLowerInvariant()
    if ($actualHash -ne $manifest.sha256) {
        throw 'The backup checksum does not match its manifest.'
    }

    New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
    $backupMount = "type=bind,source=$($backup.DirectoryName),target=/backups,readonly"
    $temporaryMount = "type=bind,source=$temporaryDirectory,target=/run/resinops-restore"
    $archiveList = & docker run --rm --mount $backupMount $DockerImage `
        pg_restore --list "/backups/$($backup.Name)"
    if ($LASTEXITCODE -ne 0) { throw 'The backup archive catalog could not be read.' }

    # Vault is a Supabase-managed extension that is not present in the stock
    # PostgreSQL image. Its extension declaration and encrypted internal rows
    # are excluded from this disposable portability drill.
    $restoreList = $archiveList | Where-Object {
        $_ -notmatch 'EXTENSION - supabase_vault' -and
        $_ -notmatch 'COMMENT - EXTENSION supabase_vault' -and
        $_ -notmatch 'TABLE DATA vault secrets'
    }
    $restoreListPath = Join-Path $temporaryDirectory 'restore.list'
    [IO.File]::WriteAllLines($restoreListPath, $restoreList, [Text.UTF8Encoding]::new($false))

    Invoke-Docker -Arguments @(
        'run', '-d', '--name', $containerName,
        '-e', "POSTGRES_PASSWORD=$localPassword",
        '--mount', $backupMount,
        '--mount', $temporaryMount,
        $DockerImage
    ) | Out-Null

    # pg_isready alone is not a reliable readiness signal here: the
    # official postgres image starts a TEMPORARY server on the same
    # default socket to run init scripts, stops it, then starts the REAL
    # server -- pg_isready can report "accepting connections" against
    # that transient server, then the socket disappears for a moment
    # while the real one starts, and a docker exec landing in that gap
    # fails with "No such file or directory" even though pg_isready just
    # said yes. Retrying the ACTUAL first real query instead treats a
    # genuine successful query as the only readiness signal, so it can't
    # be fooled by the bootstrap server. Reproduced on GitHub Actions'
    # shared runners even though local Docker Desktop rarely hits the
    # window (fast enough to close it before anyone notices).
    $rolesSql = @'
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end
$roles$;
'@
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        & docker exec $containerName psql -U postgres -d postgres --set ON_ERROR_STOP=1 --command $rolesSql 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'The disposable restore database did not become ready.' }

    Invoke-Docker -Arguments @(
        'exec', $containerName,
        'pg_restore', '-U', 'postgres', '-d', 'postgres',
        '--exit-on-error', '--no-owner', '--no-acl',
        '--use-list', '/run/resinops-restore/restore.list',
        "/backups/$($backup.Name)"
    ) | Out-Null

    $verificationSql = @'
select json_build_object(
  'facilities', (select count(*) from public.facilities),
  'facility_members', (select count(*) from public.facility_members),
  'profiles', (select count(*) from public.profiles),
  'inventory_items', (select count(*) from public.inventory_items),
  'production_batches', (select count(*) from public.production_batches),
  'audit_logs', (select count(*) from public.audit_logs)
)::text;
'@
    $rowCountOutput = & docker exec $containerName psql -U postgres -d postgres `
        --set ON_ERROR_STOP=1 --tuples-only --no-align --command $verificationSql
    if ($LASTEXITCODE -ne 0) { throw 'Core restored tables could not be queried.' }
    $restoredCounts = ($rowCountOutput -join '').Trim() | ConvertFrom-Json

    if ($manifest.PSObject.Properties.Name -contains 'rowCounts') {
        foreach ($property in $manifest.rowCounts.PSObject.Properties) {
            if ($restoredCounts.($property.Name) -ne $property.Value) {
                throw "Restored row count mismatch for $($property.Name)."
            }
        }
    } else {
        Write-Warning 'This older manifest has no rowCounts field; archive restoration was verified without source-count comparison.'
    }

    $verified = $true
    Write-Host 'Disposable ResinOps restore completed successfully.' -ForegroundColor Green
    Write-Host "Archive: $($backup.FullName)"
    Write-Host "SHA-256: $actualHash"
    Write-Host "Restored row counts: $($restoredCounts | ConvertTo-Json -Compress)"
}
finally {
    $existingContainer = & docker ps -a --filter "name=^/$containerName$" --format '{{.Names}}' 2>$null
    if ($existingContainer -eq $containerName) {
        & docker rm -f $containerName 2>$null | Out-Null
    }
    if (Test-Path -LiteralPath $temporaryDirectory) {
        Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
    }
    if (-not $verified) {
        Write-Host 'Disposable restore verification did not complete.' -ForegroundColor Red
    }
}
