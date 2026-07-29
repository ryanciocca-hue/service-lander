/**
 * ===========================================================================
 * Chat engine for service.powertechniquena.com
 * ===========================================================================
 * Walks the visitor through the script in flow.js, simulating an agent typing,
 * and reports every step back to /api/event so the dashboard can replay the
 * conversation and count which options get chosen.
 *
 * To change what the chat says, edit flow.js — not this file.
 * ===========================================================================
 */

import { CONFIG, NODES, START_NODE, THANK_YOU } from "./flow.js";

const log = document.getElementById("chat-log");
const actions = document.getElementById("chat-actions");
const headerCall = document.getElementById("header-call");

/* -------------------------------------------------------------------------
 * Session + event tracking
 * ---------------------------------------------------------------------- */

const SESSION_KEY = "pt_session_id";
const TRACKED_PARAMS = [
  "gclid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
];

let sessionId = null;
let seq = 0;
let queue = [];
let outcome = null;
let completed = false;
let flushTimer = null;

const sessionReady = startSession();

async function startSession() {
  // Reuse the id across a refresh so one visit stays one conversation.
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) {
    sessionId = existing;
    return;
  }

  const search = new URLSearchParams(location.search);
  const params = {};
  for (const key of TRACKED_PARAMS) {
    const value = search.get(key);
    if (value) params[key] = value;
  }

  try {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        params,
        landingUrl: location.href,
        referrer: document.referrer || null,
      }),
    });
    const data = await response.json();
    if (data.sessionId) {
      sessionId = data.sessionId;
      sessionStorage.setItem(SESSION_KEY, sessionId);
    }
  } catch {
    // Tracking is best-effort; the chat carries on regardless.
  }
}

function track(type, fields = {}) {
  queue.push({ seq: seq++, type, ...fields });
  scheduleFlush();
}

function setOutcome(value, isComplete) {
  outcome = value;
  completed = isComplete;
  scheduleFlush();
}

function scheduleFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 500);
}

async function flush({ beacon = false } = {}) {
  clearTimeout(flushTimer);
  await sessionReady;
  if (!sessionId) {
    queue = [];
    return;
  }
  if (queue.length === 0 && !outcome) return;

  const payload = JSON.stringify({
    sessionId,
    events: queue,
    outcome,
    completed,
  });
  queue = [];

  // On page hide, sendBeacon is the only thing guaranteed to go out.
  if (beacon && navigator.sendBeacon) {
    navigator.sendBeacon("/api/event", new Blob([payload], { type: "application/json" }));
    return;
  }

  try {
    await fetch("/api/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}

addEventListener("pagehide", () => flush({ beacon: true }));
addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flush({ beacon: true });
});

/* -------------------------------------------------------------------------
 * Rendering helpers
 * ---------------------------------------------------------------------- */

let hasInteracted = false;

function element(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent != null) node.textContent = textContent;
  return node;
}

