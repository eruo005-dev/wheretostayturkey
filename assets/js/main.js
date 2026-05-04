// wheretostayturkey.com — lightweight JS: email capture, exit intent, sticky CTA show/hide.
(function () {
  // ---- Email capture submit (inline + modal) ----
  function handleLeadSubmit(form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const email = form.querySelector('input[type="email"]').value.trim();
      const btn = form.querySelector("button");
      const originalText = btn.textContent;
      const endpoint = form.getAttribute("action");
      if (!email) return;
      btn.textContent = "Sending…";
      btn.disabled = true;
      try {
        if (endpoint && !endpoint.includes("YOUR_FORM_ID")) {
          if (endpoint.includes("mailerlite.com")) {
            // MailerLite expects form-encoded data with fields[email].
            // Cross-origin POST returns opaque (no-cors); fire-and-forget.
            const body = new URLSearchParams();
            body.append("fields[email]", email);
            body.append("ml-submit", "1");
            body.append("anticsrf", "true");
            await fetch(endpoint, {
              method: "POST",
              mode: "no-cors",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: body.toString(),
            });
          } else {
            await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify({ email, source: form.dataset.source || "inline", page: location.pathname }),
            });
          }
        }
        // Send users straight to the thank-you page where the itinerary lives
        // plus the highest-converting affiliate upsells on the site.
        window.location.href = "/thank-you/?src=" + encodeURIComponent(form.dataset.source || "inline");
      } catch (err) {
        btn.textContent = originalText;
        btn.disabled = false;
        alert("Something went wrong. Try again in a moment.");
      }
    });
  }
  document.querySelectorAll("form.lead-form").forEach(handleLeadSubmit);

  // ---- Exit-intent modal (desktop only) ----
  const modal = document.querySelector(".modal-backdrop");
  if (modal) {
    const KEY = "ws_seen_popup";
    const seen = sessionStorage.getItem(KEY) || localStorage.getItem(KEY);
    if (!seen) {
      document.addEventListener("mouseout", function (e) {
        if (!e.toElement && !e.relatedTarget && e.clientY < 10) {
          modal.classList.add("is-open");
          try { sessionStorage.setItem(KEY, "1"); } catch (_) {}
        }
      });
      // Mobile fallback: show after 45 seconds
      setTimeout(function () {
        if (!sessionStorage.getItem(KEY)) {
          modal.classList.add("is-open");
          try { sessionStorage.setItem(KEY, "1"); } catch (_) {}
        }
      }, 45000);
    }
    modal.addEventListener("click", function (e) {
      if (e.target === modal || e.target.classList.contains("modal-close")) {
        modal.classList.remove("is-open");
      }
    });
  }

  // ---- Smooth-anchor offset for sticky nav ----
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", function (e) {
      const id = this.getAttribute("href").slice(1);
      const el = document.getElementById(id);
      if (el) {
        e.preventDefault();
        const y = el.getBoundingClientRect().top + window.scrollY - 72;
        window.scrollTo({ top: y, behavior: "smooth" });
      }
    });
  });
})();

// Scroll-reveal: add .is-visible when .reveal elements enter viewport
(function () {
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-visible"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          io.unobserve(e.target);
        }
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
})();

// ---- Cookie consent ----
(function () {
  const KEY = "ws_consent";
  const banner = document.getElementById("cookie-banner");
  if (!banner) return;

  function apply(choice) {
    try { localStorage.setItem(KEY, choice); } catch (_) {}
    banner.hidden = true;
    if (choice === "accept-all") {
      // Enable advanced analytics if configured (Google Analytics, AdSense).
      // Plausible is cookieless and doesn't need consent, but we honor user choice anyway.
      if (window._waitingGA && typeof window._waitingGA === "function") window._waitingGA();
    }
  }

  const existing = (function () {
    try { return localStorage.getItem(KEY); } catch (_) { return null; }
  })();

  if (existing) {
    apply(existing);
    return;
  }

  banner.hidden = false;
  banner.querySelectorAll("[data-cookie]").forEach(function (b) {
    b.addEventListener("click", function () { apply(b.dataset.cookie); });
  });
})();

// ---- Anchor-copy buttons on h2s ----
// Walks long-form h2s, assigns slug ids if missing, appends a "#" button
// that copies the deep-link to the clipboard. Skips visually-hidden h2s,
// lead-magnet headings, card headings, and anything inside the nav/footer/modal.
(function () {
  function slugify(s) {
    return String(s).toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  }
  const SKIP = /(?:^|\s)(visually-hidden|lead-magnet-h|card-h|footer-col-h)(?:\s|$)/;
  const heads = document.querySelectorAll("section.container h2, article h2, .prose h2");
  const used = new Set();
  let toast;
  function getToast() {
    if (toast) return toast;
    toast = document.createElement("div");
    toast.className = "anchor-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
    return toast;
  }
  function flashToast(msg) {
    const t = getToast();
    t.textContent = msg;
    t.classList.add("is-on");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("is-on"), 1600);
  }
  heads.forEach((h) => {
    if (h.className && SKIP.test(h.className)) return;
    if (h.closest(".lead-magnet, .nav, .footer, .modal-backdrop, .cookie-banner, .hero-home, .hero")) return;
    let id = h.id;
    if (!id) {
      id = slugify(h.textContent || "");
      if (!id) return;
      let suffix = 2;
      while (used.has(id) || document.getElementById(id)) {
        id = slugify(h.textContent || "") + "-" + suffix++;
      }
      h.id = id;
    }
    used.add(id);
    if (h.querySelector(".anchor-link")) return;
    const a = document.createElement("a");
    a.className = "anchor-link";
    a.href = "#" + id;
    a.setAttribute("aria-label", "Copy link to this section");
    a.textContent = "#";
    a.addEventListener("click", function (e) {
      e.preventDefault();
      const url = location.origin + location.pathname + "#" + id;
      const done = () => flashToast("Link copied");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, () => {
          history.replaceState(null, "", "#" + id);
          flashToast("Link updated");
        });
      } else {
        history.replaceState(null, "", "#" + id);
        flashToast("Link updated");
      }
    });
    h.appendChild(a);
  });
})();

// ---- Mouse-driven 3D scene parallax on homepage hero ----
(function () {
  const scene = document.getElementById("scene-3d");
  if (!scene) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let raf = 0;
  let targetX = 0, targetY = 0;
  let currentX = 0, currentY = 0;
  const hero = scene.parentElement;

  function onMove(e) {
    const r = hero.getBoundingClientRect();
    // -1 to 1 range, centered on hero
    targetX = ((e.clientX - r.left) / r.width - 0.5) * 2;
    targetY = ((e.clientY - r.top) / r.height - 0.5) * 2;
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick() {
    // smooth interpolation toward target (lerp)
    currentX += (targetX - currentX) * 0.08;
    currentY += (targetY - currentY) * 0.08;
    scene.style.setProperty("--mx", currentX.toFixed(3));
    scene.style.setProperty("--my", currentY.toFixed(3));
    if (Math.abs(targetX - currentX) > 0.001 || Math.abs(targetY - currentY) > 0.001) {
      raf = requestAnimationFrame(tick);
    } else {
      raf = 0;
    }
  }
  hero.addEventListener("mousemove", onMove, { passive: true });
  hero.addEventListener("mouseleave", function () {
    targetX = 0; targetY = 0;
    if (!raf) raf = requestAnimationFrame(tick);
  }, { passive: true });
})();
