/**
 * ===========================================================================
 * THE CONVERSATION SCRIPT
 * ===========================================================================
 * This is the only file you need to edit to change what the chat says, what
 * options it offers, or where each answer leads.
 *
 * It is imported by both the browser (public/chat.js) and the analytics API
 * (api/admin/metrics.js), so the dashboard always labels questions and options
 * exactly the way visitors saw them.
 *
 * Each node can have:
 *   messages  - the agent's chat bubbles, shown one at a time with typing dots
 *   question  - the canonical question text used in reports
 *   options   - buttons the visitor picks from; `next` is the node they go to
 *   cta       - a single call-to-action button (a link or a phone number)
 *   form      - a form rendered inside the chat
 *   outcome   - recorded against the conversation when this node is reached
 * ===========================================================================
 */

export const CONFIG = {
  agentName: "Ryan",
  agentRole: "Atlas Copco Service",

  // Shown beside every agent bubble.
  agentShortName: "Ryan C.",

  // Headshot shown beside every agent bubble and in the chat header.
  // Drop the file in public/ and point this at it. If the file is missing or
  // fails to load, the avatar falls back to `agentInitials` automatically, so
  // the page never shows a broken image.
  agentPhoto: "/ryan-c.jpg",
  agentInitials: "R",

  webshopUrl: "https://shop-power-technique.atlascopco.com/en-us/",

  // PLACEHOLDER — swap in the real parts support number before launch.
  // Update both lines: `phoneDisplay` is what visitors read, `phoneHref` is
  // what their phone dials.
  phoneDisplay: "(800) 555-0100",
  phoneHref: "tel:+18005550100",
};

export const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "District of Columbia", "Florida", "Georgia",
  "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
  "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
  "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
  "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
  "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
  "Puerto Rico", "Canada", "Other / Outside the US",
];

/** Turns "Dale Whitfield" into ", Dale" so later prompts can use their name. */
function firstName(full) {
  const first = (full ?? "").trim().split(/\s+/)[0];
  return first ? `, ${first}` : "";
}

export const START_NODE = "intro";

export const NODES = {
  intro: {
    messages: [
      `Hi, I'm ${CONFIG.agentName} from Atlas Copco service.`,
      "Are you looking for parts or service?",
    ],
    question: "Are you looking for parts or service?",
    options: [
      { id: "parts", label: "Parts", next: "parts_route" },
      { id: "service", label: "Service", next: "service_form" },
    ],
  },

  parts_route: {
    messages: [
      "I can help you with that.",
      "Do you want someone to reach out to you for help, or do you want to shop for your parts online?",
    ],
    question: "Reach out for help, or shop online?",
    options: [
      { id: "webshop", label: "Shop on Web Shop", next: "parts_webshop" },
      { id: "contact_me", label: "Have someone contact me", next: "parts_callback" },
      { id: "call_now", label: "Call parts support now", next: "parts_call" },
    ],
  },

  parts_webshop: {
    messages: [
      "Perfect — the Web Shop has genuine Atlas Copco parts with live pricing and availability.",
      "Here's the direct link. You can search by machine model or part number once you're in.",
    ],
    cta: {
      kind: "link",
      label: "Open the Atlas Copco Web Shop",
      href: CONFIG.webshopUrl,
      note: "Opens in a new tab",
    },
    outcome: "webshop",
    terminal: true,
  },

  parts_call: {
    messages: [
      "Good call — that's usually the fastest way to get the right part identified.",
      `Our parts team is on ${CONFIG.phoneDisplay}. Have your machine model and serial number handy if you can.`,
    ],
    cta: {
      kind: "tel",
      label: `Call ${CONFIG.phoneDisplay}`,
      href: CONFIG.phoneHref,
      note: "Tap to call parts support",
    },
    outcome: "call",
    terminal: true,
  },

  parts_callback: {
    messages: ["No problem — I'll get a parts specialist to reach out to you."],
    form: {
      id: "parts_callback",
      kind: "parts_callback",
      submitLabel: "Send my request",
      // Asked one at a time. `prompt` is what the agent says before each
      // question — a function when it needs an earlier answer.
      fields: [
        {
          name: "name",
          label: "Your name",
          type: "text",
          autocomplete: "name",
          prompt: "First off, what's your name?",
          emptyError: "Just your name is fine.",
          required: true,
          maxLength: 100,
        },
        {
          name: "phone",
          label: "Phone number",
          type: "tel",
          autocomplete: "tel",
          prompt: (v) => `Thanks${firstName(v.name)}! What's the best phone number to reach you at?`,
          emptyError: "We'll need a number to call you back on.",
          required: true,
          maxLength: 32,
        },
        {
          name: "email",
          label: "Email address",
          type: "email",
          autocomplete: "email",
          prompt: "Got it. And your email address?",
          emptyError: "We'll need an email address.",
          required: true,
          maxLength: 254,
        },
        {
          name: "state",
          label: "State",
          type: "select",
          options: US_STATES,
          prompt: "Which state are you in? That way I can route you to the right team.",
          emptyError: "Please pick your state.",
          required: true,
        },
        {
          name: "notes",
          label: "What parts do you need?",
          type: "textarea",
          prompt:
            "Last one — what parts do you need? Machine model and serial number help if you have them handy.",
          emptyError: "Tell us roughly what you're after and we'll take it from there.",
          required: true,
          maxLength: 2000,
          placeholder: "e.g. XAS 185, serial ARP-2249811 — air filter and separator kit",
        },
      ],
    },
    outcome: "parts_callback",
    terminal: true,
  },

  service_form: {
    messages: ["Got it — let's get a service request started for you."],
    form: {
      id: "service_request",
      kind: "service_request",
      submitLabel: "Send my request",
      fields: [
        {
          name: "name",
          label: "Your name",
          type: "text",
          autocomplete: "name",
          prompt: "First off, what's your name?",
          emptyError: "Just your name is fine.",
          required: true,
          maxLength: 100,
        },
        {
          name: "phone",
          label: "Phone number",
          type: "tel",
          autocomplete: "tel",
          prompt: (v) => `Thanks${firstName(v.name)}. What's the best number to reach you at?`,
          emptyError: "We'll need a number to reach you on.",
          required: true,
          maxLength: 32,
        },
        {
          name: "email",
          label: "Email address",
          type: "email",
          autocomplete: "email",
          prompt: "And your email address?",
          emptyError: "We'll need an email address.",
          required: true,
          maxLength: 254,
        },
        {
          name: "notes",
          label: "Service request details",
          type: "textarea",
          prompt:
            "Now tell me what's going on — machine model, serial number, the issue you're seeing, and where the machine is.",
          emptyError: "A short description is enough to get started.",
          required: true,
          maxLength: 2000,
          placeholder: "e.g. QAS 60 generator, low oil pressure fault after 40 hours, Austin TX",
        },
      ],
    },
    outcome: "service_request",
    terminal: true,
  },
};

