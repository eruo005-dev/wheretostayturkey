// Persona filter + amenity icon enhancement — wheretostayturkey.com
(function () {
  // SVG icons (16px viewBox 24x24, currentColor stroke)
  const ICONS = {
    pool: '<svg viewBox="0 0 24 24"><path d="M2 18c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M6 14V6a3 3 0 0 1 6 0v8M12 10h6"/></svg>',
    spa: '<svg viewBox="0 0 24 24"><path d="M12 22c-4-3-7-7-7-11a7 7 0 0 1 14 0c0 4-3 8-7 11Z"/><circle cx="12" cy="10" r="2"/></svg>',
    view: '<svg viewBox="0 0 24 24"><path d="M3 19l5-7 4 5 3-4 6 6"/><path d="M3 19h18"/><circle cx="17" cy="6" r="2"/></svg>',
    sea: '<svg viewBox="0 0 24 24"><path d="M2 16c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M2 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M2 8c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/></svg>',
    breakfast: '<svg viewBox="0 0 24 24"><path d="M5 11a3 3 0 0 0 0 6h12a4 4 0 0 0 0-8h-2"/><path d="M9 9V6"/><path d="M13 9V5"/><path d="M17 9V6"/></svg>',
    family: '<svg viewBox="0 0 24 24"><circle cx="9" cy="7" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M14 18v-1a3 3 0 0 1 3-3h1a3 3 0 0 1 3 3v1"/></svg>',
    boutique: '<svg viewBox="0 0 24 24"><path d="M5 8 12 3l7 5v12H5z"/><path d="M9 21V13h6v8"/></svg>',
    wifi: '<svg viewBox="0 0 24 24"><path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/></svg>',
    historic: '<svg viewBox="0 0 24 24"><path d="M3 21h18"/><path d="M5 21V11l7-6 7 6v10"/><path d="M10 21v-6h4v6"/></svg>',
    rooftop: '<svg viewBox="0 0 24 24"><path d="M2 21h20"/><path d="M4 21V10l8-6 8 6v11"/><circle cx="12" cy="14" r="1.5"/></svg>',
  };

  const KEYWORDS = [
    { test: /\b(pool|swimming|infinity)\b/i, key: "pool", label: "Pool" },
    { test: /\b(hammam|spa|sauna|steam)\b/i, key: "spa", label: "Spa" },
    { test: /\b(rooftop|terrace|panoramic)\b/i, key: "rooftop", label: "Rooftop" },
    { test: /\b(sea[- ]?view|seafront|beachfront|ocean|aegean|mediterranean|bosphorus)\b/i, key: "sea", label: "Sea view" },
    { test: /\b(breakfast|kahvaltı|kahvalti)\b/i, key: "breakfast", label: "Breakfast" },
    { test: /\b(famil(y|ies)|kid|child|playground)\b/i, key: "family", label: "Families" },
    { test: /\b(boutique|design[- ]led|hipster)\b/i, key: "boutique", label: "Boutique" },
    { test: /\b(historic|ottoman|mansion|konak|cave|byzantine)\b/i, key: "historic", label: "Historic" },
    { test: /\b(wi-?fi|co[- ]work)\b/i, key: "wifi", label: "Wi-Fi" },
  ];

  function injectAmenityIcons() {
    const cards = document.querySelectorAll(".hotel-card");
    cards.forEach((card) => {
      if (card.dataset.amenitiesInjected === "true") return;
      const txt = card.textContent.toLowerCase();
      const matches = KEYWORDS.filter((k) => k.test.test(txt)).slice(0, 4);
      if (!matches.length) return;
      const row = document.createElement("div");
      row.className = "amenity-row";
      row.innerHTML = matches
        .map((m) => `<span class="amenity-icon" title="${m.label}">${ICONS[m.key]}<span>${m.label}</span></span>`)
        .join("");
      const heading = card.querySelector("h3, h4, .hotel-name");
      if (heading && heading.parentNode) {
        heading.parentNode.insertBefore(row, heading.nextSibling);
      } else {
        card.appendChild(row);
      }
      card.dataset.amenitiesInjected = "true";
    });
  }

  function applyFilter(filter) {
    const cards = document.querySelectorAll(".hotel-card");
    cards.forEach((card) => {
      let show = true;
      if (filter && filter !== "all") {
        const tier = (card.dataset.tier || "").toLowerCase();
        const bestFor = (card.dataset.bestfor || "").toLowerCase();
        if (filter === "luxury" || filter === "budget") {
          show = tier === filter;
        } else {
          show = bestFor.split(",").map((t) => t.trim()).includes(filter);
        }
      }
      card.dataset.hidden = show ? "false" : "true";
    });
  }

  function setActiveChip(filter) {
    document.querySelectorAll(".persona-chip").forEach((chip) => {
      chip.dataset.active = chip.dataset.filter === filter ? "true" : "false";
    });
  }

  function initFilters() {
    const bar = document.querySelector(".persona-filter");
    if (!bar) return;
    const initialFilter = (location.hash || "").replace("#", "") || "all";
    setActiveChip(initialFilter);
    applyFilter(initialFilter);
    bar.addEventListener("click", (e) => {
      const chip = e.target.closest(".persona-chip");
      if (!chip) return;
      const f = chip.dataset.filter;
      setActiveChip(f);
      applyFilter(f);
      if (f === "all") history.replaceState(null, "", location.pathname);
      else history.replaceState(null, "", "#" + f);
    });
    window.addEventListener("hashchange", () => {
      const f = (location.hash || "").replace("#", "") || "all";
      setActiveChip(f);
      applyFilter(f);
    });
  }

  function init() {
    injectAmenityIcons();
    initFilters();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
