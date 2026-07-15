[CmdletBinding()]
param(
    [string] $Repository = 'amoebicextracts-cell/resinops',
    [string] $SupabaseUrl = 'https://rcrkofzkbxfjzckyuqwy.supabase.co',
    [string] $GitHubCli = 'C:\Program Files\GitHub CLI\gh.exe'
)

$ErrorActionPreference = 'Stop'
$passwordPointer = [IntPtr]::Zero
$anonKeyPointer = [IntPtr]::Zero
$plainPassword = $null
$plainAnonKey = $null

function Read-RequiredValue {
    param([string] $Prompt)
    do { $value = Read-Host $Prompt } while ([string]::IsNullOrWhiteSpace($value))
    return $value.Trim()
}

function Set-RepositorySecret {
    param([string] $Name, [string] $Value)
    $Value | & $GitHubCli secret set $Name --repo $Repository
    if ($LASTEXITCODE -ne 0) { throw "Could not set GitHub secret $Name." }
    Write-Host "Configured $Name" -ForegroundColor Green
}

try {
    if (-not (Test-Path -LiteralPath $GitHubCli)) { throw 'GitHub CLI is not installed at the expected path.' }
    & $GitHubCli auth status
    if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI is not authenticated.' }

    $secureAnonKey = Read-Host 'Production Supabase anon/publishable key' -AsSecureString
    $anonKeyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureAnonKey)
    $plainAnonKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($anonKeyPointer)

    $smokeEmail = Read-RequiredValue 'Dedicated viewer smoke-user email'
    $securePassword = Read-Host 'Dedicated viewer smoke-user password' -AsSecureString
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)

    $facilityId = Read-RequiredValue 'Smoke user assigned facility UUID'
    $forbiddenFacilityId = Read-RequiredValue 'Forbidden facility UUID'
    [Guid]::Parse($facilityId) | Out-Null
    [Guid]::Parse($forbiddenFacilityId) | Out-Null
    if ($facilityId -eq $forbiddenFacilityId) { throw 'The assigned and forbidden facility IDs must differ.' }

    Set-RepositorySecret 'PRODUCTION_SUPABASE_URL' $SupabaseUrl.TrimEnd('/')
    Set-RepositorySecret 'PRODUCTION_SUPABASE_ANON_KEY' $plainAnonKey
    Set-RepositorySecret 'PRODUCTION_SMOKE_USER_EMAIL' $smokeEmail
    Set-RepositorySecret 'PRODUCTION_SMOKE_USER_PASSWORD' $plainPassword
    Set-RepositorySecret 'PRODUCTION_SMOKE_FACILITY_ID' $facilityId
    Set-RepositorySecret 'PRODUCTION_SMOKE_FORBIDDEN_FACILITY_ID' $forbiddenFacilityId

    & $GitHubCli workflow run production-smoke.yml --repo $Repository
    if ($LASTEXITCODE -ne 0) { throw 'Secrets were set, but the production smoke workflow could not be started.' }
    Write-Host 'Production smoke secrets are configured and a verification run was started.' -ForegroundColor Green
}
finally {
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    if ($anonKeyPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($anonKeyPointer)
    }
    $plainPassword = $null
    $plainAnonKey = $null
}
