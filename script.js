// ========== CONFIGURACIÓN BACKEND ==========
const BASE_URL = "https://script.google.com/macros/s/AKfycby9r3ikkEE9PrCBAwueyUph6Xp5-afiifEhKe6dvmc0wP38n5jUwRM8yecDbNg7KyhSMw/exec";
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
const norm = (s)=>String(s??"").trim().toLowerCase();
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
  const distritos = unique(TARIFAS.map(t=>String(t.distrito||"").trim())).filter(Boolean).sort();
  distritos.forEach(d=> sel.insertAdjacentHTML("beforeend", `<option value="${d}">${d}</option>`));
}
function poblarSubzonas(distrito, selectId){
  const sel=$(selectId);
  sel.innerHTML=`<option value="">— Selecciona —</option>`;
  const dKey = norm(distrito);
  const subzonas = unique(
    TARIFAS
      .filter(t=> norm(t.distrito)===dKey)
      .map(t=> String(t.subzona||"").trim())
  ).filter(Boolean).sort();
  subzonas.forEach(s=> sel.insertAdjacentHTML("beforeend", `<option value="${s}">${s}</option>`));
  sel.disabled = sel.options.length<=1;
}

// ========== FACTORES DE TASACIÓN ==========
function factorDepto({piso, ascensor, condicion, dormitorios, antiguedad}){
  let f=1;
  // Piso y ascensor
  if (piso>4 && norm(ascensor)==="no") f *= 0.96;
  if (piso<=2 && norm(ascensor)==="si") f *= 1.01; // ligera prima bajos con ascensor
  // Condición
  const c = norm(condicion);
  if (c==="a estrenar") f*=1.06;
  else if (c==="bueno") f*=1.02;
  else if (c==="regular") f*=0.98;
  else if (c==="para remodelar") f*=0.94;
  // Dormitorios
  if (dormitorios>=4) f*=1.02;
  else if (dormitorios===1) f*=0.98;
  // Antigüedad
  if (antiguedad>=20 && antiguedad<40) f*=0.97;
  else if (antiguedad>=40) f*=0.93;
  return f;
}
function factorCasa({condicion, dormitorios, antiguedad}){
  let f=1;
  const c = norm(condicion);
  if (c==="a estrenar") f*=1.06;
  else if (c==="bueno") f*=1.02;
  else if (c==="regular") f*=0.98;
  else if (c==="para remodelar") f*=0.94;
  if (dormitorios>=5) f*=1.02;
  if (antiguedad>=20 && antiguedad<40) f*=0.97;
  else if (antiguedad>=40) f*=0.93;
  return f;
}

