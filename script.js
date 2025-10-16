// ====== LOGIN / GATE (SIN CAMBIOS) ======
const CLAVE_GLOBAL = "12345";
const gate = document.getElementById('gate');
const app = document.getElementById('app');
const gateMsg = document.getElementById('gateMsg');
const btnLogin = document.getElementById('btnLogin');
const logout = document.getElementById('logout');

if (btnLogin){
  btnLogin.onclick = () => {
    const inputClave = document.getElementById('clave').value;
    if (inputClave === CLAVE_GLOBAL) {
      gate.style.display = 'none';
      app.style.display = 'block';
      gateMsg.textContent = "";
    } else {
      gateMsg.textContent = "Clave incorrecta 🚫";
    }
  };
}
if (logout){
  logout.onclick = () => {
    app.style.display = 'none';
    gate.style.display = 'block';
    document.getElementById('clave').value = "";
  };
}

// ====== CONFIG BACKEND (LICENCIAS Y TARIFAS) ======
const BASE_URL = "https://script.google.com/macros/s/AKfycby9r3ikkEE9PrCBAwueyUph6Xp5-afiifEhKe6dvmc0wP38n5jUwRM8yecDbNg7KyhSMw/exec";
const TARIFF_URL = `${BASE_URL}?action=tariffs`;
const VALIDATE_URL = `${BASE_URL}?action=validate`;
const ISSUE_URL = `${BASE_URL}?action=issue`;

// ====== UTILIDADES ======
const $ = (id) => document.getElementById(id);
const norm = (s)=> String(s??"").trim().toLowerCase();
const unique = (arr)=> Array.from(new Set(arr));

// ====== ESTADO ======
let TARIFAS = []; // [{distrito, subzona, valorM2:Number}]

// ====== API LICENCIAS (SIN CAMBIOS) ======
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
    buyerName: $("buyerName")?.value || "Cliente",
    buyerEmail: $("buyerEmail")?.value || "cliente@correo.com",
    buyerDocType: $("buyerDocType")?.value || "DNI",
    buyerDocId: $("buyerDocId")?.value || "00000000",
    payMethod: $("payMethod")?.value || "Yape/Plin",
    amount: $("amount")?.value || "100",
    voucherUrl: $("operationNumber")?.value || "OP-XXXXXX",
    notes: $("notes")?.value || "Emisión prueba"
  };
  return apiIssue(payload);
}
if (typeof window !== "undefined") window.emitirLicencia = emitirLicencia;

