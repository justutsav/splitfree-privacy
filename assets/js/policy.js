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
})();
