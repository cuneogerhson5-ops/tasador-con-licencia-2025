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
function buscarVM2(d,s){
  const dKey = norm(d), sKey = norm(s);
  const it = TARIFAS.find(t=> norm(t.distrito)===dKey && norm(t.subzona)===sKey);
  return it? Number(it.valorM2): NaN;
}

// ========== FACTORES DE TASACIÓN (basados en el ejemplo) ==========
function factorDepto({piso, ascensor, condicion, dormitorios, antiguedad}){
  let f=1;
  // Piso y ascensor (exactos del ejemplo)
  if (piso<=2 && norm(ascensor)==="si") f *= 1.01; // +1% piso bajo con ascensor
  if (piso>4 && norm(ascensor)==="no") f *= 0.96; // -4% piso alto sin ascensor
  
  // Condición (exactos del ejemplo)
  const c = norm(condicion);
  if (c==="a estrenar") f*=1.06;     // +6%
  else if (c==="bueno") f*=1.02;     // +2%
  else if (c==="regular") f*=0.98;   // -2% (como en el ejemplo)
  else if (c==="para remodelar") f*=0.94; // -6%
  
  // Dormitorios (exactos del ejemplo)
  if (dormitorios>=4) f*=1.02;       // +2%
  else if (dormitorios===1) f*=0.98; // -2%
  // 2-3 dormitorios = neutro (factor 1.0)
  
  // Antigüedad (exactos del ejemplo)
  if (antiguedad>=20 && antiguedad<40) f*=0.97; // -3%
  else if (antiguedad>=40) f*=0.93;             // -7%
  // <20 años = neutro (como 15 años en el ejemplo)
  
  return f;
}

function factorCasa({condicion, dormitorios, antiguedad}){
  let f=1;
  // Condición (igual que departamento)
  const c = norm(condicion);
  if (c==="a estrenar") f*=1.06;
  else if (c==="bueno") f*=1.02;
  else if (c==="regular") f*=0.98;
  else if (c==="para remodelar") f*=0.94;
  
  // Dormitorios (para casas, umbral en 5+)
  if (dormitorios>=5) f*=1.02;
  else if (dormitorios===1) f*=0.98;
  
  // Antigüedad (igual que departamento)
  if (antiguedad>=20 && antiguedad<40) f*=0.97;
  else if (antiguedad>=40) f*=0.93;
  
  return f;
}

// ========== RANGOS MIN/MEDIO/ALTO (exactos del ejemplo) ==========
function calcularRango({medio, piso, ascensor, condicion}){
  let low = 0.95, high = 1.05; // ±5% estándar
  
  // Ajustes contextuales (exactos del ejemplo)
  const sinAscensorPisoAlto = (piso>4 && norm(ascensor)==="no");
  if (sinAscensorPisoAlto) low = 0.94; // -6% si piso alto sin ascensor
  
  if (norm(condicion)==="a estrenar") high = 1.06; // +6% si a estrenar
  
  return {
    minimo: medio * low,
    alto: medio * high
  };
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
    
    // ÁREA PONDERADA: área libre al 50% (exacto del ejemplo)
    const areaPonderada = at + (0.5 * al);
    const f = factorDepto({piso, ascensor, condicion, dormitorios, antiguedad});
    const medio = areaPonderada * vm2 * f;
    const {minimo, alto} = calcularRango({medio, piso, ascensor, condicion});
    
    out.innerHTML = `
      <div class="grid">
        <div class="pill"><h4>Área ponderada</h4><div>${areaPonderada.toFixed(1)} m²</div></div>
        <div class="pill"><h4>Valor m²</h4><div>S/${vm2.toLocaleString()}</div></div>
        <div class="pill"><h4>Ajuste</h4><div>x ${f.toFixed(3)}</div></div>
      </div>
      <div class="grid" style="margin-top:8px">
        <div class="pill"><h4>Valor mínimo</h4><div>S/${Math.round(minimo).toLocaleString()}</div></div>
        <div class="pill"><h4>Valor medio</h4><div>S/${Math.round(medio).toLocaleString()}</div></div>
        <div class="pill"><h4>Valor alto</h4><div>S/${Math.round(alto).toLocaleString()}</div></div>
      </div>
    `;
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
    
    // ÁREA PONDERADA: área libre al 50%
    const areaPonderada = at + (0.5 * al);
    const f = factorCasa({condicion, dormitorios, antiguedad});
    const medio = areaPonderada * vm2 * f;
    const {minimo, alto} = calcularRango({medio, piso: 1, ascensor: "si", condicion});
    
    out.innerHTML = `
      <div class="grid">
        <div class="pill"><h4>Área ponderada</h4><div>${areaPonderada.toFixed(1)} m²</div></div>
        <div class="pill"><h4>Valor m²</h4><div>S/${vm2.toLocaleString()}</div></div>
        <div class="pill"><h4>Ajuste</h4><div>x ${f.toFixed(3)}</div></div>
      </div>
      <div class="grid" style="margin-top:8px">
        <div class="pill"><h4>Valor mínimo</h4><div>S/${Math.round(minimo).toLocaleString()}</div></div>
        <div class="pill"><h4>Valor medio</h4><div>S/${Math.round(medio).toLocaleString()}</div></div>
        <div class="pill"><h4>Valor alto</h4><div>S/${Math.round(alto).toLocaleString()}</div></div>
      </div>
    `;
  });

  $("form-terreno").addEventListener("submit", (ev)=>{
    ev.preventDefault();
    const d=$("terreno-distrito").value, s=$("terreno-subzona").value;
    const area=Number($("terreno-area").value||0), vm2=buscarVM2(d,s), out=$("terreno-result");
    if(!d||!s||!isFinite(vm2)) return out.textContent="Selecciona distrito/subzona válidos";
    
    const medio = area * vm2;
    const minimo = medio * 0.97; // ±3% para terrenos
    const alto = medio * 1.03;
    
    out.innerHTML = `
      <div class="grid">
        <div class="pill"><h4>Área</h4><div>${area.toFixed(1)} m²</div></div>
        <div class="pill"><h4>Valor m²</h4><div>S/${vm2.toLocaleString()}</div></div>
        <div class="pill"><h4>Ajuste</h4><div>x 1.000</div></div>
      </div>
      <div class="grid" style="margin-top:8px">
        <div class="pill"><h4>Valor mínimo</h4><div>S/${Math.round(minimo).toLocaleString()}</div></div>
        <div class="pill"><h4>Valor medio</h4><div>S/${Math.round(medio).toLocaleString()}</div></div>
        <div class="pill"><h4>Valor alto</h4><div>S/${Math.round(alto).toLocaleString()}</div></div>
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
    voucherUrl: "OP-123456",
    notes: "Emisión prueba S/100"
  };
  return apiIssue(payload);
}
if (typeof window !== "undefined") { window.emitirLicencia = emitirLicencia; }
