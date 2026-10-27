// Real app screens for the website, from the LOCAL seeded stack (same approach as
// splitfreeapp/scripts/capture-shots.mjs). Run with node 22 from anywhere:
//   node capture-site.mjs <outDir> [light|dark]
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const APP = "/home/justutsav/projects/SplitFree/SplitFree/splitfreeapp";
const { default: puppeteer } = await import(`${APP}/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js`);
const { createClient } = await import(`${APP}/node_modules/@supabase/supabase-js/dist/index.mjs`).catch(() => import(`${APP}/node_modules/@supabase/supabase-js/dist/module/index.js`));
const { db, url: supabaseUrl, PASSWORD, DEMO_EMAIL } = await import(`${APP}/scripts/seed-demo.mjs`);

const OUT = resolve(process.argv[2] ?? "shots");
const THEME = process.argv[3] ?? "light";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { ANON_KEY } = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { cwd: APP, encoding: "utf8" }));

async function mintSession() {
  const written = {};
  const client = createClient(supabaseUrl, ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
      storage: { getItem: (k) => written[k] ?? null, setItem: (k, v) => { written[k] = v; }, removeItem: (k) => { delete written[k]; } } },
  });
  const { error } = await client.auth.signInWithPassword({ email: DEMO_EMAIL, password: PASSWORD });
  if (error) throw error;
  return written;
}

function startDev() {
  const proc = spawn("npm", ["run", "dev", "--", "--port", "5299"], {
    cwd: APP, env: { ...process.env, VITE_SUPABASE_URL: supabaseUrl, VITE_SUPABASE_PUBLISHABLE_KEY: ANON_KEY },
  });
  return new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error("dev server timeout")), 90_000);
    proc.stdout.on("data", (b) => { const m = String(b).match(/https?:\/\/localhost:\d+/); if (m) { clearTimeout(t); ok({ proc, base: m[0] }); } });
    proc.on("exit", (c) => fail(new Error(`dev exited ${c}`)));
  });
}

async function tap(page, text, sel = "button, a, [role=tab], [role=button]") {
  const h = await page.evaluateHandle((text, sel) =>
    [...document.querySelectorAll(sel)].find((x) => x.textContent.trim().toLowerCase().startsWith(text.toLowerCase())) ?? null, text, sel);
  const el = h.asElement();
  if (!el) { console.log("    miss:", text); return false; }
  await el.click();
  return true;
}
const clickText = (page, text, sel = "button, a, [role=tab], [role=button]") =>
  page.evaluate((text, sel) => {
    const el = [...document.querySelectorAll(sel)].find((x) => x.textContent.trim().startsWith(text));
    if (!el) return false;
    el.click();
    return true;
  }, text, sel);

const goa = await db.from("groups").select("id").eq("name", "Goa Trip").single();
const flat = await db.from("groups").select("id").eq("name", "Flat 402").single();
console.log("minting");
const session = await mintSession();
console.log("minted");
const { proc, base } = await startDev();
console.log("dev at", base);
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--hide-scrollbars", "--force-device-scale-factor=1"] });

async function fresh(opt = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 432, height: 768, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument((entries, theme, nudge) => {
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    if (!nudge) localStorage.setItem("sf.avatar-nudge-at", String(Date.now() + 1e12));
    localStorage.setItem("sf.onboarded", "true");
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k) {
      if (String(k).startsWith("coach_")) return "done";
      if (k === "theme") return theme;
      return get.call(this, k);
    };
    // Android WebView renders system-ui as Roboto; Linux Chrome would fall back to DejaVu.
    document.addEventListener("DOMContentLoaded", () => {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=block";
      document.head.appendChild(l);
      const s = document.createElement("style");
      s.textContent = ":root{--font-sans:Roboto,sans-serif!important} body{font-family:Roboto,sans-serif!important}";
      document.head.appendChild(s);
    });
  }, session, opt.theme ?? THEME, !!opt.nudge);
  return page;
}

async function shot(name, path, steps = async () => {}, wait = 1800, opt = {}) {
  const page = await fresh(opt);
  await page.goto(`${base}${path}`, { waitUntil: "networkidle2" });
  await sleep(1500);
  await steps(page);
  await sleep(wait);
  await page.screenshot({ path: resolve(OUT, `${name}.png`) });
  console.log("  ", name, page.url().replace(base, ""));
  await page.close();
}

try {
  const only = process.argv[4]?.split(",");
  const S = (name, ...rest) => (!only || only.includes(name) ? shot(name, ...rest) : null);
  await S("home", "/home");
  await S("group-balances", `/groups/${goa.data.id}`, async (p) => { await tap(p, "Balances"); });
  await S("group-recurring", `/groups/${flat.data.id}`, async (p) => { await tap(p, "Recurring"); });
  await S("group-totals", `/groups/${goa.data.id}`, async (p) => { await tap(p, "Totals"); });
  await S("expense", `/groups/${goa.data.id}`, async (p) => { await tap(p, "Beach shack dinner", "a, button, li, [role=button], div"); await sleep(1500); });
  await S("new-expense", "/expenses/new", async (p) => {
    await tap(p, "Choose"); await sleep(900);
    await tap(p, "Groups"); await sleep(700);
    await tap(p, "FFlat 402", "button"); await sleep(1200);
    const d = await p.$('input[placeholder*="Groceries"]'); if (d) await d.type("Weekly groceries");
    const a = await p.$('input[inputmode="decimal"], input[type="number"]'); if (a) { await a.click({ clickCount: 3 }); await a.type("2400"); }
    await p.evaluate(() => document.activeElement?.blur());
  });
  await S("settings", "/account/settings", async (p) => { await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); });
  await S("delete", "/account/delete");
  await S("privacy-app", "/account/settings/privacy");
  await S("avatars", "/home", async () => {}, 2500, { nudge: true });
  await S("shop", "/home", async (p) => { await tap(p, "Shop payments"); await sleep(1500); });
  await S("celebrations", "/account/celebrations");
  await S("home-mono", "/home", async () => {}, 1800, { theme: "mono" });
  await S("settle-mono", "/home", async (p) => { await tap(p, "Paid all"); await sleep(1800); }, 1800, { theme: "mono" });
} finally {
  await browser.close();
  proc.kill("SIGTERM");
}
