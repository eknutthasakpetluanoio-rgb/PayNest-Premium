const KEY = "paynest_contracts_v1";
const CUSTOMER_KEY = "paynest_customers_v1";

let contracts = load();
let customers = loadCustomers();

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

function save() {
  localStorage.setItem(KEY, JSON.stringify(contracts));
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
  localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customers));
}

function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
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
  if (Number(c.paid || 0) >= Number(c.term || 0)) {
    return "completed";
  }

  if (c.dueDate && c.dueDate < todayISO()) {
    return "overdue";
  }

  const left =
    Number(c.term || 0) -
    Number(c.paid || 0);

  if (
    left <= 2 ||
    (
      Number(c.term || 0) > 0 &&
      Number(c.paid || 0) /
      Number(c.term || 0) >= 0.8
    )
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
      Number(c.term || 0) -
      Number(c.paid || 0)
    )
  );
}

function totalContractValue(c) {
  return Number(c.installment || 0) *
    Number(c.term || 0);
}

function fmtDate(s) {
  if (!s) return "ไม่ระบุ";

  const d = parseDate(s);

  return d
    ? d.toLocaleDateString(
        "th-TH",
        {
          day: "numeric",
          month: "short",
          year: "numeric"
        }
      )
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
    p.classList.toggle(
      "active",
      p.id === `page-${page}`
    );
  });

  $$(".nav").forEach(n => {
    n.classList.toggle(
      "active",
      n.dataset.page === page
    );
  });

  if ($("#fab")) {
    $("#fab").style.display =
      page === "detail"
        ? "none"
        : "grid";
  }

  if (page === "home") renderHome();
  if (page === "contracts") renderContracts();
  if (page === "calendar") renderCalendar();
  if (page === "customers") renderCustomers();
  if (page === "settings") renderSettings();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* =========================================================
   HOME
========================================================= */

function renderHome() {
  const active =
    contracts.filter(
      c => status(c) !== "completed"
    );

  const monthly =
    active
      .filter(
        c => c.frequency === "monthly"
      )
      .reduce(
        (s, c) =>
          s + Number(c.installment || 0),
        0
      );

  const remain =
    contracts.reduce(
      (s, c) => s + balance(c),
      0
    );

  const paid =
    contracts.reduce(
      (s, c) =>
        s +
        Number(c.installment || 0) *
        Number(c.paid || 0),
      0
    );

  const total =
    contracts.reduce(
      (s, c) =>
        s + totalContractValue(c),
      0
    );

  const progress =
    total
      ? Math.min(
          100,
          Math.round(
            paid / total * 100
          )
        )
      : 0;

  if ($("#monthlyTotal"))
    $("#monthlyTotal").textContent =
      money(monthly);

  if ($("#totalContractsText"))
    $("#totalContractsText").textContent =
      `${contracts.length} สัญญา`;

  if ($("#remainingTotal"))
    $("#remainingTotal").textContent =
      money(remain);

  if ($("#paidTotal"))
    $("#paidTotal").textContent =
      money(paid);

  if ($("#overallProgressText"))
    $("#overallProgressText").textContent =
      `${progress}%`;

  if ($("#overallProgress"))
    $("#overallProgress").style.width =
      `${progress}%`;

  if ($("#normalCount"))
    $("#normalCount").textContent =
      contracts.filter(
        c => status(c) === "normal"
      ).length;

  if ($("#nearCount"))
    $("#nearCount").textContent =
      contracts.filter(
        c => status(c) === "near"
      ).length;

  if ($("#overdueCount"))
    $("#overdueCount").textContent =
      contracts.filter(
        c => status(c) === "overdue"
      ).length;

  const overdue =
    contracts.filter(
      c => status(c) === "overdue"
    ).length;

  if ($("#insight")) {
    $("#insight").textContent =
      contracts.length === 0
        ? "ยังไม่มีสัญญา เริ่มต้นด้วยการเพิ่มสัญญาแรกของคุณ"
        : overdue
          ? `มี ${overdue} สัญญาที่เลยกำหนด ควรตรวจสอบและติดตามการชำระ`
          : `มี ${active.length} สัญญาที่ยังดำเนินอยู่ ความคืบหน้ารวม ${progress}%`;
  }

  const recent =
    [...contracts]
      .sort(
        (a, b) =>
          (b.createdAt || "")
            .localeCompare(
              a.createdAt || ""
            )
      )
      .slice(0, 4);

  if ($("#recentList")) {
    $("#recentList").innerHTML =
      recent.length
        ? recent.map(cardHTML).join("")
        : emptyHTML(
            "ยังไม่มีสัญญา",
            "กด + เพื่อเพิ่มสัญญา"
          );
  }
}

