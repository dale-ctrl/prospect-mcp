<#
.SYNOPSIS
Comprehensive one-script install for the Prospect CRM Claude plugin (v1.2.11+).

.DESCRIPTION
Wraps the full team-rollout install in a single PowerShell run so a non-
technical user can go from zero to working in one go. Handles:

  Pre-flight  Node.js 18+, Claude Desktop, Claude Code CLI, login state
  Step 1      git insteadOf rule for HTTPS clone fallback
  Step 2      Register the wcg-prospect marketplace via Claude Code CLI
  Step 3      Install (or update) prospect-crm@wcg-prospect via CLI
  Step 4      Locate the local plugin install at ~\.claude\plugins\...
  Step 4b     npm install --omit=dev inside the plugin (CLI install does
              not run this; the MCP server crashes without it)
  Step 5      Wire up the prospect-crm entry in claude_desktop_config.json
              pointing at the local dist\index.js (preserving any other
              mcpServers entries the user has)
  Step 6      Write credentials to %USERPROFILE%\.prospect-crm\config.json
  Step 7      Print the manual Cowork-UI marketplace step the user must do
  Step 8      Print restart + smoke-test instructions

Idempotent throughout -- re-running detects existing state and updates
in place. No duplicate config entries, no broken JSON.

.PARAMETER CredentialsOnly
Skip the install plumbing (steps 1-5) and only refresh credentials
(step 6) plus the Cowork UI reminder + restart instructions. Useful
for PAT rotation without re-running the whole install.

.PARAMETER UserCode
Optional. Skip the user-code prompt by supplying it (e.g. "DL").

.PARAMETER Pat
Optional. Skip the PAT prompt by supplying it on the command line.
Avoid in interactive use -- the hidden-input prompt is safer.

.PARAMETER BaseUrl
Optional override for PROSPECT_BASE_URL. Defaults to the regional
write-capable host.

.NOTES
ASCII-only output for cmd.exe compatibility. Does NOT touch
admin-portal permissions.json -- access grants stay a deliberate
admin-portal decision, not a self-serve step.
#>