// ====== API TARIFAS (SOLO PARA VALORIZACIÓN) ======
async function apiTariffs(){ 
  const r = await fetch(TARIFF_URL); 
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  // Sanitiza valorM2 a número
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
function buscarVM2(distrito, subzona){
  const it = TARIFAS.find(x=> norm(x.distrito)===norm(distrito) && norm(x.subzona)===norm(subzona));
  return it ? it.valorM2 : NaN;
}
function poblarDistritos(sel){
  sel.innerHTML = '<option value="">Selecciona un distrito</option>';
  const distritos = unique(TARIFAS.map(t=> t.distrito)).sort();
  distritos.forEach(d=>{
    const opt = document.createElement('option');
    opt.value = d; opt.textContent = d;
    sel.appendChild(opt);
  });
}
function poblarSubzonas(selDistrito, selZona){
  selZona.innerHTML = '<option value="">Selecciona una zona</option>';
  const dKey = norm(selDistrito.value);
  const subzonas = unique(
    TARIFAS.filter(t=> norm(t.distrito)===dKey).map(t=> t.subzona)
  ).sort();
  subzonas.forEach(s=>{
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    selZona.appendChild(opt);
  });
}

// ====== FACTORES DE VALORIZACIÓN (CALIBRADOS) ======
const FACT = {
  antig: { premiumNuevo: 0.03, depAnual: 0.007, depMax: 0.12 },
  dorms: { base: 2, inc: 0.03, incMax: 0.06, dec: 0.04, decMax: 0.08 },
  area:  { dpto: 0.25, casa: 0.40, terr: 0.90 },
  efic:  { A:1.03, B:1.02, C:1.00, D:0.98, E:0.96, F:0.94 },
  cond:  { "a estrenar":1.06, "bueno":1.02, "regular":0.98, "para remodelar":0.94 }
};
async function obtenerTipoCambio(){ return 3.75; }

function aplicarAntig(v, a){
  if (a<=1) return v*(1+FACT.antig.premiumNuevo);
  const dep = Math.min(a*FACT.antig.depAnual, FACT.antig.depMax);
  return v*(1-dep);
}
function aplicarDorms(v, d, tipo){
  if (tipo==="terreno") return v;
  const base = FACT.dorms.base;
  if (d===base) return v;
  if (d>base){
    const inc = Math.min((d-base)*FACT.dorms.inc, FACT.dorms.incMax);
    return v*(1+inc);
  } else {
    const dec = Math.min((base-d)*FACT.dorms.dec, FACT.dorms.decMax);
    return v*(1-dec);
  }
}
function aplicarCond(v, c){ return v*(FACT.cond[norm(c)] ?? 1.00); }
function aplicarEfic(v, e){ return v*(FACT.efic[e] ?? 1.00); }
function ajustePisoAsc(v, piso, asc){ // asc: "con"/"sin"
  let d = 0;
  const t = norm(asc)==="con" || norm(asc)==="si";
  if (!t && piso>=7) d=-0.10;
  else if (!t && piso>=4) d=-0.07;
  else if (t && piso>=9) d=-0.03;
  else if (t && piso<=2) d=+0.02;
  return v*(1+d);
}
function rango(tipo){ return tipo==="terreno" ? 0.08 : 0.05; }

function areaDepto(at, al){ return at + al*FACT.area.dpto; }
function areaCasa(at, al, atTerr=0){ return at + al*FACT.area.casa + atTerr*0.20; }
function areaTerreno(a){ return a*FACT.area.terr; }

function formatear(v){
  return new Intl.NumberFormat("es-PE",{minimumFractionDigits:0,maximumFractionDigits:0}).format(v);
}
function mostrarError(msg){
  const s = $("summary");
  s.textContent = `Error: ${msg}`;
  s.style.color = "#e74c3c";
}
function limpiarResultados(){ ["valMin","valMed","valMax"].forEach(id=> $(id).textContent="-"); }

// ====== CÁLCULO PRINCIPAL (SOLO VALORIZACIÓN) ======
async function calcular(){
  try{
    limpiarResultados();

    const tipo = $("tipo").value.toLowerCase();
    const distrito = $("distrito").value;
    const zona = $("zona").value;

    const at = parseFloat($("areaConstruida").value)||0;
    const al = parseFloat($("areaLibre").value)||0;
    const aTerr = parseFloat($("areaTerreno").value)||0;

    const d = parseInt($("dorms").value)||0;
    const b = parseInt($("baths").value)||0; // reservado si luego reactivas baño
    const piso = parseInt($("piso").value)||0;
    const asc = $("ascensor").value;

    const antig = parseInt($("antiguedad").value)||0;
    const cond = $("estado").value;
    const ef = $("eficiencia").value;
    const moneda = $("moneda").value; // "S/" o "$"

    if (!distrito || !zona) return mostrarError("Debe seleccionar distrito y zona");
    if (!tipo) return mostrarError("Debe seleccionar el tipo de inmueble");
    if (tipo!=="terreno" && at<=0) return mostrarError("El área construida debe ser mayor a 0");
    if (aTerr<0) return mostrarError("El área de terreno no puede ser negativa");
    if (tipo!=="terreno" && d<1) return mostrarError("Debe tener al menos 1 dormitorio");
    if (antig<0) return mostrarError("La antigüedad no puede ser negativa");

    const vm2 = buscarVM2(distrito, zona);
    if (!isFinite(vm2)) return mostrarError("No se encontró VM2 en tarifas para la subzona seleccionada");

    let ap = 0;
    if (tipo.includes("departamento")) ap = areaDepto(at, al);
    else if (tipo.includes("casa")) ap = areaCasa(at, al, aTerr);
    else ap = areaTerreno(aTerr);

    let base = vm2 * ap;

    if (tipo.includes("departamento")) base = ajustePisoAsc(base, piso, asc);
    if (tipo!=="terreno") base = aplicarDorms(base, d, tipo);
    base = aplicarAntig(base, antig);
    base = aplicarCond(base, cond);
    if (tipo!=="terreno") base = aplicarEfic(base, ef);

    const FX = await obtenerTipoCambio();
    const fx = (moneda==="$") ? (1/FX) : 1;
    const r = rango(tipo);
    const valMin = base*(1-r)*fx;
    const valMed = base*fx;
    const valMax = base*(1+r)*fx;

    $("summary").textContent = `Estimación para ${tipo} en ${zona}, ${distrito}`;
    $("summary").style.color = "#2c3e50";
    $("valMin").textContent = `${moneda} ${formatear(valMin)}`;
    $("valMed").textContent = `${moneda} ${formatear(valMed)}`;
    $("valMax").textContent = `${moneda} ${formatear(valMax)}`;
  }catch(e){
    console.error(e);
    mostrarError(e.message||"Error en el cálculo");
  }
}

// ====== INICIALIZACIÓN (POBLADO SELECTS + LISTENERS) ======
document.addEventListener("DOMContentLoaded", async ()=>{
  // Cargar TARIFAS para valorización
  try{
    TARIFAS = await apiTariffs();
    const distritoSel = $("distrito");
    const zonaSel = $("zona");
    poblarDistritos(distritoSel);
    distritoSel.addEventListener("change", ()=> poblarSubzonas(distritoSel, zonaSel));
  }catch(err){
    console.error("Error cargando tarifas:", err);
  }

  // Mostrar/ocultar campos según tipo (mantiene tu UX actual)
  const tipoSel = $("tipo");
  const pisoGroup = $("piso-group");
  const ascensorGroup = $("ascensor-group");
  const dormsGroup = $("dorms-group");
  const bathsGroup = $("baths-group");
  const areaLibreGroup = $("areaLibre-group");
  const areaTerrenoGroup = $("areaTerreno-group");
  const areaConstruidaGroup = $("areaConstruida-group");

  tipoSel.addEventListener("change", () => {
    const t = tipoSel.value.toLowerCase();
    if (t.includes("departamento")) {
      pisoGroup.style.display = "block";
      ascensorGroup.style.display = "block";
      dormsGroup.style.display = "block";
      bathsGroup.style.display = "block";
      areaLibreGroup.style.display = "block";
      areaTerrenoGroup.style.display = "none";
      areaConstruidaGroup.style.display = "block";
    } else if (t.includes("casa")) {
      pisoGroup.style.display = "none";
      ascensorGroup.style.display = "none";
      dormsGroup.style.display = "block";
      bathsGroup.style.display = "block";
      areaLibreGroup.style.display = "block";
      areaTerrenoGroup.style.display = "block";
      areaConstruidaGroup.style.display = "block";
    } else if (t.includes("terreno")) {
      pisoGroup.style.display = "none";
      ascensorGroup.style.display = "none";
      dormsGroup.style.display = "none";
      bathsGroup.style.display = "none";
      areaLibreGroup.style.display = "none";
      areaTerrenoGroup.style.display = "block";
      areaConstruidaGroup.style.display = "none";
    }
  });

  // Submit del formulario (conservado)
  const form = $("calc");
  form.addEventListener("submit", (e)=>{ e.preventDefault(); calcular(); });
});








