/* =========================================================
   index.js — ড্যাশবোর্ড (ফর্ম নির্বাচন + সার্টিফিকেট সার্চ)
   এই ফাইলটি স্বয়ংসম্পূর্ণ (self-contained) যাতে যেকোনো স্ট্যাটিক
   হোস্টিং-এ শুধু এই একটি ফাইল দিয়েই index.html কাজ করে।

   এই পেজটি লগইন-গার্ডেড: এখানে ঢুকতে হলে বৈধ সেশন থাকা আবশ্যক
   (দেখুন requireAuth নিচে)। "লগইন.html" এ ফিরে না গিয়ে থাকতে হলে
   সাবমিট/জেনারেট করার সময় ব্যাকএন্ডও (Code.gs) টোকেন যাচাই করে —
   তাই ফ্রন্টএন্ড গার্ড এড়িয়ে গেলেও সার্টিফিকেট তৈরি করা যাবে না।
   ========================================================= */

const CONFIG = {
  // Google Apps Script Web App এর ডিপ্লয় করা URL
  GOOGLE_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbyNQsiRGYpMx3fMeWlSf_jd8eUsP2QWAypUa2pk_fiVgSQZK_RTnogyabOR7EctPhJeCA/exec",

  // এই সাইটটি যেখানে হোস্ট করা হয়েছে
  SITE_BASE_URL: "https://github.com/SaurovKumer/c/"
};

/* কোনো গোপন তথ্য / সার্ভিস অ্যাকাউন্ট কী এই ফাইলে রাখা হয়নি এবং রাখা যাবে না। */

function goBack() {
  window.location.href = "index.html";
}

/* ---------- Backend call helpers ----------
   Google Apps Script-এর সাথে preflight CORS সমস্যা এড়াতে
   POST বডি text/plain হিসেবে পাঠানো হয় এবং Apps Script পাশে
   JSON.parse(e.postData.contents) দিয়ে পড়া হয়।
*/
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

/* ---------- Status message ---------- */
function setStatus(el, type, message) {
  el.className = "status-msg show " + type;
  el.textContent = message;
}
function hideStatus(el) {
  el.className = "status-msg";
  el.textContent = "";
}

/* =========================================================
   auth.js — লগইন সেশন ব্যবস্থাপনা (সব সুরক্ষিত পেজে ব্যবহৃত)
   ========================================================= */

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

/**
 * পেজ লোড হওয়ার সাথে সাথেই কল করুন। লোকাল টোকেন না থাকলে/মেয়াদ
 * শেষ হলে সাথে সাথেই লগইন পেজে পাঠায় (head এর ইনলাইন স্ক্রিপ্টও এটা
 * করে, এটা দ্বিতীয় স্তর)। এরপর সার্ভারের কাছে টোকেনটি সত্যিই এখনো
 * বৈধ কিনা (অন্য ডিভাইস থেকে লগআউট/অ্যাডমিন নিষ্ক্রিয় করেনি তো) তা
 * যাচাই করে — এটিই আসল নিরাপত্তা স্তর।
 */
async function requireAuth(loginPath) {
  const session = getSession();
  if (!session || !session.token) {
    window.location.replace(loginPath);
    return null;
  }
  if (session.expiresAt && new Date(session.expiresAt) <= new Date()) {
    clearSession();
    window.location.replace(loginPath);
    return null;
  }
  try {
    const check = await gasGet({ action: "checkSession", token: session.token });
    if (!check || !check.success) {
      clearSession();
      window.location.replace(loginPath);
      return null;
    }
  } catch (e) {
    // নেটওয়ার্ক সমস্যায় লগআউট করে দেয়া ঠিক হবে না, বর্তমান সেশনেই থাকতে দিন
    console.warn("সেশন যাচাই করা যায়নি (নেটওয়ার্ক):", e);
  }
  return session;
}

function handleLogout() {
  const session = getSession();
  if (session && session.token) {
    gasPost({ action: "logout", token: session.token }).catch(() => {});
  }
  clearSession();
  window.location.href = "login.html";
}

/* =========================================================
   search.js — সার্টিফিকেট খুঁজুন (ফর্ম টাইপ + স্মারক ক্রমিক)
   এই সার্চটি ব্যাকএন্ডে অটো-জেনারেটেড "স্মারক ক্রমিক" এর সাথে
   মিলিয়ে কাজ করে — তাই ব্যবহারকারীকে কখনো স্মারক ক্রমিক নিজে
   বসাতে হয় না, এটি ফর্ম সাবমিট করলে সার্ভার নিজে থেকেই তৈরি করে।
   (লক্ষ্য করুন: certificateN.html পেজগুলো নিজে থেকেই সম্পূর্ণ
   পাবলিক — QR স্ক্যান করে যে কেউ লগইন ছাড়াই সেগুলো দেখতে পারবে;
   এই সার্চ বক্সটি শুধু ড্যাশবোর্ডে সুবিধার জন্য, যা লগইন-গার্ডেড।)
   ========================================================= */

function initCertificateSearch() {
  const form = document.getElementById("searchForm");
  if (!form) return;

  const serialEl = document.getElementById("searchSerial");
  const statusEl = document.getElementById("searchStatus");
  const btnEl = document.getElementById("searchBtn");

  const CERT_PATH = "c/certificate.html";
  const formType = "FORM-1"; // এখন শুধু ফর্ম ১ সমর্থিত

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const serial = serialEl.value.trim();

    hideStatus(statusEl);

    if (!serial) {
      setStatus(statusEl, "error", "অনুগ্রহ করে স্মারক ক্রমিক লিখুন।");
      return;
    }

    setStatus(statusEl, "loading", "খোঁজা হচ্ছে...");
    btnEl.disabled = true;

    try {
      if (!CONFIG.GOOGLE_SCRIPT_URL || CONFIG.GOOGLE_SCRIPT_URL.indexOf("YOUR_GOOGLE_APPS_SCRIPT") === 0) {
        throw new Error("GOOGLE_SCRIPT_URL কনফিগার করা হয়নি।");
      }
      const result = await gasGet({ action: "findCertificate", formType, serial });
      if (!result || !result.success) {
        throw new Error((result && result.message) || "এই তথ্যে কোনো সার্টিফিকেট পাওয়া যায়নি।");
      }
      setStatus(statusEl, "success", "সার্টিফিকেট পাওয়া গেছে। নিয়ে যাওয়া হচ্ছে...");
      // ব্যাকএন্ড থেকে সম্পূর্ণ লিংক এলে সেটিই ব্যবহার হবে, নয়তো ডিফল্ট
      // c/ ফোল্ডারে নেয়া হবে (id প্যারামিটার সহ)।
      let link = result.certificateLink;
      if (!link && result.qrId) {
        link = CERT_PATH + "?id=" + encodeURIComponent(result.qrId);
      }
      window.location.href = link;
    } catch (err) {
      console.error(err);
      const msg = (err && err.message && !/Failed to fetch/i.test(err.message))
        ? err.message
        : "সার্টিফিকেট খুঁজে পাওয়া যায়নি। অনুগ্রহ করে ক্রমিক নম্বর যাচাই করুন।";
      setStatus(statusEl, "error", msg);
    } finally {
      btnEl.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireAuth("login.html");
  if (!session) return; // ইতিমধ্যে লগইন পেজে পাঠানো হচ্ছে

  const who = document.getElementById("whoami");
  if (who) who.textContent = session.username ? ("স্বাগতম, " + session.username) : "";

  initCertificateSearch();
});