/* =========================================================
   CONTRACT CARD
========================================================= */

function cardHTML(c) {
  const st = status(c);

  const pct =
    c.term
      ? Math.min(
          100,
          Math.round(
            Number(c.paid || 0) /
            Number(c.term || 0) *
            100
          )
        )
      : 0;

  return `
    <button
      class="contract-card"
      data-open="${esc(c.id)}"
      type="button"
    >

      <div class="card-row">

        <div>

          <h3>
            ${esc(c.product)}
          </h3>

          <p>
            ${esc(c.customer)}
            ${c.phone
              ? " • " + esc(c.phone)
              : ""}
          </p>

        </div>

        <div class="balance">
          ${money(balance(c))}
        </div>

      </div>

      <div
        class="progress-wrap"
        style="margin-top:13px"
      >

        <div class="progress">
          <i
            style="width:${pct}%"
          ></i>
        </div>

      </div>

      <div
        class="card-row"
        style="margin-top:8px"
      >

        <p>
          ${frequencyText(c.frequency)}
          •
          ${Number(c.paid || 0)}/${Number(c.term || 0)}
          งวด
        </p>

        <span
          class="status-badge ${
            st === "overdue"
              ? "danger"
              : st === "near"
                ? "warning"
                : st === "completed"
                  ? "success"
                  : ""
          }"
        >
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
  const q =
    ($("#searchInput")?.value || "")
      .trim()
      .toLowerCase();

  const sort =
    $("#sortSelect")?.value ||
    "due";

  let arr =
    contracts.filter(c =>
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
      return (
        b.createdAt || ""
      ).localeCompare(
        a.createdAt || ""
      );
    }

    if (sort === "balance") {
      return balance(b) - balance(a);
    }

    if (sort === "name") {
      return String(
        a.customer || ""
      ).localeCompare(
        String(b.customer || ""),
        "th"
      );
    }

    return (
      a.dueDate || "9999"
    ).localeCompare(
      b.dueDate || "9999"
    );
  });

  if ($("#contractCountLabel")) {
    $("#contractCountLabel").textContent =
      `${arr.length} / ${contracts.length} สัญญา`;
  }

  if ($("#contractList")) {
    $("#contractList").innerHTML =
      arr.length
        ? arr.map(cardHTML).join("")
        : emptyHTML(
            "ไม่พบสัญญา",
            "ลองเปลี่ยนคำค้นหาหรือตัวกรอง"
          );
  }

  $$(".chip").forEach(x => {
    x.classList.toggle(
      "active",
      x.dataset.listFilter === listFilter
    );
  });
}
/* =========================================================
   CONTRACT DETAIL
========================================================= */

function openDetail(id) {
  currentId = id;
  currentDetailType = "contract";

  const c = contracts.find(
    x => x.id === id
  );

  if (!c || !$("#detailContent")) return;

  const st = status(c);

  const pct = c.term
    ? Math.min(
        100,
        Math.round(
          Number(c.paid || 0) /
          Number(c.term || 0) *
          100
        )
      )
    : 0;

  $("#detailContent").innerHTML = `

    <section class="detail-card glass">

      <span class="eyebrow">
        ${esc(statusText(st).toUpperCase())}
      </span>

      <h2>
        ${esc(c.product)}
      </h2>

      <p>
        ${esc(c.customer)}
        ${c.phone
          ? " • " + esc(c.phone)
          : ""}
      </p>

      <div class="detail-amount">
        ${money(balance(c))}
      </div>

      <p>ยอดคงเหลือ</p>

      <div
        class="progress-wrap"
        style="margin-top:20px"
      >

        <div class="progress-meta">

          <span>
            ชำระแล้ว
            ${Number(c.paid || 0)}/${Number(c.term || 0)}
            งวด
          </span>

          <b>${pct}%</b>

        </div>

        <div class="progress">

          <i
            style="width:${pct}%"
          ></i>

        </div>

      </div>

    </section>


    <section class="detail-card glass">

      <div class="detail-grid">

        <div>
          <span>ราคาสินค้า</span>
          <b>${money(c.price)}</b>
        </div>

        <div>
          <span>เงินดาวน์</span>
          <b>${money(c.down)}</b>
        </div>

        <div>
          <span>ค่างวด</span>
          <b>${money(c.installment)}</b>
        </div>

        <div>
          <span>ประเภท</span>
          <b>${frequencyText(c.frequency)}</b>
        </div>

        <div>
          <span>เริ่มผ่อน</span>
          <b>${fmtDate(c.startDate)}</b>
        </div>

        <div>

          <span>งวดถัดไป</span>

          <b>
            ${
              st === "completed"
                ? "ครบสัญญา"
                : fmtDate(c.dueDate)
            }
          </b>

        </div>

      </div>

    </section>


    <section class="detail-card glass">

      <div class="section-head">

        <h2>
          การชำระ
        </h2>

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
          ${
            st === "completed"
              ? "ชำระครบแล้ว"
              : "บันทึกชำระ 1 งวด"
          }
        </button>

      </div>


      ${
        c.notes
          ? `<p style="margin-top:15px">
              ${esc(c.notes)}
            </p>`
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

  const customer =
    customers.find(c =>
      String(c.name || "")
        .toLowerCase() ===
      String(name || "")
        .toLowerCase()
    );

  if (!customer) return;

  currentCustomerName =
    customer.name;

  currentDetailType =
    "customer";

  currentId = null;

  const related =
    contracts
      .filter(c =>
        String(c.customer || "")
          .toLowerCase() ===
        customer.name.toLowerCase()
      )
      .sort((a, b) =>
        (a.dueDate || "9999")
          .localeCompare(
            b.dueDate || "9999"
          )
      );

  const total =
    related.reduce(
      (s, c) =>
        s + balance(c),
      0
    );

  $("#detailContent").innerHTML = `

    <section class="detail-card glass">

      <span class="eyebrow">
        CUSTOMER
      </span>

      <h2>
        ${esc(customer.name)}
      </h2>

      ${
        customer.phone
          ? `<p>
              ${esc(customer.phone)}
            </p>`
          : ""
      }

      <div class="detail-amount">
        ${money(total)}
      </div>

      <p>
        ยอดคงเหลือทั้งหมด
      </p>

    </section>


    <section class="detail-card glass">

      <div class="section-head">

        <div>

          <span class="eyebrow">
            CONTRACTS
          </span>

          <h2>
            สัญญาของลูกค้า
          </h2>

        </div>

        <span class="status-badge">
          ${related.length} สัญญา
        </span>

      </div>


      ${
        related.length

          ? `
            <div class="list">

              ${
                related.map(c => `

                  <button
                    class="agenda-item"
                    data-open="${esc(c.id)}"
                    type="button"
                  >

                    <div>

                      <b>
                        ${esc(c.product)}
                      </b>

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

                    <strong>
                      ${money(balance(c))}
                    </strong>

                  </button>

                `).join("")
              }

            </div>
          `

          : emptyHTML(
              "ยังไม่มีสัญญา",
              "ลูกค้ารายนี้ยังไม่มีสัญญา"
            )
      }

    </section>

  `;

  go("detail");
}


/* =========================================================
   CONTRACT MODAL
========================================================= */

function openModal(id = null) {

  const form =
    $("#contractForm");

  if (
    !form ||
    !$("#modal")
  ) {
    return;
  }

  form.reset();

  if ($("#editId")) {
    $("#editId").value = "";
  }

  $("#modalTitle").textContent =
    id
      ? "แก้ไขสัญญา"
      : "เพิ่มสัญญา";


  if (id) {

    const c =
      contracts.find(
        x => x.id === id
      );

    if (!c) return;

    if ($("#editId")) {
      $("#editId").value =
        c.id;
    }

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

      if ($(`#${k}`)) {

        $(`#${k}`).value =
          c[k] ?? "";

      }

    });

  } else {

    if ($("#down"))
      $("#down").value = 0;

    if ($("#frequency"))
      $("#frequency").value =
        "monthly";

    if ($("#startDate"))
      $("#startDate").value =
        todayISO();

    if ($("#dueDate"))
      $("#dueDate").value =
        todayISO();

  }


  updateCalc();

  $("#modal")
    .classList
    .remove("hidden");

  setTimeout(
    () => $("#customer")?.focus(),
    50
  );
}


