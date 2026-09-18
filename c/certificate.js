/* =========================================================
   certificate.js — সার্টিফিকেট ১ (ফর্ম ১ এর জন্য নতুন ডিজাইন)
   স্মারক নং: 45.<district_id>.<upz_id>.<union_id>.<year>.<memoNo>
   প্রিফিক্স ফর্ম ১ থেকে, memoNo (ক্রমিক) Code.gs থেকে।
   ========================================================= */

const CONFIG = {
  GOOGLE_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbyNQsiRGYpMx3fMeWlSf_jd8eUsP2QWAypUa2pk_fiVgSQZK_RTnogyabOR7EctPhJeCA/exec"
};

/* কোনো গোপন তথ্য / সার্ভিস অ্যাকাউন্ট কী এই ফাইলে রাখা হয়নি এবং রাখা যাবে না। */

function goBack() {
  window.location.href = "https://www.lgoms.org";
}

async function gasGet(params) {
  const url = new URL(CONFIG.GOOGLE_SCRIPT_URL);
  Object.keys(params || {}).forEach(k => url.searchParams.set(k, params[k]));
  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) throw new Error("network");
  return res.json();
}

(async function init() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const loadingEl = document.getElementById("loadingMsg");
  const errorEl = document.getElementById("errorMsg");
  const rootEl = document.getElementById("certRoot");

  if (!id) {
    loadingEl.style.display = "none";
    errorEl.style.display = "block";
    return;
  }

  try {
    const data = await gasGet({ action: "certificate", id });
    if (!data || !data.success) throw new Error("not-found");
    const c = data.record;

    document.getElementById("c-qr").src =
      "https://api.qrcode-monkey.com/qr/custom?data=" + encodeURIComponent(window.location.href) + "&size=300&file=png";

    // স্মারক নং: ব্যাকএন্ডের তৈরি করা পূর্ণ মেমো নম্বর দেখানো হয়,
    // না থাকলে (পুরনো রেকর্ডে) কাঁচা স্মারক ক্রমিক দেখানো হয়।
    document.getElementById("c-memo").textContent = c.memoNo || c.smarakSerial || "";

    document.getElementById("c-date").textContent = c.issueDate || "";
    document.getElementById("c-name").textContent = c.name || "";
    document.getElementById("c-nid").textContent = c.nidMasked || "";
    document.getElementById("c-father").textContent = c.fatherName || "";
    document.getElementById("c-father-label").textContent = c.guardianRelation || "পিতা";
    document.getElementById("c-mother").textContent = c.motherName || "";
    document.getElementById("c-village").textContent = c.village || "";
    document.getElementById("c-village2").textContent = c.village || "";
    document.getElementById("c-house").textContent = c.houseNo || "";
    document.getElementById("c-ward").textContent = c.ward || "";
    document.getElementById("c-ward2").textContent = c.ward || "";
    document.getElementById("c-ward3").textContent = c.ward || "";
    document.getElementById("c-post").textContent = c.postOffice || "";
    // পুরনো রেকর্ডে upazila/district না থাকলে ডিফল্ট মান দেখানো হয়
    const upazilaName = c.upazila || "কালুখালী";
    const districtName = c.district || "রাজবাড়ী";
    document.getElementById("c-upazila").textContent = upazilaName;
    document.getElementById("c-district").textContent = districtName;
    const upzHead = document.getElementById("c-upazila-head");
    const distHead = document.getElementById("c-district-head");
    const upzSign = document.getElementById("c-upazila-sign");
    const distSign = document.getElementById("c-district-sign");
    if (upzHead) upzHead.textContent = upazilaName;
    if (distHead) distHead.textContent = districtName;
    if (upzSign) upzSign.textContent = upazilaName;
    if (distSign) distSign.textContent = districtName;
    document.getElementById("c-chairman").textContent = c.chairmanName || "";
    // পদবি গতিশীলভাবে বসানো হয় (চেয়ারম্যান / প্যানেল চেয়ারম্যান / প্রশাসনিক
    // কর্মকর্তা / ম্যানুয়ালি লেখা পদবি) — পুরনো রেকর্ডে না থাকলে "চেয়ারম্যান" থেকে যাবে।
    if (c.chairmanType) {
      document.getElementById("c-chairman-type").textContent = c.chairmanType;
    }

    // ইউনিয়নের নাম গতিশীলভাবে বসানো হয় (একাধিক ইউনিয়ন সমর্থনের জন্য);
    // পুরনো রেকর্ডে না থাকলে ডিফল্ট ইউনিয়নের নামটিই থেকে যাবে।
    if (c.union) {
      document.getElementById("c-union").textContent = c.union;
      document.getElementById("c-union2").textContent = c.union;
    }

    const isMadapur = String(c.union || "").includes("মদাপুর");
    document.getElementById("signature-default").style.display = isMadapur ? "none" : "";
    document.getElementById("signature-madapur").style.display = isMadapur ? "" : "none";

    loadingEl.style.display = "none";
    rootEl.style.display = "block";
  } catch (err) {
    console.error(err);
    loadingEl.style.display = "none";
    errorEl.style.display = "block";
  }
})();
