// Shared by the capture and recording scripts: drives the real app (vite dev on
// :5299, pointed at the LOCAL stack) signed in as the site's demo user.
//   cd ../SplitFree/splitfreeapp && VITE_SUPABASE_URL=http://127.0.0.1:54321 \
//     VITE_SUPABASE_PUBLISHABLE_KEY=<local anon key> npm run dev -- --port 5299
import { execFileSync } from "node:child_process";

export const APP = "/home/justutsav/projects/SplitFree/SplitFree/splitfreeapp";
export const BASE = "http://localhost:5299";
const { default: puppeteer } = await import(`${APP}/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js`);
const { createClient } = await import(`${APP}/node_modules/@supabase/supabase-js/dist/index.mjs`).catch(() => import(`${APP}/node_modules/@supabase/supabase-js/dist/module/index.js`));
const { db, url: supabaseUrl } = await import(`${APP}/scripts/seed-demo.mjs`);
const { PASSWORD, SITE_EMAIL } = await import("./seed-site.mjs");
export { db };

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A current phone: 412 x 915 CSS px is a 20:9 screen (Pixel 7 / Galaxy S class).
export const W = 412, H = 915;

const { ANON_KEY } = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { cwd: APP, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));

export async function mintSession() {
  const written = {};
  const client = createClient(supabaseUrl, ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
      storage: { getItem: (k) => written[k] ?? null, setItem: (k, v) => { written[k] = v; }, removeItem: (k) => { delete written[k]; } } },
  });
  const { error } = await client.auth.signInWithPassword({ email: SITE_EMAIL, password: PASSWORD });
  if (error) throw error;
  return written;
}

export async function launch(extraArgs = []) {
  return puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--hide-scrollbars", "--force-device-scale-factor=1", ...extraArgs] });
}

/**
 * A signed-in page. `zoom` renders the app at 2x inside a 1x viewport, which is
 * how the screencast gets a sharp picture (it records CSS pixels). `tour`
 * names one CoachMarks id (e.g. "home-v2") that is allowed to run.
 */
export async function appPage(browser, session, { zoom = false, seenAt = null, extra, tour = null } = {}) {
  const page = await browser.newPage();
  if (zoom) await page.setViewport({ width: W * 2, height: H * 2, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument((entries, zoom, seenAt, tour) => {
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    localStorage.setItem("sf.avatar-nudge-at", String(Date.now() + 1e12));
    localStorage.setItem("sf.onboarded", "true");
    localStorage.setItem("push_enabled", "true");
    localStorage.setItem("hf_settle_celebration", "off");
    if (seenAt) localStorage.setItem("notifications_seen_at", seenAt);
    // Notifications on, as on a phone that allowed them. Web push itself is
    // stubbed out so nothing registers with Firebase from a capture run.
    try { Object.defineProperty(Notification, "permission", { get: () => "granted" }); } catch {}
    if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.reject(new Error("capture"));
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k) {
      // every tour is done, except the one a clip shows (`tour`: its coach id)
      if (String(k).startsWith("coach_") && k !== `coach_${tour}`) return "done";
      if (k === "theme") return "light";
      return get.call(this, k);
    };
    // Android WebView renders system-ui as Roboto; Linux Chrome would fall back to DejaVu.
    document.addEventListener("DOMContentLoaded", () => {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=block";
      document.head.appendChild(l);
      const s = document.createElement("style");
      s.textContent = ":root{--font-sans:Roboto,sans-serif!important} body,[data-sonner-toaster],[data-sonner-toast]{font-family:Roboto,sans-serif!important}";
      document.head.appendChild(s);
      if (zoom) document.documentElement.style.zoom = "2";
    });
    // CoachMarks positions its spotlight and card from getBoundingClientRect and
    // window.innerWidth/innerHeight, which report viewport px, then lays them out
    // in CSS px that html zoom doubles again: the card runs off the right edge and
    // the spotlight off the bottom. While the tour is up, hand it zoomed-space
    // numbers instead; once it is done (real storage says so) nothing is patched.
    if (zoom && tour) {
      const touring = () => get.call(localStorage, `coach_${tour}`) !== "done";
      const z = () => parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      for (const k of ["innerWidth", "innerHeight"]) {
        const d = Object.getOwnPropertyDescriptor(window, k) ?? Object.getOwnPropertyDescriptor(Window.prototype, k);
        Object.defineProperty(window, k, { configurable: true, get: () => (touring() ? d.get.call(window) / z() : d.get.call(window)) });
      }
      const rect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () {
        const r = rect.call(this);
        if (!touring() || !this.hasAttribute?.("data-coach")) return r;
        const s = z();
        return new DOMRect(r.x / s, r.y / s, r.width / s, r.height / s);
      };
    }
  }, session, zoom, seenAt, tour);
  if (extra) await extra(page);
  return page;
}

/** Tap the first element whose text starts with `text`, with a real pointer. */
export async function tap(page, text, sel = "button, a, [role=tab], [role=button]") {
  const h = await page.evaluateHandle((text, sel) =>
    [...document.querySelectorAll(sel)].find((x) => x.textContent.trim().toLowerCase().startsWith(text.toLowerCase()) && x.getBoundingClientRect().width > 0) ?? null, text, sel);
  const el = h.asElement();
  if (!el) { console.log("    miss:", text); return false; }
  await el.click();
  return true;
}

/** Visible buttons/links, for finding the next thing to tap. */
export const listButtons = (page) => page.evaluate(() =>
  [...document.querySelectorAll("button, a, [role=button], [role=tab], input")]
    .filter((e) => e.getBoundingClientRect().width > 0)
    .map((e) => `${e.tagName.toLowerCase()} "${(e.textContent || e.getAttribute("aria-label") || e.placeholder || "").trim().slice(0, 40)}"`).join("\n"));

// The app's slide-to-confirm knobs answer pointer events, not mouse or touch.
// `steps` x `ms` sets the drag's pace; the default is a quick thumb.
export async function slide(page, label, { steps = 24, ms = 26 } = {}) {
  return page.evaluate(async (label, steps, ms) => {
    const el = [...document.querySelectorAll(`[aria-label^="${label}"]`)].filter((e) => e.getBoundingClientRect().width > 0).pop();
    if (!el) return "no slider " + label;
    const r = el.getBoundingClientRect();
    let track = el.parentElement;
    while (track && track.getBoundingClientRect().width < 200) track = track.parentElement;
    const tr = track.getBoundingClientRect();
    const y = r.top + r.height / 2;
    const fire = (type, x) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 7, pointerType: "touch", isPrimary: true }));
    const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
    fire("pointerdown", r.left + r.width / 2);
    // Under html zoom the knob reads clientX deltas against a CSS-px track, so it
    // runs z times ahead of the pointer; send deltas / z so it lands on the last step.
    const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    const dist = (tr.right - r.right) / z;
    for (let i = 1; i <= steps + 4; i++) { await wait(ms); fire("pointermove", r.left + r.width / 2 + dist * Math.min(1, i / steps)); }
    await wait(80);
    fire("pointerup", r.left + r.width / 2 + dist);
    return "slid";
  }, label, steps, ms);
}

