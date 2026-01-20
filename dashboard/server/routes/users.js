import express from "express";
import bcrypt from "bcrypt";
import { dbOps } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  const users = await dbOps.all(
    "SELECT id, username, created_at FROM users ORDER BY id ASC"
  );
  res.json({ ok: true, users });
});

router.post("/", requireAuth, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: "Missing username or password" });
    return;
  }
  const existing = await dbOps.get(
    "SELECT id FROM users WHERE username = ?",
    [username]
  );
  if (existing) {
    res.status(409).json({ error: "Username already exists" });
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();
  await dbOps.run(
    "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
    [username, hash, now]
  );
  res.json({ ok: true });
});

router.put("/:id/password", requireAuth, async (req, res) => {
  const { password } = req.body || {};
  if (!password) {
    res.status(400).json({ error: "Missing password" });
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  await dbOps.run("UPDATE users SET password_hash = ? WHERE id = ?", [
    hash,
    req.params.id
  ]);
  res.json({ ok: true });
});

router.delete("/:id", requireAuth, async (req, res) => {
  if (String(req.session.userId) === String(req.params.id)) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }
  await dbOps.run("DELETE FROM users WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

export default router;