function closeModal() {

  if ($("#modal")) {

    $("#modal")
      .classList
      .add("hidden");

  }
}


function updateCalc() {

  const price =
    Number(
      $("#price")?.value
    ) || 0;

  const down =
    Number(
      $("#down")?.value
    ) || 0;

  const inst =
    Number(
      $("#installment")?.value
    ) || 0;

  const term =
    Number(
      $("#term")?.value
    ) || 0;


  if ($("#financeAmount")) {

    $("#financeAmount")
      .textContent =
      money(
        Math.max(
          0,
          price - down
        )
      );

  }


  if ($("#financeTotal")) {

    $("#financeTotal")
      .textContent =
      money(
        inst * term
      );

  }

}


/* =========================================================
   SAVE CONTRACT
========================================================= */

function formSubmit(e) {

  e.preventDefault();

  const id =
    $("#editId")?.value;


  const data = {

    customer:
      $("#customer")?.value.trim() ||
      "",

    phone:
      $("#phone")?.value.trim() ||
      "",

    product:
      $("#product")?.value.trim() ||
      "",

    price:
      Number(
        $("#price")?.value
      ) || 0,

    down:
      Number(
        $("#down")?.value
      ) || 0,

    frequency:
      $("#frequency")?.value ||
      "monthly",

    installment:
      Number(
        $("#installment")?.value
      ) || 0,

    term:
      Number(
        $("#term")?.value
      ) || 0,

    startDate:
      $("#startDate")?.value ||
      todayISO(),

    dueDate:
      $("#dueDate")?.value ||
      todayISO(),

    notes:
      $("#notes")?.value.trim() ||
      ""

  };


  if (
    !data.customer ||
    !data.product ||
    data.installment <= 0 ||
    data.term <= 0
  ) {

    return toast(
      "กรุณากรอกข้อมูลให้ครบ"
    );

  }


  if (
    data.down >
    data.price
  ) {

    return toast(
      "เงินดาวน์ต้องไม่มากกว่าราคาสินค้า"
    );

  }


  if (id) {

    const i =
      contracts.findIndex(
        c => c.id === id
      );

    if (i < 0) {

      return toast(
        "ไม่พบสัญญา"
      );

    }


    contracts[i] = {

      ...contracts[i],

      ...data

    };


    syncCustomer(
      contracts[i]
    );


    toast(
      "แก้ไขสัญญาแล้ว"
    );

  } else {

    const c = {

      id: uid(),

      ...data,

      paid: 0,

      paymentHistory: [],

      createdAt:
        new Date()
          .toISOString()

    };


    contracts.push(c);

    syncCustomer(c);


    toast(
      "เพิ่มสัญญาแล้ว"
    );

  }


  save();

  closeModal();

  renderAll();
}
/* =========================================================
   PAYMENT
========================================================= */

