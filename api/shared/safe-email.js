// The safe email (Entra otherMails[0]): the private address Microsoft uses to reach a
// person when their account is in trouble. One rule for 个人资料 (api/me) and for the
// IT 管理员's edit form (api/domain): a real address, not the account itself, and not
// mainland free-mail — exactly the mail that stops arriving. Same list as the order
// form (api/order, assets/app.js).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const BLOCKED_EMAIL_DOMAINS = [
  "qq.com", "vip.qq.com", "foxmail.com",
  "163.com", "vip.163.com", "126.com", "vip.126.com", "yeah.net", "188.com",
  "sina.com", "sina.cn", "vip.sina.com",
  "sohu.com", "tom.com", "21cn.com", "aliyun.com",
  "139.com", "189.cn", "wo.cn", "wo.com.cn",
];
function blockedEmail(email) {
  const d = String(email).split("@")[1].toLowerCase();
  return BLOCKED_EMAIL_DOMAINS.some((b) => d === b || d.endsWith("." + b));
}
// "" when acceptable (empty clears it), else the problem.
function safeEmailProblem(v, upn) {
  if (!v) return "";
  if (!EMAIL_RE.test(v)) return "safeEmail: not an email address";
  if (blockedEmail(v)) return "safeEmail: QQ, 163 and other mainland free-mail are not accepted";
  if (v === String(upn || "").toLowerCase()) return "safeEmail: must be different from the Office 365 account";
  return "";
}
module.exports = { EMAIL_RE, BLOCKED_EMAIL_DOMAINS, blockedEmail, safeEmailProblem };
