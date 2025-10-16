// ====== LOGIN / GATE ======
const CLAVE_GLOBAL = "12345";
const gate = document.getElementById('gate');
const appSection = document.getElementById('app-section');
const gateMsg = document.getElementById('gateMsg');
document.getElementById('btnLogin')?.addEventListener('click', () => {
  if (document.getElementById('clave').value === CLAVE_GLOBAL) {
    gate.style.display = 'none';
    appSection.classList.remove('hidden');
    gateMsg.textContent = '';
  } else {
    gateMsg.textContent = 'Clave incorrecta 🚫';
  }
});
document.getElementById('logout')?.addEventListener('click', () => {
  document.getElementById('clave').value = '';
  gate.style.display = 'block';
  appSection.classList.add('hidden');
});

// ====== CONFIG ======
const BASE_URL     = 'https://script.google.com/macros/s/AKfycby9r3ikkEE9PrCBAwueyUph6Xp5-afiifEhKe6dvmc0wP38n5jUwRM8yecDbNg7KyhSMw/exec';
const TARIFF_URL   = `${BASE_URL}?action=tariffs`;
const VALIDATE_URL = `${BASE_URL}?action=validate`;
const ISSUE_URL    = `${BASE_URL}?action=issue`;
const $    = id => document.getElementById(id);
const norm = s => String(s||'').trim().toLowerCase();
const unique = arr => [...new Set(arr)];
window.TARIFAS = [];

// ====== API ======
async function apiTariffs(){
  const r = await fetch(TARIFF_URL);
  if(!r.ok) throw new Error(r.status);
  return (await r.json()).map(t=>({
    distrito: t.distrito.trim(),
    subzona:  t.subzona.trim(),
    valorM2:  Number(String(t.valorM2).replace(/[^\d.]/g,''))
  }));
}

async function apiValidate(email,lic){
  const r = await fetch(`${VALIDATE_URL}&email=${encodeURIComponent(email)}&license=${encodeURIComponent(lic)}`);
  if(!r.ok) throw new Error(r.status);
  return r.json();
}

async function apiIssue(payload){
  const r = await fetch(ISSUE_URL,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
  });
  if(!r.ok) throw new Error(r.status);
  return r.json();
}

async function emitirLicencia(){
  const p = {
    buyerName:$('buyerName').value,
    buyerEmail:$('buyerEmail').value,
    buyerDocType:$('buyerDocType').value,
    buyerDocId:$('buyerDocId').value,
    payMethod:$('payMethod').value,
    amount:$('amount').value,
    voucherUrl:$('operationNumber').value,
    notes:$('notes').value
  };
  return apiIssue(p);
}
if(typeof window!=='undefined') window.emitirLicencia = emitirLicencia;

// ====== UTIL ======
function setStatus(id,msg,ok=false){
  const el=$(id);
  if(!el) return;
  el.textContent=msg;
  el.classList.toggle('ok',ok);
  el.classList.toggle('error',!ok);
}

