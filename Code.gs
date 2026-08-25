/**
 * নাগরিক সনদ — Google Apps Script ব্যাকএন্ড
 * ==========================================
 * শুধুমাত্র ফর্ম ১ (নাগরিক সনদপত্র) সমর্থিত — ফর্ম ২, ফর্ম ৩ এবং তাদের
 * সার্টিফিকেট পেজ (certificate2/3) সরিয়ে ফেলা হয়েছে, যাতে অ্যাপটি হালকা
 * ও দ্রুত থাকে।
 *
 * Sheets:
 *   - "Registrations"   : নিবন্ধন রেকর্ড
 *   - "Configuration"    : ড্রপডাউন ডেটা, চেয়ারম্যান নাম, সিরিয়াল সেটিংস
 *   - "Users"            : লগইন ইউজারনেম + হ্যাশ করা পাসওয়ার্ড
 *   - "Sessions"         : সক্রিয় লগইন সেশন টোকেন (মেয়াদসহ)
 *
 * Deploy: Extensions → Apps Script → Deploy → New deployment → Web app
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * মূল বৈশিষ্ট্যসমূহ:
 * 1) স্মারক নং (Memo No): "45.<district_id>.<upz_id>.<union_id>.<year>.<memoNo>"।
 *    প্রিফিক্স (45.district_id.upz_id.union_id.year.) ফর্ম ১ থেকে আসে;
 *    এই স্ক্রিপ্ট শুধু ৮-সংখ্যার memoNo/ক্রমিক জেনারেট করে প্রিফিক্সের সাথে জোড়ে।
 * 2) স্মারক ক্রমিক ৮-সংখ্যা প্যাড করা হয় (padSerial); সার্চ ফাংশনও
 *    (findCertificateBySerial) একই প্যাডিং ব্যবহার করে।
 * 3) *** লগইন সুরক্ষা ***
 *    - সনদ তৈরি করা (registerSubmission) একটি বৈধ, মেয়াদ-উত্তীর্ণ-নয়
 *      এমন সেশন টোকেন ছাড়া কাজ করে না — টোকেন ভুল/অনুপস্থিত/মেয়াদোত্তীর্ণ
 *      হলে সরাসরি প্রত্যাখ্যান করে (authRequired: true)। এটিই আসল
 *      নিরাপত্তা স্তর — শুধু ফ্রন্টএন্ডে লগইন পেজ দেখানো যথেষ্ট নয়।
 *    - getConfig/certificate/findCertificate — এই তিনটি অ্যাকশন
 *      ***ইচ্ছাকৃতভাবে*** লগইন ছাড়াই খোলা রাখা হয়েছে, যাতে QR কোড
 *      স্ক্যান করে বা "সার্টিফিকেট খুঁজুন" দিয়ে যে কেউ (লগইন ছাড়াই)
 *      ইতিমধ্যে ইস্যু করা সনদ দেখতে পারে — শুধু *তৈরি* করা সুরক্ষিত।
 *    - পাসওয়ার্ড কখনো প্লেইন টেক্সটে সংরক্ষণ হয় না (SHA-256 + প্রতি
 *      ইউজারের নিজস্ব র‍্যান্ডম salt)। নতুন ইউজার যোগ/পাসওয়ার্ড রিসেট
 *      করতে Google Sheet খুলে উপরের কাস্টম মেনু "নাগরিক সনদ" ব্যবহার
 *      করুন — কোনো কোড এডিট করার দরকার নেই (দেখুন onOpen নিচে)।
 * 4) *** উপজেলা / জেলা (নতুন) ***
 *    ফর্ম ১ এ এখন ইউনিয়ন, উপজেলা ও জেলা — এই তিনটিই ম্যানুয়ালি লেখা
 *    যায় (ইউনিয়নে আগের তালিকা সাজেশন হিসেবে থেকে যায়)। এই মানগুলো
 *    "Upazila" ও "District" কলামে সংরক্ষণ হয় এবং certificate.html এ
 *    সরাসরি দেখানো হয়।
 *    *** যদি আপনার লাইভ Google Sheet এই আপডেটের আগেই তৈরি করা থাকে,
 *    তাহলে "Registrations" শীটের হেডার সারিতে "Upazila" ও "District" —
 *    এই দুটি কলাম-নাম ম্যানুয়ালি যোগ করে দিন (একদম শেষে)। ***
 */

