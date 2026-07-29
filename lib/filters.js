/** Shared date-range and campaign filtering for the dashboard endpoints. */

const RANGES = {
  today: "date_trunc('day', now())",
  "7d": "now() - interval '7 days'",
  "30d": "now() - interval '30 days'",
  "90d": "now() - interval '90 days'",
  all: null,
};

export function parseFilters(req) {
  const url = new URL(req.url, "http://localhost");
  const range = url.searchParams.get("range") ?? "30d";
  const campaign = url.searchParams.get("campaign") ?? "";

  return {
    range: Object.hasOwn(RANGES, range) ? range : "30d",
    campaign: campaign.trim().slice(0, 255),
    search: (url.searchParams.get("q") ?? "").trim().slice(0, 120),
    page: Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1),
  };
}

/**
 * Builds a WHERE clause against the sessions table.
 * `alias` is the table alias the clause should reference.
 */
export function sessionWhere(filters, alias = "s", startIndex = 1) {
  const clauses = [];
  const values = [];
  let index = startIndex;

  const rangeSql = RANGES[filters.range];
  if (rangeSql) clauses.push(`${alias}.created_at >= ${rangeSql}`);

  if (filters.campaign) {
    clauses.push(`${alias}.utm_campaign = $${index++}`);
    values.push(filters.campaign);
  }

  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
    nextIndex: index,
  };
}
