<#
.SYNOPSIS
One-click setup of the Prospect CRM MCP connector on a user's machine.

.DESCRIPTION
Run this yourself (as admin) on each new user's PC after Node.js and
Claude Desktop are installed. From PowerShell:

    \\192.168.1.155\sfm_data\prospect-mcp\scripts\setup-user.ps1

or from a mapped drive:

    Z:\prospect-mcp\scripts\setup-user.ps1

Does the following, in order:

  1. Verifies Node.js 18+ is on PATH (required — the MCP server is a
     Node process launched by Claude Desktop).
  2. Verifies Claude Desktop is installed.
  3. Prompts for the CRM user code (e.g. ML, RL, JM).
  4. Prompts for the user's Prospect365 PAT (hidden input).
  5. Backs up any existing %APPDATA%\Claude\claude_desktop_config.json.
  6. Merges a `prospect-crm` MCP server entry into the config without
     disturbing any other MCP entries the user may have.
  7. Prints a reminder that you still need to add them + set their
     permissions in the Admin Portal on your own machine.

Idempotent — re-running it updates the PAT without duplicating entries.
If the user later gets a new PAT, run it again.

.NOTES
Does NOT touch permissions.json. That stays with the admin so access
grants remain a deliberate decision you make in the portal, not a
self-serve step.
#>

param(
  [string]$UserCode,
  [string]$Pat,
  [string]$ServerPath
)

$ErrorActionPreference = "Stop"
$script:FailCount = 0

function Write-Step {
  param([string]$Text)
  Write-Host ""
  Write-Host "== $Text ==" -ForegroundColor Cyan
}

function Write-Ok {
  param([string]$Text)
  Write-Host "  [ok] $Text" -ForegroundColor Green
}

function Write-Fail {
  param([string]$Text)
  Write-Host "  [!!] $Text" -ForegroundColor Red
  $script:FailCount++
}

function Write-Info {
  param([string]$Text)
  Write-Host "  $Text"
}

# ── Step 1: Node.js ────────────────────────────────────────────
Write-Step "Checking Node.js"
try {
  $nodeVersion = (& node --version 2>&1).Trim()
  if ($nodeVersion -match "^v(\d+)\.") {
    $major = [int]$Matches[1]
    if ($major -lt 18) {
      Write-Fail "Node.js $nodeVersion is too old. Need v18 or newer."
      Write-Info "Download from https://nodejs.org/ (LTS is fine)."
    } else {
      Write-Ok "Node.js $nodeVersion"
    }
  } else {
    Write-Fail "Node.js reports an unexpected version: $nodeVersion"
  }
} catch {
  Write-Fail "Node.js not found on PATH."
  Write-Info "Install from https://nodejs.org/ then re-run this script."
}

# ── Step 2: Claude Desktop ─────────────────────────────────────
Write-Step "Checking Claude Desktop"
$claudePaths = @(
  "$env:LOCALAPPDATA\Programs\claude\Claude.exe",
  "$env:LOCALAPPDATA\Programs\Claude\Claude.exe",
  "$env:LOCALAPPDATA\Claude\Claude.exe",
  "$env:ProgramFiles\Claude\Claude.exe"
)
$claudeFound = $claudePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($claudeFound) {
  Write-Ok "Claude Desktop at $claudeFound"
} else {
  Write-Fail "Claude Desktop not found in the usual install locations."
  Write-Info "Install from https://claude.ai/download then re-run this script."
}

if ($script:FailCount -gt 0) {
  Write-Host ""
  Write-Host "Resolve the issues above, then re-run this script." -ForegroundColor Yellow
  exit 1
}

# ── Step 3: Locate the MCP server on the NAS ──────────────────
Write-Step "Locating the MCP server build"
if (-not $ServerPath) {
  # The script itself lives in <repo>\scripts\, so the dist is one level up.
  $repoRoot = Split-Path -Parent $PSScriptRoot
  $ServerPath = Join-Path $repoRoot "dist\index.js"
}

if (-not (Test-Path $ServerPath)) {
  Write-Fail "MCP server entry point not found at: $ServerPath"
  Write-Info "Ask Dale to run 'npm run build' on the NAS share."
  exit 1
}
Write-Ok "MCP server at $ServerPath"

