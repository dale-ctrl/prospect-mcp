/**
 * Simple admin server for the ProspectCRM permissions portal.
 * Run: node admin/server.mjs
 * Open: http://localhost:3333
 *
 * Serves the admin HTML and handles saving permissions.json. On save, the
 * file is committed to the local git repo and pushed to GitHub so every
 * Claude Desktop user picks up the change on next restart (the plugin
 * fetches `config/permissions.json` from raw.githubusercontent.com at
 * startup — see src/permissions.ts).
 */

import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname, extname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");
const CONFIG_PATH = join(REPO_ROOT, "config", "permissions.json");
const PORT = 3333;
// Regional write-capable host — the public-docs `crm-odata-v1.prospect365.com`
// is a read-only shim that silently no-ops bound actions. Matches the default
// in src/client.ts.
const PROSPECT_BASE = process.env.PROSPECT_BASE_URL || "https://api-v1-westeurope.prospect365.com";

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".json": "application/json",
  ".css": "text/css",
};

// ── Git helpers ──────────────────────────────────────────────
//
// Inherits the maintainer's existing git credential setup (Windows Credential
// Manager / SSH agent / etc.). No separate PAT is introduced — whatever lets
// `git push` work in the terminal lets it work here.

function git(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", args, { cwd: REPO_ROOT, ...opts });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", (err) => reject(new Error(`git ${args[0]}: ${err.message}`)));
    proc.on("exit", (code) => {
      if (code === 0) resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      else reject(new Error(`git ${args.join(" ")} failed (exit ${code}): ${stderr.trim() || stdout.trim()}`));
    });
  });
}

// Stages ONLY config/permissions.json (never a wildcard add — otherwise an
// in-progress dist/ rebuild or .env edit would be swept into the commit),
// commits, pulls --rebase to absorb concurrent admin edits from another
// machine, then pushes. Returns { pushed, ts, noop } on success.
//
// Order matters: the save endpoint already wrote permissions.json before
// calling this, so the file is sitting on disk as an unstaged change. If we
// `git pull --rebase` first, git bails with "you have unstaged changes" and
// nothing gets pushed (Dale hit this in v1.3.0). Committing first leaves the
// working tree clean so rebase runs cleanly.
//
// If the rebase produces a real conflict (not just unstaged-changes — that's
// already prevented by ordering), we `git rebase --abort` so the local
// commit stays intact and the UI can offer a retry.
async function commitAndPushPermissions() {
  const ts = new Date().toISOString();

  // Precise add — only the file we just wrote.
  await git(["add", "config/permissions.json"]);

  // Did the staged content actually differ from HEAD? If not, no commit
  // needed. (Someone else may have already pushed the same content, or the
  // admin clicked Save without actually changing anything.)
  let hasStagedChanges = false;
  try {
    await git(["diff", "--cached", "--quiet", "--exit-code", "config/permissions.json"]);
    // exit 0 means no staged changes
  } catch {
    hasStagedChanges = true;
  }

  if (!hasStagedChanges) {
    // Still try to push in case a previous run committed but failed to push.
    // If origin is already in sync, git push is a no-op.
    try {
      await git(["push", "origin", "main"]);
    } catch {
      // ignore — nothing local to send and origin may be ahead, that's fine
    }
    return { pushed: true, ts, noop: true };
  }

  await git(["commit", "-m", `admin: update permissions [${ts}]`]);

  // Now pull-rebase — working tree is clean because we just committed.
  // If a concurrent admin edit from another machine produced a real conflict,
  // abort the rebase and surface the error. The local commit is kept so
  // the next retry won't lose the change; the admin can resolve manually.
  try {
    await git(["pull", "--rebase", "origin", "main"]);
  } catch (rebaseErr) {
    try { await git(["rebase", "--abort"]); } catch { /* nothing to abort */ }
    throw new Error(`pull --rebase failed (local commit preserved for retry): ${rebaseErr.message}`);
  }

  await git(["push", "origin", "main"]);
  return { pushed: true, ts, noop: false };
}

