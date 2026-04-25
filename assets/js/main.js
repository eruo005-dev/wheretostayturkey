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
          await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ email, source: form.dataset.source || "inline", page: location.pathname }),
          });
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
