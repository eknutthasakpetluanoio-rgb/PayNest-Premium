const KEY = "paynest_contracts_v1";
const CUSTOMER_KEY = "paynest_customers_v1";

let contracts = [];
let customers = [];

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
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
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

function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/* ---------- storage ---------- */

function load() {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(x) ? x : [];
  } catch (e) {
    console.error("PayNest load contracts:", e);
    return [];
  }
}

function loadCustomers() {
  try {
    const x = JSON.parse(localStorage.getItem(CUSTOMER_KEY) || "[]");
    return Array.isArray(x) ? x : [];
  } catch (e) {
    console.error("PayNest load customers:", e);
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(contracts));
    return true;
  } catch (e) {
    console.error(e);
    toast("บันทึกข้อมูลไม่สำเร็จ");
    return false;
  }
}

function saveCustomers() {
  try {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customers));
    return true;
  } catch (e) {
    console.error(e);
    toast("บันทึกลูกค้าไม่สำเร็จ");
    return false;
  }
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
    frequency: ["daily", "weekly", "monthly"].includes(c.frequency) ? c.frequency : "monthly",
    installment: Number(c.installment || 0),
    term: Math.max(0, Number(c.term || 0)),
    paid: Math.max(0, Number(c.paid || 0)),
    paymentHistory: Array.isArray(c.paymentHistory) ? c.paymentHistory : [],
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

function syncCustomer(c) {
  const name = String(c?.customer || "").trim();
  if (!name) return;

  const key = name.toLowerCase();
  let x = customers.find(v => String(v.name || "").toLowerCase() === key);

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

function ensureCustomers() {
  const map = new Map();

  customers.forEach(c => {
    const x = normalizeCustomer(c);
    if (x?.name && !map.has(x.name.toLowerCase())) {
      map.set(x.name.toLowerCase(), x);
    }
  });

  contracts.forEach(c => {
    const x = normalizeContract(c);
    if (!x?.customer) return;
    const key = x.customer.toLowerCase();

    if (!map.has(key)) {
      map.set(key, {
        id: uid(),
        name: x.customer,
        phone: x.phone || "",
        notes: "",
        createdAt: x.createdAt,
        updatedAt: new Date().toISOString()
      });
    } else if (!map.get(key).phone && x.phone) {
      map.get(key).phone = x.phone;
    }
  });

  customers = [...map.values()];
  saveCustomers();
}

/* ---------- date / calculation ---------- */

function addPeriod(s, f) {
  const d = parseDate(s) || new Date();
  const day = d.getDate();

  if (f === "daily") {
    d.setDate(d.getDate() + 1);
  } else if (f === "weekly") {
    d.setDate(d.getDate() + 7);
  } else {
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  }

  return localDate(d);
}

function nextDueAfterPayment(c) {
  return addPeriod(c.dueDate || c.startDate || todayISO(), c.frequency);
}

function status(c) {
  const term = Number(c.term || 0);
  const paid = Number(c.paid || 0);

  if (term > 0 && paid >= term) return "completed";
  if (c.dueDate && c.dueDate < todayISO()) return "overdue";

  const left = Math.max(0, term - paid);
  if (left <= 2 || (term > 0 && paid / term >= 0.8)) return "near";
  return "normal";
}

function balance(c) {
  return Math.max(0, Number(c.installment || 0) * Math.max(0, Number(c.term || 0) - Number(c.paid || 0)));
}

function totalContractValue(c) {
  return Number(c.installment || 0) * Number(c.term || 0);
}

function fmtDate(s) {
  if (!s) return "ไม่ระบุ";
  const d = parseDate(s);
  return d ? d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "ไม่ระบุ";
}

function frequencyText(v) {
  return ({ daily: "รายวัน", weekly: "รายสัปดาห์", monthly: "รายเดือน" }[v] || "ไม่ระบุ");
}

function statusText(v) {
  return ({ normal: "ปกติ", near: "ใกล้ครบ", overdue: "ค้างชำระ", completed: "ครบแล้ว" }[v] || "");
}

/* ---------- UI ---------- */

function toast(message) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2200);
}

