/**
 * ===========================================================================
 * Conversation dashboard
 * ===========================================================================
 * Reads /api/admin/* and renders the overview charts, the conversation list
 * with transcript replay, and the submissions table.
 *
 * Chart colors are read from CSS custom properties so light and dark mode each
 * use their own validated steps.
 * ===========================================================================
 */

import { NODES, FUNNEL, OUTCOME_LABELS } from "./flow.js";

const $ = (id) => document.getElementById(id);

const gate = $("gate");
const app = $("app");
const tooltip = $("tooltip");

const state = {
  tab: "overview",
  range: "30d",
  campaign: "",
  search: "",
  page: 1,
  metrics: null,
};

/* -------------------------------------------------------------------------
 * Small helpers
 * ---------------------------------------------------------------------- */

function element(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent != null) node.textContent = textContent;
  return node;
}

const numberFormat = new Intl.NumberFormat("en-US");

function compact(value) {
  if (value < 1000) return String(value);
  if (value < 10000) return `${(value / 1000).toFixed(1)}K`.replace(".0K", "K");
  if (value < 1_000_000) return `${Math.round(value / 1000)}K`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

function percent(part, whole) {
  if (!whole) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

async function api(path, options) {
  const response = await fetch(path, { credentials: "same-origin", ...options });
  if (response.status === 401) {
    showGate();
    throw new Error("Not signed in");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

function setStatus(message) {
  $("status").textContent = message;
}

/* -------------------------------------------------------------------------
 * Tooltip
 * ---------------------------------------------------------------------- */

function showTooltip(event, html) {
  tooltip.replaceChildren(...html);
  tooltip.hidden = false;
  moveTooltip(event);
}

function moveTooltip(event) {
  const pad = 14;
  const rect = tooltip.getBoundingClientRect();
  let left = event.clientX + pad;
  let top = event.clientY + pad;
  if (left + rect.width > window.innerWidth - 8) left = event.clientX - rect.width - pad;
  if (top + rect.height > window.innerHeight - 8) top = event.clientY - rect.height - pad;
  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${Math.max(8, top)}px`;
}

function hideTooltip() {
  tooltip.hidden = true;
}

/** Attaches a hover tooltip to any mark. `lines` returns an array of nodes. */
function attachTooltip(node, lines) {
  node.addEventListener("mouseenter", (event) => showTooltip(event, lines()));
  node.addEventListener("mousemove", moveTooltip);
  node.addEventListener("mouseleave", hideTooltip);
}

/* -------------------------------------------------------------------------
 * Auth
 * ---------------------------------------------------------------------- */

function showGate() {
  gate.hidden = false;
  app.hidden = true;
}

function showApp() {
  gate.hidden = true;
  app.hidden = false;
}

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("login-button");
  const error = $("login-error");
  error.hidden = true;
  button.disabled = true;
  button.textContent = "Signing in…";

  try {
    await api("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: $("password").value }),
    });
    showApp();
    loadAll();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = "Sign in";
  }
});

$("logout").addEventListener("click", async () => {
  await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" });
  location.reload();
});

/* -------------------------------------------------------------------------
 * Bars
 * ---------------------------------------------------------------------- */

/**
 * One horizontal bar. Values sit outside the bar end in a text token, so a
 * label can never be clipped by its own mark.
 */
function bar({ label, count, share, max, alt = false, depth = 0, tooltipLines }) {
  const row = element("div", `bar${depth ? ` bar--depth-${depth}` : ""}`);

  const name = element("div", "bar__label", label);
  name.title = label;
  row.appendChild(name);

  const track = element("div", "bar__track");
  const fill = element("div", `bar__fill${alt ? " bar__fill--alt" : ""}`);
  fill.style.width = max > 0 ? `${Math.max((count / max) * 100, count > 0 ? 1.5 : 0)}%` : "0%";
  track.appendChild(fill);
  row.appendChild(track);

  const value = element("div", "bar__value", numberFormat.format(count));
  if (share != null) value.appendChild(element("small", null, share));
  row.appendChild(value);

  if (tooltipLines) attachTooltip(row, tooltipLines);
  return row;
}

/* -------------------------------------------------------------------------
 * Overview
 * ---------------------------------------------------------------------- */

function renderTiles(totals) {
  const container = $("tiles");
  container.replaceChildren();

  const tiles = [
    {
      label: "Conversations",
      value: compact(totals.sessions),
      sub: "Visitors who opened the chat",
    },
    {
      label: "Engaged",
      value: compact(totals.engaged),
      sub: `${percent(totals.engaged, totals.sessions)} answered at least one question`,
    },
    {
      label: "Submissions",
      value: compact(totals.submissions),
      sub: `${percent(totals.submissions, totals.sessions)} of all conversations`,
    },
    {
      label: "Clicked through",
      value: compact(totals.cta_clicks),
      sub: "Tapped the web shop or call button",
    },
    {
      label: "Reached an answer",
      value: percent(totals.completed, totals.sessions),
      sub: `${numberFormat.format(totals.completed)} of ${numberFormat.format(totals.sessions)}`,
    },
  ];

  for (const tile of tiles) {
    const card = element("div", "tile");
    card.appendChild(element("div", "tile__label", tile.label));
    card.appendChild(element("div", "tile__value", tile.value));
    card.appendChild(element("div", "tile__sub", tile.sub));
    container.appendChild(card);
  }
}

function renderQuestions(questions) {
  const container = $("questions");
  container.replaceChildren();

  const answered = questions.filter((question) => question.total > 0);
  if (answered.length === 0) {
    container.appendChild(
      element("p", "empty", "No answers recorded yet for this period.")
    );
    return;
  }

  for (const question of questions) {
    const block = element("div", "question");
    block.appendChild(element("h3", "question__title", question.question));
    block.appendChild(
      element(
        "p",
        "question__meta",
        `${numberFormat.format(question.total)} ${question.total === 1 ? "answer" : "answers"}`
      )
    );

    const max = Math.max(...question.options.map((option) => option.count), 1);
    const bars = element("div", "bars");

    for (const option of question.options) {
      bars.appendChild(
        bar({
          label: option.label,
          count: option.count,
          share: question.total > 0 ? percent(option.count, question.total) : null,
          max,
          tooltipLines: () => [
            element("strong", null, option.label),
            document.createTextNode(
              `${numberFormat.format(option.count)} of ${numberFormat.format(question.total)} answers · ${percent(option.count, question.total)}`
            ),
          ],
        })
      );
    }

    block.appendChild(bars);
    container.appendChild(block);
  }
}

function renderFunnel(funnel) {
  const container = $("funnel");
  container.replaceChildren();

  const counts = new Map(funnel.map((step) => [step.nodeId, step.count]));
  const shape = new Map(FUNNEL.map((step) => [step.nodeId, step]));
  const max = Math.max(...funnel.map((step) => step.count), 1);

  if (max === 1 && funnel.every((step) => step.count === 0)) {
    container.appendChild(element("p", "empty", "No conversations in this period."));
    return;
  }

  for (const step of funnel) {
    const meta = shape.get(step.nodeId) ?? { depth: 0, parent: null };
    const parentCount = meta.parent ? counts.get(meta.parent) ?? 0 : null;

    container.appendChild(
      bar({
        label: step.label,
        count: step.count,
        share: parentCount ? percent(step.count, parentCount) : null,
        max,
        depth: meta.depth,
        tooltipLines: () => {
          const lines = [element("strong", null, step.label)];
          lines.push(
            document.createTextNode(
              `${numberFormat.format(step.count)} conversations reached this step`
            )
          );
          if (parentCount) {
            const parentLabel = shape.get(meta.parent)?.label ?? "the step above";
            lines.push(element("br"));
            lines.push(
              document.createTextNode(
                `${percent(step.count, parentCount)} of “${parentLabel}” · ${numberFormat.format(parentCount - step.count)} went elsewhere`
              )
            );
          }
          return lines;
        },
      })
    );
  }
}

function renderOutcomes(outcomes) {
  const container = $("outcomes");
  container.replaceChildren();

  if (outcomes.length === 0) {
    container.appendChild(element("p", "empty", "No conversations in this period."));
    return;
  }

  const total = outcomes.reduce((sum, entry) => sum + entry.count, 0);
  const max = Math.max(...outcomes.map((entry) => entry.count), 1);

  for (const entry of outcomes) {
    container.appendChild(
      bar({
        label: OUTCOME_LABELS[entry.outcome] ?? entry.label,
        count: entry.count,
        share: percent(entry.count, total),
        max,
        tooltipLines: () => [
          element("strong", null, entry.label),
          document.createTextNode(
            `${numberFormat.format(entry.count)} of ${numberFormat.format(total)} conversations`
          ),
        ],
      })
    );
  }
}

function renderDevices(devices) {
  const container = $("devices");
  container.replaceChildren();

  if (devices.length === 0) {
    container.appendChild(element("p", "empty", "No conversations in this period."));
    return;
  }

  const total = devices.reduce((sum, entry) => sum + entry.count, 0);
  const max = Math.max(...devices.map((entry) => entry.count), 1);

  for (const entry of devices) {
    container.appendChild(
      bar({
        label: entry.device,
        count: entry.count,
        share: percent(entry.count, total),
        max,
      })
    );
  }
}

/* -------------------------------------------------------------------------
 * Daily volume — two-series line chart
 * ---------------------------------------------------------------------- */

const SVG_NS = "http://www.w3.org/2000/svg";

function svg(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

/**
 * Picks an axis maximum that divides into four clean, whole-number ticks —
 * 0/25/50/75/100 rather than 0/23/45/68/90. These are counts, so the step is
 * never below 1.
 */
function niceMax(value) {
  const rough = Math.max(value, 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return Math.max(1, step * magnitude) * 4;
}

function renderDaily(daily) {
  const container = $("daily");
  container.replaceChildren();

  if (daily.length === 0) {
    container.appendChild(element("p", "empty", "No conversations in this period."));
    $("daily-table").replaceChildren();
    return;
  }

  // A legend is always present for two or more series.
  const legend = element("div", "legend");
  for (const [label, modifier] of [
    ["Conversations", ""],
    ["Submissions", " legend__key--2"],
  ]) {
    const item = element("span", "legend__item");
    item.appendChild(element("span", `legend__key${modifier}`));
    item.appendChild(document.createTextNode(label));
    legend.appendChild(item);
  }
  container.appendChild(legend);

  const width = 720;
  const height = 220;
  const pad = { top: 14, right: 54, bottom: 26, left: 42 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;

  const max = niceMax(Math.max(...daily.map((day) => Math.max(day.sessions, day.submissions)), 1));
  const xAt = (index) =>
    pad.left + (daily.length === 1 ? plotWidth / 2 : (index / (daily.length - 1)) * plotWidth);
  const yAt = (value) => pad.top + plotHeight - (value / max) * plotHeight;

  const chart = svg("svg", {
    class: "chart",
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Daily conversations and submissions",
  });

  // Hairline gridlines, solid, recessive.
  for (let i = 0; i <= 4; i += 1) {
    const value = (max / 4) * i;
    const y = yAt(value);
    chart.appendChild(
      svg("line", { class: "gridline", x1: pad.left, x2: width - pad.right, y1: y, y2: y })
    );
    const tick = svg("text", { class: "tick", x: pad.left - 8, y: y + 4, "text-anchor": "end" });
    tick.textContent = numberFormat.format(Math.round(value));
    chart.appendChild(tick);
  }

  chart.appendChild(
    svg("line", {
      class: "axis",
      x1: pad.left,
      x2: width - pad.right,
      y1: pad.top + plotHeight,
      y2: pad.top + plotHeight,
    })
  );

  const series = [
    { key: "sessions", label: "Conversations", color: cssVar("--series-1") },
    { key: "submissions", label: "Submissions", color: cssVar("--series-2") },
  ];

  for (const entry of series) {
    const points = daily.map((day, index) => `${xAt(index)},${yAt(day[entry.key])}`).join(" ");
    chart.appendChild(svg("polyline", { class: "line", points, stroke: entry.color }));

    // End-dot with a 2px surface ring, plus a direct end label.
    const lastIndex = daily.length - 1;
    const lastValue = daily[lastIndex][entry.key];
    chart.appendChild(
      svg("circle", { class: "dot", cx: xAt(lastIndex), cy: yAt(lastValue), r: 4, fill: entry.color })
    );
    const label = svg("text", {
      class: "end-label",
      x: xAt(lastIndex) + 10,
      y: yAt(lastValue) + 4,
    });
    label.textContent = numberFormat.format(lastValue);
    chart.appendChild(label);
  }

  // X ticks: first and last only, so they never collide.
  for (const index of daily.length > 1 ? [0, daily.length - 1] : [0]) {
    const tick = svg("text", {
      class: "tick",
      x: xAt(index),
      y: height - 8,
      "text-anchor": index === 0 ? "start" : "end",
    });
    tick.textContent = new Date(`${daily[index].day}T00:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    chart.appendChild(tick);
  }

  // Crosshair + tooltip across the whole plot.
  const crosshair = svg("line", {
    class: "crosshair",
    y1: pad.top,
    y2: pad.top + plotHeight,
    opacity: 0,
  });
  chart.appendChild(crosshair);

  const overlay = svg("rect", {
    x: pad.left,
    y: pad.top,
    width: plotWidth,
    height: plotHeight,
    fill: "transparent",
  });
  overlay.style.cursor = "crosshair";
  chart.appendChild(overlay);

  overlay.addEventListener("mousemove", (event) => {
    const box = chart.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / box.width;
    const x = ratio * width;
    const index = Math.max(
      0,
      Math.min(
        daily.length - 1,
        Math.round(((x - pad.left) / plotWidth) * (daily.length - 1 || 1))
      )
    );
    const day = daily[index];

    crosshair.setAttribute("x1", xAt(index));
    crosshair.setAttribute("x2", xAt(index));
    crosshair.setAttribute("opacity", "1");

    showTooltip(event, [
      element(
        "strong",
        null,
        new Date(`${day.day}T00:00:00`).toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        })
      ),
      document.createTextNode(`${numberFormat.format(day.sessions)} conversations`),
      element("br"),
      document.createTextNode(`${numberFormat.format(day.submissions)} submissions`),
    ]);
  });

  overlay.addEventListener("mouseleave", () => {
    crosshair.setAttribute("opacity", "0");
    hideTooltip();
  });

  container.appendChild(chart);
  renderDailyTable(daily);
}

/** The table view behind "Show numbers" — nothing is gated behind hover. */
function renderDailyTable(daily) {
  const container = $("daily-table");
  container.replaceChildren();

  const wrap = element("div", "table-wrap");
  const table = element("table", "table");

  const head = element("thead");
  const headRow = element("tr");
  for (const heading of ["Day", "Conversations", "Submissions"]) {
    headRow.appendChild(element("th", null, heading));
  }
  head.appendChild(headRow);
  table.appendChild(head);

  const body = element("tbody");
  for (const day of daily) {
    const row = element("tr");
    row.appendChild(element("td", "nowrap", day.day));
    row.appendChild(element("td", "nowrap", numberFormat.format(day.sessions)));
    row.appendChild(element("td", "nowrap", numberFormat.format(day.submissions)));
    body.appendChild(row);
  }
  table.appendChild(body);

  wrap.appendChild(table);
  container.appendChild(wrap);
}

$("toggle-daily-table").addEventListener("click", (event) => {
  const panel = $("daily-table");
  panel.hidden = !panel.hidden;
  event.target.textContent = panel.hidden ? "Show numbers" : "Hide numbers";
  event.target.setAttribute("aria-expanded", String(!panel.hidden));
});

/* -------------------------------------------------------------------------
 * Conversations
 * ---------------------------------------------------------------------- */

function renderConversations(data) {
  const body = document.querySelector("#conversations-table tbody");
  body.replaceChildren();

  if (data.conversations.length === 0) {
    const row = element("tr");
    const cell = element("td", "empty", "No conversations match these filters.");
    cell.colSpan = 6;
    row.appendChild(cell);
    body.appendChild(row);
  }

  for (const conversation of data.conversations) {
    const row = element("tr");

    row.appendChild(element("td", "nowrap", formatDateTime(conversation.created_at)));

    const pathCell = element("td");
    const path = element("div", "path");
    const choices = conversation.choices ?? [];
    if (choices.length === 0) {
      path.appendChild(element("span", "muted", "No options chosen"));
    } else {
      choices.forEach((choice, index) => {
        if (index > 0) path.appendChild(element("span", "muted", "›"));
        path.appendChild(element("span", "path__step", choice));
      });
    }
    pathCell.appendChild(path);
    row.appendChild(pathCell);

    const outcomeCell = element("td");
    outcomeCell.appendChild(
      element(
        "span",
        "pill",
        conversation.outcome
          ? OUTCOME_LABELS[conversation.outcome] ?? conversation.outcome
          : "No selection"
      )
    );
    row.appendChild(outcomeCell);

    row.appendChild(element("td", null, conversation.utm_campaign ?? "—"));
    row.appendChild(element("td", null, conversation.device ?? "—"));

    const actionCell = element("td");
    const open = element("button", "linkish", "View");
    open.addEventListener("click", () => openTranscript(conversation.id));
    actionCell.appendChild(open);
    row.appendChild(actionCell);

    body.appendChild(row);
  }

  const pager = $("pager");
  pager.replaceChildren();

  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize));
  pager.appendChild(
    element(
      "span",
      null,
      `${numberFormat.format(data.total)} conversation${data.total === 1 ? "" : "s"} · page ${data.page} of ${pageCount}`
    )
  );

  if (data.page > 1) {
    const previous = element("button", "linkish", "← Previous");
    previous.addEventListener("click", () => {
      state.page -= 1;
      loadConversations();
    });
    pager.appendChild(previous);
  }

  if (data.page < pageCount) {
    const next = element("button", "linkish", "Next →");
    next.addEventListener("click", () => {
      state.page += 1;
      loadConversations();
    });
    pager.appendChild(next);
  }
}

