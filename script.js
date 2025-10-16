// ====== LOGIN / GATE ======
const CLAVE_GLOBAL = "12345";
const gate = document.getElementById('gate');
const appSection = document.getElementById('app-section');
const gateMsg = document.getElementById('gateMsg');
const btnLogin = document.getElementById('btnLogin');
const logout = document.getElementById('logout');

btnLogin?.addEventListener('click', () => {
  const clave = document.getElementById('clave')?.value;
  if (clave === CLAVE_GLOBAL) {
    gate.style.display = 'none';
    appSection.classList.remove('hidden');
    gateMsg.textContent = '';
  } else {
    gateMsg.textContent = 'Clave incorrecta 🚫';
  }
});

logout?.addEventListener('click', () => {
  document.getElementById('clave').value = '';
  gate.style.display = 'block';
  appSection.classList.add('hidden');
});

// ====== CONFIG BACKEND ======
const BASE_URL     = 'https://script.google.com/macros/s/AKfycby9r3ikkEE9PrCBAwueyUph6Xp5-afiifEhKe6dvmc0wP38n5jUwRM8yecDbNg7KyhSMw/exec';
const TARIFF_URL   = `${BASE_URL}?action=tariffs`;
const VALIDATE_URL = `${BASE_URL}?action=validate`;
const ISSUE_URL    = `${BASE_URL}?action=issue`;

const $    = id => document.getElementById(id);
const norm = s  => String(s||'').trim().toLowerCase();
const unique = arr => [...new Set(arr)];

// Exponer TARIFAS globalmente para depuración
window.TARIFAS = [];

// ====== API ======
async function apiTariffs() {
  const r = await fetch(TARIFF_URL);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  return data.map(t => ({
    distrito: t.distrito.trim(),
    subzona:  t.subzona.trim(),
    valorM2:  Number(String(t.valorM2).replace(/[^\d.]/g, ''))
  }));
}