const SHEET_REG = "Registrations";
const SHEET_CFG = "Configuration";
const SHEET_USERS = "Users";
const SHEET_SESSIONS = "Sessions";

// এই সাইটটি যেখানে হোস্ট করা হয়েছে — certificate লিংক তৈরির জন্য ব্যবহৃত
const SITE_BASE_URL = "https://github.com/SaurovKumer/c/";

// একটি লগইন সেশন ডিফল্টভাবে কত ঘণ্টা বৈধ থাকবে (Configuration শীটে
// "SessionHours" কী দিয়ে ওভাররাইড করা যাবে)
const DEFAULT_SESSION_HOURS = 12;

const REG_HEADERS = [
  "Timestamp", "Union", "Ward", "Post Office", "Village",
  "Smarak Serial", "Name", "NID/Birth Reg", "Father's Name", "Mother's Name",
  "House No", "Chairman Type", "Chairman Name",
  "Certificate Link", "Verification Link",
  "Memo No", "Created By",
  // ★ উপজেলা/জেলা ম্যানুয়াল ইনপুট — একদম শেষে যোগ হয়েছে বলে আগের কোনো
  // কলামের ক্রম/ইনডেক্স পাল্টায়নি।
  "Upazila", "District", "Issue Date",
  // ★ পিতা/স্বামী সম্পর্ক নির্বাচন — একদম শেষে যোগ হয়েছে, পুরনো কলাম অপরিবর্তিত।
  "Guardian Relation"
];

const USER_HEADERS = ["Username", "PasswordHash", "Salt", "Active"];
const SESSION_HEADERS = ["Token", "Username", "CreatedAt", "ExpiresAt"];

/* =========================================================
   ENTRY POINTS
   ========================================================= */

function doGet(e) {
  try {
    const action = e.parameter.action;
    // --- নিচের তিনটি অ্যাকশন ইচ্ছাকৃতভাবে পাবলিক (লগইন লাগে না) ---
    if (action === "getConfig") {
      return jsonOut({ success: true, config: buildFrontendConfig(e.parameter.formType) });
    }
    if (action === "certificate") {
      return jsonOut(getCertificateRecord(e.parameter.id));
    }
    if (action === "findCertificate") {
      return jsonOut(findCertificateBySerial(e.parameter.formType, e.parameter.serial));
    }
    // --- সেশন যাচাই (ড্যাশবোর্ড/ফর্ম পেজ লোড হওয়ার সময় ব্যবহৃত) ---
    if (action === "checkSession") {
      const username = validateSession(e.parameter.token);
      return jsonOut({ success: !!username, username: username || null });
    }
    return jsonOut({ success: false, message: "অজানা অনুরোধ।" });
  } catch (err) {
    return jsonOut({ success: false, message: "সার্ভার সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।" });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === "register") {
      // *** আসল নিরাপত্তা স্তর: বৈধ সেশন টোকেন ছাড়া কোনো সনদ তৈরি হয় না ***
      return jsonOut(registerSubmission(body.formType, body.data || {}, body.token));
    }
    if (body.action === "login") {
      return jsonOut(loginUser(body.username, body.password));
    }
    if (body.action === "logout") {
      return jsonOut(logoutUser(body.token));
    }
    return jsonOut({ success: false, message: "অজানা অনুরোধ।" });
  } catch (err) {
    return jsonOut({ success: false, message: "তথ্য সংরক্ষণ করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।" });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* =========================================================
   REGISTRATION
   ========================================================= */

function registerSubmission(formType, data, token) {
  // *** নিরাপত্তা চেক: বৈধ, মেয়াদ-উত্তীর্ণ-নয় এমন সেশন ছাড়া কোনো সনদ তৈরি হয় না ***
  const username = validateSession(token);
  if (!username) {
    return {
      success: false,
      authRequired: true,
      message: "অনুগ্রহ করে লগইন করুন। সেশনের মেয়াদ শেষ হয়ে থাকতে পারে।"
    };
  }

  formType = normalizeFormType(formType);
  if (!formType) return { success: false, message: "সঠিক ফর্ম টাইপ পাওয়া যায়নি।" };

  const err = validateData(data, formType);
  if (err) return { success: false, message: err };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000); // সমসাময়িক সাবমিশন সামলাতে atomic lock
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const regSheet = getOrCreateRegSheet(ss);
    const cfgSheet = ss.getSheetByName(SHEET_CFG);

    const smarakSerial = getNextSerial(cfgSheet, formType); // ৮-সংখ্যা প্যাড করা, এমনিতেই ইউনিক
    const timestamp = new Date();

    const smarokPrefix = String(data.smarokPrefix || "").trim();
    if (!smarokPrefix) {
      return { success: false, message: "স্মারক প্রিফিক্স পাওয়া যায়নি। ফর্মটি রিফ্রেশ করে আবার চেষ্টা করুন।" };
    }
    const memoNo = smarokPrefix + smarakSerial;

    // ★ QR কোড / সার্টিফিকেট লিংকের আইডি হিসেবে এখন সরাসরি স্মারক ক্রমিক
    // (Smarak Serial) ব্যবহার হয় — এটি atomic কাউন্টার থেকে আসে বলে
    // এমনিতেই ইউনিক, তাই আলাদা QR ID তৈরির দরকার নেই।
    const certificateLink = SITE_BASE_URL + "/c/certificate.html?id=" + encodeURIComponent(smarakSerial);
    const verificationLink = certificateLink;

    regSheet.appendRow([
      timestamp,
      data.union || "",
      data.ward || "",
      data.postOffice || "",
      data.village || "",
      smarakSerial,
      data.name || "",
      data.nid || "",
      data.fatherName || "",
      data.motherName || "",
      data.houseNo || "",
      data.chairmanType || "",
      data.chairmanName || "",
      certificateLink,
      verificationLink,
      memoNo,
      username,
      data.upazila || "",
      data.district || "",
      data.issueDate || "",
      data.guardianRelation || "পিতা"
    ]);

    return {
      success: true,
      formType: formType,
      smarakSerial: String(smarakSerial),
      memoNo: memoNo,
      qrId: smarakSerial,
      certificateLink: certificateLink,
      verificationLink: verificationLink,
      message: "নাগরিক সনদ সফলভাবে তৈরি হয়েছে।"
    };
  } catch (err) {
    return { success: false, message: "তথ্য সংরক্ষণ করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।" };
  } finally {
    lock.releaseLock();
  }
}