function go(page) {
  currentPage = page;

  $$(".page").forEach(p => p.classList.toggle("active", p.id === `page-${page}`));
  $$(".nav").forEach(n => n.classList.toggle("active", n.dataset.page === page));

  const fab = $("#fab");
  if (fab) fab.style.display = page === "detail" ? "none" : "grid";

  if (page === "home") renderHome();
  if (page === "contracts") renderContracts();
  if (page === "calendar") renderCalendar();
  if (page === "customers") renderCustomers();
  if (page === "settings") renderSettings();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function emptyHTML(a, b) {
  return `<div class="empty"><b>${esc(a)}</b><span>${esc(b)}</span></div>`;
}

/* ---------- contract cards ---------- */

function cardHTML(c) {
  const st = status(c);
  const pct = Number(c.term) > 0 ? Math.min(100, Math.round(Number(c.paid || 0) / Number(c.term) * 100)) : 0;

  return `
    <button class="contract-card" data-open="${esc(c.id)}" type="button">
      <div class="card-row">
        <div>
          <h3>${esc(c.product || "ไม่ระบุสินค้า")}</h3>
          <p>${esc(c.customer || "ไม่ระบุลูกค้า")}${c.phone ? " • " + esc(c.phone) : ""}</p>
        </div>
        <div class="balance">${money(balance(c))}</div>
      </div>
      <div class="progress-wrap" style="margin-top:13px">
        <div class="progress"><i style="width:${pct}%"></i></div>
      </div>
      <div class="card-row" style="margin-top:8px">
        <p>${frequencyText(c.frequency)} • ${Number(c.paid || 0)}/${Number(c.term || 0)} งวด</p>
        <span class="status-badge ${st === "overdue" ? "danger" : st === "near" ? "warning" : st === "completed" ? "success" : ""}">
          ${statusText(st)}
        </span>
      </div>
    </button>
  `;
}

/* ---------- home ---------- */

function renderHome() {
  const active = contracts.filter(c => status(c) !== "completed");
  const monthly = active.filter(c => c.frequency === "monthly").reduce((s, c) => s + Number(c.installment || 0), 0);
  const remain = contracts.reduce((s, c) => s + balance(c), 0);
  const paid = contracts.reduce((s, c) => s + Number(c.installment || 0) * Number(c.paid || 0), 0);
  const total = contracts.reduce((s, c) => s + totalContractValue(c), 0);
  const progress = total ? Math.min(100, Math.round(paid / total * 100)) : 0;

  if ($("#monthlyTotal")) $("#monthlyTotal").textContent = money(monthly);
  if ($("#totalContractsText")) $("#totalContractsText").textContent = `${contracts.length} สัญญา`;
  if ($("#remainingTotal")) $("#remainingTotal").textContent = money(remain);
  if ($("#paidTotal")) $("#paidTotal").textContent = money(paid);
  if ($("#overallProgressText")) $("#overallProgressText").textContent = `${progress}%`;
  if ($("#overallProgress")) $("#overallProgress").style.width = `${progress}%`;

  if ($("#normalCount")) $("#normalCount").textContent = contracts.filter(c => status(c) === "normal").length;
  if ($("#nearCount")) $("#nearCount").textContent = contracts.filter(c => status(c) === "near").length;
  if ($("#overdueCount")) $("#overdueCount").textContent = contracts.filter(c => status(c) === "overdue").length;

  const overdue = contracts.filter(c => status(c) === "overdue").length;
  if ($("#insight")) {
    $("#insight").textContent = !contracts.length
      ? "ยังไม่มีสัญญา เริ่มต้นด้วยการเพิ่มสัญญาแรกของคุณ"
      : overdue
        ? `มี ${overdue} สัญญาที่เลยกำหนด ควรตรวจสอบและติดตามการชำระ`
        : `มี ${active.length} สัญญาที่ยังดำเนินอยู่ ความคืบหน้ารวม ${progress}%`;
  }

  const recent = [...contracts].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 4);
  if ($("#recentList")) $("#recentList").innerHTML = recent.length ? recent.map(cardHTML).join("") : emptyHTML("ยังไม่มีสัญญา", "กด + เพื่อเพิ่มสัญญา");
}

/* ---------- contracts ---------- */

