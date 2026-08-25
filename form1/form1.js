/* =========================================================
   form1.js — ফর্ম ১

   স্মারক নং ফরম্যাট: 45.<district_id>.<upz_id>.<union_id>.<year>.<memoNo>
   - district_id / upz_id / union_id / year  ফর্ম থেকে তৈরি হয় (geo-data.json)
   - জেলা ও উপজেলা চেকবক্স দিয়ে ম্যানুয়ালি সম্পাদনযোগ্য
   - memoNo (৮-সংখ্যার ক্রমিক) শুধু Code.gs এ জেনারেট ও শিটে সংরক্ষিত হয়
   ========================================================= */

const CONFIG = {
  GOOGLE_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbyNQsiRGYpMx3fMeWlSf_jd8eUsP2QWAypUa2pk_fiVgSQZK_RTnogyabOR7EctPhJeCA/exec",
  CERTIFICATE_BASE_URL: "https://github.com/SaurovKumer/c//c/certificate.html",
  VERIFICATION_BASE_URL: "https://github.com/SaurovKumer/c//c/certificate.html"
};

const DEFAULT_UPAZILA = "কালুখালী";
const WARD_LIST = ["০১", "০২", "০৩", "০৪", "০৫", "০৬", "০৭", "০৮", "০৯"];

let GEO = null;

const CHAIRMAN_SUGGESTIONS_BY_UNION = {
  "০১ নং রতনদিয়া": ["জনাব আবুল কাশেম মন্ডল"],
  "০২ নং কালিকাপুর": ["মোঃ আতিউর রহমান"],
  "০৩ নং বোয়ালিয়া": ["মো: রফিকুল ইসলাম"],
  "০৪ নং মাঝবাড়ী": [],
  "০৫ নং মদাপুর": [],
  "০৬ নং মৃগী": ["এম এ মতিন", "মোঃ আব্দুল হাই"],
  "০৭ নং সাওরাইল": ["মোঃ শহিদুল ইসলাম (আলী)"]
};

function goBack() {
  window.location.href = "../index.html";
}

function getSession() {
  try {
    const raw = localStorage.getItem("ns_auth");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem("ns_auth");
}

function handleLogout() {
  const session = getSession();
  if (session && session.token) {
    gasPost({ action: "logout", token: session.token }).catch(() => {});
  }
  clearSession();
  window.location.href = "../login.html";
}

async function gasGet(params) {
  const url = new URL(CONFIG.GOOGLE_SCRIPT_URL);
  Object.keys(params || {}).forEach(k => url.searchParams.set(k, params[k]));
  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) throw new Error("network");
  return res.json();
}

