// ====== LOGIN / GATE ======
const CLAVE_GLOBAL = "12345";
const gate = document.getElementById('gate');
const app = document.getElementById('app');
const gateMsg = document.getElementById('gateMsg');
const btnLogin = document.getElementById('btnLogin');
const logout = document.getElementById('logout');

btnLogin && btnLogin.addEventListener('click', () => {
  const clave = document.getElementById('clave').value;
  if (clave === CLAVE_GLOBAL) {
    gate.style.display = 'none';
    app.style.display = 'block';
  } else {
    gateMsg.textContent = "Clave incorrecta 🚫";
  }
});
logout && logout.addEventListener('click', () => {
  app.style.display = 'none';
  gate.style.display = 'block';
  document.getElementById('clave').value = "";
});

// ====== CONFIG BACKEND ======
const BASE_URL     = "https://script.google.com/macros/s/AKfycby9r3ikkEE9PrCBAwueyUph6Xp5-afiifEhKe6dvmc0wP38n5jUwRM8yecDbNg7KyhSMw/exec";
const TARIFF_URL   = `${BASE_URL}?action=tariffs`;
const VALIDATE_URL = `${BASE_URL}?action=validate`;
const ISSUE_URL    = `${BASE_URL}?action=issue`;

const $    = id => document.getElementById(id);
const norm = s  => String(s||"").trim().toLowerCase();
const unique = arr => Array.from(new Set(arr));

// ====== ESTADO (exponer globalmente) ======
window.TARIFAS = [];

// ====== API ======
async function apiTariffs() {
  const r = await fetch(TARIFF_URL);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  return data.map(t=>({
    distrito: t.distrito.trim(),
    subzona:  t.subzona.trim(),
    valorM2:  Number(String(t.valorM2).replace(/[^\d.]/g,""))
  }));
}

