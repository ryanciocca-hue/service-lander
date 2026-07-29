/**
 * Email notifications via the Resend HTTP API (https://resend.com/docs).
 * Uses plain fetch, so there is no SDK dependency to keep up to date.
 *
 * Configure with RESEND_API_KEY, FROM_EMAIL and NOTIFY_EMAILS. If the API key
 * is missing, sending is skipped and the submission is still saved — a failed
 * notification must never cost you the lead.
 */

const KIND_LABELS = {
  parts_callback: "Parts callback request",
  service_request: "Service request",
};

function recipients(kind) {
  const perKind =
    kind === "parts_callback"
      ? process.env.NOTIFY_EMAILS_PARTS
      : process.env.NOTIFY_EMAILS_SERVICE;

  const raw = perKind || process.env.NOTIFY_EMAILS || "";
  return raw
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildRows(submission) {
  const rows = [
    ["Name", submission.name],
    ["Phone", submission.phone],
    ["Email", submission.email],
  ];
  if (submission.product) rows.push(["Product", submission.product]);
  if (submission.state) rows.push(["State", submission.state]);
  if (submission.notes) {
    rows.push([
      submission.kind === "service_request" ? "Service details" : "Parts needed",
      submission.notes,
    ]);
  }
  return rows;
}

function buildHtml(submission, context) {
  const label = KIND_LABELS[submission.kind] ?? "New request";
  const cells = buildRows(submission)
    .map(
      ([key, value]) => `
        <tr>
          <td style="padding:8px 12px;background:#f4f6fa;font-weight:600;white-space:nowrap;vertical-align:top;">${escapeHtml(key)}</td>
          <td style="padding:8px 12px;">${escapeHtml(value).replace(/\n/g, "<br/>")}</td>
        </tr>`
    )
    .join("");

  const attribution = [
    ["Campaign", context.utm_campaign],
    ["Source", context.utm_source],
    ["Keyword", context.utm_term],
    ["Google Click ID", context.gclid],
    ["Device", context.device],
  ].filter(([, value]) => Boolean(value));

  const attributionHtml = attribution.length
    ? `<h3 style="font:600 14px system-ui,sans-serif;color:#4a5568;margin:24px 0 8px;">Where they came from</h3>
       <table style="border-collapse:collapse;font:14px system-ui,sans-serif;color:#1a202c;">
         ${attribution
           .map(
             ([key, value]) => `
           <tr>
             <td style="padding:6px 12px;background:#f4f6fa;font-weight:600;white-space:nowrap;">${escapeHtml(key)}</td>
             <td style="padding:6px 12px;">${escapeHtml(value)}</td>
           </tr>`
           )
           .join("")}
       </table>`
    : "";

  return `
  <div style="font:14px system-ui,-apple-system,Segoe UI,sans-serif;color:#1a202c;max-width:620px;">
    <h2 style="font:700 20px system-ui,sans-serif;margin:0 0 4px;">${escapeHtml(label)}</h2>
    <p style="color:#4a5568;margin:0 0 20px;">Submitted from service.powertechniquena.com</p>
    <table style="border-collapse:collapse;width:100%;">${cells}</table>
    ${attributionHtml}
    <p style="color:#718096;font-size:12px;margin-top:28px;">
      Reply directly to this email to reach the customer.
    </p>
  </div>`;
}

function buildText(submission, context) {
  const label = KIND_LABELS[submission.kind] ?? "New request";
  const lines = [label, "Submitted from service.powertechniquena.com", ""];
  for (const [key, value] of buildRows(submission)) lines.push(`${key}: ${value}`);

  const attribution = [
    ["Campaign", context.utm_campaign],
    ["Source", context.utm_source],
    ["Keyword", context.utm_term],
    ["Google Click ID", context.gclid],
    ["Device", context.device],
  ].filter(([, value]) => Boolean(value));

  if (attribution.length) {
    lines.push("", "Where they came from");
    for (const [key, value] of attribution) lines.push(`${key}: ${value}`);
  }
  return lines.join("\n");
}

/**
 * Sends the notification. Never throws — returns a result object the caller
 * records against the submission row.
 */
export async function sendSubmissionNotification(submission, context = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL;
  const to = recipients(submission.kind);

  if (!apiKey) return { sent: false, error: "RESEND_API_KEY is not set" };
  if (!from) return { sent: false, error: "FROM_EMAIL is not set" };
  if (to.length === 0) return { sent: false, error: "NOTIFY_EMAILS is not set" };

  const label = KIND_LABELS[submission.kind] ?? "New request";
  const subject = `${label} — ${submission.name}`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Stops duplicate emails if the function is retried.
        "Idempotency-Key": `submission-${submission.id}`,
      },
      body: JSON.stringify({
        from,
        to,
        reply_to: submission.email,
        subject,
        html: buildHtml(submission, context),
        text: buildText(submission, context),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return { sent: false, error: `Resend ${response.status}: ${detail.slice(0, 300)}` };
    }

    return { sent: true, error: null };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}