function renderContracts() {
  const q = ($("#searchInput")?.value || "").trim().toLowerCase();
  const sort = $("#sortSelect")?.value || "due";

  let arr = contracts.filter(c => {
    const text = `${c.customer} ${c.product} ${c.phone || ""}`.toLowerCase();
    return (!q || text.includes(q)) && (listFilter === "all" || status(c) === listFilter);
  });

  arr.sort((a, b) => {
    if (sort === "newest") return (b.createdAt || "").localeCompare(a.createdAt || "");
    if (sort === "balance") return balance(b) - balance(a);
    if (sort === "name") return String(a.customer || "").localeCompare(String(b.customer || ""), "th");
    return (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
  });

  if ($("#contractCountLabel")) $("#contractCountLabel").textContent = `${arr.length} / ${contracts.length} สัญญา`;
  if ($("#contractList")) $("#contractList").innerHTML = arr.length ? arr.map(cardHTML).join("") : emptyHTML("ไม่พบสัญญา", "ลองเปลี่ยนคำค้นหาหรือตัวกรอง");

  $$(".chip").forEach(x => x.classList.toggle("active", x.dataset.listFilter === listFilter));
}

/* ---------- detail ---------- */

function paymentHistoryHTML(c) {
  const history = Array.isArray(c.paymentHistory) ? c.paymentHistory : [];
  if (!history.length) {
    return `<section class="detail-card glass"><div class="section-head"><h2>ประวัติการชำระ</h2></div>${emptyHTML("ยังไม่มีรายการ", "รายการชำระจะปรากฏที่นี่")}</section>`;
  }

  return `
    <section class="detail-card glass">
      <div class="section-head"><h2>ประวัติการชำระ</h2><span class="status-badge">${history.length} รายการ</span></div>
      <div class="list">
        ${history.slice().reverse().map((p, i) => `
          <div class="agenda-item">
            <div>
              <b>งวดที่ ${Number(p.term || (history.length - i))}</b>
              <small>${fmtDate(p.date || "")}</small>
            </div>
            <strong>${money(p.amount || c.installment)}</strong>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function openDetail(id) {
  const c = contracts.find(x => x.id === id);
  if (!c) return;

  currentId = id;
  currentDetailType = "contract";

  const st = status(c);
  const pct = Number(c.term) > 0 ? Math.min(100, Math.round(Number(c.paid || 0) / Number(c.term) * 100)) : 0;

  if (!$("#detailContent")) return;

  $("#detailContent").innerHTML = `
    <section class="detail-card glass">
      <span class="eyebrow">${esc(statusText(st).toUpperCase())}</span>
      <h2>${esc(c.product)}</h2>
      <p>${esc(c.customer)}${c.phone ? " • " + esc(c.phone) : ""}</p>
      <div class="detail-amount">${money(balance(c))}</div>
      <p>ยอดคงเหลือ</p>
      <div class="progress-wrap" style="margin-top:20px">
        <div class="progress-meta"><span>ชำระแล้ว ${Number(c.paid || 0)}/${Number(c.term || 0)} งวด</span><b>${pct}%</b></div>
        <div class="progress"><i style="width:${pct}%"></i></div>
      </div>
    </section>

    <section class="detail-card glass">
      <div class="detail-grid">
        <div><span>ราคาสินค้า</span><b>${money(c.price)}</b></div>
        <div><span>เงินดาวน์</span><b>${money(c.down)}</b></div>
        <div><span>ค่างวด</span><b>${money(c.installment)}</b></div>
        <div><span>ประเภท</span><b>${frequencyText(c.frequency)}</b></div>
        <div><span>เริ่มผ่อน</span><b>${fmtDate(c.startDate)}</b></div>
        <div><span>งวดถัดไป</span><b>${st === "completed" ? "ครบสัญญา" : fmtDate(c.dueDate)}</b></div>
      </div>
    </section>

    <section class="detail-card glass">
      <div class="section-head"><h2>การชำระ</h2></div>
      <div class="modal-actions">
        <button class="btn secondary" data-action="delete" data-id="${esc(c.id)}" type="button">ลบสัญญา</button>
        <button class="btn primary" data-action="pay" data-id="${esc(c.id)}" ${st === "completed" ? "disabled" : ""} type="button">
          ${st === "completed" ? "ชำระครบแล้ว" : "บันทึกชำระ 1 งวด"}
        </button>
      </div>
      ${c.notes ? `<p style="margin-top:15px">${esc(c.notes)}</p>` : ""}
    </section>

    ${paymentHistoryHTML(c)}
  `;

  go("detail");
}

function openCustomerDetail(name) {
  const customer = customers.find(c => String(c.name || "").toLowerCase() === String(name || "").toLowerCase());
  if (!customer) return;

  currentCustomerName = customer.name;
  currentDetailType = "customer";
  currentId = null;

  const related = contracts.filter(c => String(c.customer || "").toLowerCase() === customer.name.toLowerCase())
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));

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
        <div><span class="eyebrow">CONTRACTS</span><h2>สัญญาของลูกค้า</h2></div>
        <span class="status-badge">${related.length} สัญญา</span>
      </div>
      ${related.length ? `<div class="list">${related.map(c => `
        <button class="agenda-item" data-open="${esc(c.id)}" type="button">
          <div>
            <b>${esc(c.product)}</b>
            <small>${frequencyText(c.frequency)} • ${Number(c.paid || 0)}/${Number(c.term || 0)} งวด</small>
            <small>${status(c) === "completed" ? "ครบสัญญา" : `งวดถัดไป ${fmtDate(c.dueDate)}`}</small>
          </div>
          <strong>${money(balance(c))}</strong>
        </button>`).join("")}</div>` : emptyHTML("ยังไม่มีสัญญา", "ลูกค้ารายนี้ยังไม่มีสัญญา")}
    </section>
  `;

  go("detail");
}

/* ---------- modal ---------- */

function openModal(id = null) {
  const form = $("#contractForm");
  const modal = $("#modal");
  if (!form || !modal) return;

  form.reset();
  if ($("#editId")) $("#editId").value = "";
  $("#modalTitle").textContent = id ? "แก้ไขสัญญา" : "เพิ่มสัญญา";

  if (id) {
    const c = contracts.find(x => x.id === id);
    if (!c) return;

    ["customer","phone","product","price","down","frequency","installment","term","startDate","dueDate","notes"].forEach(k => {
      if ($(`#${k}`)) $(`#${k}`).value = c[k] ?? "";
    });
    if ($("#editId")) $("#editId").value = c.id;
  } else {
    if ($("#down")) $("#down").value = 0;
    if ($("#frequency")) $("#frequency").value = "monthly";
    if ($("#startDate")) $("#startDate").value = todayISO();
    if ($("#dueDate")) $("#dueDate").value = todayISO();
  }

  updateCalc();
  modal.classList.remove("hidden");
  modal.style.display = "grid";
  setTimeout(() => $("#customer")?.focus(), 80);
}

