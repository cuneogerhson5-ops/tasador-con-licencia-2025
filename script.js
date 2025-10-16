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

// ========== VM2 (del primer script) ==========
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

// ========== API ==========
async function apiTariffs(){ 
  const r = await fetch(TARIFF_URL); 
  if(!r.ok) throw new Error(`HTTP ${r.status}`); 
  return r.json();
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
if (typeof window !== "undefined") window.emitirLicencia = emitirLicencia;

// ========== FACTORES RE-CALIBRADOS ==========
const FACTORES_TASACION = {
  antiguedad: { premiumNuevo: 0.03, depAnual: 0.007, depMax: 0.12 },
  dormitorios: { base: 2, incPorDorm: 0.03, incMax: 0.06, decPorDef: 0.04, decMax: 0.08 },
  banos: { base: 2, incPorBano: 0.02, incMax: 0.04, decPorDef: 0.05, decMax: 0.10 },
  areaLibre: { departamento: 0.25, casa: 0.40, terreno: 0.90 },
  eficienciaEnergetica: { A:1.03, B:1.02, C:1.00, D:0.98, E:0.96, F:0.94 },
  estadoConservacion: { excelente:1.04, bueno:1.00, regular:0.94, remodelar:0.88 }
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
function aplicarFactorBanos(valor, banos, tipo){
  if (tipo.includes("terreno")) return valor;
  const base = FACTORES_TASACION.banos.base;
  if (banos === base) return valor;
  if (banos > base){
    const inc = Math.min((banos - base) * FACTORES_TASACION.banos.incPorBano, FACTORES_TASACION.banos.incMax);
    return valor * (1 + inc);
  } else {
    const dec = Math.min((base - banos) * FACTORES_TASACION.banos.decPorDef, FACTORES_TASACION.banos.decMax);
    return valor * (1 - dec);
  }
}
function aplicarFactorPiso(valor, piso, tieneAscensor, tipo){
  if (!tipo.includes("departamento")) return valor;
  let delta = 0;
  if (!tieneAscensor && piso >= 7) delta = -0.10;
  else if (!tieneAscensor && piso >= 4) delta = -0.07;
  else if (tieneAscensor && piso >= 9) delta = -0.03;
  else if (tieneAscensor && piso <= 2) delta = +0.02;
  return valor * (1 + delta);
}
function aplicarFactorEficienciaEnergetica(valor, cal){
  const f = FACTORES_TASACION.eficienciaEnergetica[cal] ?? 1.00;
  return valor * f;
}
function aplicarFactorEstadoConservacion(valor, estado){
  const f = FACTORES_TASACION.estadoConservacion[estado] ?? 1.00;
  return valor * f;
}
function limitarAjusteTotal(valorBaseAntes, valorDespues){
  const ratio = valorDespues / valorBaseAntes;
  const maxUp = 1.18, maxDn = 0.82;
  const clamped = Math.min(Math.max(ratio, maxDn), maxUp);
  return valorBaseAntes * clamped;
}
function rangoPorTipo(datos){
  if (datos.tipo.includes("terreno")) return 0.08;
  return 0.05;
}

// ========== VALIDACIONES Y UI ==========
function mostrarError(mensaje) {
  const summary = document.getElementById("summary");
  if (summary){
    summary.textContent = `Error: ${mensaje}`;
    summary.style.color = '#e74c3c';
  } else {
    alert(mensaje);
  }
}
function limpiarResultados() {
  ['valMin', 'valMed', 'valMax'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '-';
  });
}

// ========== CALCULADORAS SEPARADAS ==========
function calcAreaPonderadaDepartamento(at, al){
  return at + (al * FACTORES_TASACION.areaLibre.departamento);
}
function calcAreaPonderadaCasa(at, al, atTerr){
  return at + (al * FACTORES_TASACION.areaLibre.casa) + (atTerr * 0.20);
}
function calcAreaPonderadaTerreno(aTerr){
  return aTerr * FACTORES_TASACION.areaLibre.terreno;
}

// ========== TASACIÓN: DEPARTAMENTO ==========
function calcularDepartamento() {
  const distrito = $("depto-distrito").value;
  const subzona = $("depto-subzona").value;
  const piso = Number($("depto-piso").value || 0);
  const ascensor = $("depto-ascensor").value;
  const condicion = $("depto-condicion").value;
  const dormitorios = Number($("depto-dormitorios").value || 0);
  const antiguedad = Number($("depto-antiguedad").value || 0);
  const at = Number($("depto-area-techada").value || 0);
  const al = Number($("depto-area-libre").value || 0);

  const out = $("depto-result");

  const vm2 = buscarVM2(distrito, subzona);
  if (!distrito || !subzona || !isFinite(vm2)) {
    out.textContent = "Selecciona distrito/subzona válidos";
    return;
  }

  const areaPonderada = calcAreaPonderadaDepartamento(at, al);
  let valorBase = vm2 * areaPonderada;
  const antes = valorBase;

  // Condición (igual esquema que tu primer script)
  const c = norm(condicion);
  let fCond = 1;
  if (c==="a estrenar") fCond=1.06;
  else if (c==="bueno") fCond=1.02;
  else if (c==="regular") fCond=0.98;
  else if (c==="para remodelar") fCond=0.94;

  // Factores calibrados
  valorBase = aplicarFactorAntiguedad(valorBase, antiguedad);
  valorBase = aplicarFactorDormitorios(valorBase, dormitorios, "departamento");
  valorBase = aplicarFactorPiso(valorBase, piso, norm(ascensor)==="si", "departamento");
  valorBase = valorBase * fCond;

  valorBase = limitarAjusteTotal(antes, valorBase);

  const medio = valorBase;
  const r = 0.05;
  const minimo = medio * (1 - r);
  const alto = medio * (1 + r);

  out.innerHTML = `
    <div class="grid">
      <div class="pill"><h4>Área ponderada</h4><div>${areaPonderada.toFixed(1)} m²</div></div>
      <div class="pill"><h4>Valor m²</h4><div>S/${vm2.toLocaleString()}</div></div>
      <div class="pill"><h4>Ajuste total</h4><div>${(medio/antes).toFixed(3)}x</div></div>
    </div>
    <div class="grid" style="margin-top:8px">
      <div class="pill"><h4>Valor mínimo</h4><div>S/${Math.round(minimo).toLocaleString()}</div></div>
      <div class="pill"><h4>Valor medio</h4><div>S/${Math.round(medio).toLocaleString()}</div></div>
      <div class="pill"><h4>Valor alto</h4><div>S/${Math.round(alto).toLocaleString()}</div></div>
    </div>
  `;
}

// ========== TASACIÓN: CASA ==========
function calcularCasa() {
  const distrito = $("casa-distrito").value;
  const subzona = $("casa-subzona").value;
  const condicion = $("casa-condicion").value;
  const dormitorios = Number($("casa-dormitorios").value || 0);
  const antiguedad = Number($("casa-antiguedad").value || 0);
  const at = Number($("casa-area-techada").value || 0);
  const al = Number($("casa-area-libre").value || 0);

  const out = $("casa-result");

  const vm2 = buscarVM2(distrito, subzona);
  if (!distrito || !subzona || !isFinite(vm2)) {
    out.textContent = "Selecciona distrito/subzona válidos";
    return;
  }

  const areaPonderada = calcAreaPonderadaCasa(at, al, 0);
  let valorBase = vm2 * areaPonderada;
  const antes = valorBase;

  const c = norm(condicion);
  let fCond = 1;
  if (c==="a estrenar") fCond=1.06;
  else if (c==="bueno") fCond=1.02;
  else if (c==="regular") fCond=0.98;
  else if (c==="para remodelar") fCond=0.94;

  valorBase = aplicarFactorAntiguedad(valorBase, antiguedad);
  valorBase = aplicarFactorDormitorios(valorBase, dormitorios, "casa");
  valorBase = valorBase * fCond;

  valorBase = limitarAjusteTotal(antes, valorBase);

  const medio = valorBase;
  const r = 0.05;
  const minimo = medio * (1 - r);
  const alto = medio * (1 + r);

  out.innerHTML = `
    <div class="grid">
      <div class="pill"><h4>Área ponderada</h4><div>${areaPonderada.toFixed(1)} m²</div></div>
      <div class="pill"><h4>Valor m²</h4><div>S/${vm2.toLocaleString()}</div></div>
      <div class="pill"><h4>Ajuste total</h4><div>${(medio/antes).toFixed(3)}x</div></div>
    </div>
    <div class="grid" style="margin-top:8px">
      <div class="pill"><h4>Valor mínimo</h4><div>S/${Math.round(minimo).toLocaleString()}</div></div>
      <div class="pill"><h4>Valor medio</h4><div>S/${Math.round(medio).toLocaleString()}</div></div>
      <div class="pill"><h4>Valor alto</h4><div>S/${Math.round(alto).toLocaleString()}</div></div>
    </div>
  `;
}

// ========== TASACIÓN: TERRENO ==========
function calcularTerreno() {
  const distrito = $("terreno-distrito").value;
  const subzona = $("terreno-subzona").value;
  const area = Number($("terreno-area").value || 0);

  const out = $("terreno-result");

  const vm2 = buscarVM2(distrito, subzona);
  if (!distrito || !subzona || !isFinite(vm2)) {
    out.textContent = "Selecciona distrito/subzona válidos";
    return;
  }
  const areaPonderada = calcAreaPonderadaTerreno(area);
  const medio = vm2 * areaPonderada;
  const r = 0.08;
  const minimo = medio * (1 - r);
  const alto = medio * (1 + r);

  out.innerHTML = `
    <div class="grid">
      <div class="pill"><h4>Área ponderada</h4><div>${areaPonderada.toFixed(1)} m²</div></div>
      <div class="pill"><h4>Valor m²</h4><div>S/${vm2.toLocaleString()}</div></div>
      <div class="pill"><h4>Ajuste total</h4><div>1.000x</div></div>
    </div>
    <div class="grid" style="margin-top:8px">
      <div class="pill"><h4>Valor mínimo</h4><div>S/${Math.round(minimo).toLocaleString()}</div></div>
      <div class="pill"><h4>Valor medio</h4><div>S/${Math.round(medio).toLocaleString()}</div></div>
      <div class="pill"><h4>Valor alto</h4><div>S/${Math.round(alto).toLocaleString()}</div></div>
    </div>
  `;
}

// ========== INICIALIZACIÓN ==========
document.addEventListener("DOMContentLoaded", async ()=>{
  // Validación de licencia
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
          if(TARIFAS.length===0){
            TARIFAS = await apiTariffs();
            poblarDistritos("depto-distrito");
            poblarDistritos("casa-distrito");
            poblarDistritos("terreno-distrito");
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
  const formDepto = $("form-depto");
  const formCasa = $("form-casa");
  const formTerreno = $("form-terreno");

  if (formDepto) formDepto.addEventListener("submit", (e)=>{ e.preventDefault(); calcularDepartamento(); });
  if (formCasa) formCasa.addEventListener("submit", (e)=>{ e.preventDefault(); calcularCasa(); });
  if (formTerreno) formTerreno.addEventListener("submit", (e)=>{ e.preventDefault(); calcularTerreno(); });

  // Botón emitir prueba (ya conectado desde index)
});

console.log("Script completamente cargado");





