#!/usr/bin/env node
// scripts/notion-poller.mjs
// Pollar Notion efter tasks med status "Redo för agent" och kör dem
// EN i taget via ./scripts/run-agent.sh (Claude Code headless).
//
// Krav:  npm install @notionhq/client
// Kör:   NOTION_TOKEN=secret_xxx NOTION_DB_ID=xxx node scripts/notion-poller.mjs

import { Client } from "@notionhq/client";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ─── Konfiguration ────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const REPO_ROOT  = path.resolve(__dirname, "..");

const NOTION_TOKEN   = process.env.NOTION_TOKEN;
const DATABASE_ID    = process.env.NOTION_DB_ID;
const POLL_INTERVAL  = parseInt(process.env.POLL_INTERVAL_MS || "300000"); // 5 min
const MAX_ITERATIONS = parseInt(process.env.MAX_ITERATIONS || "0");        // 0 = oändligt

const RUN_AGENT      = path.join(REPO_ROOT, "scripts", "run-agent.sh");
const LOCK_FILE      = path.join(REPO_ROOT, ".agent.lock");

// Notion-status-värden (anpassa om dina select-alternativ heter annat)
const STATUS_READY   = "Redo för agent";
const STATUS_RUNNING = "Pågår (Agent)";
const STATUS_DONE    = "Klar (Agent)";
const STATUS_FAILED  = "Misslyckades (Agent)";

// ─── Validering ───────────────────────────────────────────────────────────────

if (!NOTION_TOKEN) {
  console.error("❌ NOTION_TOKEN saknas."); process.exit(1);
}
if (!DATABASE_ID) {
  console.error("❌ NOTION_DB_ID saknas."); process.exit(1);
}
if (!existsSync(RUN_AGENT)) {
  console.error(`❌ Hittar inte ${RUN_AGENT}`); process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAgentBusy() {
  // Agent körs om lockfilen finns OCH processen lever
  if (!existsSync(LOCK_FILE)) return false;
  try {
    const pid = parseInt(readFileSync(LOCK_FILE, "utf-8").trim());
    process.kill(pid, 0); // Signal 0 = existenskoll
    return true;
  } catch {
    return false; // Processen död → stale lockfile
  }
}

function getCurrentGitSha() {
  return execSync("git rev-parse HEAD", { cwd: REPO_ROOT }).toString().trim();
}

function getNewCommits(startSha) {
  const endSha = getCurrentGitSha();
  if (startSha === endSha) return [];
  const output = execSync(`git log --oneline ${startSha}..${endSha}`, {
    cwd: REPO_ROOT,
  }).toString().trim();
  if (!output) return [];
  return output.split("\n");
}

function runAgent(task) {
  return new Promise((resolve) => {
    const child = spawn(RUN_AGENT, [task], {
      cwd: REPO_ROOT,
      stdio: "inherit", // Streama till terminalen
    });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", (err) => {
      console.error(`❌ Kunde inte starta agent: ${err.message}`);
      resolve(1);
    });
  });
}

async function fetchNextTask() {
  const res = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: { property: "Status", select: { equals: STATUS_READY } },
    sorts: [{ timestamp: "created_time", direction: "ascending" }],
    page_size: 1, // Alltid EN task åt gången
  });
  return res.results[0] || null;
}

async function setStatus(pageId, status, extra = {}) {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      Status: { select: { name: status } },
      ...extra,
    },
  });
}

function getTitle(page) {
  return page.properties?.Name?.title?.[0]?.plain_text || "(namnlös)";
}
function getDescription(page) {
  return page.properties?.Beskrivning?.rich_text?.[0]?.plain_text || "";
}

async function appendCommitsAsComment(pageId, commits) {
  if (commits.length === 0) return;
  let text = "Agent-commits:\n" + commits.map((c) => `• ${c}`).join("\n");
  // Notion rich_text har 2000-teckens limit per content-block
  if (text.length > 1900) {
    text = text.slice(0, 1900) + "\n... (trunkerad)";
  }
  try {
    await notion.comments.create({
      parent: { page_id: pageId },
      rich_text: [{ text: { content: text } }],
    });
  } catch (err) {
    console.warn(`   ⚠️  Kunde inte skapa Notion-kommentar: ${err.message}`);
  }
}

// ─── Huvudloop ────────────────────────────────────────────────────────────────

async function poll() {
  console.log(`[${new Date().toISOString()}] 🔍 Pollar Notion...`);

  if (isAgentBusy()) {
    console.log("   ⏳ Agent upptagen, väntar till nästa poll.");
    return;
  }

  const page = await fetchNextTask();
  if (!page) {
    console.log("   ✅ Inga tasks i kön.");
    return;
  }

  const title = getTitle(page);
  const description = getDescription(page);
  const fullTask = description ? `${title}\n\n${description}` : title;
  console.log(`   📋 Task: "${title}"`);

  // Markera som pågående INNAN körning (förhindrar dubbelstart)
  await setStatus(page.id, STATUS_RUNNING);

  const startSha = getCurrentGitSha();
  const exitCode = await runAgent(fullTask);
  const commits = getNewCommits(startSha);

  // Uppdatera Notion baserat på resultat
  const finalStatus = exitCode === 0 && commits.length > 0 ? STATUS_DONE : STATUS_FAILED;
  await setStatus(page.id, finalStatus);
  await appendCommitsAsComment(page.id, commits);

  console.log(`   ${exitCode === 0 ? "✅" : "❌"} Agent klar (exit ${exitCode}, ${commits.length} commits)`);
  console.log(`   📝 Notion → "${finalStatus}"`);
}

// ─── Start ────────────────────────────────────────────────────────────────────

console.log("═══════════════════════════════════════════");
console.log("  Fritt Bokföring — Notion → Claude Code");
console.log(`  Repo:         ${REPO_ROOT}`);
console.log(`  Databas:      ${DATABASE_ID}`);
console.log(`  Poll-interval: ${POLL_INTERVAL / 1000}s`);
console.log("═══════════════════════════════════════════\n");

let iteration = 0;

async function tick() {
  try {
    await poll();
  } catch (err) {
    console.error(`⚠️  Poll-fel: ${err.message}`);
  }
  iteration++;
  if (MAX_ITERATIONS > 0 && iteration >= MAX_ITERATIONS) {
    console.log(`\n🏁 MAX_ITERATIONS (${MAX_ITERATIONS}) nådd. Avslutar.`);
    process.exit(0);
  }
  setTimeout(tick, POLL_INTERVAL);
}

tick();

process.on("SIGINT", () => {
  console.log("\n👋 Poller stoppad.");
  process.exit(0);
});