function pay(id) {

  const c =
    contracts.find(
      x => x.id === id
    );

  if (
    !c ||
    Number(c.paid || 0) >=
    Number(c.term || 0)
  ) {
    return;
  }

  if (
    !Array.isArray(
      c.paymentHistory
    )
  ) {
    c.paymentHistory = [];
  }


  const installmentNumber =
    Number(c.paid || 0) + 1;

  const amount =
    Number(c.installment || 0);

  const paymentDate =
    todayISO();


  c.paid =
    Number(c.paid || 0) + 1;


  const remainingAfter =
    Math.max(
      0,
      amount *
      (
        Number(c.term || 0) -
        Number(c.paid || 0)
      )
    );


  c.paymentHistory.unshift({

    id: uid(),

    installment:
      installmentNumber,

    amount:
      amount,

    date:
      paymentDate,

    remaining:
      remainingAfter

  });


  /*
   * ถ้ายังไม่ครบ
   * สร้างวันครบกำหนดถัดไป
   *
   * ถ้าครบแล้ว
   * ไม่เลื่อนงวดต่อ
   */

  if (
    Number(c.paid || 0) <
    Number(c.term || 0)
  ) {

    c.dueDate =
      nextDueAfterPayment(c);

  }


  save();

  syncCustomer(c);


  toast(
    Number(c.paid || 0) >=
    Number(c.term || 0)

      ? "ชำระครบสัญญาแล้ว"

      : `บันทึกชำระงวดที่ ${installmentNumber} แล้ว`
  );


  if (
    currentPage === "detail" &&
    currentDetailType === "contract"
  ) {

    openDetail(c.id);

  } else {

    renderAll();

  }

}


/* =========================================================
   PAYMENT HISTORY
========================================================= */

function paymentHistoryHTML(c) {

  const history =
    Array.isArray(c.paymentHistory)
      ? c.paymentHistory
      : [];


  const ordered =
    [...history].sort(
      (a, b) =>
        Number(
          b.installment || 0
        ) -
        Number(
          a.installment || 0
        )
    );


  return `

    <section class="detail-card glass">

      <div class="section-head">

        <div>

          <span class="eyebrow">
            PAYMENT HISTORY
          </span>

          <h2>
            ประวัติการชำระ
          </h2>

        </div>


        <span class="status-badge success">

          ${ordered.length}
          รายการ

        </span>

      </div>


      ${
        ordered.length

          ? `

            <div class="list">

              ${
                ordered.map(
                  h => `

                    <div
                      class="agenda-item"
                    >

                      <div>

                        <b>

                          งวดที่
                          ${Number(h.installment || 0)}
                          /
                          ${Number(c.term || 0)}

                        </b>


                        <small>

                          ชำระวันที่
                          ${fmtDate(h.date)}

                        </small>


                        <small>

                          คงเหลือหลังชำระ
                          ${money(h.remaining)}

                        </small>

                      </div>


                      <strong>

                        ${money(h.amount)}

                      </strong>

                    </div>

                  `
                ).join("")
              }

            </div>

          `

          : emptyHTML(

              "ยังไม่มีประวัติการชำระ",

              "เมื่อบันทึกการชำระ รายการจะปรากฏที่นี่"

            )
      }

    </section>

  `;

}


