const KEY="paynest_contracts_v1";
let contracts=load();
let currentPage="home", currentId=null, listFilter="all", calendarDate=new Date();

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const money=n=>new Intl.NumberFormat("th-TH",{style:"currency",currency:"THB",maximumFractionDigits:0}).format(Number(n)||0);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const todayISO=()=>{const d=new Date();return localDate(d)};
const localDate=d=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
const parseDate=s=>s?new Date(`${s}T00:00:00`):null;
const daysBetween=(a,b)=>Math.ceil((parseDate(b)-parseDate(a))/86400000);
function load(){try{return JSON.parse(localStorage.getItem(KEY)||"[]")}catch{return[]}}
function save(){localStorage.setItem(KEY,JSON.stringify(contracts))}
function uid(){return crypto.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)}
function status(c){
  if(c.paid>=c.term)return "completed";
  const due=c.dueDate;
  if(due&&due<todayISO())return "overdue";
  const left=c.term-c.paid;
  if(left<=2||c.paid/c.term>=.8)return "near";
  return "normal";
}
function balance(c){return Math.max(0,(Number(c.installment)||0)*(Math.max(0,(Number(c.term)||0)-(Number(c.paid)||0))))}
function totalContractValue(c){return Number(c.installment||0)*Number(c.term||0)}
function fmtDate(s){if(!s)return "ไม่ระบุ";const d=parseDate(s);return d.toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"numeric"})}
function frequencyText(v){return ({daily:"รายวัน",weekly:"รายสัปดาห์",monthly:"รายเดือน"}[v]||v)}
function statusText(v){return ({normal:"ปกติ",near:"ใกล้ครบ",overdue:"ค้างชำระ",completed:"ครบแล้ว"}[v]||v)}

