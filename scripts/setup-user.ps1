<#
.SYNOPSIS
One-time credential setup for the Prospect CRM Claude plugin (Windows).

.DESCRIPTION
PowerShell-native equivalent of scripts/setup.cjs. Run once per user
machine after installing the prospect-crm plugin via the Claude Desktop
marketplace. From PowerShell:

    \\192.168.1.155\sfm_data\prospect-mcp\scripts\setup-user.ps1

(or any other path you have the script at -- it does not need to live
on the NAS, and nothing it writes references the NAS).

Does the following, in order:

  1. Verifies Node.js 18+ is on PATH.
  2. Verifies Claude Desktop is installed.
  3. Prompts for the CRM user code (e.g. DL, ML, RL).
  4. Prompts for the user's Prospect365 PAT (hidden input).
  5. Writes %USERPROFILE%\.prospect-crm\config.json with current-user-only
     ACLs. Backs up any existing file with a timestamp suffix.
  6. Detects any leftover v1.2.0 prospect-crm entry in
     claude_desktop_config.json and prints removal instructions -- the
     plugin install carries the MCP itself in v1.2.1+, so a duplicate
     entry will block plugin load.

Idempotent -- re-run any time the PAT changes; the previous config is
backed up, never overwritten silently.

.NOTES
Does NOT touch claude_desktop_config.json. Does NOT touch the
admin-portal permissions.json. Permissions remain a deliberate decision
the admin makes in the portal.
#>

param(
  [string]$UserCode,
  [string]$Pat,
  [string]$BaseUrl
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

function Write-Warn {
  param([string]$Text)
  Write-Host "  [warn] $Text" -ForegroundColor Yellow
}

function Write-Info {
  param([string]$Text)
  Write-Host "  $Text"
}

$DefaultBaseUrl = "https://api-v1-westeurope.prospect365.com"

# -- Step 1: Node.js -------------------------------------------
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

# -- Step 2: Claude Desktop ------------------------------------
# Detection order, most specific first. Wildcards are expanded by Get-Item,
# which is wrapped in try/catch so an ACL-locked WindowsApps directory or a
# non-matching pattern doesn't abort the whole probe.
Write-Step "Checking Claude Desktop"
$claudePathPatterns = @(
  "$env:LOCALAPPDATA\Programs\claude\Claude.exe",
  "$env:LOCALAPPDATA\Programs\Claude\Claude.exe",
  "$env:LOCALAPPDATA\Claude\Claude.exe",
  "$env:ProgramFiles\Claude\Claude.exe",
  # Microsoft Store install: version- and per-machine-specific path,
  # e.g. C:\Program Files\WindowsApps\Claude_1.6259.1.0_x64__pzs8sxrjxfjjc\app\Claude.exe
  "$env:ProgramFiles\WindowsApps\Claude_*\app\Claude.exe",
  # Store alias shim, if Microsoft maintains one in the user's WindowsApps.
  "$env:LOCALAPPDATA\Microsoft\WindowsApps\Claude.exe"
)

$claudeExe = $null
foreach ($pattern in $claudePathPatterns) {
  try {
    $match = Get-Item -Path $pattern -ErrorAction Stop | Select-Object -First 1
    if ($match) {
      $claudeExe = $match.FullName
      break
    }
  } catch {
    # No match, or the parent directory is ACL-locked. Try the next pattern.
  }
}

# Secondary signal: %APPDATA%\Claude\ is created on first launch regardless
# of how Claude Desktop was installed (exe installer, MSIX, Microsoft Store).
# It's the most reliable "Claude has been installed and run at least once" check.
$claudeAppData = Join-Path $env:APPDATA "Claude"
$claudeAppDataExists = Test-Path $claudeAppData

if ($claudeExe) {
  Write-Ok "Claude Desktop at $claudeExe"
  if (-not $claudeAppDataExists) {
    Write-Info "($claudeAppData not present yet -- it's created on first launch.)"
  }
} elseif ($claudeAppDataExists) {
  # Probably a Store install on a machine where WindowsApps is ACL-locked
  # or the install path moved. Don't block setup -- the AppData dir is
  # proof-of-install, and we don't actually need the launcher path here.
  Write-Ok "Claude Desktop appears installed ($claudeAppData exists)"
  Write-Warn "Could not confirm the launcher path. Common cause: Microsoft Store"
  Write-Warn "install with restricted ACLs on WindowsApps. Continuing anyway."
} else {
  Write-Fail "Claude Desktop not found in the usual install locations."
  Write-Info "Install from https://claude.ai/download then re-run this script."
}

if ($script:FailCount -gt 0) {
  Write-Host ""
  Write-Host "Resolve the issues above, then re-run this script." -ForegroundColor Yellow
  exit 1
}

# -- Step 3: Collect user inputs -------------------------------
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

# -- Step 4: PAT -----------------------------------------------
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
  Write-Fail "PAT looks too short -- should be a long hex-ish string. Got $($Pat.Length) chars."
  exit 1
}
Write-Ok "PAT captured ($($Pat.Length) characters)"

