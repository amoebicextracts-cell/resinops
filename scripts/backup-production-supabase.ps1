[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $HostName,

    [Parameter(Mandatory = $true)]
    [string] $User,

    [ValidateRange(1, 65535)]
    [int] $Port = 5432,

    [string] $Database = 'postgres',

    [Security.SecureString] $Password,

    [string] $OutputDirectory = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'ResinOps Backups'),

    [string] $DockerImage = 'postgres:17-alpine'
)

$ErrorActionPreference = 'Stop'
$projectRef = 'rcrkofzkbxfjzckyuqwy'
$capturedAt = [DateTime]::UtcNow
$stamp = $capturedAt.ToString('yyyyMMddTHHmmssZ')
$backupName = "resinops-$projectRef-$stamp.dump"
$manifestName = "resinops-$projectRef-$stamp.json"
$backupPath = Join-Path $OutputDirectory $backupName
$manifestPath = Join-Path $OutputDirectory $manifestName
$temporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) "resinops-backup-$([Guid]::NewGuid())"
$plainPassword = $null
$passwordPointer = [IntPtr]::Zero
$verified = $false

try {
    & docker version --format '{{.Server.Version}}' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not running.' }

    New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
    New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null

    $securePassword = $Password
    if ($null -eq $securePassword) {
        $securePassword = Read-Host 'Supabase database password' -AsSecureString
    }
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    $escapedPassword = $plainPassword.Replace('\', '\\').Replace(':', '\:')
    $pgPass = "${HostName}:${Port}:${Database}:${User}:${escapedPassword}"
    $pgPassPath = Join-Path $temporaryDirectory 'pgpass'
    [IO.File]::WriteAllText($pgPassPath, $pgPass, [Text.UTF8Encoding]::new($false))

    $secretMount = "type=bind,source=$temporaryDirectory,target=/run/resinops-secrets,readonly"
    $backupMount = "type=bind,source=$OutputDirectory,target=/backups"
    $connectionCommand = 'cp /run/resinops-secrets/pgpass /tmp/pgpass && chmod 0600 /tmp/pgpass && export PGPASSFILE=/tmp/pgpass && exec "$@"'
    $dumpArguments = @(
        'run', '--rm',
        '--mount', $secretMount,
        '--mount', $backupMount,
        $DockerImage,
        'sh', '-c',
        $connectionCommand,
        'resinops-pg-dump',
        'pg_dump',
        '--host', $HostName,
        '--port', $Port,
        '--username', $User,
        '--dbname', $Database,
        '--format', 'custom',
        '--compress', '6',
        '--no-owner',
        '--no-acl',
        '--file', "/backups/$backupName"
    )

    & docker @dumpArguments
    if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed; no backup was approved.' }

    & docker run --rm --mount "$backupMount,readonly" $DockerImage pg_restore --list "/backups/$backupName" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'The backup archive could not be read by pg_restore.' }

    $rowCountSql = @'
select json_build_object(
  'facilities', (select count(*) from public.facilities),
  'facility_members', (select count(*) from public.facility_members),
  'profiles', (select count(*) from public.profiles),
  'inventory_items', (select count(*) from public.inventory_items),
  'production_batches', (select count(*) from public.production_batches),
  'audit_logs', (select count(*) from public.audit_logs)
)::text;
'@
    $rowCountOutput = & docker run --rm --mount $secretMount $DockerImage `
        sh -c $connectionCommand resinops-psql `
        psql --host $HostName --port $Port --username $User --dbname $Database `
        --set ON_ERROR_STOP=1 --tuples-only --no-align --command $rowCountSql
    if ($LASTEXITCODE -ne 0) { throw 'Core row counts could not be captured.' }
    $rowCounts = ($rowCountOutput -join '').Trim() | ConvertFrom-Json

    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $backupPath).Hash.ToLowerInvariant()
    $manifest = [ordered]@{
        projectRef = $projectRef
        capturedAt = $capturedAt.ToString('o')
        database = $Database
        postgresImage = $DockerImage
        archive = $backupName
        bytes = (Get-Item -LiteralPath $backupPath).Length
        sha256 = $hash
        archiveListingVerified = $true
        rowCounts = $rowCounts
    }
    $manifest | ConvertTo-Json | Set-Content -Encoding utf8 -LiteralPath $manifestPath
    $verified = $true

    Write-Host "Backup verified: $backupPath"
    Write-Host "SHA-256: $hash"
}
finally {
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    $plainPassword = $null
    if (-not $verified) {
        Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $manifestPath -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $temporaryDirectory) {
        Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
    }
}