/* =========================================================
   DELETE CONTRACT
========================================================= */

function deleteContract(id) {

  const c =
    contracts.find(
      x => x.id === id
    );

  if (!c) return;


  const ok =
    window.confirm(
      `ต้องการลบสัญญา "${c.product}" ของ ${c.customer} ใช่หรือไม่?`
    );


  if (!ok) return;


  contracts =
    contracts.filter(
      x => x.id !== id
    );


  save();


  toast(
    "ลบสัญญาแล้ว"
  );


  currentId = null;

  currentDetailType =
    "contract";


  go("contracts");

}


/* =========================================================
   CUSTOMER LIST
========================================================= */

function renderCustomers() {

  const q =
    (
      $("#customerSearch")?.value ||
      ""
    )
      .trim()
      .toLowerCase();


  const arr =
    customers
      .filter(c =>
        !q ||
        `${c.name} ${c.phone || ""}`
          .toLowerCase()
          .includes(q)
      )
      .sort(
        (a, b) =>
          String(a.name || "")
            .localeCompare(
              String(b.name || ""),
              "th"
            )
      );


  if ($("#customerCount")) {

    $("#customerCount")
      .textContent =
      `${arr.length} ราย`;

  }

  /*
   * รองรับทั้ง id ที่อาจมีอยู่
   * ใน index.html คนละเวอร์ชัน
   */

  const list =
    $("#customerList") ||
    $("#customersList");


  if (!list) return;


  list.innerHTML =
    arr.length

      ? arr
          .map(
            customerCardHTML
          )
          .join("")

      : emptyHTML(
          "ยังไม่มีลูกค้า",
          "กด + เพื่อเพิ่มสัญญาและลูกค้าคนแรก"
        );

}


function customerCardHTML(c) {

  const related =
    contracts.filter(x =>
      String(
        x.customer || ""
      ).toLowerCase() ===
      String(
        c.name || ""
      ).toLowerCase()
    );


  const total =
    related.reduce(
      (s, x) =>
        s + balance(x),
      0
    );


  return `

    <button
      class="customer-card agenda-item"
      data-customer="${esc(c.name)}"
      type="button"
    >

      <div>

        <b>
          ${esc(c.name)}
        </b>


        <small>

          ${related.length}
          สัญญา

          ${
            c.phone
              ? " • " + esc(c.phone)
              : ""
          }

        </small>

      </div>


      <strong>

        ${money(total)}

      </strong>

    </button>

  `;

}


/* =========================================================
   CUSTOMER MODAL
========================================================= */

function ensureCustomerModal() {

  if ($("#customerModal"))
    return;


  const el =
    document.createElement(
      "div"
    );


  el.id =
    "customerModal";

  el.className =
    "modal hidden";


  el.innerHTML = `

    <div
      class="modal-backdrop"
      data-action="close-customer-modal"
    ></div>


    <div
      class="modal-card"
    >

      <div class="modal-head">

        <div>

          <span class="eyebrow">
            CUSTOMER
          </span>

          <h2>
            เพิ่มลูกค้า
          </h2>

        </div>


        <button
          class="icon-btn"
          data-action="close-customer-modal"
          aria-label="ปิด"
          type="button"
        >
          ×
        </button>

      </div>


      <form
        id="customerForm"
      >

        <div class="form-grid">

          <label>

            ชื่อลูกค้า

            <input
              id="newCustomerName"
              required
              autocomplete="off"
            >

          </label>


          <label>

            เบอร์โทร

            <input
              id="newCustomerPhone"
              type="tel"
              autocomplete="off"
            >

          </label>

        </div>


        <label>

          หมายเหตุ

          <textarea
            id="newCustomerNotes"
            rows="3"
          ></textarea>

        </label>


        <div
          class="modal-actions"
        >

          <button
            type="button"
            class="btn secondary"
            data-action="close-customer-modal"
          >
            ยกเลิก
          </button>


          <button
            type="submit"
            class="btn primary"
          >
            บันทึกลูกค้า
          </button>

        </div>

      </form>

    </div>

  `;


  document.body.appendChild(el);


  $("#customerForm")
    .addEventListener(
      "submit",
      saveNewCustomer
    );

}


