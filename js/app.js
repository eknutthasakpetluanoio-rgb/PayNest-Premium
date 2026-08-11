"use strict";

const CONTRACT_KEY = "paynest_contracts_v1";
const CUSTOMER_KEY = "paynest_customers_v1";

let contracts = read(CONTRACT_KEY, []);
let customers = read(CUSTOMER_KEY, []);

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function read(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function money(value) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function today() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000)
    .toISOString()
    .slice(0, 10);
}

function id() {
  return Date.now().toString(36) +
    Math.random().toString(36).slice(2);
}

/* =====================================================
   RENDER
===================================================== */

function render() {

  const totalInstallment = contracts
    .filter(c => status(c) !== "completed")
    .reduce((sum, c) =>
      sum + Number(c.installment || 0), 0);

  const totalBalance = contracts
    .reduce((sum, c) =>
      sum + balance(c), 0);

  const totalPaid = contracts
    .reduce((sum, c) =>
      sum +
      Number(c.installment || 0) *
      Number(c.paid || 0), 0);

  const installment = $("#totalInstallment");
  const balanceEl = $("#totalBalance");
  const paidEl = $("#totalPaid");
  const countEl = $("#contractCount");

  if (installment)
    installment.textContent = money(totalInstallment);

  if (balanceEl)
    balanceEl.textContent = money(totalBalance);

  if (paidEl)
    paidEl.textContent = money(totalPaid);

  if (countEl)
    countEl.textContent = `${contracts.length} สัญญา`;

  renderContracts();
}

/* =====================================================
   CONTRACT
===================================================== */

function balance(c) {

  const remaining =
    Math.max(
      0,
      Number(c.term || 0) -
      Number(c.paid || 0)
    );

  return remaining *
    Number(c.installment || 0);
}

function status(c) {

  const term = Number(c.term || 0);
  const paid = Number(c.paid || 0);

  if (term > 0 && paid >= term)
    return "completed";

  if (
    c.dueDate &&
    c.dueDate < today()
  )
    return "overdue";

  if (
    term > 0 &&
    paid / term >= .8
  )
    return "near";

  return "normal";
}

function renderContracts() {

  const list = $("#contractList");

  if (!list)
    return;

  if (!contracts.length) {

    list.innerHTML = `
      <div class="empty">
        <strong>ยังไม่มีสัญญา</strong>
        <span>กดปุ่ม + เพื่อเพิ่มสัญญาแรก</span>
      </div>
    `;

    return;
  }

  list.innerHTML = contracts
    .map(contractHTML)
    .join("");
}

function contractHTML(c) {

  const term = Number(c.term || 0);
  const paid = Number(c.paid || 0);

  const percent =
    term > 0
      ? Math.min(
          100,
          Math.round(paid / term * 100)
        )
      : 0;

  const state = status(c);

  const stateText = {
    normal: "ปกติ",
    near: "ใกล้ครบ",
    overdue: "ค้างชำระ",
    completed: "ครบแล้ว"
  }[state];

  return `
    <button
      type="button"
      class="contract-card"
      data-id="${escapeHTML(c.id)}"
    >

      <div class="card-row">

        <div>
          <h3>
            ${escapeHTML(c.product || "สินค้า")}
          </h3>

          <p>
            ${escapeHTML(c.customer || "ลูกค้า")}
          </p>
        </div>

        <strong class="balance">
          ${money(balance(c))}
        </strong>

      </div>

      <div class="progress-wrap">

        <div class="progress">
          <i style="width:${percent}%"></i>
        </div>

      </div>

      <div class="card-row">

        <p>
          ${paid}/${term} งวด
        </p>

        <span class="status">
          ${stateText}
        </span>

      </div>

    </button>
  `;
}

/* =====================================================
   ADD CONTRACT
===================================================== */

