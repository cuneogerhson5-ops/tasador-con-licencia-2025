<script>
  // ====== CONFIG ======
  const BASE_URL     = 'https://script.google.com/macros/s/AKfycby9r3ikkEE9PrCBAwueyUph6Xp5-afiifEhKe6dvmc0wP38n5jUwRM8yecDbNg7KyhSMw/exec';
  const TARIFF_URL   = `${BASE_URL}?action=tariffs`;
  const VALIDATE_URL = `${BASE_URL}?action=validate`;
  const ISSUE_URL    = `${BASE_URL}?action=issue`;
  const $ = id => document.getElementById(id);
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
  async function obtenerTipoCambio(){ 
    return 3.50; 
  }

  // ====== UTIL ======
  function setStatus(id,msg,ok=false){
    const el=$(id);
    if(!el) return;
    el.textContent=msg;
    el.classList.toggle('ok',ok);
    el.classList.toggle('error',!ok);
  }

  // ====== FACTORES & CÁLCULO ======
  const FACT = {
    area:   { dpto:0.30, casa:0.40, terr:0.75 },
    antig:  { pN:0.03, dA:0.005, dM:0.10 },
    dorms:  { b:2, i:0.025, iM:0.05, d:0.035, dM:0.07 },
    efic:   { A:1.05, B:1.03, C:1.00, D:0.98, E:0.96, F:0.93 },
    cond:   { "a estrenar":1.06, "bueno":1.03, "regular":0.98, "para remodelar":0.90 },
    pisoAsc:{ sin7:-0.07, sin4:-0.04, con9:-0.015, con2:+0.025 },
    caps:   { u:0.12, d:0.12 }
  };
  function areaDepto(at,al){ return at + al*FACT.area.dpto; }
  function areaCasa(at,al){ return at + al*FACT.area.casa; }
  function areaTerreno(a){ return a*FACT.area.terr; }
  function aplicarAntig(v,a){
    if(a<=1) return v*(1+FACT.antig.pN);
    const dep=Math.min(a*FACT.antig.dA,FACT.antig.dM);
    return v*(1-dep);
  }
  function aplicarDorms(v,D){
    const b=FACT.dorms.b;
    if(D>b) return v*(1+Math.min((D-b)*FACT.dorms.i,FACT.dorms.iM));
    if(D<b) return v*(1-Math.min((b-D)*FACT.dorms.d,FACT.dorms.dM));
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
    const r=v/b, mu=1+FACT.caps.u, md=1-FACT.caps.d;
    return b*Math.min(Math.max(r,md),mu);
  }
  function formatear(v){
    return new Intl.NumberFormat('es-PE',{minimumFractionDigits:0,maximumFractionDigits:0}).format(v);
  }
  function limpiarRes(){
    ['valMin','valMed','valMax','valMinUsd','valMedUsd','valMaxUsd'].forEach(id=>{
      const e=$(id); if(e) e.textContent='-';
    });
  }
  function mostrarErr(m){
    $('summary').textContent=`Error: ${m}`;
    $('summary').style.color='#e74c3c';
  }

  // ====== POBLAR SELECTS ======
  async function cargarTarifas(){
    try {
      window.TARIFAS = await apiTariffs();
      ['depto','casa','terreno'].forEach(pref=>{
        const ds = $(`${pref}-distrito`), sz = $(`${pref}-subzona`);
        ds.innerHTML = '<option value="">Selecciona distrito</option>';
        unique(window.TARIFAS.map(t=>t.distrito)).sort()
          .forEach(d=> ds.appendChild(new Option(d,d)));
        ds.onchange = () => {
          sz.disabled = false;
          sz.innerHTML = '<option value="">Selecciona subzona</option>';
          unique(window.TARIFAS.filter(t=>norm(t.distrito)===norm(ds.value)).map(t=>t.subzona))
            .sort().forEach(z=> sz.appendChild(new Option(z,z)));
        };
      });
    } catch(e){
      console.error('Error tarifas:',e);
    }
  }

  // ====== CÁLCULO ======
  async function calcular(pref){
    try {
      limpiarRes();
      const dist=$(`${pref}-distrito`).value, subz=$(`${pref}-subzona`).value;
      if(!dist||!subz) throw new Error('Seleccione distrito y subzona');
      const vm2 = window.TARIFAS.find(t=>norm(t.distrito)===norm(dist)&&norm(t.subzona)===norm(subz))?.valorM2;
      if(!vm2) throw new Error('vm2 no encontrado');
      let base=0, v=0;

      if(pref==='depto'){
        const at=parseFloat($('depto-area-techada').value)||0;
        const al=parseFloat($('depto-area-libre').value)||0;
        const piso=parseInt($('depto-piso').value)||0;
        const dorms=parseInt($('depto-dormitorios').value)||0;
        const asc=$('depto-ascensor').value;
        const cond=$('depto-condicion').value;
        const ef=$('depto-eficiencia').value;
        const antig=parseInt($('depto-antiguedad').value)||0;
        base = vm2 * areaDepto(at,al);
        v = ajustePisoAsc(base,piso,asc);
        v = aplicarDorms(v,dorms);
        v = aplicarAntig(v,antig);
        v = aplicarCond(v,cond);
        v = aplicarEfic(v,ef);

      } else if(pref==='casa'){
        const at=parseFloat($('casa-area-techada').value)||0;
        const al=parseFloat($('casa-area-libre').value)||0;
        const dorms=parseInt($('casa-dormitorios').value)||0;
        const cond=$('casa-condicion').value;
        const ef=$('casa-eficiencia').value;
        const antig=parseInt($('casa-antiguedad').value)||0;
        base = vm2 * areaCasa(at,al);
        v = aplicarDorms(base,dorms);
        v = aplicarAntig(v,antig);
        v = aplicarCond(v,cond);
        v = aplicarEfic(v,ef);

      } else {
        const ar=parseFloat($('terreno-area').value)||0;
        const antig=parseInt($('terreno-antiguedad').value)||0;
        base = vm2 * areaTerreno(ar);
        v = aplicarAntig(base,antig);
      }

      v = capTotal(base,v);
      const FX = await obtenerTipoCambio();
      const r = pref==='terreno'?0.06:0.04;
      const vmin=v*(1-r), vmed=v, vmax=v*(1+r);

      $('summary').textContent = `Estimación ${pref} en ${subz}, ${dist}`;
      $('summary').style.color = '#2c3e50';
      $('valMin').textContent = `S/ ${formatear(vmin)}`;
      $('valMed').textContent = `S/ ${formatear(vmed)}`;
      $('valMax').textContent = `S/ ${formatear(vmax)}`;

      $('valMinUsd').textContent = `$ ${Math.round(vmin/FX).toLocaleString('en-US')}`;
      $('valMedUsd').textContent = `$ ${Math.round(vmed/FX).toLocaleString('en-US')}`;
      $('valMaxUsd').textContent = `$ ${Math.round(vmax/FX).toLocaleString('en-US')}`;

    } catch(e){
      mostrarErr(e.message);
    }
  }

  // ====== EVENTOS ======
  document.getElementById('license-form').addEventListener('submit', async ev=>{
    ev.preventDefault();
    const email=$('email').value.trim(), lic=$('licenseId').value.trim();
    if(!email||!lic){ setStatus('license-status','Completa email y licencia'); return; }
    setStatus('license-status','Validando...');
    try {
      const res = await apiValidate(email,lic);
      if(res.valid){
        setStatus('license-status',`Licencia válida. Vence: ${res.expiresAt}`,true);
        cargarTarifas();
      } else {
        setStatus('license-status',res.error||'Licencia inválida');
      }
    } catch(e){
      setStatus('license-status',`Error: ${e.message}`);
    }
  });

  document.getElementById('calc-depto').addEventListener('click', ()=>calcular('depto'));
  document.getElementById('calc-casa').addEventListener('click', ()=>calcular('casa'));
  document.getElementById('calc-terreno').addEventListener('click', ()=>calcular('terreno'));
</script>
