function scrollToEnd() {
  // Don't yank the page around before the visitor has engaged.
  if (!hasInteracted) return;
  requestAnimationFrame(() => {
    const last = actions.lastElementChild ?? log.lastElementChild;
    last?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

/**
 * The agent's headshot. Falls back to initials if the photo is missing or
 * fails to load, so a bad path never leaves a broken image on the page.
 */
function avatar(className) {
  const wrap = element("span", className);
  wrap.appendChild(element("span", "avatar__initials", CONFIG.agentInitials));

  if (CONFIG.agentPhoto) {
    const photo = document.createElement("img");
    photo.src = CONFIG.agentPhoto;
    photo.alt = "";
    photo.loading = "eager";
    photo.addEventListener("error", () => photo.remove());
    wrap.appendChild(photo);
  }

  return wrap;
}

/**
 * Agent messages are a row: headshot, then the sender's name above the bubble.
 * Visitor messages stay a bare right-aligned bubble.
 */
function addBubble(text, who) {
  if (who !== "agent") {
    const bubble = element("div", "msg msg--user", text);
    log.appendChild(bubble);
    scrollToEnd();
    return bubble;
  }

  const row = element("div", "msg-row");
  row.appendChild(avatar("msg-avatar"));

  const body = element("div", "msg-body");
  body.appendChild(element("span", "msg-name", CONFIG.agentShortName));

  const bubble = element("div", "msg msg--agent", text);
  body.appendChild(bubble);
  row.appendChild(body);

  log.appendChild(row);
  scrollToEnd();
  return bubble;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Longer messages take longer to "type", within believable bounds. */
function typingDuration(text) {
  return Math.min(1900, Math.max(620, 380 + text.length * 21));
}

async function typeThen(text) {
  await wait(240);

  // Sits in the same row shape as a bubble, so the message doesn't jump
  // sideways when the dots are replaced.
  const row = element("div", "msg-row msg-row--typing");
  row.appendChild(avatar("msg-avatar"));

  const dots = element("div", "typing");
  dots.setAttribute("aria-label", `${CONFIG.agentName} is typing`);
  for (let i = 0; i < 3; i += 1) dots.appendChild(element("i"));
  row.appendChild(dots);

  log.appendChild(row);
  scrollToEnd();

  await wait(typingDuration(text));
  row.remove();
  addBubble(text, "agent");
}

function clearActions() {
  actions.replaceChildren();
}

/**
 * CallRail's swap.js scans the page for phone numbers when it loads. Ours are
 * rendered later, as the visitor moves through the chat, so ask CallRail to
 * re-scan each time we add one — otherwise the tracking number never replaces
 * the static one and the call goes unattributed.
 *
 * A no-op when CallRail is absent or blocked, and wrapped so call tracking can
 * never break the conversation.
 */
function refreshCallTracking() {
  try {
    window.CallTrk?.swap?.();
  } catch (err) {
    console.warn("CallRail swap failed:", err);
  }
}

let headerCallBound = false;

/**
 * Points the header call button at a number and reveals it. Stationary
 * enquiries get handed to a different team, so the header has to follow the
 * conversation — otherwise it would offer the portable parts line on the very
 * screen telling them we don't cover stationary.
 */
function setHeaderCall(display, href) {
  if (!headerCall) return;

  headerCall.href = href;
  document.getElementById("header-call-label").textContent = display;

  if (headerCall.hidden) {
    headerCall.hidden = false;
    // Lets the header drop its strapline on narrow phones, now that the call
    // button is competing for the same row.
    document.querySelector(".site-header")?.classList.add("has-call");
  }

  if (!headerCallBound) {
    headerCallBound = true;
    headerCall.addEventListener("click", () => {
      track("cta_click", {
        nodeId: "header",
        optionId: "header_call",
        optionLabel: `Header call — ${document.getElementById("header-call-label").textContent}`,
      });
      flush();
    });
  }

  refreshCallTracking();
}

/** The default parts number, shown once the visitor answers anything. */
function revealHeaderCall() {
  setHeaderCall(CONFIG.phoneDisplay, CONFIG.phoneHref);
}

/* -------------------------------------------------------------------------
 * Walking the flow
 * ---------------------------------------------------------------------- */

async function goTo(nodeId) {
  const node = NODES[nodeId];
  if (!node) return;

  clearActions();
  track("node_shown", { nodeId, question: node.question ?? null });
  if (node.outcome) setOutcome(node.outcome, false);

  for (const message of node.messages) {
    await typeThen(message);
  }

  if (node.options) renderOptions(nodeId, node);
  else if (node.cta) renderCta(nodeId, node);
  else if (node.form) renderForm(nodeId, node);
}

function renderOptions(nodeId, node) {
  node.options.forEach((option, index) => {
    const button = element("button", "option", option.label);
    button.type = "button";
    button.style.animationDelay = `${index * 70}ms`;

    button.addEventListener("click", () => {
      hasInteracted = true;
      clearActions();
      addBubble(option.label, "user");
      track("option_selected", {
        nodeId,
        question: node.question ?? null,
        optionId: option.id,
        optionLabel: option.label,
      });
      revealHeaderCall();
      goTo(option.next);
    });

    actions.appendChild(button);
  });
  scrollToEnd();
}

function renderCta(nodeId, node) {
  const link = element("a", `cta${node.cta.kind === "tel" ? " cta--phone" : ""}`, node.cta.label);
  link.href = node.cta.href;

  if (node.cta.kind === "link") {
    link.target = "_blank";
    link.rel = "noopener";
  }

  link.addEventListener("click", () => {
    track("cta_click", {
      nodeId,
      optionId: node.cta.kind,
      optionLabel: node.cta.label,
    });
    setOutcome(node.outcome, true);
    flush();
  });

  actions.appendChild(link);

  // Keep the header in step with the number this step is offering.
  if (node.cta.kind === "tel") {
    setHeaderCall(node.cta.phoneDisplay ?? node.cta.label, node.cta.href);
  }

  if (node.cta.note) actions.appendChild(element("p", "cta-note", node.cta.note));
  appendRestart();
  scrollToEnd();
}

function appendRestart() {
  const restart = element("button", "restart", "Start over");
  restart.type = "button";
  restart.addEventListener("click", () => {
    track("restart", {});
    log.replaceChildren();
    clearActions();
    goTo(START_NODE);
  });
  actions.appendChild(restart);
}

/* -------------------------------------------------------------------------
 * Forms
 * ---------------------------------------------------------------------- */

/**
 * The forms are conversational: one question at a time, each asked by the
 * agent and answered in a bubble, rather than a wall of fields. On mobile
 * that means one small input on screen instead of five.
 */

function validateField(spec, value) {
  const trimmed = (value ?? "").trim();
  if (spec.required && !trimmed) return spec.emptyError ?? "Please fill this in.";
  if (!trimmed) return null;

  if (spec.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
    return "That email doesn't look right — mind checking it?";
  }
  if (spec.type === "tel" && (trimmed.match(/\d/g) || []).length < 7) {
    return "That doesn't look like a full phone number.";
  }
  return null;
}

function buildInput(spec) {
  let input;

  if (spec.type === "textarea") {
    input = element("textarea");
    input.rows = 3;
  } else if (spec.type === "select") {
    input = element("select");
    const placeholder = element("option", null, "Choose your state…");
    placeholder.value = "";
    input.appendChild(placeholder);
    for (const value of spec.options) {
      const option = element("option", null, value);
      option.value = value;
      input.appendChild(option);
    }
  } else {
    input = element("input");
    input.type = spec.type;
  }

  input.name = spec.name;
  // The agent's message is the label, so the visible <label> is dropped and
  // the accessible name comes from here instead.
  input.setAttribute("aria-label", spec.label);
  if (spec.maxLength) input.maxLength = spec.maxLength;
  if (spec.autocomplete) input.autocomplete = spec.autocomplete;
  if (spec.placeholder) input.placeholder = spec.placeholder;

  return input;
}

function renderForm(nodeId, node) {
  hasInteracted = true;
  track("form_shown", { nodeId, optionId: node.form.id, optionLabel: node.form.id });
  askField(nodeId, node, 0, {});
}

async function askField(nodeId, node, index, values) {
  const fields = node.form.fields;

  if (index >= fields.length) {
    submitForm(nodeId, node, values);
    return;
  }

  const spec = fields[index];
  clearActions();

  const prompt = typeof spec.prompt === "function" ? spec.prompt(values) : spec.prompt;
  await typeThen(prompt);

  const step = element("form", "chat-step");
  step.noValidate = true;

  const field = element("div", "field");
  const input = buildInput(spec);
  field.appendChild(input);

  const error = element("p", "field__error");
  error.hidden = true;

  const isLast = index === fields.length - 1;
  const wide = spec.type === "textarea" || spec.type === "select";

  const send = element("button", `step-send${wide ? " step-send--wide" : ""}`);
  send.type = "submit";
  send.textContent = wide ? (isLast ? node.form.submitLabel : "Continue") : "";
  if (!wide) send.setAttribute("aria-label", isLast ? node.form.submitLabel : "Continue");

  const row = element("div", `step-row${wide ? " step-row--stacked" : ""}`);
  row.appendChild(field);
  row.appendChild(send);

  step.appendChild(row);
  step.appendChild(error);

  const advance = (event) => {
    event?.preventDefault();
    const value = input.value;
    const problem = validateField(spec, value);

    if (problem) {
      field.classList.add("field--error");
      error.textContent = problem;
      error.hidden = false;
      input.focus();
      scrollToEnd();
      return;
    }

    values[spec.name] = value.trim();
    clearActions();
    addBubble(value.trim(), "user");
    track("form_field", {
      nodeId,
      optionId: spec.name,
      optionLabel: spec.label,
    });
    askField(nodeId, node, index + 1, values);
  };

  step.addEventListener("submit", advance);

  // Enter sends on a single-line field; in the notes box it needs Shift.
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    if (spec.type === "textarea" && !event.shiftKey) {
      event.preventDefault();
      advance();
    } else if (spec.type !== "textarea") {
      event.preventDefault();
      advance();
    }
  });

  // Picking from the state list is a complete answer on its own.
  if (spec.type === "select") {
    input.addEventListener("change", () => {
      if (input.value) advance();
    });
  }

  input.addEventListener("input", () => {
    field.classList.remove("field--error");
    error.hidden = true;
  });

  actions.appendChild(step);
  input.focus({ preventScroll: true });
  scrollToEnd();
}

async function submitForm(nodeId, node, values) {
  clearActions();

  const pending = element("div", "chat-step");
  const status = element("p", "step-status", "Sending…");
  pending.appendChild(status);
  actions.appendChild(pending);
  scrollToEnd();

  try {
    await sessionReady;
    const response = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, kind: node.form.kind, sessionId }),
    });
    const data = await response.json();

    if (!response.ok) {
      // The server found something the per-field checks let through; send the
      // visitor back to that question rather than losing what they typed.
      const badField = Object.keys(data.fields ?? {})[0];
      const index = node.form.fields.findIndex((f) => f.name === badField);
      clearActions();
      await typeThen(data.error ?? "Something went wrong — let's try that again.");
      askField(nodeId, node, index >= 0 ? index : 0, values);
      return;
    }

    track("form_submitted", { nodeId, optionId: node.form.id, optionLabel: node.form.id });
    setOutcome(`${node.form.kind}_submitted`, true);
    flush();

    clearActions();
    for (const message of THANK_YOU[node.form.kind] ?? ["Thanks — we'll be in touch."]) {
      await typeThen(message);
    }
    appendRestart();
  } catch {
    clearActions();
    await typeThen("I couldn't send that — please check your connection.");

    const retry = element("button", "cta", "Try again");
    retry.type = "button";
    retry.addEventListener("click", () => submitForm(nodeId, node, values));
    actions.appendChild(retry);
    scrollToEnd();
  }
}

/* -------------------------------------------------------------------------
 * Start
 * ---------------------------------------------------------------------- */

document.getElementById("agent-name").textContent = CONFIG.agentName;
document.getElementById("agent-role").textContent = CONFIG.agentRole;
document.getElementById("year").textContent = String(new Date().getFullYear());

// Swap the placeholder header avatar for the photo (with initials fallback).
const headerAvatar = avatar("avatar");
headerAvatar.id = "agent-avatar";
headerAvatar.setAttribute("aria-hidden", "true");
document.getElementById("agent-avatar").replaceWith(headerAvatar);

track("session_start", {});
setTimeout(() => goTo(START_NODE), 450);