function validateData(data, formType) {
  const required = ["union", "upazila", "district", "ward", "postOffice", "village", "name", "nid", "fatherName", "motherName", "chairmanType"];
  for (const key of required) {
    if (!data[key] || !String(data[key]).trim()) {
      return "প্রয়োজনীয় তথ্য অনুপস্থিত। অনুগ্রহ করে ফর্মটি সম্পূর্ণ পূরণ করুন।";
    }
  }
  if (!/^[0-9]{10,17}$/.test(String(data.nid).trim())) {
    return "সঠিক NID / জন্মনিবন্ধন নম্বর দিন।";
  }
  return null;
}

function normalizeFormType(t) {
  if (!t) return null;
  t = String(t).toUpperCase().trim();
  if (t !== "FORM-1") return null;
  return t;
}

/* =========================================================
   SERIAL NUMBER (per form type, atomic, no duplicates)
   ========================================================= */

/**
 * সাধারণ, পুনর্ব্যবহারযোগ্য atomic কাউন্টার — Configuration শীটে একটি
 * key→value সারি হিসেবে রাখা হয়। key না থাকলে defaultStart মানটি সরাসরি
 * প্রথম মান হিসেবে ব্যবহার হয় (এবং সারি তৈরি হয়), থাকলে তার পরের মান
 * (current + 1) হিসেব করে সারিটি হালনাগাদ করা হয়। কোনো প্যাডিং করা হয়
 * না এখানে — সেটা কলার নিজে প্রয়োজনমতো করবে (যেমন padSerial)।
 */
function getNextCounterValue(cfgSheet, key, defaultStart) {
  const data = cfgSheet.getDataRange().getValues();

  let rowIndex = -1;
  let current = null;
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) {
      rowIndex = i;
      current = data[i][1];
      break;
    }
  }

  let next;
  if (rowIndex === -1) {
    // কনফিগারেশনে না থাকলে ডিফল্ট শুরু-মান বসিয়ে সারি তৈরি করুন
    next = defaultStart;
    cfgSheet.appendRow([key, next]);
  } else {
    next = Number(current) + 1;
    cfgSheet.getRange(rowIndex + 1, 2).setValue(next);
  }
  return next;
}