param(
  [switch]$CredentialsOnly,
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

function Test-CommandExists {
  param([string]$Name)
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

$DefaultBaseUrl = "https://api-v1-westeurope.prospect365.com"
$PluginRoot     = Join-Path $env:USERPROFILE ".claude\plugins\marketplaces\wcg-prospect"
$PluginEntry    = Join-Path $PluginRoot "dist\index.js"
$CredDir        = Join-Path $env:USERPROFILE ".prospect-crm"
$CredFile       = Join-Path $CredDir "config.json"
$DesktopConfig  = Join-Path $env:APPDATA "Claude\claude_desktop_config.json"

# =================================================================
# Pre-flight: Node.js
# =================================================================
Write-Step "Pre-flight: Node.js"
$nodePath = $null
try {
  $nodeVersion = (& node --version 2>&1).Trim()
  if ($nodeVersion -match "^v(\d+)\.") {
    $major = [int]$Matches[1]
    if ($major -lt 18) {
      Write-Fail "Node.js $nodeVersion is too old. Need v18 or newer."
      Write-Info "Download from https://nodejs.org/ (LTS is fine)."
    } else {
      $cmd = Get-Command node -ErrorAction SilentlyContinue
      if ($cmd) { $nodePath = $cmd.Source }
      Write-Ok "Node.js $nodeVersion ($nodePath)"
    }
  } else {
    Write-Fail "Node.js reports an unexpected version: $nodeVersion"
  }
} catch {
  Write-Fail "Node.js not found on PATH."
  Write-Info "Install from https://nodejs.org/ then re-run this script."
}

# =================================================================
# Pre-flight: Claude Desktop (with MS Store wildcard from v1.2.2)
# =================================================================
Write-Step "Pre-flight: Claude Desktop"
$claudePathPatterns = @(
  "$env:LOCALAPPDATA\Programs\claude\Claude.exe",
  "$env:LOCALAPPDATA\Programs\Claude\Claude.exe",
  "$env:LOCALAPPDATA\Claude\Claude.exe",
  "$env:ProgramFiles\Claude\Claude.exe",
  "$env:ProgramFiles\WindowsApps\Claude_*\app\Claude.exe",
  "$env:LOCALAPPDATA\Microsoft\WindowsApps\Claude.exe"
)

$claudeExe = $null
foreach ($pattern in $claudePathPatterns) {
  try {
    $match = Get-Item -Path $pattern -ErrorAction Stop | Select-Object -First 1
    if ($match) { $claudeExe = $match.FullName; break }
  } catch {
    # No match or ACL-locked. Try next.
  }
}

$claudeAppData       = Join-Path $env:APPDATA "Claude"
$claudeAppDataExists = Test-Path $claudeAppData

if ($claudeExe) {
  Write-Ok "Claude Desktop at $claudeExe"
} elseif ($claudeAppDataExists) {
  Write-Ok "Claude Desktop appears installed ($claudeAppData exists)"
  Write-Warn "Could not confirm a launcher path -- common cause: Microsoft"
  Write-Warn "Store install with restricted ACLs on WindowsApps. Continuing."
} else {
  Write-Fail "Claude Desktop not found in the usual install locations."
  Write-Info "Install from https://claude.ai/download then re-run this script."
}

# =================================================================
# Pre-flight: Claude Code CLI + login state (full mode only)
# =================================================================
if (-not $CredentialsOnly) {
  Write-Step "Pre-flight: Claude Code CLI"
  if (Test-CommandExists "claude") {
    try {
      $cliVersion = (& claude --version 2>&1).Trim()
      Write-Ok "Claude Code CLI present: $cliVersion"
    } catch {
      Write-Fail "Claude Code CLI exists but 'claude --version' failed."
      Write-Info "Reinstall: npm install -g @anthropic-ai/claude-code"
    }
  } else {
    Write-Warn "Claude Code CLI not found on PATH. Attempting auto-install..."
    try {
      & npm install -g "@anthropic-ai/claude-code" 2>&1 | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "npm install exit $LASTEXITCODE" }
    } catch {
      Write-Fail "Auto-install of Claude Code CLI failed."
      Write-Info "Install manually: npm install -g @anthropic-ai/claude-code"
      Write-Info "Or download instructions: https://docs.claude.com/en/docs/claude-code/setup"
    }
    if (-not (Test-CommandExists "claude")) {
      Write-Fail "'claude' still not on PATH after install attempt."
      Write-Info "Open a fresh PowerShell and re-run this script -- npm-installed"
      Write-Info "globals sometimes need a new shell to land on PATH."
    } else {
      $cliVersion = (& claude --version 2>&1).Trim()
      Write-Ok "Claude Code CLI installed: $cliVersion"
    }
  }

  # Login state probe
  if ($script:FailCount -eq 0) {
    Write-Step "Pre-flight: Claude Code CLI login state"
    $listOut = & claude plugin list 2>&1
    $listExit = $LASTEXITCODE
    if ($listExit -ne 0 -and $listOut -match "(?i)auth|login|unauthori[sz]ed|token") {
      Write-Fail "Claude Code CLI is not logged in."
      Write-Info "Open a separate PowerShell window and run: claude login"
      Write-Info "Complete the browser login flow, then re-run this script."
    } else {
      Write-Ok "Claude Code CLI session usable"
    }
  }
}

if ($script:FailCount -gt 0) {
  Write-Host ""
  Write-Host "Resolve the issues above, then re-run this script." -ForegroundColor Yellow
  exit 1
}

# Resolve Node path for the connector entry. Falls back to "node".
$nodeArg = if ($nodePath) { $nodePath } else { "node" }

# =================================================================
# Steps 1-5 (full install) -- skipped in CredentialsOnly mode
# =================================================================
if (-not $CredentialsOnly) {

  # ---- Step 1: git insteadOf rule -----------------------------
  Write-Step "Step 1: git insteadOf rule"
  $existing = & git config --global --get "url.https://github.com/.insteadOf" 2>$null
  if ($existing -and $existing.Trim() -eq "git@github.com:") {
    Write-Ok "git insteadOf rule already in place"
  } else {
    & git config --global url."https://github.com/".insteadOf git@github.com: | Out-Null
    Write-Ok "Set git insteadOf rule (HTTPS fallback for clones)"
  }

  # ---- Step 2: register marketplace ---------------------------
  Write-Step "Step 2: register wcg-prospect marketplace"
  $marketplaceList = & claude plugin marketplace list 2>&1 | Out-String
  if ($marketplaceList -match "wcg-prospect") {
    Write-Ok "Marketplace 'wcg-prospect' already registered"
  } else {
    & claude plugin marketplace add dale-ctrl/prospect-mcp
    if ($LASTEXITCODE -ne 0) {
      Write-Fail "claude plugin marketplace add failed (exit $LASTEXITCODE)."
      Write-Info "Run manually: claude plugin marketplace add dale-ctrl/prospect-mcp"
      exit 1
    }
    Write-Ok "Added marketplace 'wcg-prospect'"
  }

  # ---- Step 3: install or update plugin -----------------------
  Write-Step "Step 3: install or update plugin"
  $installed = & claude plugin list 2>&1 | Out-String
  if ($installed -match "prospect-crm@wcg-prospect") {
    & claude plugin update prospect-crm@wcg-prospect
    if ($LASTEXITCODE -ne 0) {
      Write-Fail "claude plugin update failed (exit $LASTEXITCODE)."
      exit 1
    }
    Write-Ok "Updated existing plugin to latest version"
  } else {
    & claude plugin install prospect-crm@wcg-prospect
    if ($LASTEXITCODE -ne 0) {
      Write-Fail "claude plugin install failed (exit $LASTEXITCODE)."
      Write-Info "Run manually: claude plugin install prospect-crm@wcg-prospect"
      exit 1
    }
    Write-Ok "Installed plugin"
  }

  # ---- Step 4: locate local plugin install --------------------
  Write-Step "Step 4: locate local plugin install"
  if (-not (Test-Path $PluginEntry)) {
    Write-Fail "Plugin entry not found at: $PluginEntry"
    Write-Info "The CLI install did not clone what we expected. Check:"
    Write-Info "  claude plugin list"
    Write-Info "  ls $PluginRoot"
    exit 1
  }
  Write-Ok "Plugin entry found at $PluginEntry"

  # ---- Step 4b: npm install runtime deps ----------------------
  Write-Step "Step 4b: install plugin runtime dependencies (30-60s)"
  Push-Location $PluginRoot
  try {
    & npm install --omit=dev --silent 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Fail "npm install failed in $PluginRoot (exit $LASTEXITCODE)."
      Write-Info "Run manually to see errors:"
      Write-Info "  cd $PluginRoot"
      Write-Info "  npm install --omit=dev"
      exit 1
    }
    Write-Ok "Runtime dependencies installed"
  } finally {
    Pop-Location
  }

  # ---- Step 5: connector entry --------------------------------
  Write-Step "Step 5: wire up Claude Desktop connector"
  $configDir = Split-Path -Parent $DesktopConfig
  if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Force -Path $configDir | Out-Null
    Write-Info "Created $configDir"
  }

  $config = $null
  if (Test-Path $DesktopConfig) {
    $stamp  = Get-Date -Format "yyyyMMdd-HHmmss"
    $backup = "$DesktopConfig.backup-$stamp"
    Copy-Item $DesktopConfig $backup
    Write-Ok "Existing config backed up to $backup"

    try {
      $raw = Get-Content $DesktopConfig -Raw -Encoding UTF8
      if ($raw.Trim() -eq "") {
        $config = [ordered]@{ mcpServers = [ordered]@{} }
      } else {
        $config = $raw | ConvertFrom-Json
      }
    } catch {
      Write-Fail "Could not parse existing config as JSON: $($_.Exception.Message)"
      Write-Info "Original is backed up. Fix or delete $DesktopConfig and re-run."
      exit 1
    }
  } else {
    $config = [ordered]@{ mcpServers = [ordered]@{} }
  }

  # Normalise -- older configs may lack mcpServers
  if (-not ($config.PSObject.Properties.Name -contains "mcpServers")) {
    $config | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([ordered]@{}) -Force
  }

  $prospectEntry = [ordered]@{
    command = $nodeArg
    args    = @($PluginEntry)
  }

  if ($config.mcpServers.PSObject.Properties.Name -contains "prospect-crm") {
    $config.mcpServers."prospect-crm" = $prospectEntry
    Write-Ok "Updated existing 'prospect-crm' connector entry"
  } else {
    $config.mcpServers | Add-Member -NotePropertyName "prospect-crm" -NotePropertyValue $prospectEntry -Force
    Write-Ok "Added 'prospect-crm' connector entry"
  }

  # Preserve every other mcpServers entry untouched -- only prospect-crm is rewritten.
  $otherCount = ($config.mcpServers.PSObject.Properties.Name | Where-Object { $_ -ne "prospect-crm" }).Count
  if ($otherCount -gt 0) {
    Write-Info "Preserved $otherCount other mcpServers entry/entries untouched"
  }

  $json = $config | ConvertTo-Json -Depth 10
  [System.IO.File]::WriteAllText($DesktopConfig, $json, [System.Text.UTF8Encoding]::new($false))
  Write-Ok "Wrote $DesktopConfig"
  Write-Info "Connector args: $PluginEntry"
}

