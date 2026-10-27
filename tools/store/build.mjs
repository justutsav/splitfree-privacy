// Google Play listing set, from the real app on the LOCAL stack seeded with the
// site's fictional cast (tools/seed-site.mjs). Captures each screen per Play
// form factor, then frames it with a caption in compose.html and screenshots
// that at Play's exact pixel size. Nothing here draws app UI.
//   cd ../SplitFree/splitfreeapp      (node 22; vite dev on :5299, see ../app-lib.mjs)
//   node ../../splitfree-privacy/tools/record-clips.mjs camera   (once: the scan standee)
//   node ../../splitfree-privacy/tools/store/build.mjs [outDir]
//   FRAME_ONLY=1 node ../../splitfree-privacy/tools/store/build.mjs   (re-frame raw/ only)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launch, appPage, mintSession, sleep, tap, slide, fakePush, seedPendingShop, db, BASE, APP } from "../app-lib.mjs";

const OUT = resolve(process.argv[2] ?? "/home/justutsav/projects/SplitFree/playstore/2026-10-27");
const SITE = resolve(import.meta.dirname, "../..");
const CAMERA = `${process.env.CLIP_TMP ?? "/tmp/splitfree-clips"}/camera.y4m`;
const COMPOSE = pathToFileURL(`${import.meta.dirname}/compose.html`).href;
if (!existsSync(CAMERA)) throw new Error(`no ${CAMERA}: run record-clips.mjs camera first`);

// Viewports are CSS px with a device scale factor, never raw pixels: a 1080px
// layout is a different (and wrong) app. The tablets sit in Android's real
// sw600dp / sw720dp buckets, so they show the app's genuine tablet layout.
// The phone is a 20:9 screen (412x915, Pixel 7 / Galaxy S class) because the
// frame is a 20:9 phone; the canvas around it is Play's 1080x1920.
const FACTORS = [
  { dir: "phone", W: 1080, H: 1920, kind: "phone", viewport: { width: 412, height: 915, deviceScaleFactor: 3 } },
  { dir: "tablet-7in", W: 1080, H: 1920, kind: "tablet", viewport: { width: 600, height: 960, deviceScaleFactor: 2 } },
  { dir: "tablet-10in", W: 1200, H: 1920, kind: "tablet", viewport: { width: 800, height: 1280, deviceScaleFactor: 1.5 } },
];

/** Fail the run rather than ship a shot that misses what its caption says. */
async function waitText(page, text, ms = 15000) {
  for (let t = 0; t < ms; t += 150) {
    if ((await page.evaluate(() => document.body.innerText).catch(() => "")).includes(text)) return;
    await sleep(150);
  }
  throw new Error(`never saw "${text}" on ${page.url()}`);
}
async function must(page, text, sel) {
  if (!(await tap(page, text, sel))) throw new Error(`nothing to tap: "${text}" on ${page.url()}`);
}