function closeModal() {
  const modal = $("#modal");
  if (modal) {
    modal.classList.add("hidden");
    modal.style.display = "";
  }
}

function updateCalc() {
  const price = Number($("#price")?.value) || 0;
  const down = Number($("#down")?.value) || 0;
  const inst = Number($("#installment")?.value) || 0;
  const term = Number($("#term")?.value) || 0;

  if ($("#financeAmount")) $("#financeAmount").textContent = money(Math.max(0, price - down));
  if ($("#financeTotal")) $("#financeTotal").textContent = money(inst * term);
}

function formSubmit(e) {
  e.preventDefault();

  const customer = $("#customer")?.value.trim() || "";
  const phone = $("#phone")?.value.trim() || "";
  const product = $("#product")?.value.trim() || "";
  const price = Number($("#price")?.value) || 0;
  const down = Number($("#down")?.value) || 0;
  const frequency = $("#frequency")?.value || "monthly";
  const installment = Number($("#installment")?.value) || 0;
  const term = Math.max(1, Number($("#term")?.value) || 0);
  const startDate = $("#startDate")?.value || todayISO();
  const dueDate = $("#dueDate")?.value || startDate;
  const notes = $("#notes")?.value.trim() || "";
  const id = $("#editId")?.value || "";

  if (!customer || !product || !price || !installment || !term) {
    toast("กรุณากรอกข้อมูลที่จำเป็นให้ครบ");
    return;
  }

  const existing = id ? contracts.find(c => c.id === id) : null;

  const c = normalizeContract({
    ...(existing || {}),
    id: id || uid(),
    customer, phone, product, price, down, frequency,
    installment, term, startDate, dueDate, notes,
    paid: existing?.paid || 0,
    paymentHistory: existing?.paymentHistory || [],
    createdAt: existing?.createdAt || new Date().toISOString()
  });

  if (existing) {
    const index = contracts.findIndex(x => x.id === id);
    if (index >= 0) contracts[index] = c;
  } else {
    contracts.unshift(c);
  }

  if (!save()) {
    toast("บันทึกสัญญาไม่สำเร็จ");
    return;
  }

  syncCustomer(c);
  closeModal();
  currentId = c.id;
  toast(existing ? "แก้ไขสัญญาแล้ว" : "เพิ่มสัญญาแล้ว");
  openDetail(c.id);
}

/* ---------- payment ---------- */

function payContract(id) {
  const c = contracts.find(x => x.id === id);
  if (!c) return;
  if (Number(c.paid || 0) >= Number(c.term || 0)) {
    toast("สัญญานี้ชำระครบแล้ว");
    return;
  }

  c.paid = Math.min(Number(c.term || 0), Number(c.paid || 0) + 1);
  c.paymentHistory = Array.isArray(c.paymentHistory) ? c.paymentHistory : [];
  c.paymentHistory.push({
    id: uid(),
    term: c.paid,
    amount: Number(c.installment || 0),
    date: todayISO()
  });

  if (c.paid < Number(c.term || 0)) c.dueDate = nextDueAfterPayment(c);

  save();
  toast("บันทึกการชำระแล้ว");
  openDetail(id);
}

function deleteContract(id) {
  const c = contracts.find(x => x.id === id);
  if (!c) return;

  if (!confirm(`ลบสัญญา "${c.product}" ของ ${c.customer} ใช่หรือไม่?`)) return;

  contracts = contracts.filter(x => x.id !== id);
  save();
  currentId = null;
  toast("ลบสัญญาแล้ว");
  go("contracts");
}

/* ---------- customers ---------- */

function renderCustomers() {
  ensureCustomers();

  const q = ($("#