async function apiValidate(email, license) {
  const r = await fetch(`${VALIDATE_URL}&email=${encodeURIComponent(email)}&license=${encodeURIComponent(license)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function apiIssue(payload) {
  const r = await fetch(ISSUE_URL, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function emitirLicencia() {
  const payload = {
    buyerName:   $('buyerName')?.value || '',
    buyerEmail:  $('buyerEmail')?.value || '',
    buyerDocType:$('buyerDocType')?.value|| '',
    buyerDocId:  $('buyerDocId')?.value  || '',
    payMethod:   $('payMethod')?.value   || '',
    amount:      $('amount')?.value      || '',
    voucherUrl:  $('operationNumber')?.value|| '',
    notes:       $('notes')?.value       || ''
  };
  return apiIssue(payload);
}
if (typeof window !== 'undefined') window.emitirLicencia = emitirLicencia;

// ====== UTIL ======
function setStatus(id,msg,ok=false){
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('ok', ok);
  el.classList.toggle('error', !ok);
}

// ====== CÁLCULO ======
// Factores y funciones de valuación (idénticos a los tuyos)
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
  if(t==='terreno') return v;
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
  let d=0, tiene = asc==='si';
  if(!tiene&&p>=7) d=FACT.pisoAsc.sin7;
  else if(!tiene&&p>=4) d=FACT.pisoAsc.sin4;
  else if(tiene&&p>=9) d=FACT.pisoAsc.con9;
  else if(tiene&&p<=2) d=FACT.pisoAsc.con2;
  return v*(1+d);
}
function capTotal(b,v){
  const r=v/b, maxU=1+FACT.caps.u, maxD=1-FACT.caps.d;
  return b*Math.min(Math.max(r,maxD),maxU);
}
function rangoTipo(t){ return t==='terreno'?0.06:0.04; }
function formatear(v){
  return new Intl.NumberFormat('es-PE',{minimumFractionDigits:0,maximumFractionDigits:0}).format(v);
}
function limpiarResultados(){
  ['valMin','valMed','valMax'].forEach(id=>{
    const el=$(id); if(el) el.textContent='-';
  });
}
function mostrarError(m){
  const s=$('summary');
  s.textContent = `Error: ${m}`;
  s.style.color = '#e74c3c';
}
async function calcular(){
  try {
    limpiarResultados();
    // Determina qué formulario está visible
    let pref = '';
    if (!$('form-depto').classList.contains('hidden')) pref = 'depto';
    else if (!$('form-casa').classList.contains('hidden')) pref = 'casa';
    else pref = 'terreno';
    // IDs dinámicos
    const tipo = $(pref+'-tipo')?.value.toLowerCase() || '';
    const dist = $(pref+'-distrito')?.value;
    const subz = $(pref+'-subzona')?.value;
    const at   = parseFloat($(pref+'-area-techada')?.value)||0;
    const al   = parseFloat($(pref+'-area-libre')?.value)||0;
    const ar   = parseFloat($(pref+'-area')?.value)||0;
    const d    = parseInt($(pref+'-dormitorios')?.value)||0;
    const piso = parseInt($(pref+'-piso')?.value)||0;
    const asc  = $(pref+'-ascensor')?.value;
    const antig= parseInt($(pref+'-antiguedad')?.value)||0;
    const cond = $(pref+'-condicion')?.value;
    const ef   = $(pref+'-eficiencia')?.value;
    const mon  = $('moneda')?.value || 'S/';
    if(!dist||!subz) throw new Error('Seleccione distrito y subzona');
    const vm2 = window.TARIFAS.find(x=> norm(x.distrito)===norm(dist)&&norm(x.subzona)===norm(subz))?.valorM2;
    if(!isFinite(vm2)) throw new Error('vm2 no encontrado');
    let ap = tipo.includes('departamento')   ? areaDepto(at,al)
           : tipo.includes('casa')         ? areaCasa(at,al,ar)
           : areaTerreno(ar);
    let val = vm2 * ap;
    if(tipo.includes('departamento')) val = ajustePisoAsc(val,piso,asc);
    if(tipo!=='terreno') val = aplicarDorms(val,d,tipo);
    val = aplicarAntig(val,antig);
    val = aplicarCond(val,cond);
    if(tipo!=='terreno') val = aplicarEfic(val,ef);
    val = capTotal(vm2*ap,val);
    const FX = await obtenerTipoCambio(), fx = mon==='$'?1/FX:1, r = rangoTipo(tipo);
    const vmin = val*(1-r)*fx, vmed = val*fx, vmax = val*(1+r)*fx;
    $('summary').textContent = `Estimación para ${tipo} en ${subz}, ${dist}`;
    $('summary').style.color = '#2c3e50';
    $('valMin').textContent = `${mon} ${formatear(vmin)}`;
    $('valMed').textContent = `${mon} ${formatear(vmed)}`;
    $('valMax').textContent = `${mon} ${formatear(vmax)}`;
  } catch(e) {
    console.error(e);
    mostrarError(e.message);
  }
}

// ====== INICIALIZACIÓN ======
document.addEventListener('DOMContentLoaded', async () => {
  // 1) Cargar tarifas
  try {
    window.TARIFAS = await apiTariffs();
  } catch(e) {
    console.error('Error cargando tarifas:', e);
    return;
  }
  console.log('Tarifas cargadas:', window.TARIFAS);

  // 2) Poblar pares de selects
  ['depto','casa','terreno'].forEach(pref => {
    const ds = $(`${pref}-distrito`), sz = $(`${pref}-subzona`);
    if(ds && sz) {
      ds.innerHTML = '<option value="">Selecciona distrito</option>';
      unique(window.TARIFAS.map(t=>t.distrito)).sort()
        .forEach(d => ds.appendChild(Object.assign(document.createElement('option'), { value:d, textContent:d })));
      ds.addEventListener('change', () => {
        sz.disabled = false;
        sz.innerHTML = '<option value="">Selecciona subzona</option>';
        unique(window.TARIFAS.filter(t=>norm(t.distrito)===norm(ds.value)).map(t=>t.subzona))
          .sort()
          .forEach(z=> sz.appendChild(Object.assign(document.createElement('option'), { value:z, textContent:z })));
      });
    }
  });

  // 3) Validación de licencia
  $('license-form')?.addEventListener('submit', async ev => {
    ev.preventDefault();
    const em = $('email').value.trim(), lic = $('licenseId').value.trim();
    if(!em||!lic){ setStatus('license-status','Completa email y licencia'); return; }
    setStatus('license-status','Validando...');
    try {
      const res = await apiValidate(em,lic);
      if(res.valid) {
        setStatus('license-status',`Licencia válida. Vence: ${res.expiresAt}`,true);
      } else {
        setStatus('license-status',res.error||'Licencia inválida');
        return;
      }
    } catch(err) {
      console.error(err);
      setStatus('license-status',`Error: ${err.message}`);
      return;
    }
  });

  // 4) Emisión de licencia
  $('emitir-btn')?.addEventListener('click', async () => {
    setStatus('purchase-status','Emitiendo...');
    try {
      const r = await emitirLicencia();
      $('emitir-out').textContent = JSON.stringify(r,null,2);
      if(r.issued) setStatus('purchase-status',`Licencia: ${r.licenseId}`,true);
      else setStatus('purchase-status',r.error||'No emitida');
    } catch(err) {
      console.error(err);
      setStatus('purchase-status',`Error: ${err.message}`);
    }
  });

  // 5) Evitar recarga en los formularios de cálculo
  ['form-depto','form-casa','form-terreno'].forEach(id => {
    const f = document.getElementById(id);
    if(f) f.addEventListener('submit', ev => { ev.preventDefault(); calcular(); });
  });
});




















