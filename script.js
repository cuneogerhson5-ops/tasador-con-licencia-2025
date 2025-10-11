console.log("Script cargando...");

// ========== CONFIGURACIÓN BACKEND ==========
const BASE_URL = "https://script.google.com/macros/s/AKfycby9r3ikkEE9PrCBAwueyUph6Xp5-afiifEhKe6dvmc0wP38n5jUwRM8yecDbNg7KyhSMw/exec";
const TARIFF_URL = `${BASE_URL}?action=tariffs`;
const VALIDATE_URL = `${BASE_URL}?action=validate`;
const ISSUE_URL = `${BASE_URL}?action=issue`;

// ========== ESTADO ==========
let TARIFAS = [];

// ========== TODAS LAS FUNCIONES PRIMERO ==========
const $ = (id) => document.getElementById(id);
const unique = (arr) => Array.from(new Set(arr));
const norm = (s) => String(s??"").trim().toLowerCase();

function setStatus(id, msg, ok=false){ 
  const el=$(id); 
  if(el) {
    el.textContent=msg||""; 
    el.classList.remove("error","ok"); 
    if(msg) el.classList.add(ok?"ok":"error");
  }
}

function buscarVM2(d,s){
  console.log("buscarVM2 llamada:", d, s);
  const dKey = norm(d), sKey = norm(s);
  const it = TARIFAS.find(t=> norm(t.distrito)===dKey && norm(t.subzona)===sKey);
  console.log("Encontrado:", it);
  return it ? Number(it.valorM2) : NaN;
}

function poblarDistritos(selectId){
  console.log("poblarDistritos:", selectId);
  const sel=$(selectId);
  if(!sel) return;
  
  sel.innerHTML=`<option value="">— Selecciona —</option>`;
  const distritos = unique(TARIFAS.map(t=>String(t.distrito||"").trim())).filter(Boolean).sort();
  console.log("Distritos encontrados:", distritos);
  distritos.forEach(d=> sel.insertAdjacentHTML("beforeend", `<option value="${d}">${d}</option>`));
}

function poblarSubzonas(distrito, selectId){
  console.log("poblarSubzonas:", distrito, selectId);
  const sel=$(selectId);
  if(!sel) return;
  
  sel.innerHTML=`<option value="">— Selecciona —</option>`;
  const dKey = norm(distrito);
  const subzonas = unique(
    TARIFAS
      .filter(t=> norm(t.distrito)===dKey)
      .map(t=> String(t.subzona||"").trim())
  ).filter(Boolean).sort();
  console.log("Subzonas encontradas:", subzonas);
  subzonas.forEach(s=> sel.insertAdjacentHTML("beforeend", `<option value="${s}">${s}</option>`));
  sel.disabled = sel.options.length<=1;
}

function factorDepto({piso, ascensor, condicion, dormitorios, antiguedad}){
  let f=1;
  
  if (piso<=2 && norm(ascensor)==="si") f *= 1.01;
  if (piso>4 && norm(ascensor)==="no") f *= 0.96;
  
  const c = norm(condicion);
  if (c==="a estrenar") f*=1.06;
  else if (c==="bueno") f*=1.02;
  else if (c==="regular") f*=0.98;
  else if (c==="para remodelar") f*=0.94;
  
  if (dormitorios>=4) f*=1.02;
  else if (dormitorios===1) f*=0.98;
  
  if (antiguedad>=20 && antiguedad<40) f*=0.97;
  else if (antiguedad>=40) f*=0.93;
  
  return f;
}

// ========== API ==========
async function apiTariffs(){ 
  console.log("Llamando API tarifas...");
  const r = await fetch(TARIFF_URL); 
  if(!r.ok) throw new Error(`HTTP ${r.status}`); 
  const data = await r.json();
  console.log("Tarifas recibidas:", data);
  return data;
}

async function apiValidate(email, license){ 
  const r = await fetch(`${VALIDATE_URL}&email=${encodeURIComponent(email)}&license=${encodeURIComponent(license)}`); 
  if(!r.ok) throw new Error(`HTTP ${r.status}`); 
  return r.json(); 
}

async function apiIssue(payload){
  const r = await fetch(ISSUE_URL, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify(payload)
  });
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

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

// ========== EVENTOS ==========
document.addEventListener("DOMContentLoaded", ()=>{
  console.log("DOM cargado!");
  
  // VALIDACIÓN
  $("license-form").addEventListener("submit", async (ev)=>{
    console.log("Validando licencia...");
    ev.preventDefault();
    const email = $("email").value.trim().toLowerCase();
    const license = $("licenseId").value.trim();
    setStatus("license-status","Validando...");
    
    try{
      const v = await apiValidate(email, license);
      console.log("Resultado validación:", v);
      
      if(v.valid){
        setStatus("license-status", `Licencia válida. Vence: ${v.expiresAt}`, true);
        document.getElementById("app-section").classList.remove("hidden");
        
        if(TARIFAS.length===0){
          console.log("Cargando tarifas...");
          TARIFAS = await apiTariffs();
          console.log("TARIFAS cargadas, total:", TARIFAS.length);
          
          poblarDistritos("depto-distrito");
          poblarDistritos("casa-distrito");
          poblarDistritos("terreno-distrito");
          
          $("depto-distrito").addEventListener("change", e=>{
            console.log("Distrito depto cambió:", e.target.value);
            poblarSubzonas(e.target.value,"depto-subzona");
          });
        }
      }else{
        setStatus("license-status", v.error || "Licencia inválida");
      }
    }catch(err){
      console.error("Error:", err);
      setStatus("license-status", `Fallo: ${err.message}`);
    }
  });

  // DEPARTAMENTO
  $("form-depto").addEventListener("submit", (ev)=>{
    console.log("=== CALCULANDO DEPARTAMENTO ===");
    ev.preventDefault();
    
    const d = $("depto-distrito").value;
    const s = $("depto-subzona").value;
    const piso = Number($("depto-piso").value||0);
    const ascensor = $("depto-ascensor").value;
    const condicion = $("depto-condicion").value;
    const dormitorios = Number($("depto-dormitorios").value||0);
    const antiguedad = Number($("depto-antiguedad").value||0);
    const at = Number($("depto-area-techada").value||0);
    const al = Number($("depto-area-libre").value||0);
    
    console.log("Datos form:", {d, s, piso, ascensor, condicion, dormitorios, antiguedad, at, al});
    
    const vm2 = buscarVM2(d, s);
    console.log("VM2 obtenido:", vm2);
    
    const out = $("depto-result");
    
    if(!d || !s || !isFinite(vm2)) {
      console.log("Error: datos incompletos");
      out.textContent = "Selecciona distrito/subzona válidos";
      return;
    }
    
    const areaPonderada = at + (0.5 * al);
    const f = factorDepto({piso, ascensor, condicion, dormitorios, antiguedad});
    const medio = areaPonderada * vm2 * f;
    const minimo = medio * 0.95;
    const alto = medio * 1.05;
    
    console.log("Cálculos:", {areaPonderada, f, medio, minimo, alto});
    
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
    
    console.log("¡Resultado mostrado!");
  });

  // COMPRA
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
});

// Exponer función global
if (typeof window !== "undefined") { 
  window.emitirLicencia = emitirLicencia;
}

console.log("Script completamente cargado");