async function apiValidate(email, license) {
  const r = await fetch(`${VALIDATE_URL}&email=${encodeURIComponent(email)}&license=${encodeURIComponent(license)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function apiIssue(payload) {
  const r = await fetch(ISSUE_URL, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function emitirLicencia() {
  const payload = {
    buyerName:   $("buyerName")?.value   || "",
    buyerEmail:  $("buyerEmail")?.value  || "",
    buyerDocType:$("buyerDocType")?.value|| "",
    buyerDocId:  $("buyerDocId")?.value  || "",
    payMethod:   $("payMethod")?.value   || "",
    amount:      $("amount")?.value      || "",
    voucherUrl:  $("operationNumber")?.value||"",
    notes:       $("notes")?.value       || ""
  };
  return apiIssue(payload);
}
if (typeof window !== "undefined") window.emitirLicencia = emitirLicencia;

// ====== UTIL ======
function setStatus(id,msg,ok=false){
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('ok', ok);
  el.classList.toggle('error', !ok);
}

// ====== FACTORES CONSERVADORES ======
const FACT = {
  area:  { dpto:0.25, casa:0.35, terr:0.80 },
  antig: { pN:0.02, dA:0.006, dM:0.12 },
  dorms:{ b:2,i:0.02,iM:0.04,d:0.03,dM:0.06 },
  efic: { A:1.03,B:1.02,C:1.00,D:0.99,E:0.97,F:0.95 },
  cond:{"a estrenar":1.05,"bueno":1.02,"regular":0.97,"para remodelar":0.92},
  pisoAsc:{ sin7:-0.08,sin4:-0.05,con9:-0.02,con2:+0.02 },
  caps: { u:0.15,d:0.15 }
};

async function obtenerTipoCambio(){ return 3.75; }

function areaDepto(at,al){ return at + al*FACT.area.dpto; }
function areaCasa(at,al,ar=0){ return at + al*FACT.area.casa + ar*0.15; }
function areaTerreno(a){ return a*FACT.area.terr; }

function aplicarAntig(v,a){
  if(a<=1) return v*(1+FACT.antig.pN);
  const dep=Math.min(a*FACT.antig.dA,FACT.antig.dM);
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
  let d=0; const t=asc==="si";
  if(!t&&p>=7) d=FACT.pisoAsc.sin7;
  else if(!t&&p>=4) d=FACT.pisoAsc.sin4;
  else if(t&&p>=9) d=FACT.pisoAsc.con9;
  else if(t&&p<=2) d=FACT.pisoAsc.con2;
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
    const el=$(id); if(el) el.textContent="-";
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
          d=$("distrito").value,
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
    if(!d||!z) throw new Error("Seleccione distrito y zona");
    if(!t) throw new Error("Seleccione tipo");
    if(t!=="terreno"&&at<=0) throw new Error("Área construida >0");
    if(ar<0) throw new Error("Área terreno ≥0");
    if(t!=="terreno"&&D<1) throw new Error("≥1 dormitorio");
    if(antig<0) throw new Error("Antigüedad ≥0");
    const vm2=buscarVM2(d,z);
    if(!isFinite(vm2)) throw new Error("vm2 no encontrado");
    let ap=t.includes("departamento")?areaDepto(at,al)
           :t.includes("casa")?areaCasa(at,al,ar)
           :areaTerreno(ar);
    const b0=vm2*ap;
    let v=b0;
    if(t.includes("departamento")) v=ajustePisoAsc(v,p,asc);
    if(t!=="terreno") v=aplicarDorms(v,D,t);
    v=aplicarAntig(v,antig);
    v=aplicarCond(v,cond);
    if(t!=="terreno") v=aplicarEfic(v,ef);
    v=capTotal(b0,v);
    const FX=await obtenerTipoCambio(),
          fx=mon==="$"?1/FX:1,
          r=rangoTipo(t);
    const vmin=v*(1-r)*fx,
          vmed=v*fx,
          vmax=v*(1+r)*fx;
    $("summary").textContent=`Estimación para ${t} en ${z}, ${d}`;
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
document.addEventListener('DOMContentLoaded', async ()=>{
  // 1) Cargar tarifas y exponerlas globalmente
  try {
    window.TARIFAS = await apiTariffs();
    console.log("Tarifas cargadas:", window.TARIFAS);
  } catch(e){
    console.error("Error cargando tarifas:", e);
    return;
  }

  // 2) Poblar los tres pares de selects
  ['depto','casa','terreno'].forEach(tipo=>{
    const dsel=$( `${tipo}-distrito` ), ssel=$( `${tipo}-subzona` );
    if (dsel && ssel) {
      // Distritos
      dsel.innerHTML = '<option value="">Selecciona distrito</option>';
      unique(window.TARIFAS.map(t=>t.distrito)).sort().forEach(d=>{
        const o = document.createElement('option');
        o.value=d; o.textContent=d;
        dsel.appendChild(o);
      });
      console.log(`${tipo}-distrito options:`, Array.from(dsel.options).map(o=>o.value));

      // Al cambiar, poblar subzonas
      dsel.addEventListener('change', ()=>{
        ssel.disabled = false;
        ssel.innerHTML = '<option value="">Selecciona subzona</option>';
        unique(
          window.TARIFAS.filter(t=>norm(t.distrito)===norm(dsel.value))
                         .map(t=>t.subzona)
        ).sort().forEach(z=>{
          const o = document.createElement('option');
          o.value=z; o.textContent=z;
          ssel.appendChild(o);
        });
        console.log(`${tipo}-subzona options:`, Array.from(ssel.options).map(o=>o.value));
      });
    }
  });

  // 3) Validación licencia
  $("license-form")?.addEventListener('submit', async ev=>{
    ev.preventDefault();
    const em=$("email").value.trim(), lic=$("licenseId").value.trim();
    if(!em||!lic){ setStatus("license-status","Completa email y license"); return; }
    setStatus("license-status","Validando...");
    try{
      const r=await apiValidate(em,lic);
      if(r.valid){
        setStatus("license-status",`Licencia válida. Vence: ${r.expiresAt}`,true);
        $("app-section")?.classList.remove("hidden");
      } else setStatus("license-status",r.error||"Licencia inválida");
    }catch(err){
      console.error(err);
      setStatus("license-status",`Error: ${err.message}`);
    }
  });

  // 4) Emisión
  $("emitir-btn")?.addEventListener('click', async ()=>{
    setStatus("purchase-status","Emitiendo...");
    try{
      const r=await emitirLicencia();
      $("emitir-out").textContent=JSON.stringify(r,null,2);
      if(r.issued) setStatus("purchase-status",`Licencia: ${r.licenseId}`,true);
      else setStatus("purchase-status",r.error||"No emitida");
    }catch(err){
      console.error(err);
      setStatus("purchase-status",`Error: ${err.message}`);
    }
  });

  // 5) Cálculo
  $("calc")?.addEventListener('submit', e=>{
    e.preventDefault();
    calcular();
  });
});

















