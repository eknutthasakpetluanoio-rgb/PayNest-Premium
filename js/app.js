const KEY = "paynest_contracts_v1";
const CUSTOMER_KEY = "paynest_customers_v1";
const BACKUP_KEY = "paynest_last_good_backup_v1";

let contracts = load().map(normalizeContract).filter(Boolean);
let customers = loadCustomers().map(normalizeCustomer).filter(c => c && c.name);

let currentPage = "home";
let currentId = null;
let currentCustomerName = null;
let currentDetailType = "contract";
let listFilter = "all";
let calendarDate = new Date();

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const money = n => new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0
}).format(Number(n) || 0);

const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
}[m]));

function localDate(d) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
}

const todayISO = () => localDate(new Date());

function parseDate(s) {
  return s ? new Date(`${s}T00:00:00`) : null;
}

/* =========================================================
   STORAGE
========================================================= */

function load() {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(x) ? x : [];
  } catch {
    return [];
  }
}

function save(options = {}) {
  const allowEmpty = options.allowEmpty === true;

  try {
    const previous = localStorage.getItem(KEY);

    if (!allowEmpty && contracts.length === 0 && previous) {
      const parsed = JSON.parse(previous);
      if (Array.isArray(parsed) && parsed.length > 0) {
        localStorage.setItem(BACKUP_KEY, previous);
        return false;
      }
    }

    if (previous) {
      try {
        const parsed = JSON.parse(previous);
        if (Array.isArray(parsed) && parsed.length > 0) {
          localStorage.setItem(BACKUP_KEY, previous);
        }
      } catch {}
    }

    localStorage.setItem(KEY, JSON.stringify(contracts));
    return true;
  } catch {
    return false;
  }
}

function loadCustomers() {
  try {
    const x = JSON.parse(localStorage.getItem(CUSTOMER_KEY) || "[]");
    return Array.isArray(x) ? x : [];
  } catch {
    return [];
  }
}

function saveCustomers() {
  try {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customers));
    return true;
  } catch {
    return false;
  }
}

function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function normalizeContract(c) {
  if (!c || typeof c !== "object") return null;

  return {
    ...c,
    id: String(c.id || uid()),
    customer: String(c.customer || "").trim(),
    phone: String(c.phone || "").trim(),
    product: String(c.product || "").trim(),
    price: Number(c.price || 0),
    down: Number(c.down || 0),
    frequency: ["daily", "weekly", "monthly"].includes(c.frequency)
      ? c.frequency
      : "monthly",
    installment: Number(c.installment || 0),
    term: Math.max(0, Number(c.term || 0)),
    paid: Math.max(0, Number(c.paid || 0)),
    paymentHistory: Array.isArray(c.paymentHistory)
      ? c.paymentHistory
      : [],
    startDate: c.startDate || "",
    dueDate: c.dueDate || "",
    notes: String(c.notes || ""),
    createdAt: c.createdAt || new Date().toISOString()
  };
}

function normalizeCustomer(c) {
  if (!c || typeof c !== "object") return null;

  return {
    ...c,
    id: String(c.id || uid()),
    name: String(c.name || "").trim(),
    phone: String(c.phone || "").trim(),
    notes: String(c.notes || ""),
    createdAt: c.createdAt || new Date().toISOString(),
    updatedAt: c.updatedAt || new Date().toISOString()
  };
}

