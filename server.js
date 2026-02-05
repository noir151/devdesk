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

// ---------- CSV Helpers ----------
function toCsv(rows, columns) {
  const escape = (value) => {
    if (value === null || value === undefined) return "";
    const s = String(value);
    const needsQuotes = /[",\n\r]/.test(s);
    const escaped = s.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  };

  const headerLine = columns.map((c) => escape(c.header)).join(",");
  const dataLines = rows.map((r) => columns.map((c) => escape(r[c.key])).join(","));
  return [headerLine, ...dataLines].join("\n");
}

// ---------- CSV Routes (MUST be before app.get("*")) ----------
app.get("/api/tickets.csv", async (req, res) => {
  try {
    const rows = await all("SELECT * FROM tickets ORDER BY id DESC");
    const csv = toCsv(rows, [
      { key: "id", header: "Ticket ID" },
      { key: "title", header: "Title" },
      { key: "description", header: "Description" },
      { key: "category", header: "Category" },
      { key: "status", header: "Status" },
      { key: "created_at", header: "Created At" },
    ]);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="tickets.csv"');
    res.send(csv);
  } catch (e) {
    res.status(500).send(`CSV export failed: ${String(e.message || e)}`);
  }
});

app.get("/api/kb.csv", async (req, res) => {
  try {
    const rows = await all("SELECT * FROM kb_articles ORDER BY id DESC");
    const csv = toCsv(rows, [
      { key: "id", header: "Article ID" },
      { key: "title", header: "Title" },
      { key: "content", header: "Content" },
      { key: "tags", header: "Tags" },
      { key: "created_at", header: "Created At" },
    ]);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="knowledge_base.csv"');
    res.send(csv);
  } catch (e) {
    res.status(500).send(`CSV export failed: ${String(e.message || e)}`);
  }
});

app.get("/api/assets.csv", async (req, res) => {
  try {
    const rows = await all("SELECT * FROM assets ORDER BY id DESC");
    const csv = toCsv(rows, [
      { key: "id", header: "Asset ID" },
      { key: "name", header: "Name" },
      { key: "asset_tag", header: "Asset Tag" },
      { key: "serial_number", header: "Serial Number" },
      { key: "assigned_to", header: "Assigned To" },
      { key: "notes", header: "Notes" },
      { key: "created_at", header: "Created At" },
    ]);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="assets.csv"');
    res.send(csv);
  } catch (e) {
    res.status(500).send(`CSV export failed: ${String(e.message || e)}`);
  }
});

// ---------- Tickets (Search + List) ----------
app.get("/api/tickets", async (req, res) => {
  try {
    const { q = "", status = "", category = "" } = req.query;

    let sql = "SELECT * FROM tickets WHERE 1=1";
    const params = [];

    if (q.trim()) {
      sql += " AND (title LIKE ? OR description LIKE ?)";
      const like = `%${q.trim()}%`;
      params.push(like, like);
    }

    if (status.trim()) {
      sql += " AND status = ?";
      params.push(status.trim());
    }

    if (category.trim()) {
      sql += " AND category = ?";
      params.push(category.trim());
    }

    sql += " ORDER BY id DESC";

    const rows = await all(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---------- Tickets (Create) ----------
app.post("/api/tickets", async (req, res) => {
  try {
    const body = req.body || {};
    const title = (body.title || "").trim();
    const description = (body.description || "").trim();
    const category = (body.category || "").trim();

    if (!title || !description || !category) {
      return res.status(400).json({ error: "title, description, category are required" });
    }

    const r = await run(
      "INSERT INTO tickets (title, description, category, status) VALUES (?, ?, ?, ?)",
      [title, description, category, "Open"]
    );

    res.status(201).json(r);
  } catch (e) {
    console.error("POST /api/tickets failed:", e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---------- Tickets (Update Status) ----------
app.patch("/api/tickets/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = (req.body?.status || "").trim();

    const allowed = new Set(["Open", "In Progress", "Closed"]);
    if (!allowed.has(status)) {
      return res.status(400).json({ error: "status must be Open, In Progress, or Closed" });
    }

    const r = await run("UPDATE tickets SET status=? WHERE id=?", [status, id]);
    if (r.changes === 0) return res.status(404).json({ error: "Ticket not found" });

    res.json({ ok: true });
  } catch (e) {
    console.error("PATCH /api/tickets/:id failed:", e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---------- KB (Search + List) ----------
app.get("/api/kb", async (req, res) => {
  try {
    const { q = "" } = req.query;

    let sql = "SELECT * FROM kb_articles WHERE 1=1";
    const params = [];

    if (q.trim()) {
      sql += " AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)";
      const like = `%${q.trim()}%`;
      params.push(like, like, like);
    }

    sql += " ORDER BY id DESC";
    res.json(await all(sql, params));
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---------- KB (Create) ----------
app.post("/api/kb", async (req, res) => {
  try {
    const body = req.body || {};
    const title = (body.title || "").trim();
    const content = (body.content || "").trim();
    const tags = (body.tags || "").trim();

    if (!title || !content) {
      return res.status(400).json({ error: "title and content are required" });
    }

    const r = await run(
      "INSERT INTO kb_articles (title, content, tags) VALUES (?, ?, ?)",
      [title, content, tags]
    );

    res.status(201).json(r);
  } catch (e) {
    console.error("POST /api/kb failed:", e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---------- Assets (Search + List) ----------
app.get("/api/assets", async (req, res) => {
  try {
    const { q = "" } = req.query;

    let sql = "SELECT * FROM assets WHERE 1=1";
    const params = [];

    if (q.trim()) {
      sql += " AND (name LIKE ? OR asset_tag LIKE ? OR serial_number LIKE ? OR assigned_to LIKE ? OR notes LIKE ?)";
      const like = `%${q.trim()}%`;
      params.push(like, like, like, like, like);
    }

    sql += " ORDER BY id DESC";
    res.json(await all(sql, params));
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---------- Assets (Create) ----------
app.post("/api/assets", async (req, res) => {
  try {
    const body = req.body || {};
    const name = (body.name || "").trim();
    const asset_tag = (body.asset_tag || "").trim();
    const serial_number = (body.serial_number || "").trim();
    const assigned_to = (body.assigned_to || "").trim();
    const notes = (body.notes || "").trim();

    if (!name) return res.status(400).json({ error: "name is required" });

    const r = await run(
      "INSERT INTO assets (name, asset_tag, serial_number, assigned_to, notes) VALUES (?, ?, ?, ?, ?)",
      [name, asset_tag, serial_number, assigned_to, notes]
    );

    res.status(201).json(r);
  } catch (e) {
    console.error("POST /api/assets failed:", e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---------- Frontend (KEEP THIS LAST) ----------
app.get("*", (req, res) => {
  // Protect against returning HTML for API paths
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "API route not found", path: req.path });
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------- Listen (ALWAYS LAST) ----------
app.listen(3000, () => {
  console.log("DevDesk running at http://localhost:3000");
});
