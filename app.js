// 1. Создай проект на https://supabase.com/
// 2. Вставь сюда Project URL и anon key из Settings -> API.
// 3. Выполни supabase.sql в SQL Editor.

const SUPABASE_URL = "https://eglfntdtoomsxebyvkno.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_CfQwt-VgMKhMAgFidOkxvA_G0IY0omQ";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = id => document.getElementById(id);
let tasks = [];
let filter = "all";
let sort = "deadline";
let editingId = null;
let menuTaskId = null;

const authView = $("authView"), tasksView = $("tasksView"), addBtn = $("addBtn"), logoutBtn = $("logoutBtn");
const modal = $("modal"), menu = $("menu");

function fmtDate(date) {
  return new Intl.DateTimeFormat("ru-RU", {day:"numeric", month:"long"}).format(new Date(date + "T00:00:00"));
}
function todayISO(){ return new Date().toISOString().slice(0,10); }

function render() {
  let visible = tasks.filter(t => filter === "all" ? true : filter === "active" ? !t.done : t.done);
  visible.sort((a,b) => sort==="deadline" ? a.deadline.localeCompare(b.deadline) : sort==="subject" ? a.subject.localeCompare(b.subject,"ru") : new Date(b.created_at)-new Date(a.created_at));
  $("taskList").innerHTML = visible.map(t => {
    const overdue = !t.done && t.deadline < todayISO();
    const today = !t.done && t.deadline === todayISO();
    return `<article class="task ${t.done?"done":""}">
      <div>
        <div class="subject">${escapeHtml(t.subject)}</div>
        <div class="comment">${escapeHtml(t.comment)}</div>
        <span class="deadline ${overdue?"overdue":today?"today":""}">${overdue?"Просрочено · ":today?"Сегодня · ":"До "}${fmtDate(t.deadline)}</span>
      </div>
      <div class="task-actions">
        <button class="check" title="${t.done?"Вернуть в активные":"Выполнено"}" onclick="toggleDone('${t.id}',${!t.done})">${t.done?"✓":"○"}</button>
        <button class="more" title="Действия" onclick="openMenu(event,'${t.id}')">•••</button>
      </div>
    </article>`;
  }).join("");
  $("emptyState").classList.toggle("hidden", visible.length !== 0);
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}

async function loadTasks(){
  const {data,error}=await supabaseClient.from("tasks").select("*").order("deadline",{ascending:true});
  if(error){console.error(error); return;}
  tasks=data||[]; render();
}

window.toggleDone=async(id,done)=>{
  const {error}=await supabaseClient.from("tasks").update({done}).eq("id",id);
  if(error)return alert(error.message);
  const t=tasks.find(x=>x.id===id); if(t)t.done=done; render();
};
window.openMenu=(e,id)=>{
  e.stopPropagation(); menuTaskId=id;
  menu.style.left=Math.min(e.clientX,window.innerWidth-195)+"px";
  menu.style.top=Math.min(e.clientY+6,window.innerHeight-110)+"px";
  menu.classList.remove("hidden");
};
$("deleteAction").onclick=async()=>{
  if(!menuTaskId)return;
  if(!confirm("Удалить это задание?"))return;
  const {error}=await supabaseClient.from("tasks").delete().eq("id",menuTaskId);
  if(error)return alert(error.message);
  tasks=tasks.filter(t=>t.id!==menuTaskId); menu.classList.add("hidden"); render();
};
$("editAction").onclick=()=>{
  const t=tasks.find(x=>x.id===menuTaskId); if(!t)return;
  editingId=t.id; $("subject").value=t.subject; $("deadline").value=t.deadline; $("comment").value=t.comment;
  modal.classList.remove("hidden"); menu.classList.add("hidden");
  document.querySelector(".modal-card .eyebrow").textContent="РЕДАКТИРОВАНИЕ";
  document.querySelector(".modal-card h2").textContent="Изменить задание";
  document.querySelector("#taskForm .primary").textContent="Сохранить";
};

$("taskForm").onsubmit=async e=>{
  e.preventDefault();
  const payload={subject:$("subject").value.trim(),deadline:$("deadline").value,comment:$("comment").value.trim()};
  let result;
  if(editingId) result=await supabaseClient.from("tasks").update(payload).eq("id",editingId).select().single();
  else result=await supabaseClient.from("tasks").insert(payload).select().single();
  if(result.error)return alert(result.error.message);
  if(editingId){const i=tasks.findIndex(t=>t.id===editingId);tasks[i]=result.data}
  else tasks.push(result.data);
  closeModal(); render();
};

function closeModal(){
  modal.classList.add("hidden"); $("taskForm").reset(); editingId=null;
  document.querySelector(".modal-card .eyebrow").textContent="НОВОЕ ЗАДАНИЕ";
  document.querySelector(".modal-card h2").textContent="Добавить задание";
  document.querySelector("#taskForm .primary").textContent="Добавить задание";
}
$("addBtn").onclick=()=>{closeModal();modal.classList.remove("hidden");$("deadline").value=todayISO()};
$("closeModal").onclick=closeModal;
$("modal").onclick=e=>{if(e.target.classList.contains("modal-backdrop"))closeModal()};
document.addEventListener("click",e=>{if(!e.target.closest(".more")&&!e.target.closest("#menu"))menu.classList.add("hidden")});
document.querySelectorAll(".filter").forEach(b=>b.onclick=()=>{document.querySelectorAll(".filter").forEach(x=>x.classList.remove("active"));b.classList.add("active");filter=b.dataset.filter;render()});
$("sortSelect").onchange=e=>{sort=e.target.value;render()};

let signup=false;
$("toggleAuth").onclick=()=>{signup=!signup;$("authTitle").textContent=signup?"Регистрация":"Войти";$("authSubmit").textContent=signup?"Создать аккаунт":"Войти";$("toggleAuth").textContent=signup?"Уже есть аккаунт? Войти":"Нет аккаунта? Зарегистрироваться";};
$("authForm").onsubmit=async e=>{
  e.preventDefault(); $("authMessage").textContent="";
  const email=$("email").value,password=$("password").value;
  const r=signup?await supabaseClient.auth.signUp({email,password}):await supabaseClient.auth.signInWithPassword({email,password});
  if(r.error){$("authMessage").textContent=r.error.message;return}
  if(signup && !r.data.session){$("authMessage").style.color="#59605a";$("authMessage").textContent="Проверь почту для подтверждения аккаунта.";}
};
$("logoutBtn").onclick=()=>supabaseClient.auth.signOut();

async function updateUI(session){
  const logged=!!session;
  authView.classList.toggle("hidden",logged); tasksView.classList.toggle("hidden",!logged);
  addBtn.classList.toggle("hidden",!logged); logoutBtn.classList.toggle("hidden",!logged);
  if(logged) await loadTasks();
}
supabaseClient.auth.onAuthStateChange((_event,session)=>updateUI(session));
supabaseClient.auth.getSession().then(({data})=>updateUI(data.session));