/**
 * Rebuilds what the visitor actually saw: the agent's scripted lines come from
 * flow.js, the replies come from the logged events.
 */
async function openTranscript(id) {
  const dialog = $("transcript");
  const body = $("transcript-body");
  body.replaceChildren(element("p", "empty", "Loading…"));
  dialog.showModal();

  let data;
  try {
    data = await api(`/api/admin/conversation?id=${encodeURIComponent(id)}`);
  } catch (err) {
    body.replaceChildren(element("p", "empty", err.message));
    return;
  }

  body.replaceChildren();

  const meta = element("dl", "meta-grid");
  const rows = [
    ["Started", formatDateTime(data.session.created_at)],
    ["Outcome", data.session.outcome ? OUTCOME_LABELS[data.session.outcome] ?? data.session.outcome : "No selection"],
    ["Device", data.session.device ?? "—"],
    ["Campaign", data.session.utm_campaign ?? "—"],
    ["Source", data.session.utm_source ?? "—"],
    ["Keyword", data.session.utm_term ?? "—"],
    ["Google Click ID", data.session.gclid ?? "—"],
    ["Referrer", data.session.referrer ?? "—"],
  ];
  for (const [key, value] of rows) {
    meta.appendChild(element("dt", null, key));
    meta.appendChild(element("dd", null, value));
  }
  body.appendChild(meta);

  const replay = element("div", "replay");
  for (const event of data.timeline) {
    if (event.type === "node_shown") {
      const node = NODES[event.node_id];
      for (const message of node?.messages ?? [event.question ?? event.node_id]) {
        replay.appendChild(element("div", "replay__msg replay__msg--agent", message));
      }
    } else if (event.type === "option_selected") {
      const bubble = element("div", "replay__msg replay__msg--user", event.option_label);
      bubble.appendChild(element("span", "replay__time", formatDateTime(event.created_at)));
      replay.appendChild(bubble);
    } else if (event.type === "cta_click") {
      replay.appendChild(element("div", "replay__note", `Clicked: ${event.option_label}`));
    } else if (event.type === "form_shown") {
      replay.appendChild(element("div", "replay__note", "Started the form"));
    } else if (event.type === "form_field") {
      // Shows exactly which question someone stopped at.
      replay.appendChild(element("div", "replay__note", `Answered: ${event.option_label}`));
    } else if (event.type === "form_submitted") {
      replay.appendChild(element("div", "replay__note", "Form submitted"));
    } else if (event.type === "restart") {
      replay.appendChild(element("div", "replay__note", "Started over"));
    }
  }
  body.appendChild(replay);

  if (data.submission) {
    const card = element("div", "submission-card");
    card.appendChild(
      element("h3", null, data.submission.kind === "service_request" ? "Service request" : "Parts callback request")
    );
    const details = element("dl", "meta-grid");
    const fields = [
      ["Name", data.submission.name],
      ["Phone", data.submission.phone],
      ["Email", data.submission.email],
      ["State", data.submission.state ?? "—"],
      ["Details", data.submission.notes ?? "—"],
    ];
    for (const [key, value] of fields) {
      details.appendChild(element("dt", null, key));
      details.appendChild(element("dd", null, value));
    }
    card.appendChild(details);
    card.appendChild(notifiedStatus(data.submission));
    body.appendChild(card);
  }
}

