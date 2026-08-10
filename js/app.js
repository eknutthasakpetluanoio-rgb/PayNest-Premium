/* =========================================================
   PayNest Customer Manager Patch
========================================================= */

const CUSTOMER_KEY = "paynest_customers_v1";

function loadCustomers(){
  try{
    const data = JSON.parse(localStorage.getItem(CUSTOMER_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  }catch{
    return [];
  }
}

function saveCustomers(data){
  localStorage.setItem(CUSTOMER_KEY, JSON.stringify(data));
}

let customers = loadCustomers();

function syncCustomersFromContracts(){
  const map = new Map();

  customers.forEach(c=>{
    if(c?.name){
      map.set(c.name.trim().toLowerCase(), c);
    }
  });

  contracts.forEach(c=>{
    if(!c?.customer) return;

    const name = c.customer.trim();
    const key = name.toLowerCase();

    if(!map.has(key)){
      map.set(key,{
        id:uid(),
        name:name,
        phone:c.phone || "",
        notes:"",
        createdAt:new Date().toISOString()
      });
    }else{
      const old = map.get(key);
      if(c.phone && !old.phone) old.phone = c.phone;
    }
  });

  customers = [...map.values()];
  saveCustomers(customers);
}

function ensureCustomerModal(){

  if($("#customerModal")) return;

  const modal = document.createElement("div");

  modal.id = "customerModal";
  modal.className = "modal hidden";

  modal.innerHTML = `
    <div class="modal-backdrop"
         data-action="close-customer-modal"></div>

    <div class="modal-card">

      <div class="modal-head">
        <div>
          <span class="eyebrow">CUSTOMER</span>
          <h2>เพิ่มลูกค้า</h2>
        </div>

        <button
          class="icon-btn"
          type="button"
          data-action="close-customer-modal">
          ×
        </button>
      </div>

      <form id="customerForm">

        <label>
          ชื่อลูกค้า
          <input
            id="newCustomerName"
            required
            autocomplete="off">
        </label>

        <label>
          เบอร์โทร
          <input
            id="newCustomerPhone"
            type="tel"
            autocomplete="off">
        </label>

        <label>
          หมายเหตุ
          <textarea
            id="newCustomerNotes"
            rows="3"></textarea>
        </label>

        <div class="modal-actions">

          <button
            type="button"
            class="btn secondary"
            data-action="close-customer-modal">
            ยกเลิก
          </button>

          <button
            type="submit"
            class="btn primary">
            บันทึกลูกค้า
          </button>

        </div>

      </form>
    </div>
  `;

  document.body.appendChild(modal);

  $("#customerForm").addEventListener(
    "submit",
    saveNewCustomer
  );
}

function openCustomerModal(){

  ensureCustomerModal();

  $("#newCustomerName").value = "";
  $("#newCustomerPhone").value = "";
  $("#newCustomerNotes").value = "";

  $("#customerModal").classList.remove("hidden");

  setTimeout(()=>{
    $("#newCustomerName").focus();
  },50);
}

function closeCustomerModal(){

  const modal = $("#customerModal");

  if(modal){
    modal.classList.add("hidden");
  }
}

function saveNewCustomer(e){

  e.preventDefault();

  const name =
    $("#newCustomerName").value.trim();

  const phone =
    $("#newCustomerPhone").value.trim();

  const notes =
    $("#newCustomerNotes").value.trim();

  if(!name){
    toast("กรุณากรอกชื่อลูกค้า");
    return;
  }

  const exists = customers.some(
    c => c.name.trim().toLowerCase()
      === name.toLowerCase()
  );

  if(exists){
    toast("มีลูกค้าชื่อนี้อยู่แล้ว");
    return;
  }

  customers.push({
    id:uid(),
    name:name,
    phone:phone,
    notes:notes,
    createdAt:new Date().toISOString()
  });

  saveCustomers(customers);

  closeCustomerModal();

  renderCustomers();

  toast("เพิ่มลูกค้าแล้ว");
}

function renderCustomers(){

  syncCustomersFromContracts();

  const q =
    ($("#customerSearch")?.value || "")
      .trim()
      .toLowerCase();

  const arr = customers.filter(c =>
    !q ||
    `${c.name} ${c.phone || ""}`
      .toLowerCase()
      .includes(q)
  );

  $("#customerCountLabel").textContent =
    `${arr.length} ราย`;

  $("#customerList").innerHTML = arr.length
    ? arr.map(c=>`

      <div class="agenda-item">

        <div>
          <b>${esc(c.name)}</b>

          <small>
            ${c.phone
              ? esc(c.phone)
              : "ไม่มีเบอร์โทร"}
          </small>

          ${
            c.notes
              ? `<small>${esc(c.notes)}</small>`
              : ""
          }

        </div>

        <strong>
          ${money(
            contracts
              .filter(x =>
                x.customer?.trim().toLowerCase()
                === c.name.trim().toLowerCase()
              )
              .reduce(
                (sum,x)=>sum + balance(x),
                0
              )
          )}
        </strong>

      </div>

    `).join("")
    : emptyHTML(
        "ยังไม่มีลูกค้า",
        "กด + เพื่อเพิ่มลูกค้ารายแรก"
      );
}

/* ---------- Customer FAB ---------- */

document.addEventListener("click",e=>{

  const action =
    e.target.closest("[data-action]");

  if(!action) return;

  if(action.dataset.action === "add"){

    if(currentPage === "customers"){

      closeModal();

      openCustomerModal();

    }
  }

  if(
    action.dataset.action
    === "close-customer-modal"
  ){
    closeCustomerModal();
  }

});

/* ---------- Initial customer sync ---------- */

syncCustomersFromContracts();

if(currentPage === "customers"){
  renderCustomers();
}