// ====== FACTORES ======
const FACT = {
  area:{dpto:0.25,casa:0.35,terr:0.80},
  antig:{pN:0.02,dA:0.006,dM:0.12},
  dorms:{b:2,i:0.02,iM:0.04,d:0.03,dM:0.06},
  efic:{A:1.03,B:1.02,C:1.00,D:0.99,E:0.97,F:0.95},
  cond:{"a estrenar":1.05,"bueno":1.02,"regular":0.97,"para remodelar":0.92},
  pisoAsc:{sin7:-0.08,sin4:-0.05,con9:-0.02,con2:+0.02},
  caps:{u:0.15,d:0.15}
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
function aplicarDorms(v,D){
  const b=FACT.dorms.b;
  if(D>b){
    const inc=Math.min((D-b)*FACT.dorms.i,FACT.dorms.iM);
    return v*(1+inc);
  }
  if(D<b){
    const dec=Math.min((b-D)*FACT.dorms.d,FACT.dorms.dM);
    return v*(1-dec);
  }
  return v;
}
function aplicarCond(v,c){ return v*(FACT.cond[c]||1); }
function aplicarEfic(v,e){ return v*(FACT.efic[e]||1); }
function ajustePisoAsc(v,p,asc){
  let d=0,t=asc==='si';
  if(!t&&p>=7) d=FACT.pisoAsc.sin7;
  else if(!t&&p>=4) d=FACT.pisoAsc.sin4;
  else if(t&&p>=9) d=FACT.pisoAsc.con9;
  else if(t&&p<=2) d=FACT.pisoAsc.con2;
  return v*(1+d);
}
function capTotal(b,v){
  const r=v/b,mu=1+FACT.caps.u,md=1-FACT.caps.d;
  return b*Math.min(Math.max(r,md),mu);
}
function rangoTipo(t){ return t==='terreno'?0.06:0.04; }
function formatear(v){
  return new Intl.NumberFormat('es-PE',{minimumFractionDigits:0,maximumFractionDigits:0}).format(v);
}
function limpiarRes(){ ['valMin','valMed','valMax'].forEach(id=>$(id).textContent='-'); }
function mostrarErr(m){ $('summary').textContent=`Error: ${m}`; $('summary').style.color='#e74c3c'; }

// ====== CÁLCULOS ESPECÍFICOS ======
async function calcularDepto(){
  try {
    limpiarRes();
    const dist=$('depto-distrito').value, subz=$('depto-subzona').value;
    const at=parseFloat($('depto-area-techada').value)||0;
    const al=parseFloat($('depto-area-libre').value)||0;
    const piso=parseInt($('depto-piso').value)||0;
    const dorms=parseInt($('depto-dormitorios').value)||0;
    const asc=$('depto-ascensor').value;
    const antig=parseInt($('depto-antiguedad').value)||0;
    const cond=$('depto-condicion').value;
    const ef=$('depto-eficiencia').value;
    if(!dist||!subz) throw new Error('Seleccione distrito/subzona');
    const vm2=window.TARIFAS.find(x=>norm(x.distrito)===norm(dist)&&norm(x.subzona)===norm(subz))?.valorM2;
    if(!vm2) throw new Error('vm2 no encontrado');
    let base=vm2*areaDepto(at,al);
    let v=ajustePisoAsc(base,piso,asc);
    v=aplicarDorms(v,dorms);
    v=aplicarAntig(v,antig);
    v=aplicarCond(v,cond);
    v=aplicarEfic(v,ef);
    v=capTotal(base,v);
    const FX=await obtenerTipoCambio(),fx=1,r=rangoTipo('departamento');
    const vmin=v*(1-r)*fx, vmed=v*fx, vmax=v*(1+r)*fx;
    $('summary').textContent=`Estimación depto en ${subz}, ${dist}`;
    $('summary').style.color='#2c3e50';
    $('valMin').textContent=`S/ ${formatear(vmin)}`;
    $('valMed').textContent=`S/ ${formatear(vmed)}`;
    $('valMax').textContent=`S/ ${formatear(vmax)}`;
  } catch(e){ mostrarErr(e.message); }
}

async function calcularCasa(){
  try {
    limpiarRes();
    const dist=$('casa-distrito').value, subz=$('casa-subzona').value;
    const at=parseFloat($('casa-area-techada').value)||0;
    const al=parseFloat($('casa-area-libre').value)||0;
    const dorms=parseInt($('casa-dormitorios').value)||0;
    const antig=parseInt($('casa-antiguedad').value)||0;
    const cond=$('casa-condicion').value;
    const ef=$('casa-eficiencia').value;
    if(!dist||!subz) throw new Error('Seleccione distrito/subzona');
    const vm2=window.TARIFAS.find(x=>norm(x.distrito)===norm(dist)&&norm(x.subzona)===norm(subz))?.valorM2;
    if(!vm2) throw new Error('vm2 no encontrado');
    let base=vm2*areaCasa(at,al,0);
    let v=base;
    v=aplicarDorms(v,dorms);
    v=aplicarAntig(v,antig);
    v=aplicarCond(v,cond);
    v=aplicarEfic(v,ef);
    v=capTotal(base,v);
    const FX=await obtenerTipoCambio(),fx=1,r=rangoTipo('casa');
    const vmin=v*(1-r)*fx, vmed=v*fx, vmax=v*(1+r)*fx;
    $('summary').textContent=`Estimación casa en ${subz}, ${dist}`;
    $('summary').style.color='#2c3e50';
    $('valMin').textContent=`S/ ${formatear(vmin)}`;
    $('valMed').textContent=`S/ ${formatear(vmed)}`;
    $('valMax').textContent=`S/ ${formatear(vmax)}`;
  } catch(e){ mostrarErr(e.message); }
}

async function calcularTerreno(){
  try {
    limpiarRes();
    const dist=$('terreno-distrito').value, subz=$('terreno-subzona').value;
    const ar=parseFloat($('terreno-area').value)||0;
    const antig=parseInt($('terreno-antiguedad').value)||0;
    if(!dist||!subz) throw new Error('Seleccione distrito/subzona');
    const vm2=window.TARIFAS.find(x=>norm(x.distrito)===norm(dist)&&norm(x.subzona)===norm(subz))?.valorM2;
    if(!vm2) throw new Error('vm2 no encontrado');
    let base=vm2*areaTerreno(ar);
    let v=base;
    v=aplicarAntig(v,antig);
    v=capTotal(base,v);
    const FX=await obtenerTipoCambio(),fx=1,r=rangoTipo('terreno');
    const vmin=v*(1-r)*fx, vmed=v*fx, vmax=v*(1+r)*fx;
    $('summary').textContent=`Estimación terreno en ${subz}, ${dist}`;
    $('summary').style.color='#2c3e50';
    $('valMin').textContent=`S/ ${formatear(vmin)}`;
    $('valMed').textContent=`S/ ${formatear(vmed)}`;
    $('valMax').textContent=`S/ ${formatear(vmax)}`;
  } catch(e){ mostrarErr(e.message); }
}

// ====== INICIALIZACIÓN ======
document.addEventListener('DOMContentLoaded', async ()=>{
  try {
    window.TARIFAS = await apiTariffs();
    console.log('Tarifas cargadas:', window.TARIFAS);
  } catch(e) {
    console.error('Error cargando tarifas:', e);
    return;
  }

  ['depto','casa','terreno'].forEach(pref=>{
    const ds=$(pref+'-distrito'), sz=$(pref+'-subzona');
    if(ds&&sz){
      ds.innerHTML='<option value="">Selecciona distrito</option>';
      unique(window.TARIFAS.map(t=>t.distrito)).sort()
        .forEach(d=> ds.appendChild(Object.assign(document.createElement('option'),{value:d,textContent:d})));
      ds.addEventListener('change',()=>{
        sz.disabled=false;
        sz.innerHTML='<option value="">Selecciona subzona</option>';
        unique(window.TARIFAS.filter(t=>norm(t.distrito)===norm(ds.value)).map(t=>t.subzona))
          .sort().forEach(z=> sz.appendChild(Object.assign(document.createElement('option'),{value:z,textContent:z})));
      });
    }
  });

  $('license-form')?.addEventListener('submit', async ev=>{
    ev.preventDefault();
    const em=$('email').value.trim(), lic=$('licenseId').value.trim();
    if(!em||!lic){ setStatus('license-status','Completa email y licencia'); return; }
    setStatus('license-status','Validando...');
    try {
      const res = await apiValidate(em,lic);
      if(res.valid){
        setStatus('license-status',`Licencia válida. Vence: ${res.expiresAt}`,true);
        appSection.classList.remove('hidden');
      } else {
        setStatus('license-status',res.error||'Licencia inválida');
      }
    } catch(e){
      console.error(e);
      setStatus('license-status',`Error: ${e.message}`);
    }
  });

  $('emitir-btn')?.addEventListener('click', async ()=>{
    setStatus('purchase-status','Emitiendo...');
    try {
      const r = await emitirLicencia();
      $('emitir-out').textContent = JSON.stringify(r,null,2);
      if(r.issued) setStatus('purchase-status',`Licencia: ${r.licenseId}`,true);
      else setStatus('purchase-status',r.error||'No emitida');
    } catch(e){
      console.error(e);
      setStatus('purchase-status',`Error: ${e.message}`);
    }
  });

  $('form-depto').querySelector('button').addEventListener('click', calcularDepto);
  $('form-casa').querySelector('button').addEventListener('click', calcularCasa);
  $('form-terreno').querySelector('button').addEventListener('click', calcularTerreno);
});






















