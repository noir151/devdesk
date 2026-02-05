const viewEl = document.getElementById("view");
const tabs = document.querySelectorAll(".tab");

tabs.forEach((t) =>
  t.addEventListener("click", () => {
    tabs.forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    render(t.dataset.view);
  }),
);

function el(html) {
  const div = document.createElement("div");
  div.innerHTML = html.trim();
  return div.firstChild;
}

// Robust API helper:
// - Handles JSON + text
// - Shows real backend error message (instead of JSON parse crashes)
async function api(path, options) {
  const res = await fetch(path, options);
  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (!res.ok) {
    const body = isJson ? await res.json() : await res.text();
    const msg =
      isJson && body && body.error
        ? body.error
        : typeof body === "string"
          ? body
          : `Request failed: ${res.status}`;
    throw new Error(msg);
  }

  return isJson ? await res.json() : await res.text();
}

async function downloadCsv(url, filename) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download CSV (${res.status})`);

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(objectUrl);
  } catch (e) {
    alert(`CSV download failed: ${e.message || e}`);
  }
}

// ---------------- Tickets ----------------
async function renderTickets() {
  const searchState = window.__ticketsSearch || { q: "", status: "", category: "" };
  const qs = new URLSearchParams(searchState).toString();

  const ticketsRaw = await api(`/api/tickets?${qs}`);
  const tickets = Array.isArray(ticketsRaw) ? ticketsRaw : [];

  const root = el(`
    <div class="grid">
      <div class="card">
        <h2>Create Ticket</h2>
        <div class="muted">Log an issue/request.</div>

        <label>Title</label>
        <input id="t_title" placeholder="e.g. Can't access email" />

        <label>Description</label>
        <textarea id="t_desc" placeholder="What happened? Any error message?"></textarea>

        <label>Category</label>
        <select id="t_cat">
          <option>Network</option>
          <option>Hardware</option>
          <option>Access</option>
          <option>Software</option>
        </select>

        <div style="margin-top:12px;">
          <button class="primary" id="t_submit">Submit</button>
        </div>
      </div>

      <div class="card">
        <div class="row">
          <div>
            <h2 style="margin:0;">Tickets</h2>
            <div class="muted">Search + filter + update status inline.</div>
          </div>
          <div>
            <button class="primary" id="dl_tickets">Download CSV</button>
          </div>
        </div>

        <div class="row" style="gap:8px; margin: 12px 0;">
          <input id="t_q" placeholder="Search tickets..." style="flex: 2;" />
          <select id="t_status" style="flex: 1;">
            <option value="">All Status</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Closed">Closed</option>
          </select>
          <select id="t_cat_filter" style="flex: 1;">
            <option value="">All Categories</option>
            <option value="Network">Network</option>
            <option value="Hardware">Hardware</option>
            <option value="Access">Access</option>
            <option value="Software">Software</option>
          </select>
          <button class="primary" id="t_apply">Apply</button>
          <button id="t_clear">Clear</button>
        </div>

        <div id="t_list"></div>
      </div>
    </div>
  `);

  // Restore filters
  root.querySelector("#t_q").value = searchState.q || "";
  root.querySelector("#t_status").value = searchState.status || "";
  root.querySelector("#t_cat_filter").value = searchState.category || "";

  root.querySelector("#t_apply").addEventListener("click", () => {
    window.__ticketsSearch = {
      q: root.querySelector("#t_q").value.trim(),
      status: root.querySelector("#t_status").value,
      category: root.querySelector("#t_cat_filter").value,
    };
    render("tickets");
  });

  root.querySelector("#t_clear").addEventListener("click", () => {
    window.__ticketsSearch = { q: "", status: "", category: "" };
    render("tickets");
  });

  root.querySelector("#t_q").addEventListener("keydown", (e) => {
    if (e.key === "Enter") root.querySelector("#t_apply").click();
  });

  // Submit ticket (with validation + helpful errors)
  root.querySelector("#t_submit").addEventListener("click", async () => {
    const title = root.querySelector("#t_title").value.trim();
    const description = root.querySelector("#t_desc").value.trim();
    const category = root.querySelector("#t_cat").value;

    if (!title || !description) {
      alert("Please enter a title and description.");
      return;
    }

    try {
      await api("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, category }),
      });

      // Reset form
      root.querySelector("#t_title").value = "";
      root.querySelector("#t_desc").value = "";
      root.querySelector("#t_cat").value = "Network";

      // Make sure new ticket is visible
      window.__ticketsSearch = { q: "", status: "", category: "" };

      render("tickets");
    } catch (e) {
      alert(`Ticket submit failed: ${e.message || e}`);
    }
  });

  // CSV export
  root.querySelector("#dl_tickets").addEventListener("click", () => {
    downloadCsv("/api/tickets.csv", "tickets.csv");
  });

  const list = root.querySelector("#t_list");

  if (tickets.length === 0) {
    list.innerHTML = `<div class="card"><b>No tickets found.</b><div class="muted">Try clearing filters or adding a new ticket.</div></div>`;
    return root;
  }

  list.innerHTML = tickets
    .map(
      (t) => `
    <div class="card" style="margin-bottom:10px;">
      <div class="row">
        <div>
          <div><b>#${t.id}</b> ${escapeHtml(t.title)}</div>
          <div class="muted">${escapeHtml(t.category)} • ${escapeHtml(t.created_at)}</div>
        </div>
        <div class="pill">${escapeHtml(t.status)}</div>
      </div>
      <div style="margin-top:8px;">${escapeHtml(t.description)}</div>
      <div style="margin-top:10px;">
        <select data-id="${t.id}" class="status">
          ${["Open", "In Progress", "Closed"]
            .map((s) => `<option ${s === t.status ? "selected" : ""}>${s}</option>`)
            .join("")}
        </select>
      </div>
    </div>
  `,
    )
    .join("");

  list.querySelectorAll(".status").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const id = sel.getAttribute("data-id");
      try {
        await api(`/api/tickets/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: sel.value }),
        });
        render("tickets");
      } catch (e) {
        alert(`Status update failed: ${e.message || e}`);
      }
    });
  });

  return root;
}