// ========== RANGOS MIN/MEDIO/ALTO ==========
function rangoDesdeContexto({f, condicion, piso, ascensor}){
  let low = 0.95, high = 1.05;
  const sinAscensorPisoAlto = (piso>4 && norm(ascensor)==="no");
  if (sinAscensorPisoAlto) low -= 0.01; // 0.94
  if (norm(condicion)==="a estrenar") high += 0.01; // 1.06
  return { low, high };
}
function renderTresValores({outEl, total, vm2, f, condicion, piso, ascensor, etiqueta="Valor"}){
  const medio = total * vm2 * f;
  const { low, high } = rangoDesdeContexto({ f, condicion, piso, ascensor });
  const minimo = medio * low;
  const maximo = medio * high;
  outEl.innerHTML = `
    <div class="grid">
      <div class="pill"><h4>Área</h4><div>${total.toFixed(2)} m²</div></div>
      <div class="pill"><h4>Valor m²</h4><div>${vm2.toLocaleString()}</div></div>
      <div class="pill"><h4>Ajuste</h4><div>x ${f.toFixed(3)}</div></div>
    </div>
    <div class="grid" style="margin-top:8px">
      <div class="pill"><h4>${etiqueta} mínimo</h4><div>${minimo.toLocaleString()}</div></div>
      <div class="pill"><h4>${etiqueta} medio</h4><div>${medio.toLocaleString()}</div></div>
      <div class="pill"><h4>${etiqueta} alto</h4><div>${maximo.toLocaleString()}</div></div>
    </div>
  `;
}

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
      // cambiamos a número de operación; el backend hoy espera 'voucherUrl'.
      // Para no romper, mandamos en 'voucherUrl' el número de operación.
      voucherUrl: $("operationNumber").value.trim(),
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
    const piso = Number($("depto-piso").value||0);
    const ascensor = $("depto-ascensor").value;
    const condicion = $("depto-condicion").value;
    const dormitorios = Number($("depto-dormitorios").value||0);
    const antiguedad = Number($("depto-antiguedad").value||0);
    const at=Number($("depto-area-techada").value||0), al=Number($("depto-area-libre").value||0);
    const vm2=buscarVM2(d,s), out=$("depto-result");
    if(!d||!s||!isFinite(vm2)) return out.textContent="Selecciona distrito/subzona válidos";
    const total=at+al;
    const f = factorDepto({piso, ascensor, condicion, dormitorios, antiguedad});
    renderTresValores({outEl: out, total, vm2, f, condicion, piso, ascensor, etiqueta:"Valor"});
  });

  $("form-casa").addEventListener("submit", (ev)=>{
    ev.preventDefault();
    const d=$("casa-distrito").value, s=$("casa-subzona").value;
    const condicion = $("casa-condicion").value;
    const dormitorios = Number($("casa-dormitorios").value||0);
    const antiguedad = Number($("casa-antiguedad").value||0);
    const at=Number($("casa-area-techada").value||0), al=Number($("casa-area-libre").value||0);
    const vm2=buscarVM2(d,s), out=$("casa-result");
    if(!d||!s||!isFinite(vm2)) return out.textContent="Selecciona distrito/subzona válidos";
    const total=at+al;
    const f = factorCasa({condicion, dormitorios, antiguedad});
    renderTresValores({outEl: out, total, vm2, f, condicion, piso: 0, ascensor: "si", etiqueta:"Valor"});
  });

  $("form-terreno").addEventListener("submit", (ev)=>{
    ev.preventDefault();
    const d=$("terreno-distrito").value, s=$("terreno-subzona").value;
    const at=Number($("terreno-area").value||0), vm2=buscarVM2(d,s), out=$("terreno-result");
    if(!d||!s||!isFinite(vm2)) return out.textContent="Selecciona distrito/subzona válidos";
    const medio=at*vm2;
    const low=0.97, high=1.03; // terreno con rango más estrecho por menor heterogeneidad física
    const minimo=medio*low, maximo=medio*high;
    out.innerHTML = `
      <div class="grid">
        <div class="pill"><h4>Área</h4><div>${at.toFixed(2)} m²</div></div>
        <div class="pill"><h4>Valor m²</h4><div>${vm2.toLocaleString()}</div></div>
      </div>
      <div class="grid" style="margin-top:8px">
        <div class="pill"><h4>Valor mínimo</h4><div>${minimo.toLocaleString()}</div></div>
        <div class="pill"><h4>Valor medio</h4><div>${medio.toLocaleString()}</div></div>
        <div class="pill"><h4>Valor alto</h4><div>${maximo.toLocaleString()}</div></div>
      </div>
    `;
  });
});

// ========== EMISIÓN DIRECTA (BOTÓN/CONSOLA) ==========
async function emitirLicencia(){
  const payload = {
    buyerName: "Gerhson C.",
    buyerEmail: "gerhson.cueno@gmail.com",
    buyerDocType: "DNI",
    buyerDocId: "00000000",
    payMethod: "Yape/Plin",
    amount: "100",
    // Usamos el mismo campo del backend 'voucherUrl' para enviar número de operación
    voucherUrl: "OP-123456",
    notes: "Emisión prueba S/100"
  };
  return apiIssue(payload);
}
if (typeof window !== "undefined") { window.emitirLicencia = emitirLicencia; }