# =================================================================
# Step 6: credentials (always)
# =================================================================
Write-Step "Step 6: credentials"

# Read existing config, if any, so we can default the user code prompt
# and preserve unknown fields the user may have added manually.
$existingCred = $null
if (Test-Path $CredFile) {
  try {
    $existingCred = Get-Content $CredFile -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    Write-Warn "Existing $CredFile is unparseable -- it will be replaced."
    $existingCred = $null
  }
}

if (-not $UserCode) {
  $defaultUserCode = ""
  if ($existingCred -and $existingCred.PROSPECT_USER_ID) {
    $defaultUserCode = $existingCred.PROSPECT_USER_ID
    $UserCode = Read-Host "Your CRM user code [$defaultUserCode]"
    if ([string]::IsNullOrWhiteSpace($UserCode)) { $UserCode = $defaultUserCode }
  } else {
    $UserCode = Read-Host "Your CRM user code (e.g. DL, ML, RL)"
  }
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
  Write-Fail "PAT looks too short -- expected a long hex-ish string. Got $($Pat.Length) chars."
  exit 1
}
Write-Ok "PAT captured ($($Pat.Length) characters)"

if (-not $BaseUrl) {
  if ($existingCred -and $existingCred.PROSPECT_BASE_URL) {
    $BaseUrl = $existingCred.PROSPECT_BASE_URL
  } else {
    $BaseUrl = $DefaultBaseUrl
  }
}
Write-Ok "Base URL: $BaseUrl"

