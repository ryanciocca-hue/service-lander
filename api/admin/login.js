import { checkPassword, issueSession } from "../../lib/auth.js";
import { readJson, methodGuard } from "../../lib/http.js";

/** POST /api/admin/login  { password } */
export default async function handler(req, res) {
  if (!methodGuard(req, res, "POST")) return;

  try {
    const { password } = await readJson(req);

    if (!checkPassword(password)) {
      // Small delay to blunt brute-force attempts against the single password.
      await new Promise((resolve) => setTimeout(resolve, 600));
      res.status(401).json({ error: "Incorrect password." });
      return;
    }

    issueSession(res);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("POST /api/admin/login failed:", err);
    res.status(500).json({ error: "Login is not configured. Check ADMIN_PASSWORD and SESSION_SECRET." });
  }
}