function getNextSerial(cfgSheet, formType) {
  const key = "Current" + formTypeSuffix(formType) + "Serial";
  const next = getNextCounterValue(cfgSheet, key, defaultStartSerial(formType));
  return padSerial(next); // ৮-সংখ্যা প্যাড করা
}

function formTypeSuffix(formType) {
  // "FORM-1" → "Form1"
  return "Form" + formType.split("-")[1];
}

function defaultStartSerial(formType) {
  return 6800;
}

// new3.py এর সাথে মিলিয়ে ৮-সংখ্যা প্যাডিং (যেমন: 00006800)
function padSerial(n) {
  return String(n).padStart(8, "0");
}

/* =========================================================
   CONFIGURATION (dropdowns, chairman names, base URLs)
   ========================================================= */

function getConfigMap(cfgSheet) {
  const data = cfgSheet.getDataRange().getValues();
  const map = {};
  for (let i = 0; i < data.length; i++) {
    const key = String(data[i][0] || "").trim();
    if (!key) continue;
    if (!map[key]) map[key] = [];
    map[key].push(data[i][1]);
  }
  // সিঙ্গেল-ভ্যালু কী (যেমন base URL, current serial) সরাসরি স্কেলার হিসেবে দিন
  const flat = {};
  Object.keys(map).forEach(k => { flat[k] = map[k].length === 1 ? map[k][0] : map[k]; });
  return flat;
}

function buildFrontendConfig(formType) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfgSheet = ss.getSheetByName(SHEET_CFG);
  const map = getConfigMap(cfgSheet);

  const asList = (v) => (Array.isArray(v) ? v.filter(String) : (v ? [v] : []));

  return {
    unions: asList(map["Union"]),
    wards: asList(map["Ward"]),
    postOffices: asList(map["PostOffice"]),
    villages: asList(map["Village"]),
    chairmen: {
      "সাধারণ চেয়ারম্যান": map["NormalChairmanName"] || "",
      "প্যানেল চেয়ারম্যান": map["PanelChairmanName"] || ""
    }
  };
}

/* =========================================================
   CERTIFICATE / VERIFICATION LOOKUP
   ========================================================= */

function formatStoredIssueDate(issueDate, timestamp) {
  if (issueDate instanceof Date && !isNaN(issueDate.getTime())) {
    return Utilities.formatDate(issueDate, Session.getScriptTimeZone(), "dd-MM-yyyy");
  }
  const asText = String(issueDate || "").trim();
  if (asText) return asText;
  if (timestamp) {
    return Utilities.formatDate(new Date(timestamp), Session.getScriptTimeZone(), "dd-MM-yyyy");
  }
  return "";
}

function getCertificateRecord(id) {
  if (!id) return { success: false, message: "নাগরিক সনদ আইডি পাওয়া যায়নি।" };

  // ★ আইডি এখন সরাসরি স্মারক ক্রমিক (Smarak Serial) — সংখ্যা-নিরাপদভাবে
  // মেলানো হয় যাতে শিটে সংখ্যা বা প্যাড করা টেক্সট যেভাবেই থাকুক না কেন কাজ করে।
  const cleanId = padSerial(Number(String(id).replace(/\D/g, "")) || 0);
  if (Number(cleanId) === 0) return { success: false, message: "সঠিক আইডি পাওয়া যায়নি।" };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_REG);
  if (!sheet) return { success: false, message: "রেকর্ড পাওয়া যায়নি।" };

  const data = sheet.getDataRange().getValues();
  const header = data[0];
  const serialCol = header.indexOf("Smarak Serial");

  for (let i = 1; i < data.length; i++) {
    const rowSerial = padSerial(Number(String(data[i][serialCol]).replace(/\D/g, "")) || 0);
    if (rowSerial === cleanId) {
      const row = data[i];
      const get = (name) => {
        const col = header.indexOf(name);
        return col === -1 ? "" : row[col];
      };

      return {
        success: true,
        record: {
          smarakSerial: get("Smarak Serial"),
          memoNo: get("Memo No"), // পুরনো রেকর্ডে খালি থাকতে পারে — ফ্রন্টএন্ড smarakSerial এ ফলব্যাক করে
          union: get("Union"),
          name: get("Name"),
          nidMasked: get("NID/Birth Reg"),
          fatherName: get("Father's Name"),
          guardianRelation: get("Guardian Relation") || "পিতা",
          motherName: get("Mother's Name"),
          village: get("Village"),
          ward: get("Ward"),
          postOffice: get("Post Office"),
          houseNo: get("House No"),
          chairmanType: get("Chairman Type"),
          chairmanName: get("Chairman Name"),
          upazila: get("Upazila"),
          district: get("District"),
          issueDate: formatStoredIssueDate(get("Issue Date"), get("Timestamp"))
        }
      };
    }
  }
  return { success: false, message: "এই আইডির নাগরিক সনদ পাওয়া যায়নি।" };
}

