console.log("Script cargando...");

// ========== CONFIGURACIÓN BACKEND ==========
const BASE_URL = "https://script.google.com/macros/s/AKfycby9r3ikkEE9PrCBAwueyUph6Xp5-afiifEhKe6dvmc0wP38n5jUwRM8yecDbNg7KyhSMw/exec";
const TARIFF_URL = `${BASE_URL}?action=tariffs`;
const VALIDATE_URL = `${BASE_URL}?action=validate`;
const ISSUE_URL = `${BASE_URL}?action=issue`;

console.log("URLs configuradas");

// ========== ESTADO ==========
let TARIFAS = [];

// ========== API ==========
async function apiTariffs(){ 
  console.log("Llamando apiTariffs...");
  const r = await fetch(TARIFF_URL); 
  if(!r.ok) throw new Error(`HTTP ${r.status}`); 
  const data = r.json();
  console.log("apiTariffs response:", data);
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

// ========== HELPERS ==========
const $ = (id) => {
  console.log("Buscando elemento:", id);
  const el = document.getElementById(id);
  console.log("Elemento encontrado:", el);
  return el;
};

const unique = (arr)=>Array.from(new Set(arr));
const norm = (s)=>String(s??"").trim().toLowerCase();

function setStatus(id, msg, ok=false){ 
  console.log("setStatus:", id, msg, ok);
  const el=$(id); 
  if(el) {
    el.textContent=msg||""; 
    el.classList.remove("error","ok"); 
    if(msg) el.classList.add(ok?"ok":"error");
  }
}

function buscarVM2(d,s){
  console.log("buscarVM2:", d, s);
  const dKey = norm(d), sKey = norm(s);
  console.log("Normalized:", dKey, sKey);
  const it = TARIFAS.find(t=> norm(t.distrito)===dKey && norm(t.subzona)===sKey);
  console.log("Found item:", it);
  return it? Number(it.valorM2): NaN;
}

function poblarDistritos(selectId){
  console.log("poblarDistritos:", selectId);
  const sel=$(selectId);
  if(!sel) return console.error("Select no encontrado:", selectId);
  
  sel.innerHTML=`<option value="">— Selecciona —</option>`;
  const distritos = unique(TARIFAS.map(t=>String(t.distrito||"").trim())).filter(Boolean).sort();
  console.log("Distritos:", distritos);
  distritos.forEach(d=> sel.insertAdjacentHTML("beforeend", `<option value="${d}">${d}</option>`));
}

function poblarSubzonas(distrito, selectId){
  console.log("poblarSubzonas:", distrito, selectId);
  const sel=$(selectId);
  if(!sel) return console.error("Select no encontrado:", selectId);
  
  sel.innerHTML=`<option value="">— Selecciona —</option>`;
  const dKey = norm(distrito);
  const subzonas = unique(
    TARIFAS
      .filter(t=> norm(t.distrito)===dKey)
      .map(t=> String(t.subzona||"").trim())
  ).filter(Boolean).sort();
  console.log("Subzonas for", distrito, ":", subzonas);
  subzonas.forEach(s=> sel.insertAdjacentHTML("beforeend", `<option value="${s}">${s}</option>`));
  sel.disabled = sel.options.length<=1;
}

// ========== FACTORES SIMPLES ==========
function factorDepto({piso, ascensor, condicion, dormitorios, antiguedad}){
  console.log("factorDepto input:", {piso, ascensor, condicion, dormitorios, antiguedad});
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
  
  console.log("factorDepto result:", f);
  return f;
}

console.log("Esperando DOM...");

// ========== EVENTOS ==========
document.addEventListener("DOMContentLoaded", ()=>{
  console.log("DOM loaded!");
  
  // VALIDACIÓN
  const licenseForm = $("license-form");
  if(licenseForm) {
    console.log("License form encontrado, agregando listener");
    licenseForm.addEventListener("submit", async (ev)=>{
      console.log("Submit license form");
      ev.preventDefault();
      const email = $("email").value.trim().toLowerCase();
      const license = $("licenseId").value.trim();
      setStatus("license-status","Validando...");
      try{
        const v = await apiValidate(email, license);
        console.log("Validation result:", v);
        if(v.valid){
          setStatus("license-status", `Licencia válida. Vence: ${v.expiresAt}`, true);
          const appSection = document.getElementById("app-section");
          if(appSection) {
            appSection.classList.remove("hidden");
            console.log("App section mostrado");
          }
          
          if(TARIFAS.length===0){
            console.log("Cargando TARIFAS...");
            TARIFAS = await apiTariffs();
            console.log("TARIFAS cargadas:", TARIFAS);
            
            poblarDistritos("depto-distrito");
            poblarDistritos("casa-distrito");
            poblarDistritos("terreno-distrito");
            
            // Add change listeners
            const deptoDistrito = $("depto-distrito");
            if(deptoDistrito) {
              deptoDistrito.addEventListener("change", e=>{
                console.log("Depto distrito changed:", e.target.value);
                poblarSubzonas(e.target.value,"depto-subzona");
              });
            }
          }
        }else{
          setStatus("license-status", v.error || "Licencia inválida");
        }
      }catch(err){
        console.error("Error validation:", err);
        setStatus("license-status", `Fallo: ${err.message}`);
      }
    });
  } else {
    console.error("License form NO encontrado!");
  }

  // DEPARTAMENTO
  const deptoForm = $("form-depto");
  if(deptoForm) {
    console.log("Depto form encontrado, agregando listener");
    deptoForm.addEventListener("submit", (ev)=>{
      console.log("SUBMIT DEPTO FORM!");
      ev.preventDefault();
      
      const d=$("depto-distrito").value;
      const s=$("depto-subzona").value;
      const piso = Number($("depto-piso").value||0);
      const ascensor = $("depto-ascensor").value;
      const condicion = $("depto-condicion").value;
      const dormitorios = Number($("depto-dormitorios").value||0);
      const antiguedad = Number($("depto-antiguedad").value||0);
      const at=Number($("depto-area-techada").value||0);
      const al=Number($("depto-area-libre").value||0);
      
      console.log("Form values:", {d, s, piso, ascensor, condicion, dormitorios, antiguedad, at, al});
      
      const vm2 = buscarVM2(d,s);
      const out = $("depto-result");
      
      console.log("VM2:", vm2, "Output element:", out);
      
      if(!d||!s||!isFinite(vm2)) {
        const msg = "Selecciona distrito/subzona válidos";
        console.log("Error:", msg);
        if(out) out.textContent = msg;
        return;
      }
      
      const areaPonderada = at + (0.5 * al);
      const f = factorDepto({piso, ascensor, condicion, dormitorios, antiguedad});
      const medio = areaPonderada * vm2 * f;
      const minimo = medio * 0.95;
      const alto = medio * 1.05;
      
      console.log("Calculation:", {areaPonderada, f, medio, minimo, alto});
      
      if(out) {
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
        console.log("Result HTML set!");
      }
    });
  } else {
    console.error("Depto form NO encontrado!");
  }

  // COMPRA
  const purchaseForm = $("purchase-form");
  if(purchaseForm) {
    purchaseForm.addEventListener("submit", async (ev)=>{
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
  }
});

// EMISIÓN
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

if (typeof window !== "undefined") { 
  window.emitirLicencia = emitirLicencia;
  console.log("emitirLicencia expuesta al window");
}

console.log("Script cargado completamente");