function ensureCustomerRecords() {
  const map = new Map();

  customers
    .map(normalizeCustomer)
    .filter(c => c && c.name)
    .forEach(c => {
      const key = c.name.toLowerCase();
      if (!map.has(key)) map.set(key, c);
    });

  contracts
    .map(normalizeContract)
    .filter(c => c && c.customer)
    .forEach(c => {
      const key = c.customer.toLowerCase();

      if (!map.has(key)) {
        map.set(key, {
          id: uid(),
          name: c.customer,
          phone: c.phone || "",
          notes: "",
          createdAt: c.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      } else if (!map.get(key).phone && c.phone) {
        map.get(key).phone = c.phone;
      }
    });

  customers = [...map.values()];
}

/* =========================================================
   CUSTOMER
========================================================= */

function syncCustomer(c) {
  if (!c?.customer) return;

  const name = c.customer.trim();
  if (!name) return;

  const key = name.toLowerCase();

  let x = customers.find(v =>
    String(v.name || "").toLowerCase() === key
  );

  if (x) {
    if (c.phone && !x.phone) x.phone = c.phone;
    x.updatedAt = new Date().toISOString();
  } else {
    customers.push({
      id: uid(),
      name,
      phone: c.phone || "",
      notes: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  saveCustomers();
}

/* =========================================================
   DATE
========================================================= */

function addPeriod(s, f) {
  const d = parseDate(s) || new Date();
  const day = d.getDate();

  if (f === "daily") {
    d.setDate(d.getDate() + 1);
  } else if (f === "weekly") {
    d.setDate(d.getDate() + 7);
  } else {
    const targetMonth = d.getMonth() + 1;
    d.setDate(1);
    d.setMonth(targetMonth);
    d.setDate(Math.min(
      day,
      new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    ));
  }

  return localDate(d);
}

function nextDueAfterPayment(c) {
  return addPeriod(
    c.dueDate || c.startDate || todayISO(),
    c.frequency
  );
}

/* =========================================================
   STATUS / CALC
========================================================= */

function status(c) {
  const paid = Number(c.paid || 0);
  const term = Number(c.term || 0);

  if (term > 0 && paid >= term) return "completed";

  if (c.dueDate && c.dueDate < todayISO()) return "overdue";

  const left = Math.max(0, term - paid);

  if (
    left <= 2 ||
    (term > 0 && paid / term >= 0.8)
  ) {
    return "near";
  }

  return "normal";
}

function balance(c) {
  return Math.max(
    0,
    Number(c.installment || 0) *
    Math.max(
      0,
      Number(c.term || 0) - Number(c.paid || 0)
    )
  );
}

function totalContractValue(c) {
  return Number(c.installment || 0) * Number(c.term || 0);
}

function fmtDate(s) {
  if (!s) return "ไม่ระบุ";
  const d = parseDate(s);

  return d
    ? d.toLocaleDateString("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric"
      })
    : "ไม่ระบุ";
}

function frequencyText(v) {
  return ({
    daily: "รายวัน",
    weekly: "รายสัปดาห์",
    monthly: "รายเดือน"
  }[v] || v || "ไม่ระบุ");
}

function statusText(v) {
  return ({
    normal: "ปกติ",
    near: "ใกล้ครบ",
    overdue: "ค้างชำระ",
    completed: "ครบแล้ว"
  }[v] || v || "");
}

/* =========================================================
   NAVIGATION
========================================================= */

function go(page) {
  currentPage = page;

  $$(".page").forEach(p => {
    p.classList.toggle("active", p.id === `page-${page}`);
  });

  $$(".nav").forEach(n => {
    n.classList.toggle("active", n.dataset.page === page);
  });

  const fab = $("#fab");
  if (fab) fab.style.display = page === "detail" ? "none" : "grid";

  if (page === "home") renderHome();
  if (page === "contracts") renderContracts();
  if (page === "calendar") renderCalendar();
  if (page === "customers") renderCustomers();
  if (page === "settings") renderSettings();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* =========================================================
   HOME
========================================================= */

function renderHome() {
  const active = contracts.filter(c => status(c) !== "completed");

  const monthly = active
    .filter(c => c.frequency === "monthly")
    .reduce((s, c) => s + Number(c.installment || 0), 0);

  const remain = contracts.reduce((s, c) => s + balance(c), 0);

  const paid = contracts.reduce(
    (s, c) =>
      s +
      Number(c.installment || 0) *
      Number(c.paid || 0),
    0
  );

  const total = contracts.reduce(
    (s, c) => s + totalContractValue(c),
    0
  );

  const progress = total
    ? Math.min(100, Math.round((paid / total) * 100))
    : 0;

  if ($("#monthlyTotal")) $("#monthlyTotal").textContent = money(monthly);
  if ($("#totalContractsText")) {
    $("#totalContractsText").textContent = `${contracts.length} สัญญา`;
  }
  if ($("#remainingTotal")) $("#remainingTotal").textContent = money(remain);
  if ($("#paidTotal")) $("#paidTotal").textContent = money(paid);
  if ($("#overallProgressText")) {
    $("#overallProgressText").textContent = `${progress}%`;
  }
  if ($("#overallProgress")) {
    $("#overallProgress").style.width = `${progress}%`;
  }

  if ($("#normalCount")) {
    $("#normalCount").textContent =
      contracts.filter(c => status(c) === "normal").length;
  }

  if ($("#nearCount")) {
    $("#nearCount").textContent =
      contracts.filter(c => status(c) === "near").length;
  }

  if ($("#overdueCount")) {
    $("#overdueCount").textContent =
      contracts.filter(c => status(c) === "overdue").length;
  }

  const overdue = contracts.filter(c => status(c) === "overdue").length;

  if ($("#insight")) {
    $("#insight").textContent =
      contracts.length === 0
        ? "ยังไม่มีสัญญา เริ่มต้นด้วยการเพิ่มสัญญาแรกของคุณ"
        : overdue
          ? `มี ${overdue} สัญญาที่เลยกำหนด ควรตรวจสอบและติดตามการชำระ`
          : `มี ${active.length} สัญญาที่ยังดำเนินอยู่ ความคืบหน้ารวม ${progress}%`;
  }

  const recent = [...contracts]
    .sort((a, b) =>
      (b.createdAt || "").localeCompare(a.createdAt || "")
    )
    .slice(0, 4);

  if ($("#recentList")) {
    $("#recentList").innerHTML = recent.length
      ? recent.map(cardHTML).join("")
      : emptyHTML("ยังไม่มีสัญญา", "กด + เพื่อเพิ่มสัญญา");
  }
}

/* =========================================================
   CONTRACT CARD
========================================================= */

function cardHTML(c) {
  const st = status(c);

  const pct = c.term
    ? Math.min(
        100,
        Math.round(
          (Number(c.paid || 0) / Number(c.term || 0)) * 100
        )
      )
    : 0;

  return `
    <button class="contract-card" data-open="${esc(c.id)}" type="button">
      <div class="card-row">
        <div>
          <h3>${esc(c.product || "ไม่ระบุสินค้า")}</h3>
          <p>
            ${esc(c.customer || "ไม่ระบุลูกค้า")}
            ${c.phone ? " • " + esc(c.phone) : ""}
          </p>
        </div>
        <div class="balance">${money(balance(c))}</div>
      </div>

      <div class="progress-wrap" style="margin-top:13px">
        <div class="progress">
          <i style="width:${pct}%"></i>
        </div>
      </div>

      <div class="card-row" style="margin-top:8px">
        <p>
          ${frequencyText(c.frequency)}
          •
          ${Number(c.paid || 0)}/${Number(c.term || 0)}
          งวด
        </p>

        <span class="status-badge ${
          st === "overdue"
            ? "danger"
            : st === "near"
              ? "warning"
              : st === "completed"
                ? "success"
                : ""
        }">
          ${statusText(st)}
        </span>
      </div>
    </button>
  `;
}

function emptyHTML(a, b) {
  return `
    <div class="empty">
      <b>${esc(a)}</b>
      <span>${esc(b)}</span>
    </div>
  `;
}

/* =========================================================
   CONTRACT LIST
========================================================= */

function renderContracts() {
  const q = ($("#searchInput")?.value || "").trim().toLowerCase();
  const sort = $("#sortSelect")?.value || "due";

  let arr = contracts.filter(c =>
    (
      !q ||
      `${c.customer} ${c.product} ${c.phone || ""}`
        .toLowerCase()
        .includes(q)
    ) &&
    (
      listFilter === "all" ||
      status(c) === listFilter
    )
  );

  arr.sort((a, b) => {
    if (sort === "newest") {
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    }

    if (sort === "balance") return balance(b) - balance(a);

    if (sort === "name") {
      return String(a.customer || "").localeCompare(
        String(b.customer || ""),
        "th"
      );
    }

    return (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
  });

  if ($("#contractCountLabel")) {
    $("#contractCountLabel").textContent =
      `${arr.length} / ${contracts.length} สัญญา`;
  }

  if ($("#contractList")) {
    $("#contractList").innerHTML = arr.length
      ? arr.map(cardHTML).join("")
      : emptyHTML("ไม่พบสัญญา", "ลองเปลี่ยนคำค้นหาหรือตัวกรอง");
  }

  $$(".chip").forEach(x => {
    x.classList.toggle("active", x.dataset.listFilter === listFilter);
  });
}

/* =========================================================
   CONTRACT DETAIL
========================================================= */

function openDetail(id) {
  currentId = id;
  currentDetailType = "contract";

  const c = contracts.find(x => x.id === id);
  if (!c || !$("#detailContent")) return;

  const st = status(c);

  const pct = c.term
    ? Math.min(
        100,
        Math.round(
          (Number(c.paid || 0) / Number(c.term || 0)) * 100
        )
      )
    : 0;

  $("#detailContent").innerHTML = `
    <section class="detail-card glass">
      <span class="eyebrow">${esc(statusText(st).toUpperCase())}</span>
      <h2>${esc(c.product)}</h2>
      <p>
        ${esc(c.customer)}
        ${c.phone ? " • " + esc(c.phone) : ""}
      </p>

      <div class="detail-amount">${money(balance(c))}</div>
      <p>ยอดคงเหลือ</p>

      <div class="progress-wrap" style="margin-top:20px">
        <div class="progress-meta">
          <span>
            ชำระแล้ว
            ${Number(c.paid || 0)}/${Number(c.term || 0)}
            งวด
          </span>
          <b>${pct}%</b>
        </div>
        <div class="progress">
          <i style="width:${pct}%"></i>
        </div>
      </div>
    </section>

    <section class="detail-card glass">
      <div class="detail-grid">
        <div><span>ราคาสินค้า</span><b>${money(c.price)}</b></div>
        <div><span>เงินดาวน์</span><b>${money(c.down)}</b></div>
        <div><span>ค่างวด</span><b>${money(c.installment)}</b></div>
        <div><span>ประเภท</span><b>${frequencyText(c.frequency)}</b></div>
        <div><span>เริ่มผ่อน</span><b>${fmtDate(c.startDate)}</b></div>
        <div>
          <span>งวดถัดไป</span>
          <b>${st === "completed" ? "ครบสัญญา" : fmtDate(c.dueDate)}</b>
        </div>
      </div>
    </section>

    <section class="detail-card glass">
      <div class="section-head">
        <h2>การชำระ</h2>
      </div>

      <div class="modal-actions">
        <button
          class="btn secondary"
          data-action="delete"
          data-id="${esc(c.id)}"
          type="button"
        >
          ลบสัญญา
        </button>

        <button
          class="btn primary"
          data-action="pay"
          data-id="${esc(c.id)}"
          ${st === "completed" ? "disabled" : ""}
          type="button"
        >
          ${st === "completed" ? "ชำระครบแล้ว" : "บันทึกชำระ 1 งวด"}
        </button>
      </div>

      ${
        c.notes
          ? `<p style="margin-top:15px">${esc(c.notes)}</p>`
          : ""
      }
    </section>

    ${paymentHistoryHTML(c)}
  `;

  go("detail");
}

/* =========================================================
   CUSTOMER DETAIL
========================================================= */

function openCustomerDetail(name) {
  const customer = customers.find(c =>
    String(c.name || "").toLowerCase() ===
    String(name || "").toLowerCase()
  );

  if (!customer) return;

  currentCustomerName = customer.name;
  currentDetailType = "customer";
  currentId = null;

  const related = contracts
    .filter(c =>
      String(c.customer || "").toLowerCase() ===
      customer.name.toLowerCase()
    )
    .sort((a, b) =>
      (a.dueDate || "9999").localeCompare(b.dueDate || "9999")
    );

  const total = related.reduce((s, c) => s + balance(c), 0);

  $("#detailContent").innerHTML = `
    <section class="detail-card glass">
      <span class="eyebrow">CUSTOMER</span>
      <h2>${esc(customer.name)}</h2>
      ${customer.phone ? `<p>${esc(customer.phone)}</p>` : ""}
      <div class="detail-amount">${money(total)}</div>
      <p>ยอดคงเหลือทั้งหมด</p>
    </section>

    <section class="detail-card glass">
      <div class="section-head">
        <div>
          <span class="eyebrow">CONTRACTS</span>
          <h2>สัญญาของลูกค้า</h2>
        </div>
        <span class="status-badge">${related.length} สัญญา</span>
      </div>

      ${
        related.length
          ? `<div class="list">
              ${related.map(c => `
                <button class="agenda-item" data-open="${esc(c.id)}" type="button">
                  <div>
                    <b>${esc(c.product)}</b>
                    <small>
                      ${frequencyText(c.frequency)}
                      •
                      ${Number(c.paid || 0)}/${Number(c.term || 0)}
                      งวด
                    </small>
                    <small>
                      ${
                        status(c) === "completed"
                          ? "ครบสัญญา"
                          : `งวดถัดไป ${fmtDate(c.dueDate)}`
                      }
                    </small>
                  </div>
                  <strong>${money(balance(c))}</strong>
                </button>
              `).join("")}
            </div>`
          : emptyHTML("ยังไม่มีสัญญา", "ลูกค้ารายนี้ยังไม่มีสัญญา")
      }
    </section>
  `;

  go("detail");
}

/* =========================================================
   CONTRACT MODAL
========================================================= */

function openModal(id = null) {
  const form = $("#contractForm");
  const modal = $("#modal");

  if (!form || !modal) {
    toast("ไม่พบฟอร์มสัญญา");
    return;
  }

  form.reset();

  if ($("#editId")) $("#editId").value = "";
  if ($("#modalTitle")) $("#modalTitle").textContent = id ? "แก้ไขสัญญา" : "เพิ่มสัญญา";

  if (id) {
    const c = contracts.find(x => x.id === id);
    if (!c) {
      toast("ไม่พบสัญญา");
      return;
    }

    if ($("#editId")) $("#editId").value = c.id;

    [
      "customer",
      "phone",
      "product",
      "price",
      "down",
      "frequency",
      "installment",
      "term",
      "startDate",
      "dueDate",
      "notes"
    ].forEach(k => {
      const el = $(`#${k}`);
      if (el) el.value = c[k] ?? "";
    });
  } else {
    if ($("#down")) $("#down").value = 0;
    if ($("#frequency")) $("#frequency").value = "monthly";

    const today = todayISO();
    if ($("#startDate")) $("#startDate").value = today;
    if ($("#dueDate")) $("#dueDate").value = today;
  }

  updateCalc();
  modal.classList.remove("hidden");

  setTimeout(() => $("#customer")?.focus(), 80);
}

function closeModal() {
  $("#modal")?.classList.add("hidden");
}

function updateCalc() {
  const price = Number($("#price")?.value) || 0;
  const down = Number($("#down")?.value) || 0;
  const inst = Number($("#installment")?.value) || 0;
  const term = Number($("#term")?.value) || 0;

  if ($("#financeAmount")) {
    $("#financeAmount").textContent = money(Math.max(0, price - down));
  }

  if ($("#financeTotal")) {
    $("#financeTotal").textContent = money(inst * term);
  }
}

/* =========================================================
  