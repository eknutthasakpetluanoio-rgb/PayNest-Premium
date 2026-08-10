const KEY="paynest_contracts_v1";
const CUSTOMER_KEY="paynest_customers_v1";
let contracts=load(),customers=loadCustomers();
let currentPage="home",currentId=null,currentCustomerName=null,currentDetailType="contract",listFilter="all",calendarDate=new Date();

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const money=n=>new Intl.NumberFormat("th-TH",{style:"currency",currency:"THB",maximumFractionDigits:0}).format(Number(n)||0);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const localDate=d=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
const todayISO=()=>localDate(new Date()),parseDate=s=>s?new Date(`${s}T00:00:00`):null;

function load(){try{const x=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(x)?x:[]}catch{return[]}}
function save(){localStorage.setItem(KEY,JSON.stringify(contracts))}
function loadCustomers(){try{const x=JSON.parse(localStorage.getItem(CUSTOMER_KEY)||"[]");return Array.isArray(x)?x:[]}catch{return[]}}
function saveCustomers(){localStorage.setItem(CUSTOMER_KEY,JSON.stringify(customers))}
function uid(){return crypto.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)}

function syncCustomer(c){
  if(!c?.customer)return;
  const name=c.customer.trim(),key=name.toLowerCase();
  let x=customers.find(v=>String(v.name||"").toLowerCase()===key);
  if(x){if(c.phone&&!x.phone)x.phone=c.phone;x.updatedAt=new Date().toISOString()}
  else customers.push({id:uid(),name,phone:c.phone||"",notes:"",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  saveCustomers();
}

function addPeriod(s,f){
  const d=parseDate(s)||new Date(),day=d.getDate();
  if(f==="daily")d.setDate(d.getDate()+1);
  else if(f==="weekly")d.setDate(d.getDate()+7);
  else{const m=d.getMonth()+1;d.setDate(1);d.setMonth(m);d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()))}
  return localDate(d);
}
function nextDueAfterPayment(c){return addPeriod(c.dueDate||c.startDate||todayISO(),c.frequency)}
function status(c){
  if(Number(c.paid||0)>=Number(c.term||0))return"completed";
  if(c.dueDate&&c.dueDate<todayISO())return"overdue";
  const left=Number(c.term||0)-Number(c.paid||0);
  if(left<=2||(Number(c.term||0)>0&&Number(c.paid||0)/Number(c.term||0)>=.8))return"near";
  return"normal";
}
function balance(c){return Math.max(0,(Number(c.installment)||0)*Math.max(0,(Number(c.term)||0)-(Number(c.paid)||0)))}
function totalContractValue(c){return Number(c.installment||0)*Number(c.term||0)}
function fmtDate(s){if(!s)return"ไม่ระบุ";const d=parseDate(s);return d?d.toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"numeric"}):"ไม่ระบุ"}
function frequencyText(v){return({daily:"รายวัน",weekly:"รายสัปดาห์",monthly:"รายเดือน"}[v]||v)}
function statusText(v){return({normal:"ปกติ",near:"ใกล้ครบ",overdue:"ค้างชำระ",completed:"ครบแล้ว"}[v]||v)}