/**
 * স্মারক ক্রমিক দিয়ে সার্টিফিকেট খুঁজুন (index.html এর সার্চ বক্স ব্যবহার করে)
 * এই সার্চটি সবসময় ব্যাকএন্ড-জেনারেটেড স্মারক ক্রমিকের (৮-সংখ্যা প্যাড করা) সাথেই
 * মিলিয়ে কাজ করে — ব্যবহারকারী ম্যানুয়ালি কোনো ক্রমিক না বসালেও এটি ঠিকভাবে চলে।
 * formType প্যারামিটারটি এখন আর যাচাই/সংরক্ষণ করা হয় না (শুধু ফর্ম ১-ই
 * সমর্থিত), শুধু পুরনো ফ্রন্টএন্ড কলের সাথে সামঞ্জস্যের জন্য রাখা হয়েছে।
 */
function findCertificateBySerial(formType, serial) {
  if (!serial || !String(serial).trim()) return { success: false, message: "স্মারক ক্রমিক লিখুন।" };

  const cleanSerial = padSerial(Number(String(serial).replace(/\D/g, "")) || 0);
  if (Number(cleanSerial) === 0) return { success: false, message: "সঠিক স্মারক ক্রমিক লিখুন।" };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_REG);
  if (!sheet) return { success: false, message: "কোনো রেকর্ড পাওয়া যায়নি।" };

  const data = sheet.getDataRange().getValues();
  const header = data[0];
  const serialCol = header.indexOf("Smarak Serial");
  const linkCol = header.indexOf("Certificate Link");

  for (let i = 1; i < data.length; i++) {
    const rowSerial = padSerial(Number(String(data[i][serialCol]).replace(/\D/g, "")) || 0);
    if (rowSerial === cleanSerial) {
      return {
        success: true,
        certificateLink: data[i][linkCol],
        qrId: rowSerial
      };
    }
  }
  return { success: false, message: "এই স্মারক ক্রমিকে কোনো সার্টিফিকেট পাওয়া যায়নি।" };
}


/* =========================================================
   AUTHENTICATION (লগইন / সেশন / ইউজার ম্যানেজমেন্ট)
   =========================================================
   এই সিস্টেমটি একটি ছোট অফিসের জন্য যথাযথ সুরক্ষা দেয় (পাসওয়ার্ড
   হ্যাশড, সেশন মেয়াদযুক্ত), কিন্তু এন্টারপ্রাইজ-গ্রেড নয়। ব্যবহারিক
   পরামর্শ: (১) ডিফল্ট এডমিন পাসওয়ার্ড এখনই বদলান, (২) শুধু বিশ্বস্ত
   স্টাফদের ইউজারনেম/পাসওয়ার্ড দিন, (৩) শেয়ার্ড কম্পিউটারে কাজ শেষে
   "লগ আউট" চাপুন।
   ========================================================= */

function hashPassword(password, salt) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + "::" + password,
    Utilities.Charset.UTF_8
  );
  return bytes.map(b => ((b < 0 ? b + 256 : b).toString(16)).padStart(2, "0")).join("");
}

function getSessionHours() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const cfgSheet = ss.getSheetByName(SHEET_CFG);
    if (!cfgSheet) return DEFAULT_SESSION_HOURS;
    const map = getConfigMap(cfgSheet);
    const hours = Number(map["SessionHours"]);
    return hours > 0 ? hours : DEFAULT_SESSION_HOURS;
  } catch (e) {
    return DEFAULT_SESSION_HOURS;
  }
}

/**
 * ইউজারনেম ও পাসওয়ার্ড যাচাই করে সফল হলে নতুন সেশন টোকেন তৈরি করে।
 */
