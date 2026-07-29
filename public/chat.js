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

function revealHeaderCall() {
  if (!headerCall || !headerCall.hidden) return;
  headerCall.href = CONFIG.phoneHref;
  document.getElementById("header-call-label").textContent = CONFIG.phoneDisplay;
  headerCall.hidden = false;
  headerCall.addEventListener("click", () => {
    track("cta_click", { nodeId: "header", optionId: "header_call", optionLabel: "Header call button" });
    flush();
  });
  refreshCallTracking();
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
  if (node.cta.kind === "tel") refreshCallTracking();

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

function buildField(spec) {
  const wrapper = element("div", "field");
  wrapper.dataset.field = spec.name;

  const id = `f_${spec.name}`;
  const label = element("label", null, spec.label);
  label.htmlFor = id;
  wrapper.appendChild(label);

  let input;
  if (spec.type === "textarea") {
    input = element("textarea");
  } else if (spec.type === "select") {
    input = element("select");
    const placeholder = element("option", null, "Select…");
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

  input.id = id;
  input.name = spec.name;
  if (spec.required) input.required = true;
  if (spec.maxLength) input.maxLength = spec.maxLength;
  if (spec.autocomplete) input.autocomplete = spec.autocomplete;
  if (spec.placeholder) input.placeholder = spec.placeholder;

  wrapper.appendChild(input);
  return wrapper;
}

function showFieldErrors(form, fieldErrors) {
  for (const wrapper of form.querySelectorAll(".field")) {
    wrapper.classList.remove("field--error");
    wrapper.querySelector(".field__error")?.remove();
  }

  for (const [name, message] of Object.entries(fieldErrors ?? {})) {
    const wrapper = form.querySelector(`.field[data-field="${name}"]`);
    if (!wrapper) continue;
    wrapper.classList.add("field--error");
    wrapper.appendChild(element("p", "field__error", message));
  }
}

function renderForm(nodeId, node) {
  hasInteracted = true;
  track("form_shown", { nodeId, optionId: node.form.id, optionLabel: node.form.id });

  const form = element("form", "chat-form");
  form.noValidate = true;

  for (const spec of node.form.fields) form.appendChild(buildField(spec));

  const banner = element("div", "form-error");
  banner.hidden = true;
  form.appendChild(banner);

  const submit = element("button", "cta", node.form.submitLabel);
  submit.type = "submit";
  form.appendChild(submit);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    banner.hidden = true;
    submit.disabled = true;
    submit.textContent = "Sending…";

    const values = Object.fromEntries(new FormData(form).entries());

    try {
      await sessionReady;
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, kind: node.form.kind, sessionId }),
      });
      const data = await response.json();

      if (!response.ok) {
        showFieldErrors(form, data.fields);
        banner.textContent = data.error ?? "Something went wrong. Please try again.";
        banner.hidden = false;
        submit.disabled = false;
        submit.textContent = node.form.submitLabel;
        scrollToEnd();
        return;
      }

      showFieldErrors(form, {});
      track("form_submitted", { nodeId, optionId: node.form.id, optionLabel: node.form.id });
      setOutcome(`${node.form.kind}_submitted`, true);
      flush();

      clearActions();
      addBubble(summarise(values), "user");
      for (const message of THANK_YOU[node.form.kind] ?? ["Thanks — we'll be in touch."]) {
        await typeThen(message);
      }
      appendRestart();
    } catch {
      banner.textContent = "We couldn't send that. Please check your connection and try again.";
      banner.hidden = false;
      submit.disabled = false;
      submit.textContent = node.form.submitLabel;
    }
  });

  actions.appendChild(form);
  scrollToEnd();
}

/** A short confirmation bubble echoing what the visitor sent. */
function summarise(values) {
  const parts = [values.name, values.phone, values.email].filter(Boolean);
  return parts.join(" · ");
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