/** Status wears an icon plus a label, so it never depends on color alone. */
function notifiedStatus(submission) {
  const status = element("span", `status ${submission.notified ? "status--good" : "status--bad"}`);
  status.appendChild(element("span", null, submission.notified ? "✓" : "!"));
  status.appendChild(
    element(
      "span",
      null,
      submission.notified ? "Notification emailed" : `Email not sent${submission.notify_error ? ` — ${submission.notify_error}` : ""}`
    )
  );
  return status;
}

$("close-transcript").addEventListener("click", () => $("transcript").close());

/* -------------------------------------------------------------------------
 * Submissions
 * ---------------------------------------------------------------------- */

let submissionsCache = [];

function renderSubmissions(submissions) {
  submissionsCache = submissions;
  const body = document.querySelector("#submissions-table tbody");
  body.replaceChildren();

  if (submissions.length === 0) {
    const row = element("tr");
    const cell = element("td", "empty", "No submissions in this period.");
    cell.colSpan = 7;
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }

  for (const submission of submissions) {
    const row = element("tr");
    row.appendChild(element("td", "nowrap", formatDateTime(submission.created_at)));

    const kindCell = element("td");
    kindCell.appendChild(
      element("span", "pill", submission.kind === "service_request" ? "Service" : "Parts")
    );
    row.appendChild(kindCell);

    row.appendChild(element("td", null, submission.name));

    const contact = element("td");
    contact.appendChild(element("div", null, submission.email));
    contact.appendChild(element("div", "muted", submission.phone));
    row.appendChild(contact);

    row.appendChild(element("td", null, submission.state ?? "—"));
    row.appendChild(element("td", "clamp", submission.notes ?? "—"));

    const statusCell = element("td");
    statusCell.appendChild(notifiedStatus(submission));
    row.appendChild(statusCell);

    body.appendChild(row);
  }
}

