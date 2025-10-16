// URL backend
const BASE_URL     = 'https://script.google.com/macros/s/AKfycby9r3ikkEE9PrCBAwueyUph6Xp5-afiifEhKe6dvmc0wP38n5jUwRM8yecDbNg7KyhSMw/exec';
const TARIFF_URL   = `${BASE_URL}?action=tariffs`;
const VALIDATE_URL = `${BASE_URL}?action=validate`;
const $ = id => document.getElementById(id);
const norm = s => String(s||'').trim().toLowerCase();
const unique = arr => [...new Set(arr)];
let DATA = {}; // carga de tarifas

// Factores
const FACT = {
  areaLibre:{ departamento:0.25, casa:0.40, terreno:0.90 },
  antig:{ pN:0.02, dA:0.006, dM:0.12 },
  dorms:{ b:2, i:0.02, iM:0.04, d:0.03, dM:0.06 },
  banos:{ b:2, i:0.06, d:0.15, m:0.18 },
  pisoAsc:{ sin7:0.70, sin4:0.85, con9:1.05, con2:1.10 },
  efic:{ A:1.10,B:1.05,C:1.00,D:0.95,E:0.90,F:0.85 },
  estado:{ excelente:1.05, bueno:1.00, regular:0.90, remodelar:0.75 },
  tipo:{ departamento:1.00, casa:1.12, terreno:0.80 }
};

// APIs
async function apiTariffs(){
  const r = await fetch(TARIFF_URL);
  if(!r.ok) throw Error(r.status);
  return await r.json();
}
async function apiValidate(email,lic){
  const r = await fetch(`${VALIDATE_URL}&email=${encodeURIComponent(email)}&license=${encodeURIComponent(lic)}`);
  if(!r.ok) throw Error(r.status);
  return r.json();
}
async function obtenerTipoCambio(){ return 3.75; }

// Mostrar error
function mostrarError(msg){
  const s = $('summary');
  s.textContent = msg;
  s.style.color = '#e74c3c';
}

// Limpiar resultados
function limpiar(){
  ['valMin','valMed','valMax'].forEach(id=>$(id).textContent='-');
  $('summary').textContent = 'Resultados';
  $('summary').style.color='#2c3e50';
}

// Carga distritos y zonas
async function initTariffs(){
  const arr = await apiTariffs();
  // transforma a { distrito:{ zones:{...} } }
  arr.forEach(t=>{
    if(!DATA[t.distrito]) DATA[t.distrito]={ zones:{} };
    DATA[t.distrito].zones[t.subzona]=t.valorM2;
  });
  // llena select distrito
  const ds = $('distrito');
  unique(arr.map(x=>x.distrito)).sort().forEach(d=>{
    ds.append(new Option(d,d));
  });
}

// Login con correo+licencia
document.getElementById('login-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const em = $('email').value.trim(), lic = $('licenseId').value.trim();
  if(!em||!lic){ mostrarError('Correo y licencia requeridos'); return; }
  $('gateMsg').textContent = 'Validando...';
  try {
    const res = await apiValidate(em,lic);
    if(res.valid){
      $('gate').style.display='none';
      $('app').style.display='block';
      initTariffs();
      $('gateMsg').textContent='';
    } else {
      mostrarError(res.error||'Licencia inválida');
    }
  } catch(err){
    mostrarError('Error de validación');
  }
});

// Logout
$('logout').onclick = ()=> location.reload();

// Ajustar visibilidad
$('tipo').addEventListener('change',()=>{
  const t=$('tipo').value.toLowerCase();
  ['areaConstruida','areaLibre','areaTerreno','dorms','baths','piso','ascensor']
    .forEach(id=>document.getElementById(id+'-group').style.display='none');
  if(t==='departamento'){
    ['areaConstruida','areaLibre','dorms','baths','piso','ascensor']
      .forEach(id=>document.getElementById(id+'-group').style.display='block');
  } else if(t==='casa'){
    ['areaConstruida','areaLibre','areaTerreno','dorms','baths']
      .forEach(id=>document.getElementById(id+'-group').style.display='block');
  } else if(t==='terreno'){
    ['areaTerreno'].forEach(id=>document.getElementById(id+'-group').style.display='block');
  }
});

