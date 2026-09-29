// Supabase configuration
const SUPABASE_URL = "https://eglfntdtoomsxebyvkno.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_CfQwt-VgMKhMAgFidOkxvA_G0IY0omQ";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ATTACHMENT_BUCKET = "task-attachments";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per file
const ALLOWED_EXTENSIONS = new Set([
  "jpg","jpeg","png","gif","webp","heic",
  "pdf","doc","docx","odt","txt","rtf",
  "xls","xlsx","ods","csv",
  "ppt","pptx","odp",
  "zip","rar","7z"
]);

const $ = (selector, root=document) => selector.startsWith("#") || selector.startsWith(".") ? root.querySelector(selector) : root.getElementById(selector);
let tasks = [];
let filter = "all";
let sort = "deadline";
let editingId = null;
let menuTaskId = null;
let editingAttachments = [];

const authView = $("authView"), tasksView = $("tasksView"), addBtn = $("addBtn"), logoutBtn = $("logoutBtn");
const modal = $("modal"), menu = $("menu");

function fmtDate(date) {
  return new Intl.DateTimeFormat("ru-RU", {day:"numeric", month:"long"}).format(new Date(date + "T00:00:00"));
}
function todayISO(){ return new Date().toISOString().slice(0,10); }
function escapeHtml(s){return String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function formatBytes(bytes){
  if(bytes < 1024) return `${bytes} Б`;
  if(bytes < 1024*1024) return `${Math.round(bytes/1024)} КБ`;
  return `${(bytes/(1024*1024)).toFixed(1)} МБ`;
}
function fileIcon(name){
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if(["jpg","jpeg","png","gif","webp","heic"].includes(ext)) return "🖼️";
  if(ext === "pdf") return "📕";
  if(["doc","docx","odt","txt","rtf"].includes(ext)) return "📄";
  if(["xls","xlsx","ods","csv"].includes(ext)) return "📊";
  if(["ppt","pptx","odp"].includes(ext)) return "📽️";
  return "📦";
}

function render() {
  let visible = tasks.filter(t => filter === "all" ? true : filter === "active" ? !t.done : t.done);
  visible.sort((a,b) => sort==="deadline" ? a.deadline.localeCompare(b.deadline) : sort==="subject" ? a.subject.localeCompare(b.subject,"ru") : new Date(b.created_at)-new Date(a.created_at));
  $("taskList").innerHTML = visible.map(t => {
    const overdue = !t.done && t.deadline < todayISO();
    const today = !t.done && t.deadline === todayISO();
    const attachments = t.attachments || [];
    return `<article class="task ${t.done?"done":""}">
      <div>
        <div class="subject">${escapeHtml(t.subject)}</div>
        <div class="comment">${escapeHtml(t.comment)}</div>
        ${attachments.length ? `<div class="attachments">${attachments.map(a => `
          <button class="attachment" title="Открыть ${escapeHtml(a.name)}" onclick="openAttachment('${a.id}')">
            <span>${fileIcon(a.name)}</span><span class="attachment-name">${escapeHtml(a.name)}</span><span class="attachment-size">${formatBytes(a.size)}</span>
          </button>`).join("")}</div>` : ""}
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

async function loadTasks(){
  const {data,error}=await supabaseClient.from("tasks").select("*, task_attachments(*)").order("deadline",{ascending:true});
  if(error){
    // Backwards-compatible fallback if the attachment migration has not been run yet.
    const fallback = await supabaseClient.from("tasks").select("*").order("deadline",{ascending:true});
    if(fallback.error){console.error(error); return alert(error.message);}
    tasks=(fallback.data||[]).map(t=>({...t,attachments:[]}));
  } else {
    tasks=(data||[]).map(t=>({...t,attachments:t.task_attachments||[]}));
  }
  render();
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

async function deleteAttachmentRecord(attachment){
  const {error}=await supabaseClient.storage.from(ATTACHMENT_BUCKET).remove([attachment.storage_path]);
  if(error) console.warn("Не удалось удалить файл из Storage:", error.message);
  await supabaseClient.from("task_attachments").delete().eq("id",attachment.id);
}

$("deleteAction").onclick=async()=>{
  if(!menuTaskId)return;
  if(!confirm("Удалить это задание и прикреплённые файлы?"))return;
  const task=tasks.find(t=>t.id===menuTaskId);
  if(task?.attachments?.length){
    const paths=task.attachments.map(a=>a.storage_path);
    const storageResult=await supabaseClient.storage.from(ATTACHMENT_BUCKET).remove(paths);
    if(storageResult.error) console.warn("Не удалось удалить часть файлов:", storageResult.error.message);
  }
  const {error}=await supabaseClient.from("tasks").delete().eq("id",menuTaskId);
  if(error)return alert(error.message);
  tasks=tasks.filter(t=>t.id!==menuTaskId); menu.classList.add("hidden"); render();
};

$("editAction").onclick=()=>{
  const t=tasks.find(x=>x.id===menuTaskId); if(!t)return;
  editingId=t.id;
  editingAttachments=[...(t.attachments||[])];
  $("subject").value=t.subject; $("deadline").value=t.deadline; $("comment").value=t.comment;
  renderSelectedAttachments();
  modal.classList.remove("hidden"); menu.classList.add("hidden");
  document.querySelector(".modal-card .eyebrow").textContent="РЕДАКТИРОВАНИЕ";
  document.querySelector(".modal-card h2").textContent="Изменить задание";
  document.querySelector("#taskForm .primary").textContent="Сохранить";
};

function renderSelectedAttachments(){
  const list=$("attachmentList");
  list.innerHTML=editingAttachments.length ? editingAttachments.map(a=>`
    <div class="selected-attachment">
      <span>${fileIcon(a.name)}</span>
      <span class="attachment-name">${escapeHtml(a.name)}</span>
      <span class="attachment-size">${formatBytes(a.size)}</span>
      <button type="button" title="Удалить вложение" onclick="removeSelectedAttachment('${a.id}')">×</button>
    </div>`).join("") : `<span class="attachment-empty">Файлы не выбраны</span>`;
}
window.removeSelectedAttachment=async(id)=>{
  const a=editingAttachments.find(x=>x.id===id);
  if(!a)return;
  await deleteAttachmentRecord(a);
  editingAttachments=editingAttachments.filter(x=>x.id!==id);
  const t=tasks.find(x=>x.id===editingId);
  if(t)t.attachments=editingAttachments;
  renderSelectedAttachments();
  render();
};

$("files").onchange=()=>{
  const files=[...$("files").files];
  const invalid=files.filter(f=>f.size>MAX_FILE_SIZE || !ALLOWED_EXTENSIONS.has(f.name.split(".").pop()?.toLowerCase()||""));
  if(invalid.length){
    alert("Некоторые файлы не подходят. Разрешены документы, таблицы, презентации, изображения и архивы до 10 МБ каждый.");
    $("files").value="";
    return;
  }
  $("selectedFiles").textContent=files.length ? `Будет добавлено: ${files.map(f=>f.name).join(", ")}` : "";
};

async function uploadAttachments(taskId, files, userId){
  const created=[];
  for(const file of files){
    const safeName=file.name.replace(/[^a-zA-Z0-9._-]+/g,"_");
    const path=`${userId}/${taskId}/${crypto.randomUUID()}-${safeName}`;
    const upload=await supabaseClient.storage.from(ATTACHMENT_BUCKET).upload(path,file,{upsert:false,contentType:file.type||"application/octet-stream"});
    if(upload.error){
      for(const item of created){
        await supabaseClient.storage.from(ATTACHMENT_BUCKET).remove([item.storage_path]);
        await supabaseClient.from("task_attachments").delete().eq("id",item.id);
      }
      throw new Error(`Не удалось загрузить «${file.name}»: ${upload.error.message}`);
    }
    const record=await supabaseClient.from("task_attachments").insert({
      task_id:taskId,user_id:userId,name:file.name,size:file.size,mime_type:file.type||"application/octet-stream",storage_path:path
    }).select().single();
    if(record.error){
      await supabaseClient.storage.from(ATTACHMENT_BUCKET).remove([path]);
      throw new Error(`Файл «${file.name}» загрузился, но не удалось сохранить его запись: ${record.error.message}`);
    }
    created.push(record.data);
  }
  return created;
}

window.openAttachment=async(id)=>{
  const task=tasks.find(t=>(t.attachments||[]).some(a=>a.id===id));
  const attachment=task?.attachments?.find(a=>a.id===id);
  if(!attachment)return;
  const {data,error}=await supabaseClient.storage.from(ATTACHMENT_BUCKET).createSignedUrl(attachment.storage_path,300);
  if(error)return alert(`Не удалось открыть файл: ${error.message}`);
  window.open(data.signedUrl,"_blank","noopener,noreferrer");
};

$("taskForm").onsubmit=async e=>{
  e.preventDefault();
  const submit=$(".primary", $("taskForm"));
  submit.disabled=true;
  const payload={subject:$("subject").value.trim(),deadline:$("deadline").value,comment:$("comment").value.trim()};
  const files=[...$("files").files];
  try{
    let result;
    if(editingId) result=await supabaseClient.from("tasks").update(payload).eq("id",editingId).select().single();
    else result=await supabaseClient.from("tasks").insert(payload).select().single();
    if(result.error)throw new Error(result.error.message);

    const {data:{user}}=await supabaseClient.auth.getUser();
    if(files.length){
      try {
        const uploaded=await uploadAttachments(result.data.id,files,user.id);
        result.data.attachments=[...(editingId ? editingAttachments : []),...uploaded];
      } catch(uploadError) {
        if(!editingId) await supabaseClient.from("tasks").delete().eq("id",result.data.id);
        throw uploadError;
      }
    } else {
      result.data.attachments=editingId ? editingAttachments : [];
    }

    if(editingId){
      const i=tasks.findIndex(t=>t.id===editingId); tasks[i]=result.data;
    } else tasks.push(result.data);
    closeModal(); render();
  }catch(err){
    alert(err.message);
  }finally{
    submit.disabled=false;
  }
};

function closeModal(){
  modal.classList.add("hidden"); $("taskForm").reset(); editingId=null; editingAttachments=[];
  $("selectedFiles").textContent="";
  renderSelectedAttachments();
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