/**
 * Reminders go to the send-push edge function, which the local stack does not serve.
 * `patches` maps the end of a source path (e.g. "/_authenticated/home.tsx") to a
 * function that rewrites the module as vite serves it; both share one handler,
 * since a request can only be answered once.
 */
export async function fakePush(page, patches = {}) {
  await page.setRequestInterception(true);
  page.on("request", async (r) => {
    if (r.url().includes("/functions/v1/send-push")) {
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-region", "access-control-allow-methods": "POST, OPTIONS" };
      if (r.method() === "OPTIONS") return r.respond({ status: 204, headers: cors });
      return r.respond({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ sent: 1 }) });
    }
    const fix = Object.entries(patches).find(([path]) => new URL(r.url()).pathname.endsWith(path));
    if (fix) {
      const res = await fetch(r.url());
      return r.respond({ status: res.status, contentType: "text/javascript", body: fix[1](await res.text()) });
    }
    r.continue();
  });
}

// What the scan clip leaves behind: a ₹340 shop payment waiting under Shop
// payments. Seeded into the app's own write-ahead buffer (lib/merchant-pay.ts),
// the same place a payment made offline waits; the app flushes it to the server
// on mount. The local stack needs `grant select, insert, update, delete on
// public.merchant_payments to authenticated` for that (added by hand
// 2026-10-27; without it the row never syncs and home keeps counting it).
export const SHOP_QR = "upi://pay?pa=scan-at-your-own@risk&pn=Scan%20at%20your%20own%20risk&cu=INR";
// What the standee in the scan clip's camera actually encodes, so a visitor who
// scans it off the site lands on the app (see decodeAs in record-clips.mjs).
export const PLAY_URL = "https://play.google.com/store/apps/details?id=app.splitfree.client";
export const seedPendingShop = (p) => p.evaluateOnNewDocument((qr) => {
  if (sessionStorage.getItem("clip.pending-seeded")) return; // once: Split it removes it
  sessionStorage.setItem("clip.pending-seeded", "1");
  localStorage.setItem("sf.pending-merchant-payments", JSON.stringify([{
    client_id: "0b9c3c39-5e0e-4d4e-9a57-3a0f3d6c3401", paid_at: new Date(Date.now() - 120000).toISOString(),
    amount: 340, note: null, payee_vpa: "scan-at-your-own@risk", payee_name: "Scan at your own risk",
    merchant_code: null, payload: qr, upi_package: "com.google.android.apps.nbu.paisa.user",
  }]));
}, SHOP_QR);