// Zonas según distrito
$('distrito').addEventListener('change',()=>{
  const d=$('distrito').value, zs=$('zona');
  zs.innerHTML='<option value="">Selecciona una zona</option>';
  if(DATA[d]){
    Object.keys(DATA[d].zones).forEach(z=>{
      zs.append(new Option(z,z));
    });
  }
});

// Cálculo principal
$('calc').addEventListener('submit',async e=>{
  e.preventDefault();
  limpiar();
  try {
    const datos = {
      tipo: $('tipo').value.toLowerCase(),
      distrito: $('distrito').value,
      zona: $('zona').value,
      areaConstruida: parseFloat($('areaConstruida').value)||0,
      areaLibre: parseFloat($('areaLibre').value)||0,
      areaTerreno: parseFloat($('areaTerreno').value)||0,
      dorms: parseInt($('dorms').value)||0,
      baths: parseInt($('baths').value)||0,
      piso: parseInt($('piso').value)||0,
      asc: $('ascensor').value==='con',
      antig: parseInt($('antiguedad').value)||0,
      efic: $('eficiencia').value,
      est: $('estado').value,
      mon: $('moneda').value
    };
    // validaciones básicas
    if(!datos.tipo||!datos.distrito||!datos.zona){
      mostrarError('Tipo, distrito y zona obligatorios'); return;
    }
    const m2 = DATA[datos.distrito].zones[datos.zona];
    let area = 0;
    if(datos.tipo==='departamento'){
      area = datos.areaConstruida + datos.areaLibre*FACT.areaLibre.departamento;
    } else if(datos.tipo==='casa'){
      area = datos.areaConstruida + datos.areaLibre*FACT.areaLibre.casa + datos.areaTerreno*0.20;
    } else {
      area = datos.areaTerreno*FACT.areaLibre.terreno;
    }
    let valor = m2 * area;
    // antigüedad
    if(datos.antig<=1) valor *= (1+FACT.antig.pN);
    else valor *= (1 - Math.min(datos.antig*FACT.antig.dA, FACT.antig.dM));
    // dormitorios y baños
    if(datos.tipo!=='terreno'){
      if(datos.dorms>FACT.dorms.b){
        valor *= 1+Math.min((datos.dorms-FACT.dorms.b)*FACT.dorms.i, FACT.dorms.iM);
      } else if(datos.dorms<FACT.dorms.b){
        valor *= 1-Math.min((FACT.dorms.b-datos.dorms)*FACT.dorms.d, FACT.dorms.dM);
      }
      if(datos.baths>FACT.banos.b){
        valor *= 1+Math.min((datos.baths-FACT.banos.b)*FACT.banos.i, FACT.banos.m);
      } else if(datos.baths<FACT.banos.b){
        valor *= 1-((FACT.banos.b-datos.baths)*FACT.banos.d);
      }
    }
    // piso/ascensor
    if(datos.tipo==='departamento'){
      let f=1;
      if(datos.asc){
        f *= FACT.pisoAsc.con2;
        if(datos.piso>=9) f = FACT.pisoAsc.con9;
      } else {
        if(datos.piso>=7) f = FACT.pisoAsc.sin7;
        else if(datos.piso>=4) f = FACT.pisoAsc.sin4;
      }
      valor *= f;
    }
    // eficiencia y estado
    valor *= FACT.efic[datos.efic]||1;
    valor *= FACT.estado[datos.est]||1;
    // tipo inmueble
    valor *= FACT.tipo[datos.tipo]||1;
    // rango ±10%
    const rango = 0.10;
    const vMin = valor*(1-rango), vMax = valor*(1+rango);
    // conversión
    const FX = await obtenerTipoCambio();
    const conv = datos.mon==='$'?1/FX:1;
    const fmt = v=> new Intl.NumberFormat('es-PE',{maximumFractionDigits:0}).format(v);
    $('summary').textContent = `Estimación ${datos.tipo} en ${datos.zona}, ${datos.distrito}`;
    $('valMin').textContent = datos.mon+' '+fmt(vMin*conv);
    $('valMed').textContent = datos.mon+' '+fmt(valor*conv);
    $('valMax').textContent = datos.mon+' '+fmt(vMax*conv);
  } catch(err){
    console.error(err);
    mostrarError('Error en el cálculo');
  }
});

