function loginUser(username, password) {
  username = String(username || "").trim();
  password = String(password || "");
  if (!username || !password) {
    return { success: false, message: "ইউজারনেম ও পাসওয়ার্ড দিন।" };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateUsersSheet(ss);
  const data = sheet.getDataRange().getValues();
  const header = data[0];
  const uCol = header.indexOf("Username");
  const hCol = header.indexOf("PasswordHash");
  const sCol = header.indexOf("Salt");
  const aCol = header.indexOf("Active");

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][uCol]).trim().toLowerCase() === username.toLowerCase()) {
      const active = String(data[i][aCol]).trim().toUpperCase();
      if (active === "N" || active === "FALSE" || active === "NO") {
        return { success: false, message: "এই অ্যাকাউন্টটি নিষ্ক্রিয় করা আছে। অ্যাডমিনের সাথে যোগাযোগ করুন।" };
      }
      const salt = String(data[i][sCol]);
      const expectedHash = String(data[i][hCol]);
      if (hashPassword(password, salt) === expectedHash) {
        return createSession(String(data[i][uCol]).trim());
      }
      return { success: false, message: "ভুল ইউজারনেম অথবা পাসওয়ার্ড।" };
    }
  }
  return { success: false, message: "ভুল ইউজারনেম অথবা পাসওয়ার্ড।" };
}

function createSession(username) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sessSheet = getOrCreateSessionsSheet(ss);
  cleanupExpiredSessions(sessSheet);

  const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  const now = new Date();
  const expires = new Date(now.getTime() + getSessionHours() * 3600 * 1000);

  sessSheet.appendRow([token, username, now, expires]);

  return {
    success: true,
    token: token,
    username: username,
    expiresAt: expires.toISOString(),
    message: "লগইন সফল হয়েছে।"
  };
}

/**
 * টোকেন বৈধ ও মেয়াদ-উত্তীর্ণ নয় কিনা যাচাই করে; বৈধ হলে ইউজারনেম,
 * নাহলে null ফেরত দেয়। registerSubmission এই ফাংশনের উপরই নির্ভর করে
 * নিরাপত্তার জন্য — শুধু ফ্রন্টএন্ড-গার্ডের উপর নয়।
 */
function validateSession(token) {
  if (!token) return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SESSIONS);
  if (!sheet) return null;

  const data = sheet.getDataRange().getValues();
  const header = data[0];
  const tCol = header.indexOf("Token");
  const uCol = header.indexOf("Username");
  const eCol = header.indexOf("ExpiresAt");
  const now = new Date();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][tCol]) === token) {
      const expires = new Date(data[i][eCol]);
      return expires.getTime() > now.getTime() ? String(data[i][uCol]) : null;
    }
  }
  return null;
}

function logoutUser(token) {
  if (!token) return { success: true };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SESSIONS);
  if (!sheet) return { success: true };

  const data = sheet.getDataRange().getValues();
  const header = data[0];
  const tCol = header.indexOf("Token");
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][tCol]) === token) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return { success: true, message: "লগ আউট সম্পন্ন হয়েছে।" };
}

function cleanupExpiredSessions(sheet) {
  const data = sheet.getDataRange().getValues();
  const header = data[0];
  const eCol = header.indexOf("ExpiresAt");
  const now = new Date();
  // পেছন থেকে সামনে মুছুন যাতে সারি-ইনডেক্স শিফট হওয়ায় সমস্যা না হয়
  for (let i = data.length - 1; i >= 1; i--) {
    const expires = new Date(data[i][eCol]);
    if (expires.getTime() <= now.getTime()) {
      sheet.deleteRow(i + 1);
    }
  }
}

/**
 * নতুন ইউজার যোগ করে অথবা বিদ্যমান ইউজারের পাসওয়ার্ড রিসেট করে।
 * Apps Script এডিটর থেকে ম্যানুয়ালি চালানো যায়, তবে সহজতর উপায়
 * হলো Sheet খুলে কাস্টম মেনু "নাগরিক সনদ" ব্যবহার করা (নিচে onOpen)।
 */