function go(page){
  currentPage=page;
  $$(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${page}`));
  $$(".nav").forEach(n=>n.classList.toggle("active",n.dataset.page===page));
  $("#fab").style.display=page==="detail"?"none":"grid";
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
  $("#monthlyTotal").textContent=money(monthly);
  $("#totalContractsText").textContent=`${contracts.length} สัญญา`;
  $("#remainingTotal").textContent=money(remain);
  $("#paidTotal").textContent=money(paid);
  $("#overallProgressText").textContent=`${progress}%`;
  $("#overallProgress").style.width=`${progress}%`;
  $("#normalCount").textContent=contracts.filter(c=>status(c)==="normal").length;
  $("#nearCount").textContent=contracts.filter(c=>status(c)==="near").length;
  $("#overdueCount").textContent=contracts.filter(c=>status(c)==="overdue").length;
  const overdue=contracts.filter(c=>status(c)==="overdue").length;
  $("#insight").textContent=contracts.length===0?"ยังไม่มีสัญญา เริ่มต้นด้วยการเพิ่มสัญญาแรกของคุณ":overdue?`มี ${overdue} สัญญาที่เลยกำหนด ควรตรวจสอบและติดตามการชำระ`:`มี ${active.length} สัญญาที่ยังดำเนินอยู่ ความคืบหน้ารวม ${progress}%`;
  const recent=[...contracts].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,4);
  $("#recentList").innerHTML=recent.length?recent.map(cardHTML).join(""):emptyHTML("ยังไม่มีสัญญา","กด + เพื่อเพิ่มสัญญา");
}
function cardHTML(c){
  const st=status(c), pct=c.term?Math.min(100,Math.round(c.paid/c.term*100)):0;
  return `<button class="contract-card" data-open="${c.id}">
    <div class="card-row"><div><h3>${esc(c.product)}</h3><p>${esc(c.customer)}${c.phone?" • "+esc(c.phone):""}</p></div><div class="balance">${money(balance(c))}</div></div>
    <div class="progress-wrap" style="margin-top:13px"><div class="progress"><i style="width:${pct}%"></i></div></div>
    <div class="card-row" style="margin-top:8px"><p>${frequencyText(c.frequency)} • ${c.paid}/${c.term} งวด</p><span class="status-badge ${st==="overdue"?"danger":st==="near"?"warning":st==="completed"?"success":""}">${statusText(st)}</span></div>
  </button>`;
}
function emptyHTML(a,b){return `<div class="empty"><b>${a}</b><span>${b}</span></div>`}
function renderContracts(){
  const q=($("#searchInput").value||"").trim().toLowerCase(), sort=$("#sortSelect").value;
  let arr=contracts.filter(c=>(!q||`${c.customer} ${c.product} ${c.phone||""}`.toLowerCase().includes(q))&&(listFilter==="all"||status(c)===listFilter));
  arr.sort((a,b)=>{
    if(sort==="newest")return (b.createdAt||"").localeCompare(a.createdAt||"");
    if(sort==="balance")return balance(b)-balance(a);
    if(sort==="name")return a.customer.localeCompare(b.customer,"th");
    return (a.dueDate||"9999").localeCompare(b.dueDate||"9999");
  });
  $("#contractCountLabel").textContent=`${arr.length} / ${contracts.length} สัญญา`;
  $("#contractList").innerHTML=arr.length?arr.map(cardHTML).join(""):emptyHTML("ไม่พบสัญญา","ลองเปลี่ยนคำค้นหาหรือตัวกรอง");
  $$(".chip").forEach(x=>x.classList.toggle("active",x.dataset.listFilter===listFilter));
}
function openDetail(id){
  currentId=id;const c=contracts.find(x=>x.id===id);if(!c)return;
  const st=status(c), pct=c.term?Math.min(100,Math.round(c.paid/c.term*100)):0;
  $("#detailContent").innerHTML=`<section class="detail-card glass"><span class="eyebrow">${statusText(st).toUpperCase()}</span><h2>${esc(c.product)}</h2><p>${esc(c.customer)}${c.phone?" • "+esc(c.phone):""}</p><div class="detail-amount">${money(balance(c))}</div><p>ยอดคงเหลือ</p><div class="progress-wrap" style="margin-top:20px"><div class="progress-meta"><span>ชำระแล้ว ${c.paid}/${c.term} งวด</span><b>${pct}%</b></div><div class="progress"><i style="width:${pct}%"></i></div></div></section>
  <section class="detail-card glass"><div class="detail-grid"><div><span>ราคาสินค้า</span><b>${money(c.price)}</b></div><div><span>เงินดาวน์</span><b>${money(c.down)}</b></div><div><span>ค่างวด</span><b>${money(c.installment)}</b></div><div><span>ประเภท</span><b>${frequencyText(c.frequency)}</b></div><div><span>เริ่มผ่อน</span><b>${fmtDate(c.startDate)}</b></div><div><span>งวดถัดไป</span><b>${fmtDate(c.dueDate)}</b></div></div></section>
  <section class="detail-card glass"><div class="section-head"><h2>การชำระ</h2></div><div class="modal-actions"><button class="btn secondary" data-action="delete" data-id="${c.id}">ลบสัญญา</button><button class="btn primary" data-action="pay" data-id="${c.id}" ${st==="completed"?"disabled":""}>บันทึกชำระ 1 งวด</button></div>${c.notes?`<p style="margin-top:15px">${esc(c.notes)}</p>`:""}</section>`;
  go("detail");
}
function openModal(id=null){
  $("#contractForm").reset();$("#editId").value="";$("#modalTitle").textContent=id?"แก้ไขสัญญา":"เพิ่มสัญญา";
  if(id){const c=contracts.find(x=>x.id===id);if(!c)return;$("#editId").value=c.id;["customer","phone","product","price","down","frequency","installment","term","startDate","dueDate","notes"].forEach(k=>{if($( "#"+k))$("#"+k).value=c[k]??""})}
  else {$("#down").value=0;$("#frequency").value="monthly";$("#startDate").value=todayISO();$("#dueDate").value=todayISO()}
  updateCalc();$("#modal").classList.remove("hidden");setTimeout(()=>$("#customer").focus(),50)
}
function closeModal(){$("#modal").classList.add("hidden")}
function updateCalc(){
  const price=Number($("#price").value)||0,down=Number($("#down").value)||0,inst=Number($("#installment").value)||0,term=Number($("#term").value)||0;
  $("#financeAmount").textContent=money(Math.max(0,price-down));$("#financeTotal").textContent=money(inst*term);
}
function formSubmit(e){
  e.preventDefault();
  const id=$("#editId").value, data={customer:$("#customer").value.trim(),phone:$("#phone").value.trim(),product:$("#product").value.trim(),price:Number($("#price").value)||0,down:Number($("#down").value)||0,frequency:$("#frequency").value,installment:Number($("#installment").value)||0,term:Number($("#term").value)||0,startDate:$("#startDate").value||todayISO(),dueDate:$("#dueDate").value||todayISO(),notes:$("#notes").value.trim()};
  if(!data.customer||!data.product||data.installment<=0||data.term<=0)return toast("กรุณากรอกข้อมูลให้ครบ");
  if(data.down>data.price)return toast("เงินดาวน์ต้องไม่มากกว่าราคาสินค้า");
  if(id){const i=contracts.findIndex(c=>c.id===id);contracts[i]={...contracts[i],...data};toast("แก้ไขสัญญาแล้ว")}
  else {contracts.push({id:uid(),...data,paid:0,createdAt:new Date().toISOString()});toast("เพิ่มสัญญาแล้ว")}
  save();closeModal();renderAll();
}
function pay(id){
  const c=contracts.find(x=>x.id===id);if(!c||c.paid>=c.term)return;
  c.paid++;save();toast(c.paid>=c.term?"ชำระครบแล้ว":"บันทึกการชำระแล้ว");openDetail(id);
}
function remove(id){
  if(!confirm("ต้องการลบสัญญานี้หรือไม่?"))return;
  contracts=contracts.filter(c=>c.id!==id);save();go("contracts");toast("ลบสัญญาแล้ว");
}
function renderCalendar(){
  const y=calendarDate.getFullYear(),m=calendarDate.getMonth(),first=new Date(y,m,1),last=new Date(y,m+1,0);
  $("#calendarTitle").textContent=calendarDate.toLocaleDateString("th-TH",{month:"long",year:"numeric"});
  let html="",start=first.getDay(),prev=new Date(y,m,0).getDate();
  for(let i=0;i<42;i++){const n=i-start+1,d=n<=0?new Date(y,m-1,prev+n):n>last.getDate()?new Date(y,m+1,n-last.getDate()):new Date(y,m,n);const inMonth=d.getMonth()===m,s=localDate(d),due=contracts.some(c=>c.dueDate===s&&status(c)!=="completed");html+=`<button class="day ${inMonth?"":"muted"} ${s===todayISO()?"today":""} ${due?"has-due":""}" data-calendar-date="${s}">${d.getDate()}</button>`}
  $("#calendarGrid").innerHTML=html;
  const list=contracts.filter(c=>c.dueDate&&c.dueDate.slice(0,7)===`${y}-${String(m+1).padStart(2,"0")}`).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  $("#agendaTitle").textContent=`กำหนดชำระ ${list.length} รายการ`;
  $("#agendaList").innerHTML=list.length?list.map(c=>`<button class="agenda-item" data-open="${c.id}"><div><b>${esc(c.customer)}</b><small>${esc(c.product)} • ${fmtDate(c.dueDate)}</small></div><strong>${money(c.installment)}</strong></button>`).join(""):emptyHTML("ไม่มีรายการ","เดือนนี้ยังไม่มีวันครบกำหนด");
}
function renderCustomers(){
  const q=($("#customerSearch").value||"").trim().toLowerCase();
  const map=new Map();
  contracts.forEach(c=>{if(!map.has(c.customer))map.set(c.customer,[]);map.get(c.customer).push(c)});
  const arr=[...map.entries()].filter(([n])=>n.toLowerCase().includes(q));
  $("#customerCountLabel").textContent=`${arr.length} ราย`;
  $("#customerList").innerHTML=arr.length?arr.map(([name,cs])=>`<div class="agenda-item"><div><b>${esc(name)}</b><small>${cs.length} สัญญา${cs[0].phone?" • "+esc(cs[0].phone):""}</small></div><strong>${money(cs.reduce((s,c)=>s+balance(c),0))}</strong></div>`).join(""):emptyHTML("ยังไม่มีลูกค้า","เพิ่มสัญญาเพื่อสร้างรายการลูกค้า");
}
function renderSettings(){$("#storageInfo").textContent=`${contracts.length} สัญญา • เก็บข้อมูลในเครื่อง`; }
function renderAll(){renderHome();if(currentPage==="contracts")renderContracts();if(currentPage==="calendar")renderCalendar();if(currentPage==="customers")renderCustomers();if(currentPage==="settings")renderSettings()}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove("show"),2200)}
function exportData(){const blob=new Blob([JSON.stringify({app:"PayNest",version:1,contracts},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`paynest-backup-${todayISO()}.json`;a.click();URL.revokeObjectURL(a.href);toast("สำรองข้อมูลแล้ว")}
function importData(file){const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(!Array.isArray(d.contracts))throw Error();contracts=d.contracts;save();renderAll();toast("นำเข้าข้อมูลแล้ว")}catch{toast("ไฟล์สำรองไม่ถูกต้อง")}};r.readAsText(file)}
document.addEventListener("click",e=>{
  const page=e.target.closest("[data-page]");if(page){go(page.dataset.page);return}
  const open=e.target.closest("[data-open]");if(open){openDetail(open.dataset.open);return}
  const filter=e.target.closest("[data-filter]");if(filter){listFilter=filter.dataset.filter;go("contracts");return}
  const lf=e.target.closest("[data-list-filter]");if(lf){listFilter=lf.dataset.listFilter;renderContracts();return}
  const act=e.target.closest("[data-action]");if(!act)return;
  const a=act.dataset.action;
  if(a==="add")openModal();
  if(a==="edit"&&currentId)openModal(currentId);
  if(a==="back")go("contracts");
  if(a==="close-modal")closeModal();
  if(a==="pay")pay(act.dataset.id);
  if(a==="delete")remove(act.dataset.id);
  if(a==="prev-month"){calendarDate.setMonth(calendarDate.getMonth()-1);renderCalendar()}
  if(a==="next-month"){calendarDate.setMonth(calendarDate.getMonth()+1);renderCalendar()}
  if(a==="export")exportData();
  if(a==="import")$("#importInput").click();
  if(a==="clear"&&confirm("ลบข้อมูลสัญญาทั้งหมดหรือไม่?")){contracts=[];save();renderAll();toast("ลบข้อมูลทั้งหมดแล้ว")}
});
$("#contractForm").addEventListener("submit",formSubmit);
["price","down","installment","term"].forEach(id=>$("#"+id).addEventListener("input",updateCalc));
$("#searchInput").addEventListener("input",renderContracts);$("#sortSelect").addEventListener("change",renderContracts);$("#customerSearch").addEventListener("input",renderCustomers);
$("#importInput").addEventListener("change",e=>{if(e.target.files[0])importData(e.target.files[0]);e.target.value=""});
window.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});
renderAll();

if ("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));