async function gasPost(payload) {
  const res = await fetch(CONFIG.GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error("network");
  return res.json();
}

function fillSelect(selectEl, options, placeholder) {
  selectEl.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = placeholder || "নির্বাচন করুন";
  ph.disabled = true;
  ph.selected = true;
  selectEl.appendChild(ph);
  (options || []).forEach(opt => {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    selectEl.appendChild(o);
  });
}

function fillDatalist(datalistEl, options) {
  datalistEl.innerHTML = "";
  (options || []).forEach(opt => {
    const o = document.createElement("option");
    o.value = opt;
    datalistEl.appendChild(o);
  });
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function isoToDisplay(iso) {
  if (!iso || iso.indexOf("-") === -1) return "";
  const parts = iso.split("-");
  return parts[2] + "-" + parts[1] + "-" + parts[0];
}

function findUpazilaByName(name) {
  if (!GEO || !name) return null;
  return (GEO.upazilas || []).find(u => u.upz_name === name) || null;
}

function findUnionInUpazila(upz, unionName) {
  if (!upz || !unionName) return null;
  return (upz.unions || []).find(u => u.union_name === unionName) || null;
}

function findUnionAnywhere(unionName) {
  if (!GEO || !unionName) return null;
  for (const upz of GEO.upazilas || []) {
    const rec = findUnionInUpazila(upz, unionName);
    if (rec) return rec;
  }
  return null;
}

function currentDistrictName() {
  return districtEl.value.trim();
}

function currentDistrictId() {
  if (districtEditCk.checked) return districtIdEl.value.trim();
  return GEO ? String(GEO.district_id || "") : "";
}

function currentUpazilaName() {
  return upazilaEditCk.checked ? upazilaManualEl.value.trim() : upazilaEl.value;
}

function currentUpazilaId() {
  if (upazilaEditCk.checked) return upzIdEl.value.trim();
  const upz = findUpazilaByName(upazilaEl.value);
  return upz ? String(upz.upz_id) : "";
}

function currentUnionName() {
  return unionEditCk.checked ? unionManualEl.value.trim() : unionEl.value;
}

function currentUnionRecord() {
  if (unionEditCk.checked) {
    return findUnionAnywhere(unionManualEl.value.trim());
  }
  const upz = findUpazilaByName(upazilaEl.value);
  return findUnionInUpazila(upz, unionEl.value);
}

function currentUnionId() {
  if (unionEditCk.checked) return unionIdEl.value.trim();
  const rec = currentUnionRecord();
  return rec ? String(rec.union_id) : "";
}

function currentYear() {
  const iso = issueDateEl.value || todayISO();
  return iso.slice(0, 4);
}

function buildSmarokPrefix() {
  return "45." + currentDistrictId() + "." + currentUpazilaId() + "." + currentUnionId() + "." + currentYear() + ".";
}

function updateSmarokPreview() {
  const el = document.getElementById("smarokPreview");
  if (el) el.textContent = buildSmarokPrefix();
}

function activeUpazilaRecord() {
  if (upazilaEditCk.checked) return null;
  return findUpazilaByName(upazilaEl.value);
}

function onUpazilaChange() {
  const upz = activeUpazilaRecord();
  const unions = upz ? (upz.unions || []).map(u => u.union_name) : [];
  if (!unionEditCk.checked) {
    fillSelect(unionEl, unions, unions.length ? "ইউনিয়ন নির্বাচন করুন" : "তালিকায় নেই — সম্পাদনা করুন চেক করুন");
    unionEl.value = unions[0] || "";
  }
  onUnionChange();
}

function onUnionChange() {
  const rec = currentUnionRecord();
  const posts = rec && rec.post_offices ? rec.post_offices : [];
  const villages = rec && rec.villages ? rec.villages : [];

  if (!postOfficeOtherCk.checked) {
    fillSelect(postOfficeEl, posts, posts.length ? "ডাকঘর নির্বাচন করুন" : "তালিকায় নেই — নিচে লিখুন");
  }
  if (!villageOtherCk.checked) {
    fillSelect(villageEl, villages, villages.length ? "গ্রাম নির্বাচন করুন" : "তালিকায় নেই — নিচে লিখুন");
  }

  applyChairmanDefaultForUnion(currentUnionName(), chairmanNameEl, chairmanNameList);
  updateSmarokPreview();
}

function setupManualToggle(selectEl, otherCheckboxEl, otherInputEl, onDisable) {
  otherCheckboxEl.addEventListener("change", () => {
    if (otherCheckboxEl.checked) {
      selectEl.disabled = true;
      otherInputEl.style.display = "block";
      otherInputEl.focus();
    } else {
      selectEl.disabled = false;
      otherInputEl.style.display = "none";
      otherInputEl.value = "";
      if (onDisable) onDisable();
    }
  });
}

function getFieldValue(selectEl, otherCheckboxEl, otherInputEl) {
  return otherCheckboxEl.checked ? otherInputEl.value.trim() : selectEl.value;
}

function setupChairmanTypeToggle(radios, otherRadio, otherInputEl) {
  radios.forEach(r => r.addEventListener("change", () => {
    if (otherRadio.checked) {
      otherInputEl.style.display = "block";
      otherInputEl.focus();
    } else {
      otherInputEl.style.display = "none";
    }
  }));
}

function getChairmanType(radios, otherRadio, otherInputEl) {
  const checked = radios.find(r => r.checked);
  if (!checked) return "";
  if (checked === otherRadio) return otherInputEl.value.trim();
  return checked.value;
}

let lastAutoChairmanName = "";
function applyChairmanDefaultForUnion(unionName, nameInputEl, datalistEl) {
  const suggestions = CHAIRMAN_SUGGESTIONS_BY_UNION[unionName] || [];

  datalistEl.innerHTML = "";
  suggestions.forEach(n => {
    const opt = document.createElement("option");
    opt.value = n;
    datalistEl.appendChild(opt);
  });

  const defaultName = suggestions[0] || "";
  if (!nameInputEl.value.trim() || nameInputEl.value === lastAutoChairmanName) {
    nameInputEl.value = defaultName;
    lastAutoChairmanName = defaultName;
  }
}

function setupGuardianRelationToggle(radios, nameInputEl, labelTextEl) {
  const apply = () => {
    const checked = radios.find(r => r.checked);
    const isHusband = checked && checked.value === "স্বামী";
    labelTextEl.textContent = isHusband ? "স্বামীর নাম" : "পিতার নাম";
    nameInputEl.placeholder = isHusband ? "স্বামীর নাম লিখুন" : "পিতার নাম লিখুন";
  };
  radios.forEach(r => r.addEventListener("change", apply));
  apply();
}

function currentGuardianRelation() {
  const checked = guardianRelationRadios.find(r => r.checked);
  return checked ? checked.value : "পিতা";
}

function setupDistrictEdit() {
  districtEditCk.addEventListener("change", () => {
    if (districtEditCk.checked) {
      districtEl.readOnly = false;
      districtIdEl.style.display = "block";
      districtIdEl.value = districtIdEl.value || (GEO ? String(GEO.district_id) : "");
      districtEl.focus();
    } else {
      districtEl.readOnly = true;
      districtIdEl.style.display = "none";
      if (GEO) {
        districtEl.value = GEO.district_name;
        districtIdEl.value = GEO.district_id;
      }
    }
    updateSmarokPreview();
  });
}

function setupUpazilaEdit() {
  upazilaEditCk.addEventListener("change", () => {
    if (upazilaEditCk.checked) {
      upazilaEl.style.display = "none";
      upazilaManualEl.style.display = "block";
      upzIdEl.style.display = "block";
      upazilaManualEl.value = upazilaManualEl.value || upazilaEl.value;
      const upz = findUpazilaByName(upazilaEl.value);
      if (upz && !upzIdEl.value) upzIdEl.value = upz.upz_id;
      upazilaManualEl.focus();
    } else {
      upazilaEl.style.display = "";
      upazilaManualEl.style.display = "none";
      upzIdEl.style.display = "none";
      onUpazilaChange();
    }
    updateSmarokPreview();
  });
}

function setupUnionEdit() {
  unionEditCk.addEventListener("change", () => {
    if (unionEditCk.checked) {
      unionEl.style.display = "none";
      unionManualEl.style.display = "block";
      unionIdEl.style.display = "block";
      unionManualEl.value = unionManualEl.value || unionEl.value;
      const upz = findUpazilaByName(upazilaEl.value);
      const rec = findUnionInUpazila(upz, unionEl.value);
      if (rec && !unionIdEl.value) unionIdEl.value = rec.union_id;
      unionManualEl.focus();
    } else {
      unionEl.style.display = "";
      unionManualEl.style.display = "none";
      unionIdEl.style.display = "none";
      onUpazilaChange();
    }
    onUnionChange();
  });
}

function setupDateEdit() {
  issueDateEl.value = todayISO();
  issueDateEl.disabled = true;
  issueDateEditCk.addEventListener("change", () => {
    issueDateEl.disabled = !issueDateEditCk.checked;
    if (!issueDateEditCk.checked) {
      issueDateEl.value = todayISO();
    } else {
      issueDateEl.focus();
    }
    updateSmarokPreview();
  });
}

function validateRegistration(data) {
  const errors = {};
  const req = (val, key, msg) => { if (!val || !String(val).trim()) errors[key] = msg || "এই ঘরটি পূরণ করা আবশ্যক।"; };

  req(data.union, "union", "ইউনিয়নের নাম লিখুন।");
  req(data.upazila, "upazila", "উপজেলার নাম লিখুন।");
  req(data.district, "district", "জেলার নাম লিখুন।");
  req(data.ward, "ward", "ওয়ার্ড নম্বর নির্বাচন করুন।");
  req(data.postOffice, "postOffice", "ডাকঘর নির্বাচন করুন অথবা লিখুন।");
  req(data.village, "village", "গ্রাম নির্বাচন করুন অথবা লিখুন।");
  req(data.name, "name", "নাম লিখুন।");
  req(data.nid, "nid", "NID / জন্মনিবন্ধন নম্বর লিখুন।");
  req(data.fatherName, "fatherName", data.guardianRelation === "স্বামী" ? "স্বামীর নাম লিখুন।" : "পিতার নাম লিখুন।");
  req(data.motherName, "motherName", "মাতার নাম লিখুন।");
  req(data.chairmanType, "chairmanType", "পদবি নির্বাচন করুন অথবা লিখুন।");
  req(data.chairmanName, "chairmanName", "চেয়ারম্যান/দায়িত্বপ্রাপ্তের নাম লিখুন।");
  req(data.issueDate, "issueDate", "তারিখ দিন।");
  req(data.districtId, "district", "জেলা কোড দিন।");
  req(data.upzId, "upazila", "উপজেলা কোড দিন।");
  req(data.unionCode, "union", "ইউনিয়ন কোড দিন (তালিকায় না থাকলে কোড লিখুন)।");

  if (data.nid && !/^[0-9]{10,17}$/.test(data.nid.trim())) {
    errors.nid = "সঠিক NID / জন্মনিবন্ধন নম্বর দিন (শুধু সংখ্যা)।";
  }
  if (data.districtId && !/^[0-9]+$/.test(data.districtId)) {
    errors.district = "জেলা কোড শুধু সংখ্যায় লিখুন।";
  }
  if (data.upzId && !/^[0-9]+$/.test(data.upzId)) {
    errors.upazila = "উপজেলা কোড শুধু সংখ্যায় লিখুন।";
  }
  if (data.unionCode && !/^[0-9]+$/.test(data.unionCode)) {
    errors.union = "ইউনিয়ন কোড শুধু সংখ্যায় লিখুন।";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

function showFieldErrors(errors) {
  document.querySelectorAll(".field-error").forEach(el => el.textContent = "");
  Object.keys(errors).forEach(key => {
    const el = document.getElementById("err-" + key);
    if (el) el.textContent = errors[key];
  });
}

function setStatus(el, type, message) {
  el.className = "status-msg show " + type;
  el.textContent = message;
}
function hideStatus(el) {
  el.className = "status-msg";
  el.textContent = "";
}

async function submitRegistration(formType, payload, statusEl, submitBtn) {
  hideStatus(statusEl);
  setStatus(statusEl, "loading", "তথ্য সংরক্ষণ করা হচ্ছে...");
  if (submitBtn) submitBtn.disabled = true;

  try {
    if (!CONFIG.GOOGLE_SCRIPT_URL || CONFIG.GOOGLE_SCRIPT_URL.indexOf("YOUR_GOOGLE_APPS_SCRIPT") === 0) {
      throw new Error("GOOGLE_SCRIPT_URL কনফিগার করা হয়নি।");
    }
    const session = getSession();
    if (!session || !session.token) {
      clearSession();
      window.location.replace("../login.html");
      throw new Error("লগইন সেশন পাওয়া যায়নি। আবার লগইন করুন।");
    }
    const result = await gasPost({ action: "register", formType, data: payload, token: session.token });
    if (result && result.authRequired) {
      clearSession();
      window.location.replace("../login.html");
      throw new Error("সেশনের মেয়াদ শেষ হয়ে গেছে। আবার লগইন করুন।");
    }
    if (!result || !result.success) {
      throw new Error((result && result.message) || "তথ্য সংরক্ষণ করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।");
    }
    setStatus(statusEl, "success", result.message || "নাগরিক সনদ সফলভাবে তৈরি হয়েছে।");
    return result;
  } catch (err) {
    console.error(err);
    const msg = (err && err.message && !/Failed to fetch/i.test(err.message))
      ? err.message
      : "তথ্য সংরক্ষণ করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।";
    setStatus(statusEl, "error", msg);
    return null;
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function renderResult(result, resultCard) {
  document.getElementById("res-memo").textContent = result.memoNo || "-";
  document.getElementById("res-serial").textContent = result.smarakSerial || "-";
  const linkEl = document.getElementById("res-link");
  linkEl.textContent = result.certificateLink || "-";
  linkEl.parentElement.querySelector("a")?.remove?.();

  const qrImg = document.getElementById("res-qr-img");
  const qrData = encodeURIComponent(result.verificationLink || result.certificateLink || "");
  qrImg.src = "https://api.qrcode-monkey.com/qr/custom?data=" + qrData + "&size=300&file=png";

  const viewBtn = document.getElementById("btn-view-cert");
  if (viewBtn) viewBtn.href = result.certificateLink || "#";

  resultCard.classList.add("show");
  resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

const FORM_TYPE = "FORM-1";

const unionEl = document.getElementById("union");
const unionEditCk = document.getElementById("unionEdit");
const unionManualEl = document.getElementById("unionManual");
const unionIdEl = document.getElementById("unionId");
const upazilaEl = document.getElementById("upazila");
const upazilaEditCk = document.getElementById("upazilaEdit");
const upazilaManualEl = document.getElementById("upazilaManual");
const upzIdEl = document.getElementById("upzId");
const districtEl = document.getElementById("district");
const districtEditCk = document.getElementById("districtEdit");
const districtIdEl = document.getElementById("districtId");
const issueDateEl = document.getElementById("issueDate");
const issueDateEditCk = document.getElementById("issueDateEdit");
const wardEl = document.getElementById("ward");
const postOfficeEl = document.getElementById("postOffice");
const postOfficeOtherCk = document.getElementById("postOfficeOther");
const postOfficeOtherInput = document.getElementById("postOfficeOtherInput");
const villageEl = document.getElementById("village");
const villageOtherCk = document.getElementById("villageOther");
const villageOtherInput = document.getElementById("villageOtherInput");
const houseNoEl = document.getElementById("houseNo");
const statusMsg = document.getElementById("statusMsg");
const resultCard = document.getElementById("resultCard");
const submitBtn = document.getElementById("submitBtn");
const chairmanRadios = Array.from(document.querySelectorAll('input[name="chairmanType"]'));
const chairmanTypeOtherRadio = chairmanRadios.find(r => r.value === "__other__");
const chairmanTypeOtherInput = document.getElementById("chairmanTypeOtherInput");
const chairmanNameEl = document.getElementById("chairmanName");
const chairmanNameList = document.getElementById("chairmanNameList");
const guardianRelationRadios = Array.from(document.querySelectorAll('input[name="guardianRelation"]'));
const fatherNameEl = document.getElementById("fatherName");
const fatherNameLabelText = document.getElementById("fatherNameLabelText");

(async function init() {
  try {
    const res = await fetch("geo-data.json");
    if (!res.ok) throw new Error("geo");
    GEO = await res.json();
  } catch (e) {
    setStatus(statusMsg, "error", "অঞ্চলের তালিকা (geo-data.json) লোড করা যায়নি।");
    return;
  }

  fillSelect(wardEl, WARD_LIST, "ওয়ার্ড নির্বাচন করুন");
  fillSelect(upazilaEl, (GEO.upazilas || []).map(u => u.upz_name), "উপজেলা নির্বাচন করুন");

  districtEl.value = GEO.district_name || "";
  districtIdEl.value = GEO.district_id || "";
  districtEl.readOnly = true;

  const defaultUpz = (GEO.upazilas || []).find(u => u.upz_name === DEFAULT_UPAZILA);
  upazilaEl.value = defaultUpz ? DEFAULT_UPAZILA : ((GEO.upazilas || [])[0] || {}).upz_name || "";

  unionEl.addEventListener("change", onUnionChange);
  unionManualEl.addEventListener("input", onUnionChange);
  upazilaEl.addEventListener("change", onUpazilaChange);
  upazilaManualEl.addEventListener("input", updateSmarokPreview);
  districtEl.addEventListener("input", updateSmarokPreview);
  districtIdEl.addEventListener("input", updateSmarokPreview);
  upzIdEl.addEventListener("input", updateSmarokPreview);
  unionIdEl.addEventListener("input", updateSmarokPreview);
  issueDateEl.addEventListener("change", updateSmarokPreview);

  setupManualToggle(postOfficeEl, postOfficeOtherCk, postOfficeOtherInput, onUnionChange);
  setupManualToggle(villageEl, villageOtherCk, villageOtherInput, onUnionChange);
  setupChairmanTypeToggle(chairmanRadios, chairmanTypeOtherRadio, chairmanTypeOtherInput);
  setupGuardianRelationToggle(guardianRelationRadios, fatherNameEl, fatherNameLabelText);
  setupDistrictEdit();
  setupUpazilaEdit();
  setupUnionEdit();
  setupDateEdit();

  onUpazilaChange();

  if (!houseNoEl.value) houseNoEl.value = "00-00-0000-00";
  updateSmarokPreview();
})();

document.getElementById("regForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  resultCard.classList.remove("show");

  const chairmanType = getChairmanType(chairmanRadios, chairmanTypeOtherRadio, chairmanTypeOtherInput);
  const chairmanName = chairmanNameEl.value.trim();
  const isoDate = issueDateEl.disabled ? todayISO() : (issueDateEl.value || todayISO());

  const payload = {
    union: currentUnionName(),
    unionCode: currentUnionId(),
    upazila: currentUpazilaName(),
    district: currentDistrictName(),
    districtId: currentDistrictId(),
    upzId: currentUpazilaId(),
    year: isoDate.slice(0, 4),
    smarokPrefix: buildSmarokPrefix(),
    issueDate: isoToDisplay(isoDate),
    ward: wardEl.value,
    postOffice: getFieldValue(postOfficeEl, postOfficeOtherCk, postOfficeOtherInput),
    village: getFieldValue(villageEl, villageOtherCk, villageOtherInput),
    name: document.getElementById("name").value.trim(),
    nid: document.getElementById("nid").value.trim(),
    guardianRelation: currentGuardianRelation(),
    fatherName: fatherNameEl.value.trim(),
    motherName: document.getElementById("motherName").value.trim(),
    houseNo: houseNoEl.value.trim() || "00-00-0000-00",
    chairmanType: chairmanType,
    chairmanName: chairmanName
  };

  const { valid, errors } = validateRegistration(payload);
  showFieldErrors(errors);
  if (!valid) {
    setStatus(statusMsg, "error", "অনুগ্রহ করে চিহ্নিত ঘরগুলো সঠিকভাবে পূরণ করুন।");
    return;
  }

  const result = await submitRegistration(FORM_TYPE, payload, statusMsg, submitBtn);
  if (result) renderResult(result, resultCard);
});
