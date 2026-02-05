const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dbPath = path.join(__dirname, "devdesk.db");
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

async function seed() {
  console.log("Seeding database:", dbPath);

  await run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      description TEXT,
      category TEXT,
      status TEXT DEFAULT 'Open',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS kb_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      content TEXT,
      tags TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
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

  await run("DELETE FROM tickets");
  await run("DELETE FROM kb_articles");
  await run("DELETE FROM assets");

  // ---- Tickets ----
  const tickets = [
    {
      title: "Cannot connect to office Wi-Fi",
      description:
        "Laptop drops connection every few minutes on the office network. Works fine on hotspot.",
      category: "Network",
      status: "Open",
    },
    {
      title: "Outlook login loop",
      description:
        "Outlook keeps requesting password repeatedly. Credential Manager cleared but issue persists.",
      category: "Software",
      status: "In Progress",
    },
    {
      title: "New starter account setup",
      description:
        "Create Windows + email account for a new employee starting Monday. Needs VPN access + Teams.",
      category: "Access",
      status: "Open",
    },
    {
      title: "VPN error 809 when working remotely",
      description:
        "User cannot connect to VPN from home. Error code 809. Suspect router or IPsec ports blocked.",
      category: "Network",
      status: "In Progress",
    },
    {
      title: "Laptop overheating and fan noise",
      description:
        "Device runs hot during normal use; fan at full speed. Check dust/build-up and BIOS updates.",
      category: "Hardware",
      status: "Closed",
    },
    {
      title: "Printer not showing in list",
      description:
        "User can’t see the shared printer. Needs re-add of print server and correct permissions.",
      category: "Access",
      status: "Closed",
    },
  ];

  for (const t of tickets) {
    await run(
      "INSERT INTO tickets (title, description, category, status) VALUES (?, ?, ?, ?)",
      [t.title, t.description, t.category, t.status],
    );
  }

  // ---- Knowledge Base ----
  const kb = [
    {
      title: "Fix Wi-Fi disconnecting on Windows 11",
      content:
        "Disable power saving on the wireless adapter, update the driver from the manufacturer, then restart.",
      tags: "wifi, windows, network",
    },
    {
      title: "Reset Outlook credential cache",
      content:
        "Remove stored credentials in Credential Manager, sign out of Office apps, restart, then sign in again.",
      tags: "outlook, login, office365",
    },
    {
      title: "VPN error 809 resolution",
      content:
        "Confirm IPsec services are running and UDP ports 500/4500 are open. Try a different network to isolate router/firewall issues.",
      tags: "vpn, ipsec, remote",
    },
    {
      title: "Basic laptop performance checklist",
      content:
        "Check disk space, disable heavy startup apps, run updates, and verify antivirus scans. Consider SSD health check for older devices.",
      tags: "performance, laptop, troubleshooting",
    },
  ];

  for (const a of kb) {
    await run(
      "INSERT INTO kb_articles (title, content, tags) VALUES (?, ?, ?)",
      [a.title, a.content, a.tags],
    );
  }

  // ---- Assets ----
  const assets = [
    {
      name: "Dell Latitude 5420",
      asset_tag: "IT-LAP-0142",
      serial_number: "DL5420-88421",
      assigned_to: "Sarah Ahmed",
      notes: "Finance team laptop. Warranty until 2027.",
    },
    {
      name: "MacBook Pro 14",
      asset_tag: "IT-MAC-0021",
      serial_number: "MBP14-99231",
      assigned_to: "Dev Team Pool",
      notes: "Shared dev machine for testing Safari + iOS builds.",
    },
    {
      name: "HP ProDesk 600",
      asset_tag: "IT-DT-0055",
      serial_number: "HP600-22194",
      assigned_to: "Reception",
      notes: "Front desk workstation. Dual monitor setup.",
    },
    {
      name: "iPhone 13",
      asset_tag: "IT-MOB-0031",
      serial_number: "IP13-77129",
      assigned_to: "Sales Manager",
      notes: "Company mobile device. Enrolled in MDM.",
    },
  ];

  for (const a of assets) {
    await run(
      "INSERT INTO assets (name, asset_tag, serial_number, assigned_to, notes) VALUES (?, ?, ?, ?, ?)",
      [a.name, a.asset_tag, a.serial_number, a.assigned_to, a.notes],
    );
  }

  console.log("✅ Seed complete:");
  console.log(`- Tickets: ${tickets.length}`);
  console.log(`- KB Articles: ${kb.length}`);
  console.log(`- Assets: ${assets.length}`);
}

seed()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
