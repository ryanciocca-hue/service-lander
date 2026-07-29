import { isAuthenticated } from "../../lib/auth.js";

/** GET /api/admin/me — lets the dashboard decide whether to show the login screen. */
export default async function handler(req, res) {
  res.status(200).json({ authenticated: isAuthenticated(req) });
}
