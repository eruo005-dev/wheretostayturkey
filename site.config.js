// wheretostayturkey.com - central config

// Travelpayouts shared credentials (single account: Wheretostayturkey site)
// Marker = TP account ID, trs = website-source ID. Used by tp.media redirect URLs.
const tp = { marker: "722878", trs: "523094" };

const affiliates = {
  booking:        { aid: "" },
  hotelsCom:      { camref: "" },
  agoda:          { cid: "" },
  tripcom:        { allianceid: "8157710", sid: "308782349", tripSub3: "D16205590" },
  hostelworld:    { urlPrefix: "" },
  vrbo:           { camref: "" },
  getYourGuide:   { partnerId: "" },
  viator:         { pid: "" },
  klook:          { aid: "" },
  tiqets:         { partner: "" },
  civitatis:      { partner: "" },
  welcomePickups: { ref: "" },
  kiwitaxi:       { marker: "" },
  // Localrent — Turkey-strong car rental aggregator. Active TP partnership.
  // tp.media wrapper format: campaign_id=87, p=2043 (Localrent ids inside TP).
  localrent:      { campaignId: "87", partnerId: "2043", marker: tp.marker, trs: tp.trs },
  discoverCars:   { aAid: "" },
  rentalcars:     { aid: "" },
  airalo:         { ref: "" },
  holafly:        { ref: "" },
  safetywing:     { ref: "" },
  worldNomads:    { ref: "" },
  wise:           { invite: "" },
  kiwiCom:        { marker: "" },
  wayaway:        { marker: "" },
};

const business = {
  legalName: "Where to Stay Turkey",
  jurisdiction: "Turkey",
  contactEmail: "hello@wheretostayturkey.com",
  supportEmail: "support@wheretostayturkey.com",
  privacyEmail: "privacy@wheretostayturkey.com",
  editorialEmail: "editorial@wheretostayturkey.com",
  partnershipsEmail: "partnerships@wheretostayturkey.com",
  postalAddress: "[Street address, City, Postal Code, Country]",
  lastUpdated: "2026-04-24",
};

module.exports = {
  siteName: "Where to Stay in Turkey",
  siteTagline: "The fastest way to decide where to stay in Turkey.",
  siteUrl: "https://wheretostayturkey.com",
  siteDescription: "A decision engine for the best neighborhoods and hotels in Turkey.",
  business,
  affiliates,
  bookingAid: affiliates.booking.aid,
  getYourGuidePartnerId: affiliates.getYourGuide.partnerId,
  plausibleDomain: "",
  gaMeasurementId: "",
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
  currency: "USD",
  locale: "en-US",
};