const server = createServer(async (req, res) => {
  // Proxy endpoint — relays calls to Prospect CRM with the PAT from permissions.json
  // Usage: /api/crm?path=/Divisions?$filter=...
  if (req.method === "GET" && req.url?.startsWith("/api/crm?")) {
    try {
      const queryString = req.url.substring("/api/crm?".length);
      const params = new URLSearchParams(queryString);
      const path = params.get("path");
      if (!path) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing 'path' parameter" }));
        return;
      }

      // Load PAT from config
      if (!existsSync(CONFIG_PATH)) throw new Error("permissions.json not found");
      const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
      const userWithPat = Object.values(cfg.users).find((u) => u.pat && u.pat.length > 10);
      if (!userWithPat) throw new Error("No PAT configured for any user");

      const upstreamUrl = PROSPECT_BASE + path;
      const upstreamResp = await fetch(upstreamUrl, {
        headers: {
          Authorization: `Bearer ${userWithPat.pat}`,
          Accept: "application/json",
        },
      });

      const body = await upstreamResp.text();
      res.writeHead(upstreamResp.status, { "Content-Type": "application/json" });
      res.end(body);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Retry-push endpoint — re-attempts pull-rebase + push without rewriting
  // the file. Used by the UI when the prior save succeeded locally but the
  // push failed (e.g. transient network issue). The local
  // config/permissions.json must already reflect the desired state; this
  // endpoint does NOT take a body.
  if (req.method === "POST" && req.url === "/api/retry-push-permissions") {
    try {
      const result = await commitAndPushPermissions();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, ...result }));
      console.log(`Permissions push retried OK at ${result.ts}${result.noop ? " (no-op — already in sync)" : ""}`);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: false,
        error: err.message,
        hint: "Common causes: network down, merge conflict, or missing git credentials. " +
              "Try `git pull --rebase && git push` from a terminal in the repo root to debug.",
      }));
      console.error(`Permissions push retry failed: ${err.message}`);
    }
    return;
  }

  // Save permissions endpoint
  if (req.method === "POST" && req.url === "/api/save-permissions") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        // Validate it's valid JSON
        const parsed = JSON.parse(body);
        if (!parsed.users || !parsed.defaults) {
          throw new Error("Invalid permissions format");
        }

        // Backup existing file
        if (existsSync(CONFIG_PATH)) {
          const backup = CONFIG_PATH.replace(".json", `.backup-${Date.now()}.json`);
          writeFileSync(backup, readFileSync(CONFIG_PATH));
        }

        // Save new config
        writeFileSync(CONFIG_PATH, JSON.stringify(parsed, null, 2));
        console.log(`Permissions saved locally (${Object.keys(parsed.users).length} users)`);

        // Commit + push so other users pick up the change on next restart.
        // Local save has already succeeded; if the push fails we still report
        // saved=true and let the UI offer a retry.
        try {
          const pushResult = await commitAndPushPermissions();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: true,
            saved: true,
            pushed: true,
            ts: pushResult.ts,
            noop: pushResult.noop,
          }));
          console.log(`Permissions pushed to GitHub at ${pushResult.ts}${pushResult.noop ? " (no-op — already in sync)" : ""}`);
        } catch (pushErr) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: true,
            saved: true,
            pushed: false,
            error: pushErr.message,
            hint: "Local edit saved. Other users will not see this change until the push succeeds. " +
                  "Common causes: network down, merge conflict, missing git credentials. " +
                  "Use the Retry Push button to try again.",
          }));
          console.error(`Permissions saved locally but push failed: ${pushErr.message}`);
        }
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, saved: false, error: err.message }));
      }
    });
    return;
  }

  // Serve static files — strip query string before resolving path
  const urlPath = (req.url || "/").split("?")[0];
  let filePath;
  if (urlPath === "/" || urlPath === "/index.html") {
    filePath = join(__dirname, "index.html");
  } else if (urlPath.startsWith("/config/")) {
    filePath = join(__dirname, "..", urlPath);
  } else {
    filePath = join(__dirname, urlPath);
  }

  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = extname(filePath);
  const mime = MIME_TYPES[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": mime });
  res.end(readFileSync(filePath));
});

server.listen(PORT, () => {
  console.log(`\nProspectCRM Admin Portal running at:\n`);
  console.log(`  http://localhost:${PORT}\n`);
  console.log(`Permissions file: ${CONFIG_PATH}`);
  console.log(`On save: commits + pushes to origin/main so all users pick up the change on next restart.\n`);
});
