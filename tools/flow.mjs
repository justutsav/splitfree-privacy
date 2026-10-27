// Ad-hoc: run a list of steps on the signed-in app, screenshot after each.
//   node tools/flow.mjs <outDir> /home "tap:Paid all" "wait:1500" "shot" ...
// Steps: tap:<text>  tapsel:<css>  type:<css>|<text>  wait:<ms>  shot  list  eval:<js>
import { launch, appPage, mintSession, sleep, listButtons, tap, BASE } from "./app-lib.mjs";
import { resolve } from "node:path";
const [out, path, ...steps] = process.argv.slice(2);
const session = await mintSession();
const browser = await launch((process.env.CAMERA ? [`--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream`, `--use-file-for-fake-video-capture=${process.env.CAMERA}`] : []));
let n = 0;
// The app's slide-to-confirm knobs answer pointer events, not mouse or touch.
export async function slide(label) {
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
  const dist = tr.right - r.right;
  for (let i = 1; i <= 28; i++) { await wait(26); fire("pointermove", r.left + r.width / 2 + dist * Math.min(1, i / 24)); }
  await wait(80);
  fire("pointerup", tr.right - 6);
  return "slid";
}
try {
  const page = await appPage(browser, session);
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    if (r.url().includes("/functions/v1/send-push")) return r.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ sent: 1 }) });
    r.continue();
  });
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2" });
  await sleep(2000);
  for (const s of steps) {
    const [k, ...rest] = s.split(":"); const v = rest.join(":");
    if (k === "tap") await tap(page, v);
    else if (k === "tapsel") await (await page.$(v))?.click();
    else if (k === "type") { const [sel, text] = v.split("|"); const el = await page.$(sel); await el.click(); await el.type(text, { delay: 40 }); }
    else if (k === "wait") await sleep(+v);
    else if (k === "shot") { await page.screenshot({ path: resolve(out, `f${++n}.png`) }); console.log("shot", n, page.url().replace(BASE, "")); }
    else if (k === "list") console.log(await listButtons(page));
    else if (k === "slide") await page.evaluate(slide, v);
    else if (k === "eval") console.log(await page.evaluate(v));
  }
} finally { await browser.close(); }