function upsertUser(username, plainPassword, active) {
  username = String(username || "").trim();
  if (!username || !plainPassword) return false;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateUsersSheet(ss);
  const data = sheet.getDataRange().getValues();
  const header = data[0];
  const uCol = header.indexOf("Username");

  const salt = Utilities.getUuid();
  const hash = hashPassword(plainPassword, salt);
  const activeVal = active === false ? "N" : "Y";

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][uCol]).trim().toLowerCase() === username.toLowerCase()) {
      sheet.getRange(i + 1, 1, 1, 4).setValues([[username, hash, salt, activeVal]]);
      return true;
    }
  }
  sheet.appendRow([username, hash, salt, activeVal]);
  return true;
}

function setUserActive(username, activeBool) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateUsersSheet(ss);
  const data = sheet.getDataRange().getValues();
  const header = data[0];
  const uCol = header.indexOf("Username");
  const aCol = header.indexOf("Active");
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][uCol]).trim().toLowerCase() === String(username).trim().toLowerCase()) {
      sheet.getRange(i + 1, aCol + 1).setValue(activeBool ? "Y" : "N");
      return true;
    }
  }
  return false;
}

/* ---------- Google Sheet কাস্টম মেনু (কোড এডিট ছাড়াই ইউজার ম্যানেজমেন্ট) ---------- */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("নাগরিক সনদ")
    .addItem("ব্যবহারকারী যোগ / পাসওয়ার্ড রিসেট করুন", "promptAddOrResetUser")
    .addItem("ব্যবহারকারী নিষ্ক্রিয় করুন", "promptDeactivateUser")
    .addToUi();
}

function promptAddOrResetUser() {
  const ui = SpreadsheetApp.getUi();
  const u = ui.prompt("ব্যবহারকারীর ইউজারনেম লিখুন:", ui.ButtonSet.OK_CANCEL);
  if (u.getSelectedButton() !== ui.Button.OK || !u.getResponseText().trim()) return;

  const p = ui.prompt("নতুন পাসওয়ার্ড লিখুন (কমপক্ষে ৮ অক্ষর):", ui.ButtonSet.OK_CANCEL);
  if (p.getSelectedButton() !== ui.Button.OK) return;
  if (p.getResponseText().length < 8) {
    ui.alert("পাসওয়ার্ড অন্তত ৮ অক্ষরের হতে হবে। আবার মেনু থেকে চেষ্টা করুন।");
    return;
  }

  upsertUser(u.getResponseText().trim(), p.getResponseText());
  ui.alert("সংরক্ষণ করা হয়েছে — ইউজারনেম: " + u.getResponseText().trim());
}

function promptDeactivateUser() {
  const ui = SpreadsheetApp.getUi();
  const u = ui.prompt("কোন ইউজারনেম নিষ্ক্রিয় করতে চান?", ui.ButtonSet.OK_CANCEL);
  if (u.getSelectedButton() !== ui.Button.OK || !u.getResponseText().trim()) return;

  const ok = setUserActive(u.getResponseText().trim(), false);
  ui.alert(ok ? "নিষ্ক্রিয় করা হয়েছে।" : "এই ইউজারনেম খুঁজে পাওয়া যায়নি।");
}

/* =========================================================
   SETUP HELPERS
   ========================================================= */

function getOrCreateRegSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_REG);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_REG);
    sheet.appendRow(REG_HEADERS);
    return sheet;
  }
  // ★ পুরনো লাইভ শিটে নতুন কলাম না থাকলে শেষে যোগ করে দেয় — কোনো কলামের
  // ক্রম/ইনডেক্স পাল্টায় না।
  ensureRegColumn(sheet, "Issue Date");
  ensureRegColumn(sheet, "Guardian Relation");
  return sheet;
}

function ensureRegColumn(sheet, headerName) {
  const last = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, last).getValues()[0];
  if (headers.indexOf(headerName) === -1) {
    sheet.getRange(1, last + 1).setValue(headerName);
  }
}

