const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const db = new sqlite3.Database(path.join(__dirname, "devdesk.db"));

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- DB Helpers ----------
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// ---------- Init Tables ----------
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      description TEXT,
      category TEXT,
      status TEXT DEFAULT 'Open',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS kb_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      content TEXT,
      tags TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      asset_tag TEXT,
      serial_number TEXT,
      assigned_to TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// ---------- Tickets ----------
app.get("/api/tickets", async (req, res) => {
  res.json(await all("SELECT * FROM tickets ORDER BY id DESC"));
});

app.post("/api/tickets", async (req, res) => {
  const { title, description, category } = req.body;
  const r = await run(
    "INSERT INTO tickets (title, description, category) VALUES (?, ?, ?)",
    [title, description, category]
  );
  res.json(r);
});

app.patch("/api/tickets/:id", async (req, res) => {
  await run("UPDATE tickets SET status=? WHERE id=?", [
    req.body.status,
    req.params.id,
  ]);
  res.json({ ok: true });
});

// ---------- KB ----------
app.get("/api/kb", async (req, res) => {
  res.json(await all("SELECT * FROM kb_articles ORDER BY id DESC"));
});

app.post("/api/kb", async (req, res) => {
  const { title, content, tags } = req.body;
  const r = await run(
    "INSERT INTO kb_articles (title, content, tags) VALUES (?, ?, ?)",
    [title, content, tags]
  );
  res.json(r);
});

// ---------- Assets ----------
app.get("/api/assets", async (req, res) => {
  res.json(await all("SELECT * FROM assets ORDER BY id DESC"));
});

app.post("/api/assets", async (req, res) => {
  const { name, asset_tag, serial_number, assigned_to, notes } = req.body;
  const r = await run(
    "INSERT INTO assets (name, asset_tag, serial_number, assigned_to, notes) VALUES (?, ?, ?, ?, ?)",
    [name, asset_tag, serial_number, assigned_to, notes]
  );
  res.json(r);
});

// ---------- Frontend ----------
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(3000, () => {
  console.log("DevDesk running at http://localhost:3000");
});