if (-not (Test-Path $CredDir)) {
  New-Item -ItemType Directory -Force -Path $CredDir | Out-Null
  Write-Info "Created $CredDir"
}

if (Test-Path $CredFile) {
  $stamp  = Get-Date -Format "yyyyMMdd-HHmmss"
  $backup = "$CredFile.backup-$stamp"
  Copy-Item $CredFile $backup
  Write-Ok "Existing credentials backed up to $backup"
}

# Build the new config, preserving any extra fields the user may have added
# (loadCredentials only reads the known keys, but we don't want to silently
# drop e.g. PROSPECT_PROFILE_ID or PROSPECT_LOCALE if the user set them).
$cred = [ordered]@{}
if ($existingCred) {
  foreach ($prop in $existingCred.PSObject.Properties) {
    $cred[$prop.Name] = $prop.Value
  }
}
$cred["PROSPECT_PAT"]      = $Pat
$cred["PROSPECT_BASE_URL"] = $BaseUrl
$cred["PROSPECT_USER_ID"]  = $UserCode

$json = $cred | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($CredFile, $json, [System.Text.UTF8Encoding]::new($false))
Write-Ok "Wrote $CredFile"

try {
  & icacls $CredFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
  Write-Ok "Permissions restricted to $env:USERNAME"
} catch {
  Write-Warn "Could not tighten ACLs on $CredFile -- file is still inside your user profile."
}

# =================================================================
# Step 7: Cowork-UI marketplace add (manual reminder)
# =================================================================
Write-Step "Step 7: One last manual step in Cowork"
Write-Info "The CLI install above handled the MCP server. Cowork's skill catalog"
Write-Info "is a separate registry that has to be set up via the UI. Do this once:"
Write-Info ""
Write-Info "  1. In Claude Desktop, open Customize -> Personal plugins -> +"
Write-Info "  2. In the 'Add marketplace' dialog, paste:"
Write-Info "       dale-ctrl/prospect-mcp"
Write-Info "  3. Click Sync."
Write-Info "  4. When the prospect-crm plugin appears, click Install on it."
Write-Info "  5. (Optional but recommended) In the same Customize area, find the"
Write-Info "     wcg-prospect marketplace and toggle 'Sync automatically' so future"
Write-Info "     skill updates land on Cowork restart without manual refresh."
Write-Info ""
Write-Info "Without this step, the prospect-crm MCP tools work but the"
Write-Info "versa-maintenance-contracts-bulk skill (and any future skills shipped"
Write-Info "with this plugin) will not auto-load when you ask Claude to do Versa"
Write-Info "Maintenance Contract work."

# =================================================================
# Step 8: restart + smoke test
# =================================================================
Write-Host ""
Write-Host "=================================================================" -ForegroundColor Green
if ($CredentialsOnly) {
  Write-Host "  Credentials refreshed for user $UserCode" -ForegroundColor Green
} else {
  Write-Host "  Setup complete for user $UserCode on this machine" -ForegroundColor Green
}
Write-Host "=================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Final steps:"
Write-Host "  1. Do the Cowork UI marketplace add described in Step 7 above."
Write-Host "     (Skip if you've already done it on this machine.)"
Write-Host "  2. Fully quit Claude Desktop (right-click tray icon -> Quit)."
Write-Host "     Closing the window is not enough."
Write-Host "  3. Reopen Claude Desktop from the Start menu."
Write-Host "  4. In a fresh chat, run two smoke tests:"
Write-Host "       a. 'Look up Beacon Academy in Prospect'"
Write-Host "          -- confirms the prospect-crm MCP tools respond."
Write-Host "       b. 'Create a Versa Maintenance Contract for [some site]"
Write-Host "          - 9x mobile tables'"
Write-Host "          -- confirms the skill is loaded (Claude should reference"
Write-Host "          the WCG rate card without you pasting it)."
Write-Host ""
Write-Host "Re-run this script any time your PAT changes, or use:"
Write-Host "  scripts\setup-user.ps1 -CredentialsOnly"
Write-Host "to refresh credentials without re-running the full install."
Write-Host ""
if (-not $CredentialsOnly) {
  Write-Host "Connector args: $PluginEntry"
}
Write-Host "Credentials:    $CredFile"
Write-Host ""