$("export-csv").addEventListener("click", () => {
  if (submissionsCache.length === 0) return;

  const headers = [
    "Created", "Type", "Name", "Phone", "Email", "State", "Details",
    "Campaign", "Source", "Keyword", "Google Click ID", "Device", "Emailed",
  ];

  const rows = submissionsCache.map((submission) => [
    new Date(submission.created_at).toISOString(),
    submission.kind,
    submission.name,
    submission.phone,
    submission.email,
    submission.state ?? "",
    submission.notes ?? "",
    submission.utm_campaign ?? "",
    submission.utm_source ?? "",
    submission.utm_term ?? "",
    submission.gclid ?? "",
    submission.device ?? "",
    submission.notified ? "yes" : "no",
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");

  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `submissions-${state.range}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
});

/* -------------------------------------------------------------------------
 * Loading & filters
 * ---------------------------------------------------------------------- */

function queryString(extra = {}) {
  const params = new URLSearchParams({ range: state.range, ...extra });
  if (state.campaign) params.set("campaign", state.campaign);
  return params.toString();
}

async function loadMetrics() {
  const data = await api(`/api/admin/metrics?${queryString()}`);
  state.metrics = data;

  renderTiles(data.totals);
  renderQuestions(data.questions);
  renderFunnel(data.funnel);
  renderOutcomes(data.outcomes);
  renderDaily(data.daily);
  renderDevices(data.devices);

  // Populate the campaign filter once, preserving the current choice.
  const select = $("filter-campaign");
  if (select.options.length <= 1) {
    for (const entry of data.campaigns) {
      if (entry.campaign === "(none)") continue;
      const option = element("option", null, `${entry.campaign} (${entry.sessions})`);
      option.value = entry.campaign;
      select.appendChild(option);
    }
    select.value = state.campaign;
  }
}

async function loadConversations() {
  const data = await api(
    `/api/admin/conversations?${queryString({ page: String(state.page), q: state.search })}`
  );
  renderConversations(data);
}

async function loadSubmissions() {
  const data = await api(`/api/admin/submissions?${queryString()}`);
  renderSubmissions(data.submissions);
}

async function loadAll() {
  setStatus("Loading…");
  try {
    await Promise.all([loadMetrics(), loadConversations(), loadSubmissions()]);
    setStatus(`Updated ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    setStatus(err.message);
  }
}

$("filter-range").addEventListener("change", (event) => {
  state.range = event.target.value;
  state.page = 1;
  loadAll();
});

$("filter-campaign").addEventListener("change", (event) => {
  state.campaign = event.target.value;
  state.page = 1;
  loadAll();
});

$("refresh").addEventListener("click", loadAll);

let searchTimer = null;
$("search").addEventListener("input", (event) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = event.target.value;
    state.page = 1;
    loadConversations().catch((err) => setStatus(err.message));
  }, 300);
});

for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => {
    state.tab = tab.dataset.tab;
    for (const other of document.querySelectorAll(".tab")) {
      other.setAttribute("aria-selected", String(other === tab));
    }
    for (const panel of ["overview", "conversations", "submissions"]) {
      $(`panel-${panel}`).hidden = panel !== state.tab;
    }
  });
}

/* -------------------------------------------------------------------------
 * Start
 * ---------------------------------------------------------------------- */

(async function init() {
  try {
    const { authenticated } = await api("/api/admin/me");
    if (authenticated) {
      showApp();
      loadAll();
    } else {
      showGate();
    }
  } catch {
    showGate();
  }
})();
