// wheretostayturkey.com - central config

// Travelpayouts shared credentials (single account: Wheretostayturkey site)
// Marker = TP account ID, trs = website-source ID. Used by tp.media redirect URLs.
// Account dashboard at https://app.travelpayouts.com/dashboard?source=523094
const tp = { marker: "722878", trs: "523094" };

// Travelpayouts program registry — every program approved on this account
// where we have at least the campaign_id.
//
// `campaignId` is required; `partnerId` (the `p=` parameter on tp.media) is
// what TP uses to actually credit the click. When BOTH are populated the
// build emits a working tp.media wrapper. When only campaignId is known,
// the wrapper falls back to the bare partner URL until partnerId is filled
// (run scripts/fetch-tp-partners.js or copy from the TP "Generate links"
// dialog: open https://app.travelpayouts.com/tools/links/recent → pick the
// program → "Show full link" → the `p=` value).
const tpPrograms = {
  klook:          { campaignId: "137", partnerId: "4110" },
  kiwitaxi:       { campaignId: "1",   partnerId: "647" },
  localrent:      { campaignId: "87",  partnerId: "2043" },
  // Below: campaignId confirmed via TP dashboard "Ready-made by brands";
  // partnerId pending. The link builder skips tp.media wrapping until
  // partnerId is filled, so leaving them empty is safe.
  tiqets:         { campaignId: "89",  partnerId: "" },
  airalo:         { campaignId: "541", partnerId: "" },
  kiwiCom:        { campaignId: "111", partnerId: "" },
  getTransfer:    { campaignId: "147", partnerId: "" },
  welcomePickups: { campaignId: "627", partnerId: "" },
  yesim:          { campaignId: "224", partnerId: "" },
  visitorsCoverage:{ campaignId: "153", partnerId: "" },
  gigsky:         { campaignId: "636", partnerId: "" },
  airHelp:        { campaignId: "120", partnerId: "" },
  insubuy:        { campaignId: "165", partnerId: "" },
  eatwith:        { campaignId: "164", partnerId: "" },
  qeeq:           { campaignId: "172", partnerId: "" },
  ticketmaster:   { campaignId: "183", partnerId: "" },
  autoEurope:     { campaignId: "143", partnerId: "" },
  nordvpn:        { campaignId: "631", partnerId: "" },
  saily:          { campaignId: "629", partnerId: "" },
};

const affiliates = {
  // ---- Hotels (none of these are TP programs — keep blank fields here for
  // direct partner approvals) ----
  booking:        { aid: "" },
  hotelsCom:      { camref: "" },
  agoda:          { cid: "" },
  // Trip.com is a TP partner but uses native Allianceid/SID format, NOT the
  // tp.media wrapper. Confirmed values below are from TP dashboard.
  tripcom:        { allianceid: "8157710", sid: "308782349", tripSub3: "D16205590" },
  hostelworld:    { urlPrefix: "" },
  vrbo:           { camref: "" },
  // ---- Tours / activities ----
  getYourGuide:   { partnerId: "" },               // direct GYG, not in TP
  viator:         { pid: "" },                     // direct Viator, not in TP
  klook:          { ...tpPrograms.klook, marker: tp.marker, trs: tp.trs },
  tiqets:         { ...tpPrograms.tiqets, marker: tp.marker, trs: tp.trs },
  civitatis:      { partner: "" },                 // direct Civitatis, not in TP
  // ---- Transfers / car rental ----
  welcomePickups: { ...tpPrograms.welcomePickups, marker: tp.marker, trs: tp.trs },
  kiwitaxi:       { ...tpPrograms.kiwitaxi, marker: tp.marker, trs: tp.trs },
  localrent:      { ...tpPrograms.localrent, marker: tp.marker, trs: tp.trs },
  getTransfer:    { ...tpPrograms.getTransfer, marker: tp.marker, trs: tp.trs },
  autoEurope:     { ...tpPrograms.autoEurope, marker: tp.marker, trs: tp.trs },
  qeeq:           { ...tpPrograms.qeeq, marker: tp.marker, trs: tp.trs },
  discoverCars:   { aAid: "" },                    // direct, not in TP
  rentalcars:     { aid: "" },                     // direct, not in TP
  // ---- eSIM ----
  airalo:         { ...tpPrograms.airalo, marker: tp.marker, trs: tp.trs },
  yesim:          { ...tpPrograms.yesim, marker: tp.marker, trs: tp.trs },
  gigsky:         { ...tpPrograms.gigsky, marker: tp.marker, trs: tp.trs },
  saily:          { ...tpPrograms.saily, marker: tp.marker, trs: tp.trs },
  holafly:        { ref: "" },                     // direct, not in TP
  // ---- Insurance ----
  visitorsCoverage:{ ...tpPrograms.visitorsCoverage, marker: tp.marker, trs: tp.trs },
  insubuy:        { ...tpPrograms.insubuy, marker: tp.marker, trs: tp.trs },
  airHelp:        { ...tpPrograms.airHelp, marker: tp.marker, trs: tp.trs },
  safetywing:     { ref: "" },                     // direct, not in TP
  worldNomads:    { ref: "" },                     // direct, not in TP
  // ---- Money / utilities ----
  wise:           { invite: "" },                  // direct, not in TP
  nordvpn:        { ...tpPrograms.nordvpn, marker: tp.marker, trs: tp.trs },
  // ---- Flights ----
  kiwiCom:        { ...tpPrograms.kiwiCom, marker: tp.marker, trs: tp.trs },
  wayaway:        { marker: "" },                  // direct, not on this account
  // ---- Experiences ----
  eatwith:        { ...tpPrograms.eatwith, marker: tp.marker, trs: tp.trs },
  ticketmaster:   { ...tpPrograms.ticketmaster, marker: tp.marker, trs: tp.trs },
};

