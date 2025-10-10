// ========== CONFIGURACIÓN BACKEND ==========
// Reemplaza SOLO esta línea con tu URL /exec exacta (sin action)
const BASE_URL = "https://script.google.com/macros/s/AKfycby9r3ikkEE9PrCBAwueyUph6Xp5-afiifEhKe6dvmc0wP38n5jUwRM8yecDbNg7KyhSMw/exec";
// No edites lo de abajo:
const TARIFF_URL = `${BASE_URL}?action=tariffs`;
const VALIDATE_URL = `${BASE_URL}?action=validate`;
const ISSUE_URL = `${BASE_URL}?action=issue`;

// ========== ESTADO ==========
let TARIFAS = [];

// ========== API ==========
async function apiTariffs(){ const r = await fetch(TARIFF_URL); if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
async function apiValidate(email, license){ const r = await fetch(`${VALIDATE_URL}&email=${encodeURIComponent(email)}&license=${encodeURIComponent(license)}`); if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
async function apiIssue(payload){
  const r = await fetch(ISSUE_URL, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify(payload)
  });
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ========== HELPERS ==========
const $ = (id)=>document.getElementById(id);
const unique = (arr)=>Array.from(new Set(arr));
function setStatus(id, msg, ok=false){ const el=$(id); el.textContent=msg||""; el.classList.remove("error","ok"); if(msg) el.classList.add(ok?"ok":"error"); }

// ========== TABS ==========
document.addEventListener("click",(e)=>{
  const btn=e.target.closest(".tab-btn"); if(!btn) return;
  document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  const tab=btn.dataset.tab;
  document.querySelectorAll(".tab-panel").forEach(p=>p.classList.remove("active"));
  const panel=document.getElementById(`tab-${tab}`); if(panel) panel.classList.add("active");
});

// ========== SELECTS ==========
function poblarDistritos(selectId){
  const sel=$(selectId);
  sel.innerHTML=`<option value="">— Selecciona —</option>`;
  unique(TARIFAS.map(t=>t.distrito)).forEach(d=>{
    sel.insertAdjacentHTML("beforeend", `<option value="${d}">${d}</option>`);
  });
}
function poblarSubzonas(distrito, selectId){
  const sel=$(selectId);
  sel.innerHTML=`<option value="">— Selecciona —</option>`;
  unique(TARIFAS.filter(t=>t.distrito===d).map(t=>t.subzona)).forEach(s=>{
    sel.insertAdjacentHTML("beforeend", `<option value="${s}">${s}</option>`);
  });
  sel.disabled = sel.options.length<=1;
}
function buscarVM2(d,s){ const it=TARIFAS.find(t=>t.distrito===d && t.subzona===s); return it? Number(it.valorM2): NaN; }

// ========== EVENTOS ==========
window.addEventListener("DOMContentLoaded", ()=>{
  $("license-form").addEventListener("submit", async (ev)=>{
    ev.preventDefault();
    const email = $("email").value.trim().toLowerCase();
    const license = $("licenseId").value.trim();
    setStatus("license-status","Validando...");
    try{
      const v = await apiValidate(email, license);
      if(v.valid){
        setStatus("license-status", `Licencia válida. Vence: ${v.expiresAt}`, true);
        document.getElementById("app-section").classList.remove("hidden");
        if(TARIFAS.length===0){
          TARIFAS = await apiTariffs();
          // Departamento
          poblarDistritos("depto-distrito");
          $("depto-distrito").addEventListener("change", e=>poblarSubzonas(e.target.value,"depto-subzona"));
          // Casa
          poblarDistritos("casa-distrito");
          $("casa-distrito").addEventListener("change", e=>poblarSubzonas(e.target.value,"casa-subzona"));
          // Terreno
          poblarDistritos("terreno-distrito");
          $("terreno-distrito").addEventListener("change", e=>poblarSubzonas(e.target.value,"terreno-subzona"));
        }
      }else{
        setStatus("license-status", v.error || "Licencia inválida");
      }
    }catch(err){
      setStatus("license-status", `Fallo: ${err.message}`);
    }
  });

  $("purchase-form").addEventListener("submit", async (ev)=>{
    ev.preventDefault();
    setStatus("purchase-status","Registrando pago y emitiendo...");
    const payload = {
      buyerName: $("buyerName").value.trim(),
      buyerEmail: $("buyerEmail").value.trim().toLowerCase(),
      buyerDocType: $("buyerDocType").value,
      buyerDocId: $("buyerDocId").value.trim(),
      payMethod: $("payMethod").value,
      amount: $("amount").value,
      voucherUrl: $("voucherUrl").value.trim(),
      notes: $("notes").value.trim()
    };
    try{
      const r = await apiIssue(payload);
      if(r.issued){ setStatus("purchase-status", `Licencia: ${r.licenseId}`, true); }
      else{ setStatus("purchase-status", r.error || r.message || "No emitida"); }
    }catch(err){
      setStatus("purchase-status", `Fallo: ${err.message}`);
    }
  });

  $("form-depto").addEventListener("submit", (ev)=>{
    ev.preventDefault();
    const d=$("depto-distrito").value, s=$("depto-subzona").value;
    const at=Number($("depto-area-techada").value||0), al=Number($("depto-area-libre").value||0);
    const vm2=buscarVM2(d,s), out=$("depto-result");
    if(!d||!s||!isFinite(vm2)) return out.textContent="Selecciona distrito/subzona válidos";
    const total=at+al, val=total*vm2;
    out.innerHTML = `<div class="grid">
      <div class="pill"><h4>Área</h4><div>${total.toFixed(2)} m²</div></div>
      <div class="pill"><h4>Valor m²</h4><div>${vm2.toLocaleString()}</div></div>
      <div class="pill"><h4>Valor</h4><div>${val.toLocaleString()}</div></div>
    </div>`;
  });

  $("form-casa").addEventListener("submit", (ev)=>{
    ev.preventDefault();
    const d=$("casa-distrito").value, s=$("casa-subzona").value;
    const at=Number($("casa-area-techada").value||0), al=Number($("casa-area-libre").value||0);
    const vm2=buscarVM2(d,s), out=$("casa-result");
    if(!d||!s||!isFinite(vm2)) return out.textContent="Selecciona distrito/subzona válidos";
    const total=at+al, val=total*vm2;
    out.innerHTML = `<div class="grid">
      <div class="pill"><h4>Área</h4><div>${total.toFixed(2)} m²</div></div>
      <div class="pill"><h4>Valor m²</h4><div>${vm2.toLocaleString()}</div></div>
      <div class="pill"><h4>Valor</h4><div>${val.toLocaleString()}</div></div>
    </div>`;
  });

  $("form-terreno").addEventListener("submit", (ev)=>{
    ev.preventDefault();
    const d=$("terreno-distrito").value, s=$("terreno-subzona").value;
    const at=Number($("terreno-area").value||0), vm2=buscarVM2(d,s), out=$("terreno-result");
    if(!d||!s||!isFinite(vm2)) return out.textContent="Selecciona distrito/subzona válidos";
    const val=at*vm2;
    out.innerHTML = `<div class="grid">
      <div class="pill"><h4>Área</h4><div>${at.toFixed(2)} m²</div></div>
      <div class="pill"><h4>Valor m²</h4><div>${vm2.toLocaleString()}</div></div>
      <div class="pill"><h4>Valor</h4><div>${val.toLocaleString()}</div></div>
    </div>`;
  });
});

// ========== EMISIÓN DIRECTA (BOTÓN/CONSOLA) ==========
// Emisión de prueba S/100 con voucher público
async function emitirLicencia(){
  const payload = {
    buyerName: "Gerhson C.",
    buyerEmail: "gerhson.cueno@gmail.com",
    buyerDocType: "DNI",
    buyerDocId: "00000000",
    payMethod: "Yape/Plin",
    amount: "100",
    voucherUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1200",
    notes: "Emisión prueba S/100"
  };
  return apiIssue(payload);
}

// Exponer al global para usarlo desde un botón o consola
if (typeof window !== "undefined") { window.emitirLicencia = emitirLicencia; }



