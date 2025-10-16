// ====== LOGIN / GATE ======
const CLAVE_GLOBAL = "12345";
const gate = document.getElementById('gate');
const app = document.getElementById('app');
const gateMsg = document.getElementById('gateMsg');
const btnLogin = document.getElementById('btnLogin');
const logout = document.getElementById('logout');

if (btnLogin) {
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
if (logout) {
  logout.onclick = () => {
    app.style.display = 'none';
    gate.style.display = 'block';
    document.getElementById('clave').value = "";
  };
}

// ====== CONFIG BACKEND ======
const BASE_URL    = "https://script.google.com/macros/s/AKfycby9r3ikkEE9PrCBAwueyUph6Xp5-afiifEhKe6dvmc0wP38n5jUwRM8yecDbNg7KyhSMw/exec";
const TARIFF_URL = `${BASE_URL}?action=tariffs`;
const VALIDATE_URL = `${BASE_URL}?action=validate`;
const ISSUE_URL = `${BASE_URL}?action=issue`;

// ====== UTILIDADES ======
const $ = id => document.getElementById(id);
const norm = s => String(s||"").trim().toLowerCase();
const unique = arr => Array.from(new Set(arr));

// ====== ESTADO ======
let TARIFAS = [];

// ====== API LICENCIAS ======
async function apiValidate(email, license) {
  const url = `${VALIDATE_URL}&email=${encodeURIComponent(email)}&license=${encodeURIComponent(license)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}
async function apiIssue(payload) {
  const resp = await fetch(ISSUE_URL, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(payload)
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}
async function emitirLicencia() {
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

// ====== API TARIFAS ======
async function apiTariffs() {
  const resp = await fetch(TARIFF_URL);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  return (data||[]).map(t => {
    let v = t.valorM2;
    if (typeof v === "string") v = v.replace(/[^\d.]/g,"");
    return {
      distrito: String(t.distrito||"").trim(),
      subzona: String(t.subzona||"").trim(),
      valorM2: Number(v)
    };
  });
}
function buscarVM2(distrito, subzona) {
  const it = TARIFAS.find(x =>
    norm(x.distrito) === norm(distrito) &&
    norm(x.subzona) === norm(subzona)
  );
  return it ? it.valorM2 : NaN;
}

// ====== POBLADO SELECTS ======
function poblarDistritos() {
  const sel = $("distrito");
  sel.innerHTML = '<option value="">Selecciona un distrito</option>';
  unique(TARIFAS.map(t => t.distrito)).sort()
    .forEach(d => {
      const opt = document.createElement("option");
      opt.value = d; opt.textContent = d;
      sel.appendChild(opt);
    });
}
function poblarSubzonas() {
  const selD = $("distrito"), selZ = $("zona");
  selZ.innerHTML = '<option value="">Selecciona una zona</option>';
  unique(
    TARIFAS
      .filter(t => norm(t.distrito) === norm(selD.value))
      .map(t => t.subzona)
  ).sort()
    .forEach(s => {
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = s;
      selZ.appendChild(opt);
    });
}

// ====== FACTORES CONSERVADORES ======
const FACT = {
  area: { dpto:0.25, casa:0.35, terr:0.80 },
  antig: { pN:0.02, dA:0.006, dM:0.12 },
  dorms:{b:2,i:0.02,iM:0.04,d:0.03,dM:0.06},
  efic:{A:1.03,B:1.02,C:1,D:0.99,E:0.97,F:0.95},
  cond:{"a estrenar":1.05,"bueno":1.02,"regular":0.97,"para remodelar":0.92},
  pisoAsc:{s7:-0.08,s4:-0.05,c9:-0.02,c2:+0.02},
  caps:{u:0.15,d:0.15}
};
async function obtenerTipoCambio(){ return 3.75; }

function areaDepto(aT,aL){ return aT + aL*FACT.area.dpto; }
function areaCasa(aT,aL,aR){ return aT + aL*FACT.area.casa + aR*0.15; }
function areaTerreno(a){ return a*FACT.area.terr; }

function aplicarAntig(v,a){
  if(a<=1) return v*(1+FACT.antig.pN);
  const dep = Math.min(a*FACT.antig.dA,FACT.antig.dM);
  return v*(1-dep);
}
function aplicarDorms(v,D,t){
  if(t==="terreno") return v;
  const b=FACT.dorms.b;
  if(D===b) return v;
  if(D>b){
    const inc=Math.min((D-b)*FACT.dorms.i,FACT.dorms.iM);
    return v*(1+inc);
  } else {
    const dec=Math.min((b-D)*FACT.dorms.d,FACT.dorms.dM);
    return v*(1-dec);
  }
}
function aplicarCond(v,c){ return v*(FACT.cond[c.trim().toLowerCase()]||1); }
function aplicarEfic(v,e){ return v*(FACT.efic[e]||1); }
function ajustePisoAsc(v,p,asc){
  let d=0; const t=asc==="con";
  if(!t&&p>=7) d=FACT.pisoAsc.s7;
  else if(!t&&p>=4) d=FACT.pisoAsc.s4;
  else if(t&&p>=9) d=FACT.pisoAsc.c9;
  else if(t&&p<=2) d=FACT.pisoAsc.c2;
  return v*(1+d);
}
function capTotal(b,v){ 
  const r=v/b, maxU=1+FACT.caps.u, maxD=1-FACT.caps.d;
  return b*Math.min(Math.max(r,maxD),maxU);
}
function rangoTipo(t){ return t==="terreno"?0.06:0.04; }

function formatear(v){
  return new Intl.NumberFormat("es-PE",{minimumFractionDigits:0,maximumFractionDigits:0}).format(v);
}
function limpiarResultados(){
  ["valMin","valMed","valMax"].forEach(id=>{
    const e=$(id); if(e) e.textContent="-";
  });
}
function mostrarError(m){
  const s=$("summary");
  s.textContent=`Error: ${m}`;
  s.style.color="#e74c3c";
}

// ====== CÁLCULO ======
async function calcular(){
  try{
    limpiarResultados();
    const t=$("tipo").value.toLowerCase(),
          dist=$("distrito").value,
          z=$("zona").value;
    const at=parseFloat($("areaConstruida").value)||0,
          al=parseFloat($("areaLibre").value)||0,
          ar=parseFloat($("areaTerreno").value)||0;
    const D=parseInt($("dorms").value)||0,
          p=parseInt($("piso").value)||0,
          asc=$("ascensor").value;
    const antig=parseInt($("antiguedad").value)||0,
          cond=$("estado").value,
          ef=$("eficiencia").value,
          mon=$("moneda").value;
    if(!dist||!z) throw new Error("Seleccione distrito y zona");
    if(!t) throw new Error("Seleccione tipo");
    if(t!=="terreno"&&at<=0) throw new Error("Área construida > 0");
    if(ar<0) throw new Error("Área terreno ≥ 0");
    if(t!=="terreno"&&D<1) throw new Error("≥1 dormitorio");
    if(antig<0) throw new Error("Antigüedad ≥ 0");
    const vm2=buscarVM2(dist,z);
    if(!isFinite(vm2)) throw new Error("vm2 no encontrado");
    let ap= t.includes("departamento")?areaDepto(at,al)
           :t.includes("casa")?areaCasa(at,al,ar)
           :areaTerreno(ar);
    const b0=vm2*ap;
    let val=b0;
    if(t.includes("departamento")) val=ajustePisoAsc(val,p,asc);
    if(t!=="terreno") val=aplicarDorms(val,D,t);
    val=aplicarAntig(val,antig);
    val=aplicarCond(val,cond);
    if(t!=="terreno") val=aplicarEfic(val,ef);
    val=capTotal(b0,val);
    const FX=await obtenerTipoCambio(),
          fx=mon==="$"?1/FX:1,
          r=rangoTipo(t);
    const vmin=val*(1-r)*fx,
          vmed=val*fx,
          vmax=val*(1+r)*fx;
    $("summary").textContent=`Estimación para ${t} en ${z}, ${dist}`;
    $("summary").style.color="#2c3e50";
    $("valMin").textContent=`${mon} ${formatear(vmin)}`;
    $("valMed").textContent=`${mon} ${formatear(vmed)}`;
    $("valMax").textContent=`${mon} ${formatear(vmax)}`;
  }catch(e){
    console.error(e);
    mostrarError(e.message);
  }
}

// ====== INICIALIZACIÓN ======
document.addEventListener("DOMContentLoaded", async ()=>{
  // Cargar tarifas
  try{
    TARIFAS = await apiTariffs();
    const ds = $("distrito"), zs = $("zona");
    if(ds&&zs){
      poblarDistritos();
      ds.addEventListener("change", poblarSubzonas);
    }
  }catch(err){
    console.error("Error tarifas:",err);
  }
  // Validación de licencia
  $("license-form")?.addEventListener("submit", async ev=>{
    ev.preventDefault();
    const em = $("email").value.trim(), lic=$("licenseId").value.trim();
    if(!em||!lic){ setStatus("license-status","Completa email y licencia"); return; }
    setStatus("license-status","Validando...");
    try{
      const r = await apiValidate(em,lic);
      if(r.valid){
        setStatus("license-status",`Licencia válida. Vence: ${r.expiresAt||"N/D"}`,true);
        $("app-section")?.classList.remove("hidden");
      }else setStatus("license-status",r.error||"Licencia inválida");
    }catch(e){
      console.error(e);
      setStatus("license-status",`Fallo: ${e.message}`);
    }
  });
  // Emisión
  $("emitir-btn")?.addEventListener("click",async()=>{
    try{
      setStatus("purchase-status","Emitiendo...");
      const r=await emitirLicencia();
      $("emitir-out").textContent=JSON.stringify(r,null,2);
      if(r.issued) setStatus("purchase-status",`Licencia: ${r.licenseId}`,true);
      else setStatus("purchase-status",r.error||"No emitida");
    }catch(e){
      setStatus("purchase-status",`Fallo: ${e.message}`);
    }
  });
  // Cálculo
  $("calc")?.addEventListener("submit",e=>{ e.preventDefault(); calcular(); });
});














