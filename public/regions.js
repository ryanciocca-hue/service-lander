/**
 * ===========================================================================
 * REGIONAL SERVICE ROUTING
 * ===========================================================================
 * Taken from "Atlas Copco Regional Sales Managers – United States"
 * (Parts and Service / PTS map, revised 2025-10-22).
 *
 * The map assigns every state to one of four regions by colour. Those
 * assignments are transcribed below. If the map is reissued, update this file
 * — nothing else needs to change.
 * ===========================================================================
 */

export const REGIONS = {
  1: {
    id: 1,
    manager: "Cole Solberg",
    phoneDisplay: "(419) 975-4527",
    phoneHref: "tel:+14199754527",
    email: "cole.solberg@atlascopco.com",
  },
  2: {
    id: 2,
    manager: "Russel Ankrom",
    phoneDisplay: "(210) 452-5937",
    phoneHref: "tel:+12104525937",
    email: "russel.ankrom@atlascopco.com",
  },
  3: {
    id: 3,
    manager: "Jeff Hankamer",
    phoneDisplay: "(713) 281-1074",
    phoneHref: "tel:+17132811074",
    email: "jeffrey.hankamer@atlascopco.com",
  },
  4: {
    id: 4,
    manager: "Jason McClure",
    phoneDisplay: "(657) 823-0135",
    phoneHref: "tel:+16578230135",
    email: "jason.mcclure@atlascopco.com",
  },
  canada: {
    id: "canada",
    manager: "Klevis Koco",
    phoneDisplay: "(905) 301-8574",
    phoneHref: "tel:+19053018574",
    email: "klevis.koco@atlascopco.com",
  },
};

/** Used when the state isn't one we can place — the national hotline. */
export const FALLBACK = {
  id: "national",
  manager: null,
  phoneDisplay: "1-800-732-6762",
  phoneHref: "tel:+18007326762",
  email: null,
};

export const STATE_TO_REGION = {
  // ---- Region 1 — Cole Solberg: upper midwest, Great Lakes, northeast ----
  "North Dakota": 1, "South Dakota": 1, Nebraska: 1, Minnesota: 1, Iowa: 1,
  Wisconsin: 1, Michigan: 1, Illinois: 1, Indiana: 1, Ohio: 1, Kentucky: 1,
  "West Virginia": 1, Pennsylvania: 1, "New York": 1, "New Jersey": 1,
  Delaware: 1, Maryland: 1, Connecticut: 1, "Rhode Island": 1,
  Massachusetts: 1, Vermont: 1, "New Hampshire": 1, Maine: 1,

  // The map doesn't show DC. Grouped with Maryland, which surrounds it.
  "District of Columbia": 1,

  // ---- Region 2 — Russel Ankrom: southeast ----
  Virginia: 2, "North Carolina": 2, "South Carolina": 2, Georgia: 2,
  Florida: 2, Alabama: 2, Mississippi: 2, Tennessee: 2,

  // ---- Region 3 — Jeff Hankamer: south central, plus the Caribbean ----
  Kansas: 3, Missouri: 3, Oklahoma: 3, Arkansas: 3, Texas: 3, Louisiana: 3,
  "Puerto Rico": 3,

  // ---- Region 4 — Jason McClure: west ----
  Washington: 4, Oregon: 4, California: 4, Nevada: 4, Idaho: 4, Montana: 4,
  Wyoming: 4, Utah: 4, Colorado: 4, Arizona: 4, "New Mexico": 4, Alaska: 4,
  Hawaii: 4,

  // ---- Canada ----
  Canada: "canada",
};

/**
 * Returns the regional contact for a state name, or the national hotline when
 * the state is unknown or outside the covered territory.
 */
export function regionForState(state) {
  const key = STATE_TO_REGION[state];
  return (key !== undefined && REGIONS[key]) || FALLBACK;
}