# -- Step 5: Optional base URL override ------------------------
if (-not $BaseUrl) {
  $BaseUrl = $DefaultBaseUrl
}
Write-Ok "Base URL: $BaseUrl"

# -- Step 6: Write user-local credential file ------------------
Write-Step "Writing credential config"
$credDir  = Join-Path $env:USERPROFILE ".prospect-crm"
$credFile = Join-Path $credDir "config.json"

if (-not (Test-Path $credDir)) {
  New-Item -ItemType Directory -Force -Path $credDir | Out-Null
  Write-Info "Created $credDir"
}

if (Test-Path $credFile) {
  $stamp  = Get-Date -Format "yyyyMMdd-HHmmss"
  $backup = "$credFile.backup-$stamp"
  Copy-Item $credFile $backup
  Write-Ok "Existing credentials backed up to $backup"
}

$cred = [ordered]@{
  PROSPECT_PAT      = $Pat
  PROSPECT_BASE_URL = $BaseUrl
  PROSPECT_USER_ID  = $UserCode
}

$json = $cred | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($credFile, $json, [System.Text.UTF8Encoding]::new($false))
Write-Ok "Wrote $credFile"

# Lock to current user only -- belt-and-braces, the parent dir already
# defaults to the user's profile ACL, but be explicit about the file.
try {
  & icacls $credFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
  Write-Ok "Permissions restricted to $env:USERNAME"
} catch {
  Write-Warn "Could not tighten ACLs on $credFile -- file is still readable only inside your user profile."
}

# -- Step 7: Detect leftover v1.2.0 connector entry ------------
Write-Step "Checking for stale connector entry"
$desktopConfig = Join-Path $env:APPDATA "Claude\claude_desktop_config.json"
if (Test-Path $desktopConfig) {
  try {
    $raw = Get-Content $desktopConfig -Raw -Encoding UTF8
    if ($raw.Trim() -ne "") {
      $parsed = $raw | ConvertFrom-Json
      if ($parsed.PSObject.Properties.Name -contains "mcpServers" -and
          $parsed.mcpServers -and
          ($parsed.mcpServers.PSObject.Properties.Name -contains "prospect-crm")) {
        Write-Warn "Found a 'prospect-crm' entry in $desktopConfig"
        Write-Info "v1.2.1+ ships the MCP inside the plugin install, so this entry is no"
        Write-Info "longer needed and will block the plugin's MCP from loading (duplicate"
        Write-Info "server name). Open the file in a text editor, delete the 'prospect-crm'"
        Write-Info "entry from the 'mcpServers' object, save, and restart Claude Desktop."
      } else {
        Write-Ok "No stale 'prospect-crm' entry in $desktopConfig"
      }
    } else {
      Write-Ok "claude_desktop_config.json is empty -- nothing to clean up"
    }
  } catch {
    Write-Warn "Could not parse $desktopConfig as JSON -- check it manually for a stale 'prospect-crm' entry."
  }
} else {
  Write-Ok "No claude_desktop_config.json present -- nothing to clean up"
}

# -- Step 8: Done ----------------------------------------------
Write-Host ""
Write-Host "=================================================================" -ForegroundColor Green
Write-Host "  Setup complete for user $UserCode on this machine" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps (admin to-do, on your own machine):"
Write-Host "  1. Open the Admin Portal:"
Write-Host "       http://localhost:3333" -ForegroundColor Yellow
Write-Host "  2. Click + Add User, set code to $UserCode, fill in name/notes,"
Write-Host "     tick the permission toggles that match their role, hit Save."
Write-Host "     Changes go live within 5 seconds; no Claude restart needed."
Write-Host ""
Write-Host "Next steps (this machine):"
Write-Host "  1. If the warning above flagged a stale 'prospect-crm' entry in"
Write-Host "     claude_desktop_config.json, remove it before restarting."
Write-Host "  2. Fully quit Claude Desktop (right-click tray icon, Quit)."
Write-Host "     Closing the window is not enough."
Write-Host "  3. Reopen Claude Desktop from the Start menu."
Write-Host "  4. In a new chat, ask: 'search quotes for Exeter University' to"
Write-Host "     confirm the connector loaded."
Write-Host ""
Write-Host "Credentials written to: $credFile"
Write-Host ""
