/**
 * Simple admin server for the ProspectCRM permissions portal.
 * Run: node admin/server.mjs
 * Open: http://localhost:3333
 *
 * Serves the admin HTML and handles saving permissions.json.
 */

import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname, extname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONFIG_PATH = join(__dirname, "..", "config", "permissions.json");
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

  // Save permissions endpoint
  if (req.method === "POST" && req.url === "/api/save-permissions") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
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
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
        console.log(`Permissions saved (${Object.keys(parsed.users).length} users)`);
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
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
  console.log(`Permissions file: ${CONFIG_PATH}\n`);
});
