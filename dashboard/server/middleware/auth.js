import { dbOps } from "../db/index.js";

export function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export async function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  if (req.session.user && req.session.user.isAdmin === false) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

export async function attachUser(req, res, next) {
  if (req.session && req.session.userId) {
    const user = await dbOps.get(
      "SELECT id, username, created_at FROM users WHERE id = ?",
      [req.session.userId]
    );
    req.user = user || null;
  } else {
    req.user = null;
  }
  next();
}

export async function requireAgentAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing token" });
    return;
  }
  const agent = await dbOps.get(
    "SELECT * FROM agents WHERE agent_api_token = ?",
    [token]
  );
  if (!agent) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  req.agent = agent;
  next();
}