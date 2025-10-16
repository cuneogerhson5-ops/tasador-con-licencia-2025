// ====== LOGIN / GATE ======
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

// ====== CONFIG BACKEND (Apps Script) ======
const BASE_URL = "https://script.google.com/macros/s/AKfycby9r3ikkEE9PrCBAwueyUph6Xp5-afiifEhKe6dvmc0wP38n5jUwRM8yecDbNg7KyhSMw/exec";
const TARIFF_URL   = `${BASE_URL}?action=tariffs`;
const VALIDATE_URL = `${BASE_URL}?action=validate`;
const ISSUE_URL    = `${BASE_URL}?action=issue`;

// ====== UTILIDADES ======
const $ = (id) => document.getElementById(id);
const norm = (s)=> String(s??"").trim().toLowerCase();
const unique = (arr)=> Array.from(new Set(arr));
function setStatus(id, msg, ok=false){
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg || "";
  el.classList.remove("error","ok");
  if (msg) el.classList.add(ok ? "ok" : "error");
}

// ====== ESTADO ======
let TARIFAS = []; // [{distrito, subzona, valorM2:Number}]

// ====== API LICENCIAS (VALIDAR/EMITIR) ======
async function apiValidate(email, license){
  const url = `${VALIDATE_URL}&email=${encodeURIComponent(email)}&license=${encodeURIComponent(license)}`;
  const r = await fetch(url, { method: "GET" });
  if (!r.ok) {
    const text = await r.text().catch(()=> "");
    throw new Error(`HTTP ${r.status}${text ? ` - ${text}` : ""}`);
  }
  // Espera JSON: { valid:boolean, expiresAt?:string, error?:string }
  return r.json();
}
async function apiIssue(payload){
  const r = await fetch(ISSUE_URL, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify(payload)
  });
  if(!r.ok){
    const text = await r.text().catch(()=> "");
    throw new Error(`HTTP ${r.status}${text ? ` - ${text}` : ""}`);
  }
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

