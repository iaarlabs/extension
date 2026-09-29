const $ = id => document.getElementById(id);
let config = {};
let currentPlan = null;

async function load() {
  config = await chrome.storage.local.get(["githubToken","owner","repo","branch","geminiKey"]);
  $("githubToken").value = config.githubToken || "";
  $("owner").value = config.owner || "";
  $("repo").value = config.repo || "";
  $("branch").value = config.branch || "main";
  $("geminiKey").value = config.geminiKey || "";
  refreshUI();
}

function refreshUI() {
  const ready = config.githubToken && config.owner && config.repo && config.geminiKey;
  $("setupCard").classList.toggle("hidden", !!ready);
  $("projectCard").classList.toggle("hidden", !ready);
  $("projectName").textContent = ready ? `${config.owner}/${config.repo}:${config.branch || "main"}` : "Sin configurar";
  $("status").textContent = ready ? "Listo para analizar cambios." : "Configura el proyecto para empezar.";
}

$("settingsBtn").onclick = () => $("setupCard").classList.toggle("hidden");
$("editSettings").onclick = () => $("setupCard").classList.remove("hidden");

$("saveSettings").onclick = async () => {
  config = {
    githubToken: $("githubToken").value.trim(),
    owner: $("owner").value.trim(),
    repo: $("repo").value.trim(),
    branch: $("branch").value.trim() || "main",
    geminiKey: $("geminiKey").value.trim()
  };
  await chrome.storage.local.set(config);
  refreshUI();
};

async function github(path, options={}) {
  const r = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      "Accept":"application/vnd.github+json",
      "Authorization":`Bearer ${config.githubToken}`,
      "X-GitHub-Api-Version":"2022-11-28",
      ...(options.headers || {})
    }
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${await r.text()}`);
  return r.json();
}

async function getRepoFiles() {
  const tree = await github(`/repos/${config.owner}/${config.repo}/git/trees/${encodeURIComponent(config.branch)}?recursive=1`);
  if (tree.truncated) throw new Error("El repositorio es demasiado grande para este MVP.");
  const allowed = /\.(tsx?|jsx?|css|scss|html|json|md|vue)$/i;
  const candidates = tree.tree.filter(x => x.type === "blob" && allowed.test(x.path) && !/(node_modules|dist|build|\.lock$)/.test(x.path));
  const selected = candidates.slice(0, 80);
  const result = [];
  for (const f of selected) {
    const data = await github(`/repos/${config.owner}/${config.repo}/contents/${f.path}?ref=${encodeURIComponent(config.branch)}`);
    if (data.size > 120000) continue;
    const content = decodeURIComponent(escape(atob(data.content.replace(/\\n/g,""))));
    result.push({path:f.path, sha:data.sha, content});
  }
  return result;
}

async function gemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(config.geminiKey)}`;
  const body = {
    contents:[{parts:[{text:prompt}]}],
    generationConfig:{responseMimeType:"application/json", temperature:0.15}
  };
  const r = await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);
  const j=await r.json();
  return JSON.parse(j.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
}

$("analyze").onclick = async () => {
  try {
    const instruction = $("instruction").value.trim();
    if (!instruction) throw new Error("Escribe primero qué quieres cambiar.");
    $("status").textContent = "Leyendo el proyecto…";
    $("analyze").disabled = true;
    const files = await getRepoFiles();
    const compact = files.map(f => `\\n--- ${f.path} ---\\n${f.content}`).join("");
    const prompt = `Eres un ingeniero senior modificando un proyecto web. El usuario pide:
${instruction}

Devuelve SOLO JSON válido con esta forma:
{
  "summary":"resumen breve",
  "changes":[{"path":"ruta/exacta","description":"qué se cambia","content":"CONTENIDO COMPLETO DEL ARCHIVO"}],
  "warnings":["advertencias"]
}

Reglas:
- Solo modifica archivos necesarios.
- Conserva funcionalidades existentes.
- No inventes dependencias si no son necesarias.
- Devuelve el archivo COMPLETO en content.
- Si no puedes aplicar un cambio con seguridad, no lo inventes y añade warning.
- No cambies package-lock ni archivos generados.
- El proyecto actual es:
${compact}`;
    currentPlan = await gemini(prompt);
    renderPlan(currentPlan);
    $("apply").disabled = !currentPlan?.changes?.length;
    $("status").textContent = `${currentPlan.changes?.length || 0} archivo(s) preparado(s).`;
  } catch(e) {
    showError(e);
  } finally {
    $("analyze").disabled = false;
  }
};

function renderPlan(plan){
  $("planCard").classList.remove("hidden");
  $("plan").innerHTML = "";
  (plan.changes || []).forEach(c=>{
    const d=document.createElement("div");
    d.className="planItem";
    d.innerHTML=`<div class="file">${escapeHtml(c.path)}</div><div class="desc">${escapeHtml(c.description)}</div>`;
    $("plan").appendChild(d);
  });
  if(plan.warnings?.length){
    const w=document.createElement("div"); w.className="desc error";
    w.textContent="Avisos: "+plan.warnings.join(" · ");
    $("plan").appendChild(w);
  }
}

$("apply").onclick = async () => {
  if(!currentPlan?.changes?.length) return;
  if(!confirm("Esto creará un commit en GitHub. Si el proyecto está sincronizado con Lovable, Lovable podrá recibir esos cambios. ¿Continuar?")) return;
  try{
    $("apply").disabled=true;
    $("status").textContent="Aplicando cambios…";
    const ref = await github(`/repos/${config.owner}/${config.repo}/git/ref/heads/${encodeURIComponent(config.branch)}`);
    const parentSha = ref.object.sha;
    const parentCommit = await github(`/repos/${config.owner}/${config.repo}/git/commits/${parentSha}`);
    const baseTree = parentCommit.tree.sha;

    const treeItems=[];
    for(const change of currentPlan.changes){
      const blob=await github(`/repos/${config.owner}/${config.repo}/git/blobs`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({content:change.content,encoding:"utf-8"})
      });
      treeItems.push({path:change.path,mode:"100644",type:"blob",sha:blob.sha});
    }
    const tree=await github(`/repos/${config.owner}/${config.repo}/git/trees`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({base_tree:baseTree,tree:treeItems})
    });
    const commit=await github(`/repos/${config.owner}/${config.repo}/git/commits`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        message:"Lovable Control: "+($("instruction").value.trim().slice(0,72)),
        tree:tree.sha,
        parents:[parentSha]
      })
    });
    await github(`/repos/${config.owner}/${config.repo}/git/refs/heads/${encodeURIComponent(config.branch)}`,{
      method:"PATCH",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({sha:commit.sha,force:false})
    });
    $("status").textContent="Cambios aplicados correctamente.";
    $("logCard").classList.remove("hidden");
    $("log").textContent=`Commit: ${commit.sha}\\n\\n${currentPlan.summary || "Cambios aplicados."}\\n\\nAhora comprueba el proyecto en Lovable.`;
  }catch(e){showError(e); $("apply").disabled=false;}
};

function showError(e){
  $("status").textContent="Error";
  $("logCard").classList.remove("hidden");
  $("log").innerHTML=`<span class="error">${escapeHtml(e.message || String(e))}</span>`;
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
load();