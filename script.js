console.log("Script cargando...");

// ========== CONFIGURACIÓN BACKEND ==========
const BASE_URL = "https://script.google.com/macros/s/AKfycby9r3ikkEE9PrCBAwueyUph6Xp5-afiifEhKe6dvmc0wP38n5jUwRM8yecDbNg7KyhSMw/exec";
const TARIFF_URL = `${BASE_URL}?action=tariffs`;
const VALIDATE_URL = `${BASE_URL}?action=validate`;
const ISSUE_URL = `${BASE_URL}?action=issue`;

// ========== ESTADO ==========
let TARIFAS = [];

// ========== UTILIDADES ==========
const $ = (id) => document.getElementById(id);
const unique = (arr) => Array.from(new Set(arr));
const norm = (s) => String(s ?? "").trim().toLowerCase();

function setStatus(id, msg, ok=false){ 
  const el=$(id); 
  if(el) {
    el.textContent=msg||""; 
    el.classList.remove("error","ok"); 
    if(msg) el.classList.add(ok?"ok":"error");
  }
}

// ========== CARGA TARIFAS ==========
async function apiTariffs(){ 
  const r = await fetch(TARIFF_URL); 
  if(!r.ok) throw new Error(`HTTP ${r.status}`); 
  const data = await r.json();
  // Normaliza valorM2 a número
  return (data||[]).map(t=>{
    let v = t.valorM2;
    if (typeof v === "string") v = v.replace(/[^\d.]/g,"");
    return {
      distrito: String(t.distrito||"").trim(),
      subzona: String(t.subzona||"").trim(),
      valorM2: Number(v)
    };
  });
}

function buscarVM2(d,s){
  const dKey = norm(d), sKey = norm(s);
  const it = TARIFAS.find(t=> norm(t.distrito)===dKey && norm(t.subzona)===sKey);
  return it ? Number(it.valorM2) : NaN;
}

function poblarDistritos(selectId){
  const sel=$(selectId);
  if(!sel) return;
  sel.innerHTML=`<option value="">— Selecciona —</option>`;
  const distritos = unique(TARIFAS.map(t=>String(t.distrito||"").trim())).filter(Boolean).sort();
  distritos.forEach(d=> sel.insertAdjacentHTML("beforeend", `<option value="${d}">${d}</option>`));
}

function poblarSubzonas(distrito, selectId){
  const sel=$(selectId);
  if(!sel) return;
  sel.innerHTML=`<option value="">— Selecciona —</option>`;
  const dKey = norm(distrito);
  const subzonas = unique(
    TARIFAS.filter(t=> norm(t.distrito)===dKey).map(t=> String(t.subzona||"").trim())
  ).filter(Boolean).sort();
  subzonas.forEach(s=> sel.insertAdjacentHTML("beforeend", `<option value="${s}">${s}</option>`));
  sel.disabled = sel.options.length<=1;
}

// ========== API LICENCIAS ==========
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
if (typeof window !== "undefined") window.emitirLicencia = emitirLicencia;

// ========== FACTORES ==========
const FACTORES_TASACION = {
  antiguedad: { premiumNuevo: 0.03, depAnual: 0.007, depMax: 0.12 },
  dormitorios: { base: 2, incPorDorm: 0.03, incMax: 0.06, decPorDef: 0.04, decMax: 0.08 },
  areaLibre: { departamento: 0.25, casa: 0.40, terreno: 0.90 },
  eficienciaEnergetica: { A:1.03, B:1.02, C:1.00, D:0.98, E:0.96, F:0.94 },
  estadoConservacion: { "a estrenar":1.06, "bueno":1.02, "regular":0.98, "para remodelar":0.94 }
};
async function obtenerTipoCambio() { return 3.75; }

function aplicarFactorAntiguedad(valor, antig){
  if (antig <= 1) return valor * (1 + FACTORES_TASACION.antiguedad.premiumNuevo);
  const dep = Math.min(antig * FACTORES_TASACION.antiguedad.depAnual, FACTORES_TASACION.antiguedad.depMax);
  return valor * (1 - dep);
}
function aplicarFactorDormitorios(valor, dorms, tipo){
  if (tipo.includes("terreno")) return valor;
  const base = FACTORES_TASACION.dormitorios.base;
  if (dorms === base) return valor;
  if (dorms > base){
    const inc = Math.min((dorms - base) * FACTORES_TASACION.dormitorios.incPorDorm, FACTORES_TASACION.dormitorios.incMax);
    return valor * (1 + inc);
  } else {
    const dec = Math.min((base - dorms) * FACTORES_TASACION.dormitorios.decPorDef, FACTORES_TASACION.dormitorios.decMax);
    return valor * (1 - dec);
  }
}
function aplicarFactorEficienciaEnergetica(valor, cal){
  const f = FACTORES_TASACION.eficienciaEnergetica[cal] ?? 1.00;
  return valor * f;
}
function aplicarFactorCondicion(valor, condicion){
  const f = FACTORES_TASACION.estadoConservacion[norm(condicion)] ?? 1.00;
  return valor * f;
}
function ajustarRango(tipo){
  return tipo.includes("terreno") ? 0.08 : 0.05;
}

