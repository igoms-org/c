/* =========================================================
   login.js — লগইন পেজ
   সফল লগইনের পর Code.gs থেকে পাওয়া টোকেন localStorage এ
   ("ns_auth" কী তে) রাখা হয় — index.js/form1.js একই কী পড়ে
   যাচাই করে (দেখুন সেসব ফাইলের requireAuth ফাংশন)।
   ========================================================= */

const CONFIG = {
  GOOGLE_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbyNQsiRGYpMx3fMeWlSf_jd8eUsP2QWAypUa2pk_fiVgSQZK_RTnogyabOR7EctPhJeCA/exec"
};

/* কোনো গোপন তথ্য / সার্ভিস অ্যাকাউন্ট কী এই ফাইলে রাখা হয়নি এবং রাখা যাবে না। */

async function gasPost(payload) {
  const res = await fetch(CONFIG.GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error("network");
  return res.json();
}

function setStatus(el, type, message) {
  el.className = "status-msg show " + type;
  el.textContent = message;
}
function hideStatus(el) {
  el.className = "status-msg";
  el.textContent = "";
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

function saveSession(token, username, expiresAt) {
  localStorage.setItem("ns_auth", JSON.stringify({ token, username, expiresAt }));
}

// শুধুমাত্র সাইটের নিজস্ব পেজে রিডাইরেক্ট করা যাবে — বাইরের কোনো
// লিংকে (open redirect) যাতে next প্যারামিটার দিয়ে না পাঠানো যায়।
const ALLOWED_NEXT_PATHS = [
  "index.html",
  "form1/form1.html"
];

function redirectAfterLogin() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  window.location.href = (next && ALLOWED_NEXT_PATHS.indexOf(next) !== -1) ? next : "index.html";
}

document.addEventListener("DOMContentLoaded", () => {
  // ইতিমধ্যে বৈধ সেশন থাকলে লগইন ফর্ম না দেখিয়ে সরাসরি পাঠিয়ে দিন
  const existing = getSession();
  if (existing && existing.token && existing.expiresAt && new Date(existing.expiresAt) > new Date()) {
    redirectAfterLogin();
    return;
  }

  const form = document.getElementById("loginForm");
  const statusEl = document.getElementById("loginStatus");
  const btn = document.getElementById("loginBtn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideStatus(statusEl);

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    if (!username || !password) {
      setStatus(statusEl, "error", "ইউজারনেম ও পাসওয়ার্ড দিন।");
      return;
    }

    setStatus(statusEl, "loading", "যাচাই করা হচ্ছে...");
    btn.disabled = true;

    try {
      if (!CONFIG.GOOGLE_SCRIPT_URL || CONFIG.GOOGLE_SCRIPT_URL.indexOf("YOUR_GOOGLE_APPS_SCRIPT") === 0) {
        throw new Error("GOOGLE_SCRIPT_URL কনফিগার করা হয়নি।");
      }
      const result = await gasPost({ action: "login", username, password });
      if (!result || !result.success) {
        throw new Error((result && result.message) || "লগইন ব্যর্থ হয়েছে।");
      }
      saveSession(result.token, result.username, result.expiresAt);
      setStatus(statusEl, "success", "লগইন সফল হয়েছে। নিয়ে যাওয়া হচ্ছে...");
      redirectAfterLogin();
    } catch (err) {
      console.error(err);
      const msg = (err && err.message && !/Failed to fetch/i.test(err.message))
        ? err.message
        : "লগইন করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।";
      setStatus(statusEl, "error", msg);
    } finally {
      btn.disabled = false;
    }
      // saveSession("new", "admin", "2030-01-01T00:00:00Z");

      // redirectAfterLogin();
  });
});