# ── Step 4: Collect user inputs ────────────────────────────────
Write-Step "User details"
if (-not $UserCode) {
  $UserCode = Read-Host "Your CRM user code (e.g. DL, ML, RL)"
}
$UserCode = $UserCode.Trim().ToUpper()
if ($UserCode -eq "") {
  Write-Fail "User code is required."
  exit 1
}
Write-Ok "User code: $UserCode"

if (-not $Pat) {
  Write-Info "To generate your PAT:"
  Write-Info "  1. Log in to Prospect365 in a browser."
  Write-Info "  2. Settings > Integrations > API > Personal Access Tokens."
  Write-Info "  3. Create a new token. Copy the value (you won't see it again)."
  $patSecure = Read-Host "Paste your PAT (hidden)" -AsSecureString
  $Pat = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($patSecure)
  )
}
$Pat = $Pat.Trim()
if ($Pat.Length -lt 20) {
  Write-Fail "PAT looks too short — should be a long hex-ish string. Got $($Pat.Length) chars."
  exit 1
}
Write-Ok "PAT captured ($($Pat.Length) characters)"

# ── Step 5: Back up + merge claude_desktop_config.json ────────
Write-Step "Updating Claude Desktop config"
$configDir = "$env:APPDATA\Claude"
$configFile = "$configDir\claude_desktop_config.json"

if (-not (Test-Path $configDir)) {
  New-Item -ItemType Directory -Force -Path $configDir | Out-Null
  Write-Info "Created $configDir"
}

$config = $null
if (Test-Path $configFile) {
  $backup = "$configFile.backup-$(Get-Date -Format yyyyMMdd-HHmmss)"
  Copy-Item $configFile $backup
  Write-Ok "Backup saved: $backup"

  try {
    $raw = Get-Content $configFile -Raw -Encoding UTF8
    if ($raw.Trim() -eq "") {
      $config = [ordered]@{ mcpServers = [ordered]@{} }
    } else {
      $config = $raw | ConvertFrom-Json
    }
  } catch {
    Write-Fail "Could not parse existing config as JSON: $($_.Exception.Message)"
    Write-Info "Your original file is backed up. Fix or delete $configFile and re-run."
    exit 1
  }
} else {
  $config = [ordered]@{ mcpServers = [ordered]@{} }
}

# Normalise — older configs may lack mcpServers
if (-not ($config.PSObject.Properties.Name -contains "mcpServers")) {
  $config | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([ordered]@{}) -Force
}

# Build the prospect-crm entry
$prospectEntry = [ordered]@{
  command = "node"
  args    = @($ServerPath)
  env     = [ordered]@{
    PROSPECT_PAT     = $Pat
    PROSPECT_USER_ID = $UserCode
  }
}

# Merge: replace if exists, insert if not
if ($config.mcpServers.PSObject.Properties.Name -contains "prospect-crm") {
  $config.mcpServers."prospect-crm" = $prospectEntry
  Write-Ok "Updated existing 'prospect-crm' entry"
} else {
  $config.mcpServers | Add-Member -NotePropertyName "prospect-crm" -NotePropertyValue $prospectEntry -Force
  Write-Ok "Added 'prospect-crm' entry"
}

# Write back with UTF-8 (no BOM) so Claude parses it cleanly
$json = $config | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($configFile, $json, [System.Text.UTF8Encoding]::new($false))
Write-Ok "Wrote $configFile"

# ── Step 6: Done ──────────────────────────────────────────────
Write-Host ""
Write-Host "=================================================================" -ForegroundColor Green
Write-Host "  Setup complete for user $UserCode on this machine" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps (admin to-do):"
Write-Host "  1. On your own machine, open the Admin Portal:"
Write-Host "       http://localhost:3333" -ForegroundColor Yellow
Write-Host "  2. Click + Add User, set code to $UserCode, fill in name and notes,"
Write-Host "     then tick the permission toggles that match their role."
Write-Host "  3. Hit Save. Changes are live within 5 seconds — no Claude"
Write-Host "     Desktop restart needed here."
Write-Host ""
Write-Host "Next steps (this machine):"
Write-Host "  1. Fully quit Claude Desktop on this PC (right-click tray icon,"
Write-Host "     Quit). Closing the window is not enough."
Write-Host "  2. Reopen Claude Desktop from the Start menu."
Write-Host "  3. In a new chat, ask: 'search quotes for Exeter University' to"
Write-Host "     confirm the connector loaded."
Write-Host ""
Write-Host "Config written to: $configFile"
Write-Host ""
