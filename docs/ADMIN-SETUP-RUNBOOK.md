# Setup runbook — adding a new user

You (admin) will do all seven steps at the new user's machine (or over
a remote-control session). Takes about 5 minutes once Node and Claude
Desktop are installed.

## Before you start

Have ready:
- Remote-desktop access (or be at their PC)
- Their CRM user code (initials — e.g. `ML`, `RL`, `JM`)
- The Admin Portal open on your own machine: http://localhost:3333

---

## 1. Install Node.js on their machine

Check if it's already there. In their Command Prompt:

```cmd
node --version
```

- **v18 or newer** → skip to step 2.
- **Lower, or "not recognized"** → download the **LTS** installer from
  https://nodejs.org/, run it with all defaults, then **reboot** (so
  the updated PATH takes effect).

## 2. Install Claude Desktop on their machine

If not already installed, get it from https://claude.ai/download. Run
the installer. Sign them in with their **Claude Pro** account (not
yours).

Close Claude Desktop after confirming it launches. **Right-click the
tray icon → Quit** — don't just close the window.

## 3. Generate their Prospect PAT

Still on their machine:

1. Log them into Prospect365 in a browser.
2. **Settings → Integrations → API → Personal Access Tokens**.
3. Click **Create new token**, name it `Claude MCP`, create.
4. **Copy the token immediately** — you won't see it again after closing.

Paste it into a Notepad window temporarily. You'll need it in the next
step.

## 4. Run the setup script on their machine

Open **PowerShell** (not cmd) on their PC and run:

```powershell
\\192.168.1.155\sfm_data\prospect-mcp\scripts\setup-user.ps1
```

The script will:
- Check Node + Claude are installed (abort with a clear message if not).
- Ask for their user code → type the initials from step 0.
- Ask for the PAT → paste it (hidden input).
- Merge a `prospect-crm` entry into their Claude config.
- Print a reminder list.

**If PowerShell refuses to run the script** (`execution of scripts is
disabled`), run this first, then retry:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Say **Yes** to the prompt.

Close the Notepad window with the PAT when done.

## 5. Add them in the Admin Portal (on your machine)

Switch to your own PC.

1. Open http://localhost:3333.
2. Click **+ Add User**.
3. Enter their user code, name, and notes.
4. Leave the PAT field blank (they use their own, from step 3 —
   the portal's PAT field is only used by the admin-portal's live
   preview, not by their MCP server).
5. Tick the permission checkboxes that match their role. Common
   starting sets:
     - **Read-only** (default if you tick nothing) — can search and
       view everything, can't edit
     - **Sales operator** — quotes (create, edit), contacts (create,
       edit), opportunities (create, edit), tasks (create, edit)
     - **Sales manager** — sales operator + messaging.send (can email
       quotes to customers)
6. Click **Save Permissions**.

Permissions go live within 5 seconds — no Claude Desktop restart
needed to refresh them later.

## 6. Restart Claude Desktop on their machine

Back on their PC:

1. Right-click the Claude tray icon → **Quit**.
2. Reopen Claude Desktop from the Start menu.

This is required **once** so Claude picks up the new MCP server. Later
permission changes don't need a restart.

## 7. Verify

In a new Claude chat on their machine, try:

> *"Search quotes for Exeter University"*

Claude should call the `search_quotes` tool and return a list. If it
says *"I don't have access to that tool"* or similar, something broke
— check the troubleshooting section below.

Then for a write-capable user, try:

> *"Create a test quote for contact ID 23122 — description: 'Claude connector test'"*

Delete the test quote afterwards via the CRM UI or:

> *"Delete quote [id]"* (if `quotes.delete` is enabled for them)

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `setup-user.ps1` can't be found | Use the mapped drive path if UNC fails: `Z:\prospect-mcp\scripts\setup-user.ps1` (only works if `Z:` is mapped to the NAS on their machine). |
| `execution of scripts is disabled on this system` | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` in PowerShell. |
| `Node.js not found on PATH` after installing | They didn't reboot. Reboot and retry. |
| `PAT looks too short` | They pasted wrong. Regenerate a fresh token and paste more carefully. |
| `Could not parse existing config as JSON` | Their `%APPDATA%\Claude\claude_desktop_config.json` was malformed before you touched it. The script backed it up with a timestamp — delete the broken one (without the timestamp) and re-run. |
| In Claude: *"I don't have access to quote tools"* | (a) Claude wasn't fully tray-quit and reopened. (b) Their config file is pointing to a stale path — check `%APPDATA%\Claude\claude_desktop_config.json`. |
| In Claude: *"Permission denied: create on quotes"* | You haven't ticked that permission for them yet. Flip it in the Admin Portal. |
| `send_quote_email` silently succeeds but no email arrives | They have `PROSPECT_BASE_URL` pointing at the old `crm-odata-v1.prospect365.com` host. Remove the line from their `claude_desktop_config.json` (the new code defaults to the regional host automatically). |

## Removing a user

1. In the Admin Portal, click **Remove** next to their name → **Confirm**.
   → Takes effect within 5 seconds. Their tools start returning
   "Permission denied" immediately.
2. **Revoke their PAT in Prospect** (Settings → Integrations → API →
   find the token → revoke). This is the real access cut — without
   revoking, they could theoretically put the PAT into a different
   MCP client.
3. On their machine, delete the `prospect-crm` entry from
   `%APPDATA%\Claude\claude_desktop_config.json` so it stops trying
   to connect.

Step 2 is the one that actually matters for security. Step 1 is the
defense-in-depth layer.
