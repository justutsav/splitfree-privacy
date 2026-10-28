// The policy page: parts rise in as they arrive, and the contents list marks
// the section being read. Without this file the page is complete and static.
(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const parts = document.querySelectorAll(".policy-bar > *, .policy-head > *, .glance-title, .glance-items tr, .toc a, .policy-text > *, .policy-fig");
  parts.forEach((el, i) => { el.dataset.reveal = ""; el.style.setProperty("--i", i % 4); });
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { rootMargin: "0px 0px -6% 0px" });
  parts.forEach((el) => io.observe(el));

  const links = [...document.querySelectorAll(".toc a")];
  const heads = links.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  function spy() {
    let current = heads[0];
    for (const h of heads) if (h.getBoundingClientRect().top < innerHeight * 0.3) current = h;
    links.forEach((a) => a.toggleAttribute("aria-current", a.getAttribute("href") === `#${current.id}`));
  }
  addEventListener("scroll", spy, { passive: true });
  spy();
  if (reduced) parts.forEach((el) => el.classList.add("in"));

  // smooth wheel scrolling, as on the home page; the contents links glide too
  const lenis = !reduced && window.Lenis ? new window.Lenis({ lerp: 0.11 }) : null;
  if (!lenis) return;
  const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  document.addEventListener("click", (e) => {
    const hash = e.target.closest('a[href^="#"]')?.getAttribute("href");
    const target = hash && hash.length > 1 ? document.querySelector(hash) : null;
    if (!target) return;
    e.preventDefault();
    // offsetTop, not the box: a heading still rising in is drawn lower than it sits
    let y = 0;
    for (let n = target; n; n = n.offsetParent) y += n.offsetTop;
    lenis.scrollTo(y - 24, { duration: 1.1 }); // 24: the headings' scroll-margin-top
    history.pushState(null, "", hash);
  });
})();
