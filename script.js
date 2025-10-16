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

// ====== CONFIGURATION ======
const BASE_URL    = "https://script.google.com/macros/s/AKfycby9r3ikkEE9PrCBAwueyUph6Xp5-afiifEhKe6dvmc0wP38n5jUwRM8yecDbNg7KyhSMw/exec";
const TARIFF_URL  = `${BASE_URL}?action=tariffs`;
const VALIDATE_URL= `${BASE_URL}?action=validate`;
const ISSUE_URL   = `${BASE_URL}?action=issue`;

const $ = id => document.getElementById(id);
const norm = s => String(s||"").trim().toLowerCase();
const unique = arr => Array.from(new Set(arr));

let TARIFAS = [];

// ====== API FUNCTIONS ======
async function apiTariffs() {
  const r = await fetch(TARIFF_URL);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  return data.map(t => ({
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
    buyerName: $("buyerName")?.value||"",
    buyerEmail:$("buyerEmail")?.value||"",
    buyerDocType:$("buyerDocType")?.value||"",
    buyerDocId:  $("buyerDocId")?.value||"",
    payMethod:   $("payMethod")?.value||"",
    amount:      $("amount")?.value||"",
    voucherUrl:  $("operationNumber")?.value||"",
    notes:       $("notes")?.value||""
  };
  return apiIssue(payload);
}

// ====== UTILITIES ======
function setStatus(id,msg,ok=false){
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('ok', ok);
  el.classList.toggle('error', !ok);
}

// ====== POPULATE SELECTS ======
function poblarDistritos() {
  const selD = $("distrito"), selZ = $("zona");
  if (!selD || !selZ) return;
  selD.innerHTML = '<option value="">Selecciona distrito</option>';
  unique(TARIFAS.map(t=>t.distrito)).sort()
    .forEach(d=>{
      const o = document.createElement('option');
      o.value=d; o.textContent=d;
      selD.appendChild(o);
    });
  selD.addEventListener('change', ()=>{
    selZ.innerHTML = '<option value="">Selecciona zona</option>';
    unique(
      TARIFAS.filter(t=>norm(t.distrito)===norm(selD.value))
        .map(t=>t.subzona)
    ).sort().forEach(z=>{
      const o = document.createElement('option');
      o.value=z; o.textContent=z;
      selZ.appendChild(o);
    });
  });
}

// ====== INITIALIZATION ======
document.addEventListener('DOMContentLoaded', async ()=>{
  try {
    TARIFAS = await apiTariffs();
    poblarDistritos();
  } catch(e){
    console.error("Error cargando tarifas", e);
  }

  // VALIDATION FORM
  $("license-form")?.addEventListener('submit', async ev=>{
    ev.preventDefault();
    const email = $("email").value.trim();
    const lic   = $("licenseId").value.trim();
    if (!email||!lic) {
      setStatus("license-status","Completa email y licencia");
      return;
    }
    setStatus("license-status","Validando...");
    try {
      const res = await apiValidate(email,lic);
      if (res.valid) {
        setStatus("license-status",`Licencia válida. Vence: ${res.expiresAt}`,true);
        $("app-section")?.classList.remove("hidden");
      } else {
        setStatus("license-status",res.error||"Licencia inválida");
      }
    } catch(err){
      console.error(err);
      setStatus("license-status",`Error: ${err.message}`);
    }
  });

  // ISSUE BUTTON
  $("emitir-btn")?.addEventListener('click', async ()=>{
    setStatus("purchase-status","Emitiendo...");
    try {
      const r = await emitirLicencia();
      $("emitir-out").textContent=JSON.stringify(r,null,2);
      if (r.issued) setStatus("purchase-status",`Licencia: ${r.licenseId}`,true);
      else setStatus("purchase-status",r.error||"No emitida");
    } catch(err){
      console.error(err);
      setStatus("purchase-status",`Error: ${err.message}`);
    }
  });

  // CALCULATION FORM (mantener tu código existente)
  const form = $("calc");
  form && form.addEventListener('submit', e=>{
    e.preventDefault();
    calcular();
  });
});