// ====== API TARIFAS (sanitizado valorM2) ======
async function apiTariffs(){
  const r = await fetch(TARIFF_URL);
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  return (data||[]).map(t=>{
    let v = t.valorM2;
    if (typeof v === "string") v = v.replace(/[^\d.]/g,""); // limpia S/, comas y espacios
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

// ====== FACTORES DE VALORIZACIÓN (conservadores) ======
const FACT = {
  area:  { dpto: 0.25, casa: 0.35, terr: 0.80 },
  antig: { premiumNuevo: 0.02, depAnual: 0.006, depMax: 0.12 },
  dorms: { base: 2, inc: 0.02, incMax: 0.04, dec: 0.03, decMax: 0.06 },
  efic:  { A:1.03, B:1.02, C:1.00, D:0.99, E:0.97, F:0.95 },
  cond:  { "a estrenar":1.05, "bueno":1.02, "regular":0.97, "para remodelar":0.92 },
  pisoAsc: { sin_7mas:-0.08, sin_4a6:-0.05, con_9mas:-0.02, con_1a2:+0.02 },
  caps: { totalUp: 0.15, totalDn: 0.15 }
};

async function obtenerTipoCambio(){ return 3.75; } // fijo

// Áreas ponderadas
function areaDepto(at, al){ return at + al*FACT.area.dpto; }
function areaCasa(at, al, atTerr=0){ return at + al*FACT.area.casa + atTerr*0.15; }
function areaTerreno(a){ return a*FACT.area.terr; }

// Ajustes
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
function ajustePisoAsc(v, piso, asc){
  let d = 0;
  const tiene = norm(asc)==="con" || norm(asc)==="si";
  if (!tiene && piso>=7) d = FACT.pisoAsc.sin_7mas;
  else if (!tiene && piso>=4) d = FACT.pisoAsc.sin_4a6;
  else if (tiene && piso>=9) d = FACT.pisoAsc.con_9mas;
  else if (tiene && piso<=2) d = FACT.pisoAsc.con_1a2;
  return v*(1+d);
}
function capTotal(baseInicial, valorAjustado){
  const ratio = valorAjustado/baseInicial;
  const maxUp = 1 + FACT.caps.totalUp;   // +15%
  const maxDn = 1 - FACT.caps.totalDn;   // -15%
  const clamped = Math.min(Math.max(ratio, maxDn), maxUp);
  return baseInicial*clamped;
}
function rangoTipo(tipo){ return tipo==="terreno" ? 0.06 : 0.04; }

// Helpers UI
function formatear(v){
  return new Intl.NumberFormat("es-PE",{minimumFractionDigits:0,maximumFractionDigits:0}).format(v);
}
function mostrarError(msg){
  const s = $("summary");
  s.textContent = `Error: ${msg}`;
  s.style.color = "#e74c3c";
}
function limpiarResultados(){ ["valMin","valMed","valMax"].forEach(id=> { const el=$(id); if(el) el.textContent="-"; }); }

// ====== CÁLCULO PRINCIPAL (valorización) ======
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
    const piso = parseInt($("piso").value)||0;
    const asc = $("ascensor").value;

    const antig = parseInt($("antiguedad").value)||0;
    const cond = $("estado").value;
    const ef = $("eficiencia").value;
    const moneda = $("moneda").value;

    if(!distrito || !zona) throw new Error("Seleccione distrito y zona");
    if(!tipo) throw new Error("Seleccione el tipo de inmueble");
    if(tipo!=="terreno" && at<=0) throw new Error("Área construida debe ser > 0");
    if(aTerr<0) throw new Error("Área de terreno no puede ser negativa");
    if(tipo!=="terreno" && d<1) throw new Error("Debe tener al menos 1 dormitorio");
    if(antig<0) throw new Error("Antigüedad no puede ser negativa");

    const vm2 = buscarVM2(distrito, zona);
    if(!isFinite(vm2)) throw new Error("No se encontró vm2 en tarifas para la subzona");

    let ap = 0;
    if (tipo.includes("departamento")) ap = areaDepto(at, al);
    else if (tipo.includes("casa")) ap = areaCasa(at, al, aTerr);
    else ap = areaTerreno(aTerr);

    const base0 = vm2 * ap;

    let val = base0;
    if (tipo.includes("departamento")) val = ajustePisoAsc(val, piso, asc);
    if (tipo!=="terreno") val = aplicarDorms(val, d, tipo);
    val = aplicarAntig(val, antig);
    val = aplicarCond(val, cond);
    if (tipo!=="terreno") val = aplicarEfic(val, ef);

    val = capTotal(base0, val); // CAP ±15%

    const FX = await obtenerTipoCambio();
    const fx = (moneda==="$") ? (1/FX) : 1;
    const r = rangoTipo(tipo);

    const valMin = val*(1-r)*fx;
    const valMed = val*fx;
    const valMax = val*(1+r)*fx;

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

// ====== INICIALIZACIÓN (tarifas, licencias, listeners) ======
document.addEventListener("DOMContentLoaded", async ()=>{
  // Cargar TARIFAS y poblar selects
  try{
    TARIFAS = await apiTariffs();
    const distritoSel = $("distrito");
    const zonaSel = $("zona");
    if (distritoSel && zonaSel){
      poblarDistritos(distritoSel);
      distritoSel.addEventListener("change", ()=> poblarSubzonas(distritoSel, zonaSel));
    }
  }catch(err){
    console.error("Error cargando tarifas:", err);
  }

  // Validación de licencia (evita recarga y no borra inputs)
  const licenseForm = document.getElementById("license-form");
  if (licenseForm){
    licenseForm.addEventListener("submit", async (ev)=>{
      ev.preventDefault(); // evita que el navegador recargue y borre los campos [web:137][web:135]
      const email = (document.getElementById("email")?.value || "").trim();
      const license = (document.getElementById("licenseId")?.value || "").trim();
      if (!email || !license){
        setStatus("license-status","Completa correo y licencia");
        return;
      }
      setStatus("license-status","Validando...");
      try{
        const res = await apiValidate(email, license);
       if (res.valid){
  setStatus("license-status", `Licencia válida. Vence: ${res.expiresAt || "N/D"}`, true);
  document.getElementById("app-section")?.classList.remove("hidden");
  
  // Forzar carga de tarifas si aún no están
  if (TARIFAS.length === 0){
    TARIFAS = await apiTariffs();
    const distritoSel = $("distrito");
    const zonaSel = $("zona");
    if (distritoSel && zonaSel){
      poblarDistritos(distritoSel);
      distritoSel.addEventListener("change", ()=> poblarSubzonas(distritoSel, zonaSel));
    }
  }
}

        }else{
          setStatus("license-status", res.error || "Licencia inválida");
        }
      }catch(err){
        console.error("Error validando licencia:", err);
        setStatus("license-status", `Fallo: ${err.message}`);
      }
    });
  }

  // Emisión rápida (si existe botón)
  const emitirBtn = document.getElementById("emitir-btn");
  if (emitirBtn){
    emitirBtn.onclick = async ()=>{
      try{
        setStatus("purchase-status","Emitiendo...");
        const res = await emitirLicencia();
        document.getElementById('emitir-out').textContent = JSON.stringify(res, null, 2);
        if (res.issued){
          setStatus("purchase-status", `Licencia emitida: ${res.licenseId}`, true);
        }else{
          setStatus("purchase-status", res.error || "No emitida");
        }
      }catch(e){
        setStatus("purchase-status", `Fallo: ${e.message}`);
      }
    };
  }

  // Submit del formulario de cálculo
  const form = $("calc");
  if (form) form.addEventListener("submit", (e)=>{ e.preventDefault(); calcular(); });
});