function openAdd() {

  const modal = document.createElement("div");

  modal.id = "contractModal";

  modal.innerHTML = `
    <div class="modal-backdrop"></div>

    <div class="modal-card">

      <div class="modal-head">

        <div>
          <span class="eyebrow">CONTRACT</span>
          <h2>เพิ่มสัญญา</h2>
        </div>

        <button
          type="button"
          id="closeModal"
        >
          ×
        </button>

      </div>

      <form id="contractForm">

        <label>
          ชื่อลูกค้า
          <input id="customer" required>
        </label>

        <label>
          เบอร์โทร
          <input id="phone" type="tel">
        </label>

        <label>
          สินค้า
          <input id="product" required>
        </label>

        <label>
          ราคาสินค้า
          <input
            id="price"
            type="number"
            min="0"
            required
          >
        </label>

        <label>
          เงินดาวน์
          <input
            id="down"
            type="number"
            min="0"
            value="0"
          >
        </label>

        <label>
          ประเภทการผ่อน

          <select id="frequency">

            <option value="daily">
              รายวัน
            </option>

            <option value="weekly">
              รายสัปดาห์
            </option>

            <option
              value="monthly"
              selected
            >
              รายเดือน
            </option>

          </select>

        </label>

        <label>
          ค่างวด
          <input
            id="installment"
            type="number"
            min="0"
            required
          >
        </label>

        <label>
          จำนวนงวด
          <input
            id="term"
            type="number"
            min="1"
            required
          >
        </label>

        <label>
          เริ่มผ่อน
          <input
            id="startDate"
            type="date"
            value="${today()}"
          >
        </label>

        <label>
          งวดถัดไป
          <input
            id="dueDate"
            type="date"
            value="${today()}"
          >
        </label>

        <label>
          หมายเหตุ
          <textarea id="notes"></textarea>
        </label>

        <div class="modal-actions">

          <button
            type="button"
            id="cancelModal"
          >
            ยกเลิก
          </button>

          <button
            type="submit"
          >
            บันทึกสัญญา
          </button>

        </div>

      </form>

    </div>
  `;

  document.body.appendChild(modal);

  $("#closeModal").onclick = closeModal;
  $("#cancelModal").onclick = closeModal;

  $(".modal-backdrop").onclick = closeModal;

  $("#contractForm").onsubmit =
    saveContract;
}

function closeModal() {

  const modal =
    $("#contractModal");

  if (modal)
    modal.remove();
}

function saveContract(event) {

  event.preventDefault();

  const customer =
    $("#customer").value.trim();

  const phone =
    $("#phone").value.trim();

  const product =
    $("#product").value.trim();

  const price =
    Number($("#price").value);

  const down =
    Number($("#down").value) || 0;

  const frequency =
    $("#frequency").value;

  const installment =
    Number($("#installment").value);

  const term =
    Number($("#term").value);

  const startDate =
    $("#startDate").value || today();

  const dueDate =
    $("#dueDate").value || startDate;

  const notes =
    $("#notes").value.trim();

  if (
    !customer ||
    !product ||
    price <= 0 ||
    installment <= 0 ||
    term <= 0
  ) {

    alert(
      "กรุณากรอกข้อมูลที่จำเป็นให้ครบ"
    );

    return;
  }

  const contract = {

    id: id(),

    customer,
    phone,
    product,

    price,
    down,

    frequency,

    installment,
    term,

    paid: 0,

    startDate,
    dueDate,

    notes,

    paymentHistory: [],

    createdAt:
      new Date().toISOString()
  };

  contracts.unshift(contract);

  if (!write(
    CONTRACT_KEY,
    contracts
  )) {

    contracts.shift();

    alert(
      "ไม่สามารถบันทึกข้อมูลได้"
    );

    return;
  }

  saveCustomer(
    customer,
    phone
  );

  closeModal();

  render();

  alert(
    "เพิ่มสัญญาเรียบร้อยแล้ว"
  );
}

/* =====================================================
   CUSTOMER
===================================================== */

function saveCustomer(
  name,
  phone
) {

  const key =
    name.toLowerCase();

  const existing =
    customers.find(
      c =>
        String(c.name || "")
          .toLowerCase() === key
    );

  if (existing) {

    if (
      phone &&
      !existing.phone
    )
      existing.phone = phone;

  } else {

    customers.push({

      id: id(),

      name,

      phone: phone || "",

      createdAt:
        new Date().toISOString()

    });

  }

  write(
    CUSTOMER_KEY,
    customers
  );
}

/* =====================================================
   SAFE HTML
===================================================== */

function escapeHTML(value) {

  return String(value ?? "")
    .replace(
      /[&<>"']/g,
      char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[char])
    );
}

/* =====================================================
   EVENTS
===================================================== */

document.addEventListener(
  "click",
  event => {

    const add =
      event.target.closest(
        "#addButton"
      );

    if (add) {

      event.preventDefault();

      openAdd();

      return;
    }

    const card =
      event.target.closest(
        ".contract-card"
      );

    if (card) {

      const contract =
        contracts.find(
          c =>
            c.id ===
            card.dataset.id
        );

      if (contract) {

        alert(
          `สัญญาของ ${contract.customer}\n\n` +
          `สินค้า: ${contract.product}\n` +
          `ค่างวด: ${money(contract.installment)}\n` +
          `ชำระแล้ว: ${contract.paid}/${contract.term} งวด\n` +
          `คงเหลือ: ${money(balance(contract))}`
        );

      }

    }

  }
);

/* =====================================================
   START
===================================================== */

render();