/** Shown after a form is submitted successfully. */
export const THANK_YOU = {
  parts_callback: [
    "Got it — thanks!",
    "A parts specialist will be in touch shortly. If it's urgent, you're welcome to call us directly.",
  ],
  service_request: [
    "Thanks — that's come through to our service team.",
    "Someone will follow up with you shortly to get this scheduled.",
  ],
};

/**
 * Every step, in flow order, used to draw the drop-off chart on the dashboard.
 *
 * This is a branching tree rather than a straight funnel — Parts and Service
 * run in parallel, and Parts then splits three ways — so each step records its
 * `parent`. The dashboard reports drop-off as a share of the parent step, which
 * is the honest comparison; a single descending funnel bar would imply a linear
 * path that does not exist.
 *
 * Keep this in step with the nodes above.
 */
export const FUNNEL = [
  { nodeId: "intro", label: "Chat opened", parent: null, depth: 0 },
  { nodeId: "parts_route", label: "Chose Parts", parent: "intro", depth: 1 },
  { nodeId: "parts_webshop", label: "Web Shop", parent: "parts_route", depth: 2 },
  { nodeId: "parts_callback", label: "Callback form", parent: "parts_route", depth: 2 },
  { nodeId: "parts_call", label: "Call parts support", parent: "parts_route", depth: 2 },
  { nodeId: "service_form", label: "Chose Service", parent: "intro", depth: 1 },
];

/** Human-readable names for each conversation outcome, used on the dashboard. */
export const OUTCOME_LABELS = {
  webshop: "Sent to Web Shop",
  call: "Sent to phone support",
  parts_callback: "Parts callback form shown",
  service_request: "Service form shown",
  parts_callback_submitted: "Parts callback submitted",
  service_request_submitted: "Service request submitted",
};

/** Every question node, in the order they should be reported. */
export const QUESTION_NODES = Object.entries(NODES)
  .filter(([, node]) => Array.isArray(node.options) && node.options.length > 0)
  .map(([id, node]) => ({
    nodeId: id,
    question: node.question ?? id,
    options: node.options.map((option) => ({ id: option.id, label: option.label })),
  }));