// ---------------- KB ----------------
async function renderKB() {
  const searchState = window.__kbSearch || { q: "" };
  const qs = new URLSearchParams(searchState).toString();

  const kbRaw = await api(`/api/kb?${qs}`);
  const kb = Array.isArray(kbRaw) ? kbRaw : [];

  const root = el(`
    <div class="grid">
      <div class="card">
        <h2>Create KB Article</h2>

        <label>Title</label>
        <input id="k_title" placeholder="e.g. Fix Wi-Fi disconnecting" />

        <label>Content</label>
        <textarea id="k_content" placeholder="Step-by-step fix..."></textarea>

        <label>Tags (comma separated)</label>
        <input id="k_tags" placeholder="wifi, network, windows" />

        <div style="margin-top:12px;">
          <button class="primary" id="k_submit">Publish</button>
        </div>
      </div>

      <div class="card">
        <div class="row">
          <div>
            <h2 style="margin:0;">Articles</h2>
            <div class="muted">Search and export your knowledge base.</div>
          </div>
          <div>
            <button class="primary" id="dl_kb">Download CSV</button>
          </div>
        </div>

        <div class="row" style="gap:8px; margin: 12px 0;">
          <input id="k_q" placeholder="Search KB (title, content, tags)..." style="flex: 2;" />
          <button class="primary" id="k_apply">Search</button>
          <button id="k_clear">Clear</button>
        </div>

        <div id="k_list"></div>
      </div>
    </div>
  `);

  root.querySelector("#k_q").value = searchState.q || "";

  root.querySelector("#k_apply").addEventListener("click", () => {
    window.__kbSearch = { q: root.querySelector("#k_q").value.trim() };
    render("kb");
  });

  root.querySelector("#k_clear").addEventListener("click", () => {
    window.__kbSearch = { q: "" };
    render("kb");
  });

  root.querySelector("#k_q").addEventListener("keydown", (e) => {
    if (e.key === "Enter") root.querySelector("#k_apply").click();
  });

  root.querySelector("#dl_kb").addEventListener("click", () => {
    downloadCsv("/api/kb.csv", "knowledge_base.csv");
  });

  root.querySelector("#k_submit").addEventListener("click", async () => {
    const title = root.querySelector("#k_title").value.trim();
    const content = root.querySelector("#k_content").value.trim();
    const tags = root.querySelector("#k_tags").value.trim();

    if (!title || !content) {
      alert("Please enter a title and content.");
      return;
    }

    try {
      await api("/api/kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, tags }),
      });

      root.querySelector("#k_title").value = "";
      root.querySelector("#k_content").value = "";
      root.querySelector("#k_tags").value = "";

      window.__kbSearch = { q: "" };
      render("kb");
    } catch (e) {
      alert(`KB publish failed: ${e.message || e}`);
    }
  });

  const list = root.querySelector("#k_list");

  if (kb.length === 0) {
    list.innerHTML = `<div class="card"><b>No articles found.</b><div class="muted">Try clearing search or publishing a new article.</div></div>`;
    return root;
  }

  list.innerHTML = kb
    .map(
      (a) => `
    <div class="card" style="margin-bottom:10px;">
      <div><b>#${a.id}</b> ${escapeHtml(a.title)}</div>
      <div class="muted">${escapeHtml(a.created_at)} • ${escapeHtml(a.tags || "")}</div>
      <div style="margin-top:8px;">${escapeHtml(a.content)}</div>
    </div>
  `,
    )
    .join("");

  return root;
}

