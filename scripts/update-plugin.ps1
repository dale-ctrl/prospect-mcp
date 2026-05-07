<#
.SYNOPSIS
Update the locally-installed prospect-crm plugin to the latest version.

.DESCRIPTION
Run this when a new version of the plugin has been pushed to GitHub.
It does two things:

  1. claude plugin update prospect-crm@wcg-prospect
     -- pulls the latest dist/, skills/, manifests, etc.
  2. npm install --omit=dev inside the plugin's local clone
     -- in case any runtime dependencies changed in the new version.

After it finishes, fully quit Claude Desktop (right-click tray -> Quit)
and reopen so the MCP server reloads with the new code.

If you have not run setup-user.ps1 yet, run that first -- it handles
the initial install, connector wiring, and credential setup. This
script only handles the ongoing-update case.

.NOTES
ASCII-only output for cmd.exe compatibility.
#>

$ErrorActionPreference = "Stop"

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
}

function Write-Info {
  param([string]$Text)
  Write-Host "  $Text"
}

$PluginRoot  = Join-Path $env:USERPROFILE ".claude\plugins\marketplaces\wcg-prospect"
$PluginEntry = Join-Path $PluginRoot "dist\index.js"

# Pre-flight: claude CLI present
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Write-Fail "Claude Code CLI ('claude') not found on PATH."
  Write-Info "Install it: npm install -g @anthropic-ai/claude-code"
  Write-Info "Or run setup-user.ps1, which handles initial install."
  exit 1
}

# Pre-flight: plugin already installed (this script does not bootstrap)
if (-not (Test-Path $PluginRoot)) {
  Write-Fail "Plugin not installed at $PluginRoot."
  Write-Info "Run setup-user.ps1 first to do the initial install."
  exit 1
}

# Step 1: claude plugin update
Write-Step "Updating plugin from marketplace"
& claude plugin update prospect-crm@wcg-prospect
if ($LASTEXITCODE -ne 0) {
  Write-Fail "claude plugin update failed (exit $LASTEXITCODE)."
  exit 1
}
Write-Ok "Plugin update complete"

if (-not (Test-Path $PluginEntry)) {
  Write-Fail "Plugin entry missing after update: $PluginEntry"
  Write-Info "The update did not leave the expected layout. Check:"
  Write-Info "  claude plugin list"
  Write-Info "  ls $PluginRoot"
  exit 1
}

# Step 2: refresh runtime dependencies
Write-Step "Refreshing plugin runtime dependencies (30-60s)"
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
  Write-Ok "Runtime dependencies refreshed"
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Green
Write-Host "  Plugin updated successfully" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Restart Claude Desktop to apply:" -ForegroundColor Yellow
Write-Host "  1. Right-click the Claude tray icon -> Quit (closing the window"
Write-Host "     is not enough)."
Write-Host "  2. Reopen Claude Desktop from the Start menu."
Write-Host ""
Write-Host "Plugin entry: $PluginEntry"
Write-Host ""
