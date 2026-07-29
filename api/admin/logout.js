import { clearSession } from "../../lib/auth.js";
import { methodGuard } from "../../lib/http.js";

/** POST /api/admin/logout */
export default async function handler(req, res) {
  if (!methodGuard(req, res, "POST")) return;
  clearSession(res);
  res.status(200).json({ ok: true });
}