function openCustomerModal() {

  ensureCustomerModal();


  $("#newCustomerName").value =
    "";

  $("#newCustomerPhone").value =
    "";

  $("#newCustomerNotes").value =
    "";


  $("#customerModal")
    .classList
    .remove("hidden");


  setTimeout(
    () =>
      $("#newCustomerName")?.focus(),
    50
  );

}


function closeCustomerModal() {

  $("#customerModal")
    ?.classList
    .add("hidden");

}


function saveNewCustomer(e) {

  e.preventDefault();


  const name =
    $("#newCustomerName")
      ?.value.trim() ||
    "";

  const phone =
    $("#newCustomerPhone")
      ?.value.trim() ||
    "";

  const notes =
    $("#newCustomerNotes")
      ?.value.trim() ||
    "";


  if (!name) {

    return toast(
      "กรุณากรอกชื่อลูกค้า"
    );

  }


  if (
    customers.some(
      c =>
        String(c.name || "")
          .toLowerCase() ===
        name.toLowerCase()
    )
  ) {

    return toast(
      "มีลูกค้าชื่อนี้อยู่แล้ว"
    );

  }


  customers.push({

    id: uid(),

    name,

    phone,

    notes,

    createdAt:
      new Date()
        .toISOString(),

    updatedAt:
      new Date()
        .toISOString()

  });


  saveCustomers();


  closeCustomerModal();


  renderCustomers();


  toast(
    "เพิ่มลูกค้าแล้ว"
  );

}


/* =========================================================
   CALENDAR
========================================================= */

