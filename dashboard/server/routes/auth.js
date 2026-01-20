import express from "express";
import bcrypt from "bcrypt";
import { dbOps } from "../db/index.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: "Missing credentials" });
    return;
  }
  const user = await dbOps.get(
    "SELECT * FROM users WHERE username = ?",
    [username]
  );
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  req.session.userId = user.id;
  req.session.user = { id: user.id, username: user.username, isAdmin: true };
  res.json({ ok: true, user: { id: user.id, username: user.username, isAdmin: true } });
});

router.post("/logout", async (req, res) => {
  if (!req.session) {
    res.json({ ok: true });
    return;
  }
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get("/me", async (req, res) => {
  if (!req.session || !req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const user = await dbOps.get(
    "SELECT id, username, created_at FROM users WHERE id = ?",
    [req.session.userId]
  );
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.session.user = { id: user.id, username: user.username, isAdmin: true };
  res.json({ ok: true, user: { id: user.id, username: user.username, isAdmin: true } });
});

export default router;