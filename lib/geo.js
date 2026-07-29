/**
 * Turns Vercel's geolocation headers into a US state name.
 *
 * Vercel adds `x-vercel-ip-country` and `x-vercel-ip-country-region` to every
 * request at the edge, so this needs no third-party lookup, no API key, and
 * adds no latency. It is a hint only — VPNs, mobile carriers and corporate
 * networks all get it wrong routinely — so the chat always asks the visitor to
 * confirm rather than filling the field silently.
 */

const US_REGIONS = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  PR: "Puerto Rico",
};

/**
 * Returns the detected state name, or null when it can't be determined.
 * Canadian visitors collapse to "Canada", which is one of the options the
 * chat offers.
 */
export function detectState(req) {
  const country = (req.headers["x-vercel-ip-country"] ?? "").toUpperCase();
  const region = (req.headers["x-vercel-ip-country-region"] ?? "").toUpperCase();

  if (country === "CA") return "Canada";
  if (country !== "US") return null;

  return US_REGIONS[region] ?? null;
}

/** The raw headers, for the health check — useful when detection looks wrong. */
export function geoDebug(req) {
  return {
    country: req.headers["x-vercel-ip-country"] ?? null,
    region: req.headers["x-vercel-ip-country-region"] ?? null,
    city: req.headers["x-vercel-ip-city"] ?? null,
  };
}