// ========== ÁREAS PONDERADAS ==========
function areaDepto(at, al){ return at + (al * FACTORES_TASACION.areaLibre.departamento); }
function areaCasa(at, al){ return at + (al * FACTORES_TASACION.areaLibre.casa); }
function areaTerreno(a){ return a * FACTORES_TASACION.areaLibre.terreno; }

// ========== CALCULAR: DEPARTAMENTO ==========
function calcularDepartamento(){
  const distrito = $("depto-distrito").value;
  const subzona = $("depto-subzona").value;
  const at = Number($("depto-area-techada").value||0);
  const al = Number($("depto-area-libre").value||0);
  const antig = Number($("depto-antiguedad").value||0);
  const piso = Number($("depto-piso").value||0);
  const dorms = Number($("depto-dormitorios").value||0);
  const condicion = $("depto-condicion").value;
  const asc = $("depto-ascensor").value; // si/no
  const efic = $("depto-eficiencia").value; // A..F

  const out = $("depto-result");
  const vm2 = buscarVM2(distrito, subzona);
  if(!isFinite(vm2)){ out.textContent="No se encontró VM2 para la subzona; verifica TARIFAS."; return; }

  const ap = areaDepto(at, al);
  let base = vm2 * ap;

  // Ajustes calibrados (manteniendo tu lógica simple: piso/ascensor neto, dormitorios, antigüedad, condición, eficiencia)
  // Piso/ascensor neto
  let deltaPiso = 0;
  const tieneAsc = norm(asc)==="si";
  if (!tieneAsc && piso >= 7) deltaPiso = -0.10;
  else if (!tieneAsc && piso >= 4) deltaPiso = -0.07;
  else if (tieneAsc && piso >= 9) deltaPiso = -0.03;
  else if (tieneAsc && piso <= 2) deltaPiso = +0.02;

  base = base * (1 + deltaPiso);
  base = aplicarFactorDormitorios(base, dorms, "departamento");
  base = aplicarFactorAntiguedad(base, antig);
  base = aplicarFactorCondicion(base, condicion);
  base = aplicarFactorEficienciaEnergetica(base, efic);

  const r = ajustarRango("departamento");
  const min = base * (1 - r);
  const max = base * (1 + r);

  out.innerHTML = `
    <div class="grid">
      <div class="pill"><h4>Área ponderada</h4><div>${ap.toFixed(1)} m²</div></div>
      <div class="pill"><h4>Valor m²</h4><div>S/${vm2.toLocaleString()}</div></div>
      <div class="pill"><h4>Ajuste piso/ascensor</h4><div>${(1+deltaPiso).toFixed(3)}x</div></div>
    </div>
    <div class="grid" style="margin-top:8px">
      <div class="pill"><h4>Valor mínimo</h4><div>S/${Math.round(min).toLocaleString()}</div></div>
      <div class="pill"><h4>Valor medio</h4><div>S/${Math.round(base).toLocaleString()}</div></div>
      <div class="pill"><h4>Valor alto</h4><div>S/${Math.round(max).toLocaleString()}</div></div>
    </div>
  `;
}