// Captions: five words at most, and only what the capture shows (the fixture is
// tools/seed-site.mjs: Kabir signed in; Singh is owed 620; Luffy, Elon and Oggy
// owe Kabir; Catch-up and Groceries are the groups).
const SHOTS = [
  {
    file: "01-scan.png", cap: "Scan any shop's UPI QR", coins: "paisa-vasool,stonks", path: "/home",
    async prepare(page) {
      await (await page.$('a[aria-label="Scan a QR"]')).click();
      // the fake camera swings onto the standee about 2 s in; the shop sheet opens on a read
      const amt = await page.waitForSelector('input[aria-label="Amount to pay"]', { timeout: 15000 });
      await sleep(600);
      await amt.click();
      await amt.type("340", { delay: 60 });
      await page.evaluate(() => document.activeElement?.blur());
      await waitText(page, "Scan at your own risk");
    },
  },
  {
    file: "02-split.png", cap: "Split it with friends", coins: "treat-on-me,sus", path: "/home/pending", before: seedPendingShop,
    async prepare(page) {
      await waitText(page, "Split it");
      await must(page, "Split it");
      await sleep(900);
      // the picker sometimes opens on its Groups tab
      if (!(await page.$('input[placeholder="Search friends"]'))) await must(page, "Friends", "button");
      await page.waitForSelector('input[placeholder="Search friends"]', { timeout: 8000 });
      await sleep(500);
      for (const f of ["luffy", "elon", "oggy"]) { await must(page, f, "button"); await sleep(250); }
      await must(page, "Split with 3");
      await sleep(900);
      await page.evaluate(() => [...document.querySelectorAll('[role="checkbox"]')][2]?.scrollIntoView({ block: "center" }));
      const shares = await page.evaluate(() => [...document.querySelectorAll("input")].filter((i) => i.value === "85").length);
      if (shares !== 4) throw new Error(`split: expected 4 shares of 85, saw ${shares}`);
    },
  },
  {
    file: "03-balances.png", cap: "Every balance at a glance", coins: "stonks,paid-full-bill", path: "/home",
    async prepare(page) { await waitText(page, "Oggy"); },
  },
  {
    file: "04-remind.png", cap: "Remind in one tap", coins: "still-waiting,kal-pakka", path: "/home", settle: 900,
    async prepare(page) {
      await waitText(page, "Oggy");
      const btn = await page.evaluateHandle(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Remind"));
      if (!btn.asElement()) throw new Error("no Remind button");
      await btn.asElement().click();
      await waitText(page, "Reminder sent");
    },
  },
  {
    file: "05-settle.png", cap: "Settle up on UPI", coins: "settle-king,paid-back", path: "/home",
    async prepare(page) {
      await waitText(page, "Singh");
      await must(page, "Paid all");
      await page.waitForSelector('[aria-label^="Slide to Pay"]', { timeout: 8000 });
      await sleep(800);
      await slide(page, "Slide to Pay");
      // polled by hand: the upi:// hand-off can swap the execution context
      for (let i = 0; ; i++) {
        if ((await page.evaluate(() => document.body.innerText).catch(() => "")).includes("reach Singh")) break;
        if (i > 80) throw new Error("no 'Did ₹620 reach Singh?' sheet");
        await sleep(150);
      }
    },
  },
  {
    file: "06-group.png", cap: "One running tab per group", coins: "accountant,treat-on-me", path: "GROUP",
    async prepare(page) { await waitText(page, "Ice cream"); },
  },
];

// MainActivity publishes the real window insets into --sa-top / --sa-bottom on a
// phone (the WebView leaves env() at 0). A browser has none, so give the app the
// status-bar and gesture-bar strips a handset would: content then sits where it
// does on a device, clear of the frame's camera.
const insets = (p) => p.evaluateOnNewDocument(() => addEventListener("DOMContentLoaded", () => {
  const st = document.createElement("style");
  st.textContent = "html{--sa-top:28px!important;--sa-bottom:16px!important}";
  document.head.appendChild(st);
}));

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"] });

// ------------------------------------------------------------------ capture
const reseed = () => execFileSync("node", [`${SITE}/tools/seed-site.mjs`], { cwd: APP, stdio: ["ignore", "inherit", "ignore"] });

// FRAME_ONLY=1 reuses raw/ and only re-frames (for caption or frame changes)
if (!process.env.FRAME_ONLY) {
const browser = await launch([`--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream`, `--use-file-for-fake-video-capture=${CAMERA}`]);
try {
  for (const f of FACTORS) {
    mkdirSync(`${OUT}/raw/${f.dir}`, { recursive: true });
    // a fresh cast per form factor: reminders have a per-person cooldown
    reseed();
    const auth = await mintSession(); // after the seed: it makes new users
    const { data: group, error } = await db.from("groups").select("id").eq("name", "Catch-up").order("created_at", { ascending: false }).limit(1).single();
    if (error) throw error;
    // the shot that queues a shop payment goes last, or every home after it counts it
    for (const s of [...SHOTS].sort((a, b) => !!a.before - !!b.before)) {
      // a fresh profile per shot: one shot's local state (a queued payment, a
      // dismissed sheet) never leaks into the next
      const ctx = await browser.createBrowserContext();
      try {
        const page = await appPage(ctx, auth, { extra: async (p) => { await insets(p); if (s.before) await s.before(p); } });
        await page.setViewport({ ...f.viewport, isMobile: true, hasTouch: true });
        await fakePush(page);
        await page.goto(`${BASE}${s.path === "GROUP" ? `/groups/${group.id}` : s.path}`, { waitUntil: "networkidle2" });
        await sleep(1800);
        await s.prepare(page).catch(async (e) => {
          await page.screenshot({ path: `${OUT}/raw/_failed-${f.dir}-${s.file}` }).catch(() => {});
          throw e;
        });
        await sleep(s.settle ?? 1600); // skeletons, sheets and toasts finish moving
        await page.screenshot({ path: `${OUT}/raw/${f.dir}/${s.file}`, captureBeyondViewport: false });
        console.log("captured", f.dir, s.file);
      } finally { await ctx.close(); }
    }
  }
} finally { await browser.close(); }
reseed(); // leave the stack as the site's stills show it
}

// ------------------------------------------------------------------ compose
const flatten = (src, dest) => run("convert", [src, "-alpha", "off", "-depth", "8", "-define", "png:color-type=2", dest]);
const framer = await launch(["--allow-file-access-from-files"]);
try {
  const page = await framer.newPage();
  const shoot = async (W, H, query, dest) => {
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.goto(`${COMPOSE}?${new URLSearchParams({ w: W, h: H, ...query })}`);
    await page.waitForSelector("body[data-ready]", { timeout: 15000 });
    await page.screenshot({ path: `${OUT}/_tmp.png` });
    flatten(`${OUT}/_tmp.png`, dest);
  };
  for (const f of FACTORS) {
    mkdirSync(`${OUT}/${f.dir}`, { recursive: true });
    for (const s of SHOTS) {
      await shoot(f.W, f.H, { kind: f.kind, cap: s.cap, coins: s.coins, shot: pathToFileURL(`${OUT}/raw/${f.dir}/${s.file}`).href }, `${OUT}/${f.dir}/${s.file}`);
      console.log("framed", f.dir, s.file);
    }
  }
  await shoot(1024, 500, { feature: 1, shot: pathToFileURL(`${OUT}/raw/phone/03-balances.png`).href }, `${OUT}/feature-graphic-1024x500.png`);
} finally { await framer.close(); }
run("rm", ["-f", `${OUT}/_tmp.png`]);

// ------------------------------------------------------------------ check + document
const files = [...FACTORS.flatMap((f) => SHOTS.map((s) => ({ path: `${f.dir}/${s.file}`, cap: s.cap, f }))), { path: "feature-graphic-1024x500.png", cap: "splitfree / Split bills. Settle on UPI." }];
const rows = files.map(({ path, cap }) => {
  const [w, h, type, depth, alpha] = String(run("identify", ["-format", "%w %h %[type] %z %A", `${OUT}/${path}`])).trim().split(" ");
  if (alpha !== "False" && alpha !== "Undefined") throw new Error(`${path} has alpha (${alpha})`);
  if (depth !== "8") throw new Error(`${path} is ${depth}-bit per channel`);
  if (!path.startsWith("feature") && Math.max(w, h) > 2 * Math.min(w, h)) throw new Error(`${path} breaks the 2:1 rule`);
  return { path, cap, size: `${w}x${h}`, kb: Math.round(statSync(`${OUT}/${path}`).size / 1024) };
});
// one row per form factor, the feature graphic underneath at a readable size
run("montage", [...rows.slice(0, -1).map((r) => `${OUT}/${r.path}`), "-tile", "6x", "-geometry", "270x480+12+12", "-background", "#2a0d1c", `${OUT}/_sheet.png`]);
run("convert", [`${OUT}/_sheet.png`, "(", `${OUT}/${rows.at(-1).path}`, "-resize", "1024x", "-bordercolor", "#2a0d1c", "-border", "12", ")", "-background", "#2a0d1c", "-gravity", "center", "-append", "-quality", "88", `${OUT}/contact-sheet.jpg`]);
run("rm", ["-f", `${OUT}/_sheet.png`]);

const table = (dir) => rows.filter((r) => r.path.startsWith(`${dir}/`)).map((r) => `| ${r.path} | ${r.size} | ${r.kb} KB | ${r.cap} |`).join("\n");
writeFileSync(`${OUT}/README.md`, `# Google Play listing set, 2026-10-27

Real captures of the app on the local stack, seeded with the website's fictional
cast (Kabir signed in; Singh, Luffy, Elon, Oggy; groups Catch-up and Groceries).
Framed on the site's night plum with captions in Anek Latin. All PNGs are 24-bit
(8 bits per channel, no alpha); every long side is at most twice the short side.

Rebuild: \`node splitfree-privacy/tools/store/build.mjs\` from \`SplitFree/splitfreeapp\`
(node 22, local stack up, vite dev on :5299). Unframed captures are in \`raw/\` (capture sizes, not for upload).
\`contact-sheet.jpg\` is a review sheet, not for upload. Uploading is a manual step.

## Phone (1080x1920)

| File | Pixels | File size | Caption |
| --- | --- | --- | --- |
${table("phone")}

## 7-inch tablet (1080x1920, captured at 600x960 dp, sw600dp)

| File | Pixels | File size | Caption |
| --- | --- | --- | --- |
${table("tablet-7in")}

## 10-inch tablet (1200x1920, captured at 800x1280 dp, sw720dp)

| File | Pixels | File size | Caption |
| --- | --- | --- | --- |
${table("tablet-10in")}

## Feature graphic

| File | Pixels | File size | Text |
| --- | --- | --- | --- |
| ${rows.at(-1).path} | ${rows.at(-1).size} | ${rows.at(-1).kb} KB | ${rows.at(-1).cap} |
`);
console.log("wrote", OUT);
