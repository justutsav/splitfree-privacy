// Everything on the page that is not the 3D stage: the opening, the nav, the
// scroll position of the story. The stage listens for sf:scroll; without WebGL
// (or without stage.js at all) the flat phone in .phone-dom plays the same clips.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  // stage.js is a module and loads after this file, so the latest of each event
  // is kept on window.sfState for it to read on arrival.
  const emit = (name, detail) => {
    (window.sfState ??= {})[name] = detail;
    document.dispatchEvent(new CustomEvent(name, { detail }));
  };

  // ------------------------------------------------ smooth scrolling (Lenis)
  // Smooths the wheel and trackpad; touch keeps the platform's own scrolling.
  // smoothTo() is every scroll the page makes by itself.
  const lenis = !reduced && window.Lenis ? new window.Lenis({ lerp: 0.11 }) : null;
  if (lenis) {
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }
  const smoothTo = (top, { duration = 1.1, lock = false, done } = {}) => {
    if (lenis) return lenis.scrollTo(top, { duration, lock, force: true, onComplete: done });
    scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
    if (done) setTimeout(done, reduced ? 0 : duration * 1000);
  };
  // in-page links glide as well
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    const hash = a?.getAttribute("href");
    const target = hash && hash.length > 1 ? document.querySelector(hash) : null;
    if (!target || !lenis) return;
    e.preventDefault();
    smoothTo(target.getBoundingClientRect().top + scrollY);
    history.pushState(null, "", hash);
  });

  // -------------------------------------------------------------- opening
  const loader = $("#loader");
  const coinBox = $("#loader-coin");
  const coin = $(".coin3d", coinBox);
  const t0 = performance.now();
  const ready = Promise.all([
    document.fonts?.ready ?? Promise.resolve(),
    new Promise((ok) => {
      if (window.sfState?.["sf:ready"]) ok();
      document.addEventListener("sf:ready", ok, { once: true });
      document.addEventListener("sf:nogl", ok, { once: true });
    }),
  ]);
  const cap = new Promise((ok) => setTimeout(ok, 4500));
  const ease = { out: (x) => 1 - (1 - x) ** 3, inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2), in: (x) => x * x * x };
  const tween = (ms, step) => new Promise((done) => {
    const s = performance.now();
    const f = (now) => { const e = clamp((now - s) / ms); step(e); e < 1 ? requestAnimationFrame(f) : done(); };
    requestAnimationFrame(f);
  });
  let spin = 0; // degrees, carried between phases so the coin never jumps
  let idle = true;
  // The trail shows only while the coin is going up, as strong as it is fast.
  let coinY = null, coinAt = 0, rise = 0;
  const place = (y, s, ry, rx = 8, trail = true) => {
    const now = performance.now();
    const up = coinY === null ? 0 : (coinY - y) / Math.max(1, now - coinAt) * 1000; // px/s, up is positive
    coinY = y; coinAt = now;
    rise += ((trail ? clamp(up / (coinBox.offsetWidth * 1.6)) : 0) - rise) * 0.3;
    coinBox.style.setProperty("--v", rise.toFixed(3));
    coinBox.style.transform = `translateY(${y}px) scale(${s})`;
    coin.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
  };
  async function opening() {
    if (!loader) return;
    document.documentElement.classList.add("is-opening");
    if (reduced) {
      await Promise.race([ready, cap]);
      loader.style.transition = "opacity 300ms";
      loader.style.opacity = "0";
      setTimeout(finish, 320);
      return;
    }
    const c = coinBox.offsetWidth;
    // The full opening once per visit; after that, the short form.
    let quick = false;
    try { quick = sessionStorage.getItem("sf.opened") === "1"; sessionStorage.setItem("sf.opened", "1"); } catch {}
    if (quick) loader.classList.add("is-quick");
    await new Promise((ok) => setTimeout(ok, quick ? 120 : 720)); // the word writes itself first
    loader.classList.add("has-coin");
    coinBox.style.opacity = "1";
    // in: rises from under the word, three turns, settles facing us
    await tween(quick ? 500 : 900, (e) => { spin = (quick ? 720 : 1080) * ease.out(e); place(c * 1.4 * (1 - ease.out(e)), 1, spin, 22 - 14 * e); });
    // waiting: keeps turning slowly, the way a coin does on a table
    // floats on a slow wave while it waits
    let bobY = 0, bobX = 8;
    const wait = (now) => {
      if (!idle) return;
      const w = (now - t0) / 1000;
      spin += 1.2;
      bobY = Math.sin(w * 2.4) * c * 0.08;
      bobX = 8 + Math.sin(w * 1.9) * 10;
      place(bobY, 1, spin, bobX);
      requestAnimationFrame(wait);
    };
    requestAnimationFrame(wait);
    await Promise.race([Promise.all([ready, new Promise((ok) => setTimeout(ok, Math.max(0, (quick ? 700 : 1900) - (performance.now() - t0))))]), cap]);
    idle = false;
    loader.classList.add("is-leaving");
    // out: the coin turns over, and its other side is the site
    const from = spin, to = Math.ceil(spin / 360) * 360 + 180;
    const R = c / 2;
    const S = (Math.hypot(innerWidth, innerHeight) / 2 + 60) / (R * 0.94);
    // the hole is the inside of the coin's rim, which is 6% of its width
    const IN = 0.88;
    const hole = (rx, ry) => { loader.style.setProperty("--rx", `${Math.max(0.01, rx)}px`); loader.style.setProperty("--ry", `${Math.max(0.01, ry)}px`); };
    await tween(520, (e) => {
      const a = from + (to - from) * ease.inOut(e);
      const s = 1 + 0.3 * e;
      place(bobY * (1 - e), s, a, bobX * (1 - e), false);
      // only the last quarter turn opens it; earlier back-facing moments of the
      // spin would open and shut the hole in a flicker
      const open = a >= to - 90;
      coin.classList.toggle("is-open", open);
      hole(open ? R * IN * s * -Math.cos((a * Math.PI) / 180) : 0, R * IN * s);
    });
    // "split" and "free" slide out from behind the phone as it opens (site.css)
    document.documentElement.classList.add("is-revealing");
    await tween(760, (e) => {
      const s = 1.3 + (S - 1.3) * ease.in(e);
      place(0, s, to, 0, false);
      hole(R * IN * s, R * IN * s);
    });
    finish();
  }
  function finish() {
    loader?.remove();
    document.documentElement.classList.remove("is-opening");
    emit("sf:opened", {});
  }
  opening();

  // ------------------------------------------------------------ entrances
  const groups = [
    [".receipt", ".receipt-title, .receipt > p, .receipt-items tr, .tear"],
    [".end", ".faq-title, .faq-list details, .get-title, .get-line, .get .btn, .get-qr"],
  ];
  for (const [root, parts] of groups) {
    for (const r of $$(root)) $$(parts, r).forEach((el, i) => { el.dataset.reveal = ""; el.style.setProperty("--i", Math.min(i, 8)); });
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.05 });
  $$("[data-reveal]").forEach((el) => io.observe(el));

  // ------------------------------------------- nav: hides going down, back going up
  const nav = $("#nav");
  const grounds = $$("[data-ground]");
  let lastY = scrollY;
  function navFrame() {
    const y = scrollY;
    if (y > lastY + 6 && y > 140 && !nav.contains(document.activeElement)) nav.classList.add("is-hidden");
    else if (y < lastY - 6 || y < 140) nav.classList.remove("is-hidden");
    lastY = y;
    nav.classList.toggle("is-solid", y > 24);
    // which ground is under the nav, and under the scrollbar's middle
    const at = (py) => grounds.find((g) => { const r = g.getBoundingClientRect(); return r.top <= py && r.bottom > py; })?.dataset.ground ?? "light";
    nav.dataset.ground = at(30);
    document.documentElement.dataset.ground = at(innerHeight / 2);
  }
  nav.addEventListener("focusin", () => nav.classList.remove("is-hidden"));

  // ------------------------------------------------------------- story
  const hero = $(".hero");
  const mark = $(".wordmark");
  const copy = $(".hero-copy");
  const narrow = matchMedia("(max-width: 899px)");
  const phoneLayout = matchMedia("(max-width: 599px), (max-aspect-ratio: 21/20)"); // as site.css and stage.js
  const story = $("#story");
  const chapters = $$(".chapter");
  const steps = $$(".story-steps li");
  const stage = $("#stage");
  let ch = -2;
  function storyFrame() {
    const vh = innerHeight;
    const heroP = clamp(scrollY / Math.max(1, hero.offsetHeight));
    const fade = (el, speed) => {
      const o = clamp(1 - heroP * speed);
      el.style.opacity = String(o);
      // On a phone the copy stays where it is while it fades: carried up with the
      // page it would cross the phone, which grows into its story size behind it.
      const y = el === copy && phoneLayout.matches ? scrollY - heroP * 30 : -heroP * 60;
      el.style.transform = el === copy ? `translate(-50%, ${y}px)` : narrow.matches ? `translateY(${y}px)` : `translateY(calc(-50% + ${y}px))`;
      el.style.visibility = o > 0 ? "" : "hidden";
    };
    fade(mark, 2.2);
    fade(copy, 3.4);
    const r = story.getBoundingClientRect();
    const range = Math.max(1, r.height - vh);
    const p = clamp(-r.top / range);
    // -1 while the hero still owns most of the screen
    const next = heroP < 0.55 ? -1 : Math.min(chapters.length - 1, Math.floor(p * chapters.length));
    if (next !== ch) {
      ch = next;
      chapters.forEach((a, i) => { a.classList.toggle("is-on", i === ch); a.classList.toggle("is-past", i < ch); });
      steps.forEach((s, i) => s.classList.toggle("is-on", i === ch));
      stage.dataset.ch = String(ch);
      flat(ch);
    }
    emit("sf:scroll", { hero: heroP, story: p, ch, out: clamp((r.bottom - vh) / vh * -1) });
  }

  // No WebGL: the flat phone plays the chapter's clip.
  const CLIPS = ["scan", "add", "remind", "settle"];
  // as stage.js picks (tools/video-variants.sh): VP9 or H.264, the 540 cut on a phone
  const clipExt = document.createElement("video").canPlayType('video/webm; codecs="vp9"') ? "webm" : "mp4";
  const clipCut = matchMedia("(min-width: 600px) and (min-aspect-ratio: 21/20)").matches ? "" : "-540";
  const dom = $("#phone-dom");
  const domVideo = $("video", dom);
  function flat(i) {
    if (!document.documentElement.classList.contains("no-webgl")) return;
    if (i < 0) { dom.classList.remove("has-video"); domVideo.pause(); return; }
    domVideo.poster = `/assets/video/${CLIPS[i]}-poster.jpg`;
    domVideo.src = `/assets/video/${CLIPS[i]}${clipCut}.${clipExt}`;
    dom.classList.add("has-video");
    if (!reduced) domVideo.play().catch(() => {});
  }
  document.addEventListener("sf:nogl", () => flat(ch));
  domVideo.addEventListener("ended", () => {
    const i = ch, endedAt = performance.now();
    emit("sf:clipend", { ch: i });
    setTimeout(() => {
      const adv = window.sfState?.["sf:advance"];
      if (adv?.ch === i && adv.at >= endedAt) return; // moving on instead
      if (domVideo.paused) { domVideo.currentTime = 0; domVideo.play().catch(() => {}); }
    }, 1000);
  });

  // The first time through, a chapter whose clip has ended moves on to the
  // next by itself if nobody touches the page for a second, instead of
  // replaying. Once per chapter: after that the visitor is in charge.
  const advanced = new Set();
  let touchedAt = 0;
  for (const ev of ["wheel", "touchstart", "keydown", "pointerdown"]) addEventListener(ev, () => { touchedAt = performance.now(); }, { passive: true });
  function goTo(i) {
    const r = story.getBoundingClientRect();
    const top = scrollY + r.top + (r.height - innerHeight) * ((i + 0.1) / chapters.length);
    smoothTo(top);
  }
  document.addEventListener("sf:clipend", (e) => {
    const i = e.detail.ch;
    if (i !== ch || i >= chapters.length - 1 || advanced.has(i)) return;
    const endedAt = performance.now();
    setTimeout(() => {
      if (ch !== i || touchedAt > endedAt || document.hidden) return;
      advanced.add(i);
      emit("sf:advance", { ch: i, at: performance.now() }); // before the 1 s replay fires
      goTo(i + 1);
    }, 900);
  });

  // After the last chapter's clip has played once, a nudge to keep going down.
  // With reduced motion the clips do not play, so it comes a moment after the
  // last chapter opens instead.
  const nextCue = $(".story-next");
  const last = chapters.length - 1;
  document.addEventListener("sf:clipend", (e) => { if (e.detail.ch === last) nextCue?.classList.add("is-on"); });
  if (reduced) document.addEventListener("sf:scroll", (e) => { if (e.detail.ch === last) setTimeout(() => nextCue?.classList.add("is-on"), 1500); });

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; navFrame(); storyFrame(); });
  };
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  navFrame();
  storyFrame();

  // The footer's coins magnify under the pointer like the Mac dock: the one
  // under it most, its neighbours less, and the row spreads to make room.
  const dock = $(".foot-coins");
  if (dock && !reduced) {
    const coins = $$("img", dock);
    let mx = null, raf = 0;
    const apply = () => {
      raf = 0;
      for (const c of coins) {
        const r = c.getBoundingClientRect();
        const d = mx === null ? 1e4 : mx - (r.left + r.width / 2);
        c.style.setProperty("--s", (1 + 0.9 * Math.exp(-(d * d) / 7200)).toFixed(3));
      }
    };
    dock.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return; // a mouse or pen hovers; a finger scrolls
      mx = e.clientX;
      raf ||= requestAnimationFrame(apply);
    });
    dock.addEventListener("pointerleave", () => { mx = null; raf ||= requestAnimationFrame(apply); });
    // a click flips the coin, with its sound
    dock.addEventListener("click", (e) => {
      const c = e.target.closest("img");
      if (!c) return;
      window.sfCoinSound?.();
      c.classList.remove("flip"); void c.offsetWidth; c.classList.add("flip");
    });
  }

  // One answer open at a time, where the browser does not do it from name=.
  $$(".faq-list details").forEach((d) => d.addEventListener("toggle", () => {
    if (d.open) $$(".faq-list details").forEach((o) => { if (o !== d) o.open = false; });
  }));
})();