/**
 * ★ এককালীন ক্লিনআপ (ঐচ্ছিক) ★
 * আপনার লাইভ Google Sheet এই আপডেটের আগে তৈরি হয়ে থাকলে "Registrations"
 * শীটে এখনো পুরনো "Form Type", "QR ID", "Status", "Union Code" কলামগুলো
 * থেকে যেতে পারে। এগুলো এখন কোথাও ব্যবহৃত হয় না:
 *   - Form Type  : এখন শুধু ফর্ম ১-ই সমর্থিত, তাই আলাদা কলামের দরকার নেই।
 *   - QR ID      : সার্টিফিকেট/QR লিংকের আইডি হিসেবে এখন সরাসরি
 *                  "Smarak Serial" ব্যবহার হয় (এটি এমনিতেই ইউনিক)।
 *   - Status     : কোথাও পড়া/দেখানো হয় না (সবসময় "সক্রিয়" বসতো)।
 *   - Union Code : ইউনিয়নের কোড এমনিতেই "Memo No" এর ভেতরে (স্মারক
 *                  প্রিফিক্সে) সংরক্ষিত থাকে।
 * Apps Script এডিটরে এই ফাইল খুলে, ফাংশন তালিকা থেকে
 * "removeUnneededRegColumns" বেছে নিয়ে Run চাপুন — একবারই যথেষ্ট।
 * যে কলাম আগেই মোছা হয়ে গেছে সেটা এড়িয়ে যাবে, তাই একাধিকবার চালালেও
 * সমস্যা নেই।
 */
function removeUnneededRegColumns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_REG);
  if (!sheet) return;

  const toRemove = ["Form Type", "QR ID", "Status", "Union Code"];
  const last = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, last).getValues()[0];

  const indexesToRemove = [];
  toRemove.forEach(name => {
    const idx = headers.indexOf(name);
    if (idx !== -1) indexesToRemove.push(idx);
  });

  // ডানদিক থেকে বামে মুছুন যাতে বাকি কলামগুলোর ইনডেক্স শিফট হয়ে
  // গোলমাল না হয়
  indexesToRemove.sort((a, b) => b - a);
  indexesToRemove.forEach(idx => sheet.deleteColumn(idx + 1));

  Logger.log(indexesToRemove.length + "টি পুরনো কলাম মুছে ফেলা হয়েছে।");
}

function getOrCreateUsersSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_USERS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_USERS);
    sheet.appendRow(USER_HEADERS);
  }
  return sheet;
}

function getOrCreateSessionsSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_SESSIONS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_SESSIONS);
    sheet.appendRow(SESSION_HEADERS);
  }
  return sheet;
}

/**
 * প্রথমবার Apps Script এডিটর থেকে একবার ম্যানুয়ালি রান করুন:
 * এটি Registrations, Configuration, Users ও Sessions শীট + প্রাথমিক
 * নমুনা ডেটা তৈরি করবে — এবং Users শীট খালি থাকলে একটি ডিফল্ট এডমিন
 * অ্যাকাউন্ট তৈরি করবে (নিচে দেখুন)।
 *
 * বিদ্যমান প্রজেক্টে আগে থেকেই "Registrations" শীট থাকলে এই ফাংশন
 * সেটিতে হাত দেবে না (শুধু না থাকলে তৈরি করে)। পুরনো শীটে "Form Type",
 * "QR ID", "Status", "Union Code" কলাম এখনো থাকলে সেগুলো আর দরকার নেই —
 * মুছে ফেলতে উপরের removeUnneededRegColumns() ফাংশনটি একবার রান করুন।
 */
function oneTimeSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  getOrCreateRegSheet(ss);

  let cfg = ss.getSheetByName(SHEET_CFG);
  if (!cfg) {
    cfg = ss.insertSheet(SHEET_CFG);
    cfg.appendRow(["Key", "Value"]);
    const rows = [
      ["CurrentForm1Serial", 6800],
      // লগইন সেশন কত ঘণ্টা বৈধ থাকবে (চাইলে বদলান)
      ["SessionHours", DEFAULT_SESSION_HOURS]
    ];
    rows.forEach(r => cfg.appendRow(r));
  }

  const usersSheet = getOrCreateUsersSheet(ss);
  getOrCreateSessionsSheet(ss);

  const usersData = usersSheet.getDataRange().getValues();
  if (usersData.length <= 1) { // শুধু হেডার আছে, কোনো ইউজার নেই
    const defaultUser = "admin";
    const defaultPass = "ChangeMe@2026";
    upsertUser(defaultUser, defaultPass);
    Logger.log(
      "ডিফল্ট লগইন তৈরি হয়েছে — ইউজারনেম: " + defaultUser + " | পাসওয়ার্ড: " + defaultPass +
      " — অনুগ্রহ করে এখনই লগইন করে Sheet এর 'নাগরিক সনদ' মেনু থেকে পাসওয়ার্ড বদলে নিন।"
    );
  }
}