// ========== CALCULAR: CASA ==========
function calcularCasa(){
  const distrito = $("casa-distrito").value;
  const subzona = $("casa-subzona").value;
  const at = Number($("casa-area-techada").value||0);
  const al = Number($("casa-area-libre").value||0);
  const antig = Number($("casa-antiguedad").value||0);
  const dorms = Number($("casa-dormitorios").value||0);
  const condicion = $("casa-condicion").value;
  const efic = $("casa-eficiencia").value;

  const out = $("casa-result");
  const vm2 = buscarVM2(distrito, subzona);
  if(!isFinite(vm2)){ out.textContent="No se encontró VM2 para la subzona; verifica TARIFAS."; return; }

  const ap = areaCasa(at, al);
  let base = vm2 * ap;

  base = aplicarFactorDormitorios(base, dorms, "casa");
  base = aplicarFactorAntiguedad(base, antig);
  base = aplicarFactorCondicion(base, condicion);
  base = aplicarFactorEficienciaEnergetica(base, efic);

  const r = ajustarRango("casa");
  const min = base * (1 - r);
  const max = base * (1 + r);

  out.innerHTML = `
    <div class="grid">
      <div class="pill"><h4>Área ponderada</h4><div>${ap.toFixed(1)} m²</div></div>
      <div class="pill"><h4>Valor m²</h4><div>S/${vm2.toLocaleString()}</div></div>
      <div class="pill"><h4>Ajustes</h4><div>Aplicados</div></div>
    </div>
    <div class="grid" style="margin-top:8px">
      <div class="pill"><h4>Valor mínimo</h4><div>S/${Math.round(min).toLocaleString()}</div></div>
      <div class="pill"><h4>Valor medio</h4><div>S/${Math.round(base).toLocaleString()}</div></div>
      <div class="pill"><h4>Valor alto</h4><div>S/${Math.round(max).toLocaleString()}</div></div>
    </div>
  `;
}

// ========== CALCULAR: TERRENO ==========
function calcularTerreno(){
  const distrito = $("terreno-distrito").value;
  const subzona = $("terreno-subzona").value;
  const antig = Number($("terreno-antiguedad").value||0); // reservado para reportes
  const aTerr = Number($("terreno-area").value||0);

  const out = $("terreno-result");
  const vm2 = buscarVM2(distrito, subzona);
  if(!isFinite(vm2)){ out.textContent="No se encontró VM2 para la subzona; verifica TARIFAS."; return; }

  const ap = areaTerreno(aTerr);
  const base = vm2 * ap;

  const r = ajustarRango("terreno");
  const min = base * (1 - r);
  const max = base * (1 + r);

  out.innerHTML = `
    <div class="grid">
      <div class="pill"><h4>Área ponderada</h4><div>${ap.toFixed(1)} m²</div></div>
      <div class="pill"><h4>Valor m²</h4><div>S/${vm2.toLocaleString()}</div></div>
      <div class="pill"><h4>Ajustes</h4><div>No aplica</div></div>
    </div>
    <div class="grid" style="margin-top:8px">
      <div class="pill"><h4>Valor mínimo</h4><div>S/${Math.round(min).toLocaleString()}</div></div>
      <div class="pill"><h4>Valor medio</h4><div>S/${Math.round(base).toLocaleString()}</div></div>
      <div class="pill"><h4>Valor alto</h4><div>S/${Math.round(max).toLocaleString()}</div></div>
    </div>
  `;
}

// ========== INICIALIZACIÓN ==========
document.addEventListener("DOMContentLoaded", async ()=>{
  // Validar licencia para mostrar app
  const licenseForm = $("license-form");
  if (licenseForm){
    licenseForm.addEventListener("submit", async (ev)=>{
      ev.preventDefault();
      const email = $("email").value.trim().toLowerCase();
      const license = $("licenseId").value.trim();
      setStatus("license-status","Validando...");
      try{
        const v = await apiValidate(email, license);
        if(v.valid){
          setStatus("license-status", `Licencia válida. Vence: ${v.expiresAt}`, true);
          $("app-section").classList.remove("hidden");

          // Cargar TARIFAS y poblar selects
          if(TARIFAS.length===0){
            TARIFAS = await apiTariffs();
            ["depto-distrito","casa-distrito","terreno-distrito"].forEach(id=>{
              if ($(id)) poblarDistritos(id);
            });
            $("depto-distrito").addEventListener("change", e=> poblarSubzonas(e.target.value,"depto-subzona"));
            $("casa-distrito").addEventListener("change", e=> poblarSubzonas(e.target.value,"casa-subzona"));
            $("terreno-distrito").addEventListener("change", e=> poblarSubzonas(e.target.value,"terreno-subzona"));
          }
        }else{
          setStatus("license-status", v.error || "Licencia inválida");
        }
      }catch(err){
        setStatus("license-status", `Fallo: ${err.message}`);
      }
    });
  }

  // Compra (issue)
  const purchaseForm = $("purchase-form");
  if (purchaseForm){
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

  // Formularios de cálculo
  if ($("form-depto")) $("form-depto").addEventListener("submit", (e)=>{ e.preventDefault(); calcularDepartamento(); });
  if ($("form-casa")) $("form-casa").addEventListener("submit", (e)=>{ e.preventDefault(); calcularCasa(); });
  if ($("form-terreno")) $("form-terreno").addEventListener("submit", (e)=>{ e.preventDefault(); calcularTerreno(); });
});

console.log("Script completamente cargado");






