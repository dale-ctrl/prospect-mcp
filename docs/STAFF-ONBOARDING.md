# Prospect CRM in Claude — Staff setup

Claude Desktop on your PC can talk directly to Prospect365 and do things
like search quotes, add lines, create opportunities, and email a quote
to a customer — all from a normal chat. This is a **one-time, 3-minute
setup**. Please don't skip the permissions step at the end, or you'll
have read-only access.

## What you need before you start

- **Windows PC** with admin rights on your own machine.
- **Claude Desktop** installed. Get it from https://claude.ai/download
  if you don't already have it.
- **Node.js v18 or newer.** Check by opening a Command Prompt and
  running `node --version`. If it says anything below v18 or "not
  recognized", install from https://nodejs.org/ (the green "LTS" button
  is the right one) and reboot.

## Step 1 — generate your Prospect PAT

A PAT (Personal Access Token) is like a secondary password that Claude
uses to act as you in Prospect. It's tied to your user and can be
revoked at any time.

1. Log in to Prospect365 in a browser.
2. Go to **Settings → Integrations → API → Personal Access Tokens**.
3. Click **Create new token**, name it something like `Claude MCP`,
   and click create.
4. **Copy the token immediately** — you won't be able to see it again
   after closing the dialog.

Keep the token somewhere safe for the next step (you can paste it into
a temporary Notepad window and delete it after).

## Step 2 — run the setup script

Open **PowerShell** (not Command Prompt) and run:

```powershell
\\SYNOLOGY-NAS\IT\prospect-mcp\scripts\setup-user.ps1
```

> Replace `\\SYNOLOGY-NAS\IT\prospect-mcp` with whatever UNC path IT
> uses for the NAS share, or use a mapped drive like
> `Z:\prospect-mcp\scripts\setup-user.ps1`.

The script will:
- Check that Node.js and Claude Desktop are installed.
- Ask for your **CRM user code** (it's your initials, e.g. `ML`, `RL`, `JM`).
- Ask for your **PAT** (it'll hide the characters as you paste).
- Write the config for Claude Desktop.
- Print a one-line message telling you what to send to Dale.

**If it refuses to run**, Windows is probably blocking unsigned
scripts. In the same PowerShell window, run this once and then retry:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Say **Yes** to the prompt.

## Step 3 — restart Claude Desktop

- Find the Claude icon near your clock (bottom-right).
- **Right-click it → Quit**. Just closing the window isn't enough.
- Reopen Claude Desktop from the Start menu.

## Step 4 — ask Dale for permissions

The script will have told you exactly what to send. It looks like:

> *"Please grant Prospect MCP permissions for user ML."*

By default you'll have **read-only access** — you can search and view
things but not create, edit, or email. Dale controls this from an
admin portal and can toggle specific permissions per person
(for example: can you create quotes, can you send emails to customers,
can you edit contacts).

Tell Dale what you actually need to do in your role and he'll flip
the matching toggles. Changes take effect within about 5 seconds —
**you don't need to restart Claude again.**

## Step 5 — try it

In a new Claude chat, try:

- *"Search for quotes from Exeter University"*
- *"Show me quote 12345 with all the line items"*
- *"What did our top 10 customers buy last quarter?"*

If Claude says something like *"I don't have access to that tool"*,
you either haven't restarted Claude yet, or you haven't been granted
the permission for that action. Check both.

## If something goes wrong

**"The term 'setup-user.ps1' is not recognized"**
→ PowerShell is blocking the NAS path. Mount the NAS as a drive first,
then re-run using the drive letter path.

**"Node.js not found on PATH"**
→ Install Node, reboot, then re-run the script.

**"Couldn't parse existing config as JSON"**
→ You've got a broken `claude_desktop_config.json`. The script saves
a backup of it alongside the original (with a timestamp in the name).
Open %APPDATA%\Claude\ in Explorer, delete the broken one (the file
named just `claude_desktop_config.json` without a timestamp), re-run
the script.

**"Permission denied" when using a tool in Claude**
→ Tell Dale which tool you tried; he'll enable it in the Admin Portal.

**Anything else**
→ Send Dale a screenshot and the path from the script's final output:
`%APPDATA%\Claude\claude_desktop_config.json`.