function renderCalendar() {

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  /* ---------- Header ---------- */

  if ($("#calendarTitle")) {
    $("#calendarTitle").textContent =
      calendarDate.toLocaleDateString(
        "th-TH",
        {
          month: "long",
          year: "numeric"
        }
      );
  }


  /* ---------- Contracts in this month ---------- */

  const monthContracts =
    contracts
      .filter(c => c.dueDate)
      .filter(c => {

        const d = parseDate(c.dueDate);

        return (
          d &&
          d.getFullYear() === year &&
          d.getMonth() === month
        );

      })
      .sort((a, b) =>
        String(a.dueDate || "")
          .localeCompare(
            String(b.dueDate || "")
          )
      );


  /* ---------- Calendar Grid ---------- */

  const grid = $("#calendarGrid");

  if (grid) {

    const firstDay =
      new Date(
        year,
        month,
        1
      ).getDay();

    const daysInMonth =
      new Date(
        year,
        month + 1,
        0
      ).getDate();

    const prevDays =
      new Date(
        year,
        month,
        0
      ).getDate();


    let html = "";


    /* Previous month days */

    for (
      let i = firstDay - 1;
      i >= 0;
      i--
    ) {

      html += `
        <div class="day muted">
          ${prevDays - i}
        </div>
      `;

    }


    /* Current month */

    for (
      let day = 1;
      day <= daysInMonth;
      day++
    ) {

      const date =
        `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      const dueContracts =
        monthContracts.filter(
          c => c.dueDate === date
        );

      const isToday =
        date === todayISO();

      const hasDue =
        dueContracts.length > 0;

      const firstContract =
        dueContracts[0];


      html += `
        <button
          type="button"
          class="day
            ${isToday ? "today" : ""}
            ${hasDue ? "has-due" : ""}
          "
          ${
            firstContract
              ? `data-open="${esc(firstContract.id)}"`
              : ""
          }
        >
          ${day}
        </button>
      `;

    }


    /* Next month days */

    const totalCells =
      firstDay + daysInMonth;

    const nextDays =
      (7 - (totalCells % 7)) % 7;


    for (
      let day = 1;
      day <= nextDays;
      day++
    ) {

      html += `
        <div class="day muted">
          ${day}
        </div>
      `;

    }


    grid.innerHTML = html;

  }


  /* ---------- Due Date List ---------- */

  const list =
    $("#calendarList") ||
    $("#agendaList");


  if (!list) return;


  list.innerHTML =
    monthContracts.length

      ? monthContracts
          .map(
            c => `

              <button
                class="agenda-item"
                data-open="${esc(c.id)}"
                type="button"
              >

                <div>

                  <b>
                    ${esc(c.customer)}
                  </b>

                  <small>
                    ${esc(c.product)}
                  </small>

                  <small>
                    ${
                      status(c) === "completed"
                        ? "ครบสัญญา"
                        : `ครบกำหนด ${fmtDate(c.dueDate)}`
                    }
                  </small>

                </div>

                <strong>
                  ${money(c.installment)}
                </strong>

              </button>

            `
          )
          .join("")

      : emptyHTML(
          "ไม่มีงวดในเดือนนี้",
          "ยังไม่มีสัญญาที่มีกำหนดชำระในเดือนนี้"
        );

}


function calendarPrev() {

  calendarDate =
    new Date(
      calendarDate.getFullYear(),
      calendarDate.getMonth() - 1,
      1
    );


  renderCalendar();

}


function calendarNext() {

  calendarDate =
    new Date(
      calendarDate.getFullYear(),
      calendarDate.getMonth() + 1,
      1
    );


  renderCalendar();

}


/* =========================================================
   SETTINGS
========================================================= */

function renderSettings() {

  const contractStorage =
    localStorage.getItem(KEY);

  const customerStorage =
    localStorage.getItem(
      CUSTOMER_KEY
    );


  if ($("#storageContractCount")) {

    $("#storageContractCount")
      .textContent =
      contracts.length;

  }


  if ($("#storageCustomerCount")) {

    $("#storageCustomerCount")
      .textContent =
      customers.length;

  }


  if ($("#storageInfo")) {

    $("#storageInfo")
      .textContent =
      `${contracts.length} สัญญา • ${customers.length} ลูกค้า • เก็บข้อมูลในเครื่อง`;

  }


  if ($("#storageStatus")) {

    $("#storageStatus")
      .textContent =
      contractStorage !== null ||
      customerStorage !== null
        ? "พร้อมใช้งาน"
        : "ยังไม่มีข้อมูล";

  }

}


/* =========================================================
   EXPORT / IMPORT
========================================================= */

function exportData() {

  const data = {

    app:
      "PayNest",

    version:
      "v1",

    exportedAt:
      new Date()
        .toISOString(),

    contracts,

    customers

  };


  const blob =
    new Blob(
      [
        JSON.stringify(
          data,
          null,
          2
        )
      ],
      {
        type:
          "application/json"
      }
    );


  const url =
    URL.createObjectURL(
      blob
    );


  const a =
    document.createElement(
      "a"
    );


  a.href =
    url;

  a.download =
    `paynest-backup-${todayISO()}.json`;


  document.body.appendChild(a);

  a.click();

  a.remove();


  URL.revokeObjectURL(url);


  toast(
    "ส่งออกข้อมูลแล้ว"
  );

}


function importData(file) {

  if (!file) return;


  const reader =
    new FileReader();


  reader.onload = () => {

    try {

      const data =
        JSON.parse(
          reader.result
        );


      if (
        !data ||
        !Array.isArray(
          data.contracts
        )
      ) {

        throw new Error(
          "invalid"
        );

      }


      contracts =
        data.contracts;


      customers =
        Array.isArray(
          data.customers
        )
          ? data.customers
          : [];


      save();

      saveCustomers();


      renderAll();


      toast(
        "นำเข้าข้อมูลแล้ว"
      );


    } catch {

      toast(
        "ไฟล์ข้อมูลไม่ถูกต้อง"
      );

    }

  };


  reader.readAsText(
    file
  );

}


/* =========================================================
   CLEAR DATA
========================================================= */

function clearAllData() {

  const ok =
    window.confirm(
      "ต้องการลบข้อมูลสัญญาและลูกค้าทั้งหมดใช่หรือไม่? การกระทำนี้ย้อนกลับไม่ได้"
    );


  if (!ok) return;


  contracts = [];

  customers = [];


  localStorage.removeItem(
    KEY
  );

  localStorage.removeItem(
    CUSTOMER_KEY
  );


  renderAll();


  toast(
    "ลบข้อมูลทั้งหมดแล้ว"
  );

}


/* =========================================================
   TOAST
========================================================= */

function toast(message) {

  let el =
    $("#toast");


  if (!el) {

    el =
      document.createElement(
        "div"
      );

    el.id =
      "toast";

    el.className =
      "toast";

    document.body.appendChild(
      el
    );

  }


  el.textContent =
    message;


  el.classList.add(
    "show"
  );


  clearTimeout(
    window.__paynestToastTimer
  );


  window.__paynestToastTimer =
    setTimeout(
      () => {
        el.classList.remove(
          "show"
        );
      },
      2200
    );

}
/* =========================================================
   EVENT HANDLERS
========================================================= */

function bindEvents() {

  document.addEventListener(
    "click",
    e => {

      /* ---------- Navigation ---------- */

      const nav =
        e.target.closest(
          ".nav[data-page]"
        );

      if (nav) {

        e.preventDefault();

        go(
          nav.dataset.page
        );

        return;

      }


      /* ---------- Open Contract ---------- */

      const open =
        e.target.closest(
          "[data-open]"
        );

      if (open) {

        e.preventDefault();

        openDetail(
          open.dataset.open
        );

        return;

      }


      /* ---------- Open Customer ---------- */

      const customer =
        e.target.closest(
          "[data-customer]"
        );

      if (customer) {

        e.preventDefault();

        openCustomerDetail(
          customer.dataset.customer
        );

        return;

      }


      /* ---------- Actions ---------- */

      const action =
        e.target.closest(
          "[data-action]"
        );

      if (action) {

        e.preventDefault();

        const type =
          action.dataset.action;

        const id =
          action.dataset.id;


        if (type === "pay") {

          pay(id);

          return;

        }


        if (type === "delete") {

          deleteContract(id);

          return;

        }


        if (
          type ===
          "close-modal"
        ) {

          closeModal();

          return;

        }


        if (
          type ===
          "close-customer-modal"
        ) {

          closeCustomerModal();

          return;

        }


        if (type === "add") {

          const activePage =
            document.querySelector(
              ".nav.active"
            )?.dataset.page ||
            currentPage;


          if (
            activePage ===
            "customers"
          ) {

            openCustomerModal();

          } else {

            openModal();

          }

          return;

        }


        if (type === "back") {

          go("contracts");

          return;

        }


        if (
          type ===
          "prev-month"
        ) {

          calendarPrev();

          return;

        }


        if (
          type ===
          "next-month"
        ) {

          calendarNext();

          return;

        }


        if (type === "export") {

          exportData();

          return;

        }


        if (type === "import") {

          $("#importInput")?.click();

          return;

        }


        if (type === "clear") {

          clearAllData();

          return;

        }

      }


      /* ---------- Filter ---------- */

      const chip =
        e.target.closest(
          ".chip[data-list-filter]"
        );

      if (chip) {

        listFilter =
          chip.dataset.listFilter ||
          "all";

        renderContracts();

        return;

      }


      /* ---------- FAB ---------- */

      if (
        e.target.closest(
          "#fab"
        )
      ) {

        const activePage =
          document.querySelector(
            ".nav.active"
          )?.dataset.page ||
          currentPage;


        if (
          activePage ===
          "customers"
        ) {

          openCustomerModal();

        } else {

          openModal();

        }

        return;

      }


      /* ---------- Calendar ---------- */

      if (
        e.target.closest(
          "#calendarPrev"
        )
      ) {

        calendarPrev();

        return;

      }


      if (
        e.target.closest(
          "#calendarNext"
        )
      ) {

        calendarNext();

        return;

      }


      /* ---------- Export ---------- */

      if (
        e.target.closest(
          "#exportData"
        )
      ) {

        exportData();

        return;

      }


      /* ---------- Clear ---------- */

      if (
        e.target.closest(
          "#clearData"
        )
      ) {

        clearAllData();

        return;

      }

    }
  );


  /* =======================================================
     CONTRACT FORM
  ======================================================= */

  $("#contractForm")
    ?.addEventListener(
      "submit",
      formSubmit
    );


  /* =======================================================
     CALCULATOR
  ======================================================= */

  [
    "#price",
    "#down",
    "#installment",
    "#term"
  ].forEach(
    selector => {

      $(selector)
        ?.addEventListener(
          "input",
          updateCalc
        );

    }
  );


  /* =======================================================
     SEARCH
  ======================================================= */

  $("#searchInput")
    ?.addEventListener(
      "input",
      renderContracts
    );


  $("#sortSelect")
    ?.addEventListener(
      "change",
      renderContracts
    );


  $("#customerSearch")
    ?.addEventListener(
      "input",
      renderCustomers
    );


  /* =======================================================
     IMPORT
  ======================================================= */

  $("#importInput")
    ?.addEventListener(
      "change",
      e => {

        const file =
          e.target.files?.[0];

        if (file) {

          importData(file);

        }

        e.target.value = "";

      }
    );


  /* =======================================================
     MODAL BACKDROP
  ======================================================= */

  $("#modal")
    ?.addEventListener(
      "click",
      e => {

        if (
          e.target ===
          $("#modal")
        ) {

          closeModal();

        }

      }
    );


  /* =======================================================
     KEYBOARD
  ======================================================= */

  document.addEventListener(
    "keydown",
    e => {

      if (
        e.key ===
        "Escape"
      ) {

        closeModal();

        closeCustomerModal();

      }

    }
  );

}


/* =========================================================
   RENDER ALL
========================================================= */

function renderAll() {

  renderHome();
  renderContracts();
  renderCustomers();
  renderCalendar();
  renderSettings();

}


/* =========================================================
   INITIALIZE
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        bindEvents();

        // ซิงก์ลูกค้าจากสัญญาที่มีอยู่
        contracts.forEach(contract => {
            syncCustomer(contract);
        });

        renderAll();

        go("home");
  }
);
document.addEventListener("click", e => {
  const btn = e.target.closest('[data-action="edit"]');

  if (!btn) return;

  if (currentId) {
    openModal(currentId);
  }
});