const business = {
  legalName: "Where to Stay Turkey",
  jurisdiction: "Turkey",
  contactEmail: "hello@wheretostayturkey.com",
  supportEmail: "support@wheretostayturkey.com",
  privacyEmail: "privacy@wheretostayturkey.com",
  editorialEmail: "editorial@wheretostayturkey.com",
  partnershipsEmail: "partnerships@wheretostayturkey.com",
  // Optional. Leave blank until a registered business address exists;
  // the build hides "Postal mail:" lines whenever this is empty rather
  // than rendering a placeholder. Set to a real string once available.
  postalAddress: "",
  lastUpdated: "2026-04-24",
};

module.exports = {
  siteName: "Where to Stay in Turkey",
  siteTagline: "The fastest way to decide where to stay in Turkey.",
  // Canonical site URL — must match what Vercel actually serves so
  // canonicals don't point to a 308-redirect chain. Apex (no-www)
  // 308-redirects to www on this deployment, so the canonical lives
  // at the www subdomain. If the redirect direction is ever flipped,
  // change this to "https://wheretostayturkey.com" and rebuild.
  siteUrl: "https://www.wheretostayturkey.com",
  siteDescription: "A decision engine for the best neighborhoods and hotels in Turkey.",
  business,
  affiliates,
  tp,
  tpPrograms,
  bookingAid: affiliates.booking.aid,
  getYourGuidePartnerId: affiliates.getYourGuide.partnerId,
  plausibleDomain: "",
  gaMeasurementId: "",
  // Google AdSense — auto-ads loader. When clientId is set the loader
  // is injected into <head> on every page; Google places auto-ads
  // automatically. Configure per-URL exclusions in the AdSense console
  // if you want commercial-intent city pages ad-free.
  adsense: { clientId: "ca-pub-8018173696794576" },
  emailCaptureEndpoint: "https://assets.mailerlite.com/jsonp/2296486/forms/185895210894493012/subscribe",
  // Third-party verification snippets injected into <head> on every page.
  // Used for: Travelpayouts site verification, Google Search Console (HTML script verify),
  // Bing Webmaster, etc. Keep these short — they run on every page load.
  verificationScripts: [
    // Travelpayouts site verification
    `<script nowprocket data-noptimize="1" data-cfasync="false" data-wpfc-render="false" seraph-accel-crit="1" data-no-defer="1">(function(){var s=document.createElement("script");s.async=1;s.src='https://emrldtp.com/NTIzMDk0.js?t=523094';document.head.appendChild(s);})();</script>`,
  ],
  defaultOgImage: "/assets/img/og-default.svg",
  twitterHandle: "@wheretostayturkey",
  // Render city/showcase cards using their data.heroImage URLs (when set).
  // We keep verified Wikimedia URLs in cities*.json data so this can be
  // flipped to true the moment the operator wants real-photo cards back.
  useHeroPhotos: false,
  // IndexNow protocol (Bing, Yandex, Seznam, Naver). 32-char hex string,
  // any value the operator picks. The build emits a key file at the site
  // root so search engines can verify ownership. After each deploy, run
  // `node scripts/indexnow-ping.js` to push fresh URLs to IndexNow.
  indexnowKey: "fb1c608ab6dba0aed5ba0fa8164e8766",
  currency: "USD",
  locale: "en-US",
};