function go(page){
  currentPage=page;
  $$(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${page}`));
  $$(".nav").forEach(n=>n.classList.toggle("active",n.dataset.page===page));
  if($("#fab"))$("#fab").style.display=page==="detail"?"none":"grid";
  if(page==="home")renderHome();
  if(page==="contracts")renderContracts();
  if(page==="calendar")renderCalendar();
  if(page==="customers")renderCustomers();
  if(page==="settings")renderSettings();
  window.scrollTo({top:0,behavior:"smooth"});
}

function renderHome(){
  const active=contracts.filter(c=>status(c)!=="completed");
  const monthly=active.filter(c=>c.frequency==="monthly").reduce((s,c)=>s+Number(c.installment||0),0);
  const remain=contracts.reduce((s,c)=>s+balance(c),0);
  const paid=contracts.reduce((s,c)=>s+Number(c.installment||0)*Number(c.paid||0),0);
  const total=contracts.reduce((s,c)=>s+totalContractValue(c),0);
  const progress=total?Math.min(100,Math.round(paid/total*100)):0;
  if($("#monthlyTotal"))$("#monthlyTotal").textContent=money(monthly);
  if($("#totalContractsText"))$("#totalContractsText").textContent=`${contracts.length} สัญญา`;
  if($("#remainingTotal"))$("#remainingTotal").textContent=money(remain);
  if($("#paidTotal"))$("#paidTotal").textContent=money(paid);
  if($("#overallProgressText"))$("#overallProgressText").textContent=`${progress}%`;
  if($("#overallProgress"))$("#overallProgress").style.width=`${progress}%`;
  if($("#normalCount"))$("#normalCount").textContent=contracts.filter(c=>status(c)==="normal").length;
  if($("#nearCount"))$("#nearCount").textContent=contracts.filter(c=>status(c)==="near").length;
  if($("#overdueCount"))$("#overdueCount").textContent=contracts.filter(c=>status(c)==="overdue").length;
  const overdue=contracts.filter(c=>status(c)==="overdue").length;
  if($("#insight"))$("#insight").textContent=contracts.length===0?"ยังไม่มีสัญญา เริ่มต้นด้วยการเพิ่มสัญญาแรกของคุณ":overdue?`มี ${overdue} สัญญาที่เลยกำหนด ควรตรวจสอบและติดตามการชำระ`:`มี ${active.length} สัญญาที่ยังดำเนินอยู่ ความคืบหน้ารวม ${progress}%`;
  const recent=[...contracts].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,4);
  if($("#recentList"))$("#recentList").innerHTML=recent.length?recent.map(cardHTML).join(""):emptyHTML("ยังไม่มีสัญญา","กด + เพื่อเพิ่มสัญญา");
}

function cardHTML(c){
  const st=status(c),pct=c.term?Math.min(100,Math.round(Number(c.paid||0)/Number(c.term||0)*100)):0;
  return`<button class="contract-card" data-open="${c.id}" type="button"><div class="card-row"><div><h3>${esc(c.product)}</h3><p>${esc(c.customer)}${c.phone?" • "+esc(c.phone):""}</p></div><div class="balance">${money(balance(c))}</div></div><div class="progress-wrap" style="margin-top:13px"><div class="progress"><i style="width:${pct}%"></i></div></div><div class="card-row" style="margin-top:8px"><p>${frequencyText(c.frequency)} • ${c.paid}/${c.term} งวด</p><span class="status-badge ${st==="overdue"?"danger":st==="near"?"warning":st==="completed"?"success":""}">${statusText(st)}</span></div></button>`;
}
function emptyHTML(a,b){return`<div class="empty"><b>${a}</b><span>${b}</span></div>`}

function renderContracts(){
  const q=($("#searchInput")?.value||"").trim().toLowerCase(),sort=$("#sortSelect")?.value||"due";
  let arr=contracts.filter(c=>(!q||`${c.customer} ${c.product} ${c.phone||""}`.toLowerCase().includes(q))&&(listFilter==="all"||status(c)===listFilter));
  arr.sort((a,b)=>sort==="newest"?(b.createdAt||"").localeCompare(a.createdAt||""):sort==="balance"?balance(b)-balance(a):sort==="name"?String(a.customer||"").localeCompare(String(b.customer||""),"th"):(a.dueDate||"9999").localeCompare(b.dueDate||"9999"));
  if($("#contractCountLabel"))$("#contractCountLabel").textContent=`${arr.length} / ${contracts.length} สัญญา`;
  if($("#contractList"))$("#contractList").innerHTML=arr.length?arr.map(cardHTML).join(""):emptyHTML("ไม่พบสัญญา","ลองเปลี่ยนคำค้นหาหรือตัวกรอง");
  $$(".chip").forEach(x=>x.classList.toggle("active",x.dataset.listFilter===listFilter));
}

function openDetail(id){
  currentId=id;currentDetailType="contract";
  const c=contracts.find(x=>x.id===id);if(!c)return;
  const st=status(c),pct=c.term?Math.min(100,Math.round(Number(c.paid||0)/Number(c.term||0)*100)):0;
  $("#detailContent").innerHTML=`<section class="detail-card glass"><span class="eyebrow">${statusText(st).toUpperCase()}</span><h2>${esc(c.product)}</h2><p>${esc(c.customer)}${c.phone?" • "+esc(c.phone):""}</p><div class="detail-amount">${money(balance(c))}</div><p>ยอดคงเหลือ</p><div class="progress-wrap" style="margin-top:20px"><div class="progress-meta"><span>ชำระแล้ว ${c.paid}/${c.term} งวด</span><b>${pct}%</b></div><div class="progress"><i style="width:${pct}%"></i></div></div></section><section class="detail-card glass"><div class="detail-grid"><div><span>ราคาสินค้า</span><b>${money(c.price)}</b></div><div><span>เงินดาวน์</span><b>${money(c.down)}</b></div><div><span>ค่างวด</span><b>${money(c.installment)}</b></div><div><span>ประเภท</span><b>${frequencyText(c.frequency)}</b></div><div><span>เริ่มผ่อน</span><b>${fmtDate(c.startDate)}</b></div><div><span>งวดถัดไป</span><b>${fmtDate(c.dueDate)}</b></div></div></section><section class="detail-card glass"><div class="section-head"><h2>การชำระ</h2></div><div class="modal-actions"><button class="btn secondary" data-action="delete" data-id="${c.id}" type="button">ลบสัญญา</button><button class="btn primary" data-action="pay" data-id="${c.id}" type="button" ${st==="completed"?"disabled":""}>บันทึกชำระ 1 งวด</button></div>${c.notes?`<p style="margin-top:15px">${esc(c.notes)}</p>`:""}</section>${paymentHistoryHTML(c)}`;
  go("detail");
}

function openCustomerDetail(name){
  const customer=customers.find(c=>String(c.name||"").toLowerCase()===String(name||"").toLowerCase());
  if(!customer)return;
  currentCustomerName=customer.name;currentDetailType="customer";currentId=null;
  const related=contracts.filter(c=>String(c.customer||"").toLowerCase()===customer.name.toLowerCase()).sort((a,b)=>(a.dueDate||"9999").localeCompare(b.dueDate||"9999"));
  const total=related.reduce((s,c)=>s+balance(c),0);
  $("#detailContent").innerHTML=`<section class="detail-card glass"><span class="eyebrow">CUSTOMER</span><h2>${esc(customer.name)}</h2>${customer.phone?`<p>${esc(customer.phone)}</p>`:""}<div class="detail-amount">${money(total)}</div><p>ยอดคงเหลือทั้งหมด</p></section><section class="detail-card glass"><div class="section-head"><div><span class="eyebrow">CONTRACTS</span><h2>สัญญาของลูกค้า</h2></div><span class="status-badge">${related.length} สัญญา</span></div>${related.length?`<div class="list">${related.map(c=>`<button class="agenda-item" data-open="${c.id}" type="button"><div><b>${esc(c.product)}</b><small>${frequencyText(c.frequency)} • ${c.paid}/${c.term} งวด</small><small>งวดถัดไป ${fmtDate(c.dueDate)}</small></div><strong>${money(balance(c))}</strong></button>`).join("")}</div>`:emptyHTML("ยังไม่มีสัญญา","ลูกค้ารายนี้ยังไม่มีสัญญา")}</section>`;
  go("detail");
}

function openModal(id=null){
  $("#contractForm").reset();$("#editId").value="";$("#modalTitle").textContent=id?"แก้ไขสัญญา":"เพิ่มสัญญา";
  if(id){
    const c=contracts.find(x=>x.id===id);if(!c)return;
    $("#editId").value=c.id;
    ["customer","phone","product","price","down","frequency","installment","term","startDate","dueDate","notes"].forEach(k=>{if($("#"+k))$("#"+k).value=c[k]??""});
  }else{$("#down").value=0;$("#frequency").value="monthly";$("#startDate").value=todayISO();$("#dueDate").value=todayISO()}
  updateCalc();$("#modal").classList.remove("hidden");setTimeout(()=>$("#customer").focus(),50);
}
function closeModal(){$("#modal").classList.add("hidden")}
function updateCalc(){
  const price=Number($("#price").value)||0,down=Number($("#down").value)||0,inst=Number($("#installment").value)||0,term=Number($("#term").value)||0;
  $("#financeAmount").textContent=money(Math.max(0,price-down));$("#financeTotal").textContent=money(inst*term);
}
function formSubmit(e){
  e.preventDefault();const id=$("#editId").value;
  const data={customer:$("#customer").value.trim(),phone:$("#phone").value.trim(),product:$("#product").value.trim(),price:Number($("#price").value)||0,down:Number($("#down").value)||0,frequency:$("#frequency").value,installment:Number($("#installment").value)||0,term:Number($("#term").value)||0,startDate:$("#startDate").value||todayISO(),dueDate:$("#dueDate").value||todayISO(),notes:$("#notes").value.trim()};
  if(!data.customer||!data.product||data.installment<=0||data.term<=0)return toast("กรุณากรอกข้อมูลให้ครบ");
  if(data.down>data.price)return toast("เงินดาวน์ต้องไม่มากกว่าราคาสินค้า");
  if(id){
    const i=contracts.findIndex(c=>c.id===id);if(i<0)return toast("ไม่พบสัญญา");
    contracts[i]={...contracts[i],...data};syncCustomer(contracts[i]);toast("แก้ไขสัญญาแล้ว");
  }else{
    const c={id:uid(),...data,paid:0,paymentHistory:[],createdAt:new Date().toISOString()};
    contracts.push(c);syncCustomer(c);toast("เพิ่มสัญญาแล้ว");
  }
  save();closeModal();renderAll();
}

function pay(id){
  const c=contracts.find(x=>x.id===id);if(!c||Number(c.paid||0)>=Number(c.term||0))return;
  if(!Array.isArray(c.paymentHistory))c.paymentHistory=[];
  const installmentNumber=Number(c.paid||0)+1,amount=Number(c.installment||0),paymentDate=todayISO();
  c.paid=Number(c.paid||0)+1;
  const remainingAfter=Math.max(0,amount*(Number(c.term||0)-Number(c.paid||0)));
  c.paymentHistory.unshift({id:uid(),installment:installmentNumber,amount,date:paymentDate,remaining:remainingAfter});
  if(c.paid<c.term)c.dueDate=nextDueAfterPayment(c);
  save();toast(c.paid>=c.term?"ชำระครบแล้ว":"บันทึกการชำระแล้ว");openDetail(id);
}

function remove(id){
  if(!confirm("ต้องการลบสัญญานี้หรือไม่?"))return;
  contracts=contracts.filter(c=>c.id!==id);save();go("contracts");toast("ลบสัญญาแล้ว");
}

function paymentHistoryHTML(c){
  const history=Array.isArray(c.paymentHistory)?c.paymentHistory:[];
  if(!history.length)return`<section class="detail-card glass"><div class="section-head"><div><span class="eyebrow">PAYMENT HISTORY</span><h2>ประวัติการชำระ</h2></div></div><div class="empty"><b>ยังไม่มีประวัติการชำระ</b><span>เมื่อบันทึกการชำระ รายการจะปรากฏที่นี่</span></div></section>`;
  return`<section class="detail-card glass"><div class="section-head"><div><span class="eyebrow">PAYMENT HISTORY</span><h2>ประวัติการชำระ</h2></div><span class="status-badge success">${history.length} รายการ</span></div><div class="list">${history.map(p=>`<div class="agenda-item"><div><b>งวดที่ ${p.installment}/${c.term}</b><small>ชำระวันที่ ${fmtDate(p.date)}</small><small>คงเหลือหลังชำระ ${money(p.remaining)}</small></div><strong>${money(p.amount)}</strong></div>`).join("")}</div></section>`;
}

function ensureCustomerModal(){
  if($("#customerModal"))return;
  const el=document.createElement("div");el.id="customerModal";el.className="modal hidden";
  el.innerHTML=`<div class="modal-backdrop" data-action="close-customer-modal"></div><div class="modal-card"><div class="modal-head"><div><span class="eyebrow">CUSTOMER</span><h2>เพิ่มลูกค้า</h2></div><button class="icon-btn" data-action="close-customer-modal" aria-label="ปิด" type="button">×</button></div><form id="customerForm"><div class="form-grid"><label>ชื่อลูกค้า<input id="newCustomerName" required autocomplete="off"></label><label>เบอร์โทร<input id="newCustomerPhone" type="tel" autocomplete="off"></label></div><label>หมายเหตุ<textarea id="newCustomerNotes" rows="3"></textarea></label><div class="modal-actions"><button type="button" class="btn secondary" data-action="close-customer-modal">ยกเลิก</button><button type="submit" class="btn primary">บันทึกลูกค้า</button></div></form></div>`;
  document.body.appendChild(el);$("#customerForm").addEventListener("submit",saveNewCustomer);
}
function openCustomerModal(){ensureCustomerModal();$("#newCustomerName").value="";$("#newCustomerPhone").value="";$("#newCustomerNotes").value="";$("#customerModal").classList.remove("hidden");setTimeout(()=>$("#newCustomerName").focus(),50)}
function closeCustomerModal(){const m=$("#customerModal");if(m)m.classList.add("hidden")}
function saveNewCustomer(e){
  e.preventDefault();
  const name=$("#newCustomerName").value.trim(),phone=$("#newCustomerPhone").value.trim(),notes=$("#newCustomerNotes").value.trim();
  if(!name)return toast("กรุณากรอกชื่อลูกค้า");
  if(customers.some(c=>String(c.name||"").toLowerCase()===name.toLowerCase()))return toast("มีลูกค้าชื่อนี้อยู่แล้ว");
  customers.push({id:uid(),name,phone,notes,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  saveCustomers();closeCustomerModal();renderCustomers();toast("เพิ่มลูกค้าแล้ว");
}

function customerHTML(c){
  const related=contracts.filter(x=>String(x.customer||"").toLowerCase()===String(c.name||"").toLowerCase());
  const total=related.reduce((s,x)=>s+balance(x),0);
  return`<button class="agenda-item customer-item" data-customer="${esc(c.name)}" type="button"><div><b>${esc(c.name)}</b><small>${related.length} สัญญา${c.phone?" • "+esc(c.phone):""}</small>${c.notes?`<small>${esc(c.notes)}</small>`:""}</div><strong>${money(total)}</strong></button>`;
}

function renderCustomers(){
  contracts.forEach(syncCustomer);
  const q=($("#customerSearch")?.value||"").trim().toLowerCase();
  const arr=customers.filter(c=>String(c.name||"").toLowerCase().includes(q)).sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"th"));
  if($("#customerCountLabel"))$("#customerCountLabel").textContent=`${arr.length} ราย`;
  if($("#customerList"))$("#customerList").innerHTML=arr.length?arr.map(customerHTML).join(""):emptyHTML("ยังไม่มีลูกค้า","กด + เพื่อเพิ่มลูกค้า");
}

function renderCalendar(){
  const y=calendarDate.getFullYear(),m=calendarDate.getMonth(),first=new Date(y,m,1),last=new Date(y,m+1,0);
  if($("#calendarTitle"))$("#calendarTitle").textContent=calendarDate.toLocaleDateString("th-TH",{month:"long",year:"numeric"});
  let html="",start=first.getDay(),prev=new Date(y,m,0).getDate();
  for(let i=0;i<42;i++){
    const n=i-start+1,d=n<=0?new Date(y,m-1,prev+n):n>last.getDate()?new Date(y,m+1,n-last.getDate()):new Date(y,m,n),inMonth=d.getMonth()===m,s=localDate(d),due=contracts.some(c=>c.dueDate===s&&status(c)!=="completed");
    html+=`<button class="day ${inMonth?"":"muted"} ${s===todayISO()?"today":""} ${due?"has-due":""}" data-calendar-date="${s}" type="button">${d.getDate()}</button>`;
  }
  if($("#calendarGrid"))$("#calendarGrid").innerHTML=html;
  const key=`${y}-${String(m+1).padStart(2,"0")}`;
  const list=contracts.filter(c=>c.dueDate&&c.dueDate.slice(0,7)===key).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  if($("#agendaTitle"))$("#agendaTitle").textContent=`กำหนดชำระ ${list.length} รายการ`;
  if($("#agendaList"))$("#agendaList").innerHTML=list.length?list.map(c=>`<button class="agenda-item" data-open="${c.id}" type="button"><div><b>${esc(c.customer)}</b><small>${esc(c.product)} • ${fmtDate(c.dueDate)}</small></div><strong>${money(c.installment)}</strong></button>`).join(""):emptyHTML("ไม่มีรายการ","เดือนนี้ยังไม่มีวันครบกำหนด");
}

function renderSettings(){if($("#storageInfo"))$("#storageInfo").textContent=`${contracts.length} สัญญา • ${customers.length} ลูกค้า • เก็บข้อมูลในเครื่อง`}
function renderAll(){renderHome();if(currentPage==="contracts")renderContracts();if(currentPage==="calendar")renderCalendar();if(currentPage==="customers")renderCustomers();if(currentPage==="settings")renderSettings()}
function toast(msg){const t=$("#toast");if(!t)return;t.textContent=msg;t.classList.add("show");clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove("show"),2200)}

function exportData(){
  const blob=new Blob([JSON.stringify({app:"PayNest",version:2,contracts,customers},null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`paynest-backup-${todayISO()}.json`;a.click();URL.revokeObjectURL(a.href);toast("สำรองข้อมูลแล้ว");
}
function importData(file){
  const r=new FileReader();
  r.onload=()=>{
    try{
      const d=JSON.parse(r.result);if(!Array.isArray(d.contracts))throw Error();
      contracts=d.contracts;customers=Array.isArray(d.customers)?d.customers:[];
      if(!customers.length)contracts.forEach(syncCustomer);
      save();saveCustomers();renderAll();toast("นำเข้าข้อมูลแล้ว");
    }catch{toast("ไฟล์สำรองไม่ถูกต้อง")}
  };
  r.readAsText(file);
}

document.addEventListener("click",e=>{
  const page=e.target.closest("[data-page]");if(page){go(page.dataset.page);return}
  const open=e.target.closest("[data-open]");if(open){openDetail(open.dataset.open);return}
  const customer=e.target.closest("[data-customer]");if(customer){openCustomerDetail(customer.dataset.customer);return}
  const filter=e.target.closest("[data-filter]");if(filter){listFilter=filter.dataset.filter;go("contracts");return}
  const lf=e.target.closest("[data-list-filter]");if(lf){listFilter=lf.dataset.listFilter;renderContracts();return}
  const act=e.target.closest("[data-action]");if(!act)return;
  const a=act.dataset.action;
  if(a==="add"){
    const activePage=document.querySelector(".nav.active")?.dataset.page||currentPage;
    activePage==="customers"?openCustomerModal():openModal();return;
  }
  if(a==="edit"&&currentId){openModal(currentId);return}
  if(a==="back"){currentDetailType==="customer"?go("customers"):go("contracts");return}
  if(a==="close-modal"){closeModal();return}
  if(a==="close-customer-modal"){closeCustomerModal();return}
  if(a==="pay"){pay(act.dataset.id);return}
  if(a==="delete"){remove(act.dataset.id);return}
  if(a==="prev-month"){calendarDate.setMonth(calendarDate.getMonth()-1);renderCalendar();return}
  if(a==="next-month"){calendarDate.setMonth(calendarDate.getMonth()+1);renderCalendar();return}
  if(a==="export"){exportData();return}
  if(a==="import"){$("#importInput")?.click();return}
  if(a==="clear"&&confirm("ลบข้อมูลสัญญาทั้งหมดหรือไม่?")){contracts=[];customers=[];save();saveCustomers();renderAll();toast("ลบข้อมูลทั้งหมดแล้ว")}
});

if($("#contractForm"))$("#contractForm").addEventListener("submit",formSubmit);
["price","down","installment","term"].forEach(id=>{if($("#"+id))$("#"+id).addEventListener("input",updateCalc)});
if($("#searchInput"))$("#searchInput").addEventListener("input",renderContracts);
if($("#sortSelect"))$("#sortSelect").addEventListener("change",renderContracts);
if($("#customerSearch"))$("#customerSearch").addEventListener("input",renderCustomers);
if($("#importInput"))$("#importInput").addEventListener("change",e=>{if(e.target.files[0])importData(e.target.files[0]);e.target.value=""});
window.addEventListener("keydown",e=>{if(e.key==="Escape"){closeModal();closeCustomerModal()}});

renderAll();
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