// ---------------- Assets ----------------
async function renderAssets() {
  const searchState = window.__assetsSearch || { q: "" };
  const qs = new URLSearchParams(searchState).toString();

  const assetsRaw = await api(`/api/assets?${qs}`);
  const assets = Array.isArray(assetsRaw) ? assetsRaw : [];

  const root = el(`
    <div class="grid">
      <div class="card">
        <h2>Add Asset</h2>

        <label>Name</label>
        <input id="a_name" placeholder="e.g. Dell Latitude 5420" />

        <label>Asset Tag</label>
        <input id="a_tag" placeholder="e.g. IT-00012" />

        <label>Serial Number</label>
        <input id="a_serial" placeholder="e.g. ABC123..." />

        <label>Assigned To</label>
        <input id="a_assigned" placeholder="e.g. Nouar" />

        <label>Notes</label>
        <textarea id="a_notes" placeholder="Condition, warranty, etc."></textarea>

        <div style="margin-top:12px;">
          <button class="primary" id="a_submit">Save</button>
        </div>
      </div>

      <div class="card">
        <div class="row">
          <div>
            <h2 style="margin:0;">Assets</h2>
            <div class="muted">Search and export inventory for audits and BI.</div>
          </div>
          <div>
            <button class="primary" id="dl_assets">Download CSV</button>
          </div>
        </div>

        <div class="row" style="gap:8px; margin: 12px 0;">
          <input id="a_q" placeholder="Search assets (name, tag, serial, user)..." style="flex: 2;" />
          <button class="primary" id="a_apply">Search</button>
          <button id="a_clear">Clear</button>
        </div>

        <div id="a_list"></div>
      </div>
    </div>
  `);

  root.querySelector("#a_q").value = searchState.q || "";

  root.querySelector("#a_apply").addEventListener("click", () => {
    window.__assetsSearch = { q: root.querySelector("#a_q").value.trim() };
    render("assets");
  });

  root.querySelector("#a_clear").addEventListener("click", () => {
    window.__assetsSearch = { q: "" };
    render("assets");
  });

  root.querySelector("#a_q").addEventListener("keydown", (e) => {
    if (e.key === "Enter") root.querySelector("#a_apply").click();
  });

  root.querySelector("#dl_assets").addEventListener("click", () => {
    downloadCsv("/api/assets.csv", "assets.csv");
  });

  root.querySelector("#a_submit").addEventListener("click", async () => {
    const name = root.querySelector("#a_name").value.trim();
    const asset_tag = root.querySelector("#a_tag").value.trim();
    const serial_number = root.querySelector("#a_serial").value.trim();
    const assigned_to = root.querySelector("#a_assigned").value.trim();
    const notes = root.querySelector("#a_notes").value.trim();

    if (!name) {
      alert("Please enter an asset name.");
      return;
    }

    try {
      await api("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, asset_tag, serial_number, assigned_to, notes }),
      });

      root.querySelector("#a_name").value = "";
      root.querySelector("#a_tag").value = "";
      root.querySelector("#a_serial").value = "";
      root.querySelector("#a_assigned").value = "";
      root.querySelector("#a_notes").value = "";

      window.__assetsSearch = { q: "" };
      render("assets");
    } catch (e) {
      alert(`Asset save failed: ${e.message || e}`);
    }
  });

  const list = root.querySelector("#a_list");

  if (assets.length === 0) {
    list.innerHTML = `<div class="card"><b>No assets found.</b><div class="muted">Try clearing search or adding a new asset.</div></div>`;
    return root;
  }

  list.innerHTML = assets
    .map(
      (a) => `
    <div class="card" style="margin-bottom:10px;">
      <div class="row">
        <div><b>#${a.id}</b> ${escapeHtml(a.name)}</div>
        <div class="pill">${escapeHtml(a.asset_tag || "No tag")}</div>
      </div>
      <div class="muted">${escapeHtml(a.created_at)}</div>
      <div style="margin-top:8px;">
        <div><b>Serial:</b> ${escapeHtml(a.serial_number || "-")}</div>
        <div><b>Assigned:</b> ${escapeHtml(a.assigned_to || "-")}</div>
        <div><b>Notes:</b> ${escapeHtml(a.notes || "-")}</div>
      </div>
    </div>
  `,
    )
    .join("");

  return root;
}

// ---------------- Router ----------------
async function render(which) {
  viewEl.innerHTML = "Loading...";
  try {
    const node =
      which === "kb"
        ? await renderKB()
        : which === "assets"
          ? await renderAssets()
          : await renderTickets();

    viewEl.innerHTML = "";
    viewEl.appendChild(node);
  } catch (e) {
    viewEl.innerHTML = `<div class="card"><b>Error:</b> ${escapeHtml(String(e.message || e))}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[m],
  );
}

render("tickets");
