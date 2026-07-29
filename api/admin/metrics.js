import { rows, one } from "../../lib/db.js";
import { requireAdmin } from "../../lib/auth.js";
import { parseFilters, sessionWhere } from "../../lib/filters.js";
import { QUESTION_NODES, FUNNEL, OUTCOME_LABELS } from "../../public/flow.js";

/**
 * GET /api/admin/metrics?range=30d&campaign=
 *
 * Everything the Overview tab draws:
 *   - headline totals and conversion rate
 *   - how often each option is chosen, per question
 *   - the drop-off funnel
 *   - where conversations end up
 *   - daily volume
 *   - the campaign list used by the filter dropdown
 */
export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    const filters = parseFilters(req);
    const where = sessionWhere(filters, "s");
    const values = where.values;

    const [totals, choiceRows, funnelRows, outcomeRows, daily, campaigns, deviceRows] =
      await Promise.all([
        one(
          `SELECT
             count(*)::int AS sessions,
             count(*) FILTER (WHERE s.completed)::int AS completed,
             count(*) FILTER (
               WHERE EXISTS (
                 SELECT 1 FROM events e
                  WHERE e.session_id = s.id AND e.type = 'option_selected'
               )
             )::int AS engaged,
             count(*) FILTER (
               WHERE EXISTS (SELECT 1 FROM submissions sub WHERE sub.session_id = s.id)
             )::int AS submissions,
             count(*) FILTER (
               WHERE EXISTS (
                 SELECT 1 FROM events e
                  WHERE e.session_id = s.id AND e.type = 'cta_click'
               )
             )::int AS cta_clicks
           FROM sessions s
           ${where.sql}`,
          values
        ),

        // How often each option was chosen, per question.
        rows(
          `SELECT e.node_id, e.option_id, e.option_label, count(DISTINCT e.session_id)::int AS count
             FROM events e
             JOIN sessions s ON s.id = e.session_id
             ${where.sql ? `${where.sql} AND` : "WHERE"} e.type = 'option_selected'
            GROUP BY e.node_id, e.option_id, e.option_label`,
          values
        ),

        // How many conversations reached each step.
        rows(
          `SELECT e.node_id, count(DISTINCT e.session_id)::int AS count
             FROM events e
             JOIN sessions s ON s.id = e.session_id
             ${where.sql ? `${where.sql} AND` : "WHERE"} e.type = 'node_shown'
            GROUP BY e.node_id`,
          values
        ),

        rows(
          `SELECT COALESCE(s.outcome, 'no_selection') AS outcome, count(*)::int AS count
             FROM sessions s
             ${where.sql}
            GROUP BY 1
            ORDER BY count DESC`,
          values
        ),

        rows(
          `SELECT to_char(date_trunc('day', s.created_at), 'YYYY-MM-DD') AS day,
                  count(*)::int AS sessions,
                  count(*) FILTER (
                    WHERE EXISTS (SELECT 1 FROM submissions sub WHERE sub.session_id = s.id)
                  )::int AS submissions
             FROM sessions s
             ${where.sql}
            GROUP BY 1
            ORDER BY 1 ASC`,
          values
        ),

        rows(
          `SELECT COALESCE(s.utm_campaign, '(none)') AS campaign, count(*)::int AS sessions
             FROM sessions s
            GROUP BY 1
            ORDER BY sessions DESC
            LIMIT 50`
        ),

        rows(
          `SELECT COALESCE(s.device, 'unknown') AS device, count(*)::int AS count
             FROM sessions s
             ${where.sql}
            GROUP BY 1
            ORDER BY count DESC`,
          values
        ),
      ]);

    // Zero-fill against the flow definition so options nobody picked still show
    // up in the report — a 0% option is a finding, not a missing row.
    const chosen = new Map(
      choiceRows.map((row) => [`${row.node_id}::${row.option_id}`, row])
    );

    const questions = QUESTION_NODES.map(({ nodeId, question, options }) => {
      const counts = options.map((option) => ({
        optionId: option.id,
        label: option.label,
        count: chosen.get(`${nodeId}::${option.id}`)?.count ?? 0,
      }));
      const total = counts.reduce((sum, entry) => sum + entry.count, 0);

      return {
        nodeId,
        question,
        total,
        options: counts
          .map((entry) => ({
            ...entry,
            share: total > 0 ? entry.count / total : 0,
          }))
          .sort((a, b) => b.count - a.count),
      };
    });

    const reached = new Map(funnelRows.map((row) => [row.node_id, row.count]));
    const funnel = FUNNEL.map((step) => ({
      ...step,
      count: reached.get(step.nodeId) ?? 0,
    }));

    const outcomes = outcomeRows.map((row) => ({
      outcome: row.outcome,
      label: OUTCOME_LABELS[row.outcome] ?? "No option selected",
      count: row.count,
    }));

    res.status(200).json({
      filters,
      totals: totals ?? { sessions: 0, completed: 0, engaged: 0, submissions: 0, cta_clicks: 0 },
      questions,
      funnel,
      outcomes,
      daily,
      campaigns,
      devices: deviceRows,
    });
  } catch (err) {
    console.error("GET /api/admin/metrics failed:", err);
    res.status(500).json({ error: "Could not load metrics." });
  }
}
