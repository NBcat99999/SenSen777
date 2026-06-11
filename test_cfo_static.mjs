import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = path.dirname(decodeURIComponent(new URL(import.meta.url).pathname));
let state = JSON.parse(fs.readFileSync(path.join(root, "data", "state.json"), "utf8"));

async function apiRoute(route) {
  const request = route.request();
  const endpoint = request.url().split("/api/", 2)[1];
  if (request.method() === "GET" && endpoint === "state") return route.fulfill({ json: state });
  if (request.method() === "POST") {
    const payload = request.postDataJSON() || {};
    if (endpoint === "object") state[payload.key] = payload.value;
    if (endpoint === "item") {
      state[payload.collection] ||= [];
      state[payload.collection].unshift(payload.item);
    }
    if (endpoint === "update") {
      const item = (state[payload.collection] || []).find((x) => x.id === payload.id);
      if (item) Object.assign(item, payload.changes);
    }
    return route.fulfill({ json: { ok: true, state } });
  }
  return route.fulfill({ status: 404, body: "not found" });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
await page.route("**/api/**", apiRoute);
await page.goto(pathToFileURL(path.join(root, "index.html")).href, { waitUntil: "networkidle" });

assert((await page.locator("#dashboardMetrics .metric").count()) === 7, "核心指标数量错误");
assert((await page.locator("#managementActions .action-item").count()) <= 3, "管理动作超过三项");
assert((await page.locator("#operatingPulse .pulse-row").count()) === 7, "经营脉冲不完整");
assert((await page.locator("#professionalMetrics .metric").count()) === 16, "专业指标不完整");
assert((await page.locator("#glossaryRows tr").count()) >= 20, "指标词典不完整");
assert((await page.locator("#rulebookRows tr").count()) === 12, "CFO 规则手册不完整");
assert((await page.locator("#compassDimensions .dimension-row").count()) === 5, "规则罗盘不完整");
assert((await page.locator("dialog").count()) === 0, "页面包含对话框");

await page.getByRole("button", { name: "报销票据", exact: true }).click();
assert((await page.locator("#reimbursementMetrics .metric").count()) === 3, "报销指标不完整");
assert((await page.locator("#reimbursementImpact").innerText()).includes("即时联动"), "缺少报销联动预览");

await page.getByRole("button", { name: "客户模型", exact: true }).click();
assert((await page.locator("#customerRows tr").count()) === 40, "演示客户数量错误");
assert((await page.locator("#customerMetrics .metric").count()) === 6, "客户联动指标不完整");

await page.getByRole("button", { name: "收支成本", exact: true }).click();
assert((await page.locator("#financeInputMetrics .metric").count()) === 6, "收支成本指标不完整");
assert((await page.locator("#incomeForm").count()) === 1, "缺少收入录入口");
assert((await page.locator("#costForm").count()) === 1, "缺少成本录入口");

await page.getByRole("button", { name: "分红规则", exact: true }).click();
assert((await page.locator("#dividendRuleMetrics .metric").count()) === 6, "分红规则指标不完整");
assert((await page.locator("#dividendRulesForm").count()) === 1, "缺少可编辑分红规则");

await page.getByRole("button", { name: "代账交接", exact: true }).click();
assert((await page.locator("#accountingMetrics .metric").count()) === 6, "代账指标不完整");

await page.getByRole("button", { name: "融资雷达", exact: true }).click();
assert((await page.locator("#fundraisingMetrics .metric").count()) === 6, "融资指标不完整");
assert((await page.locator("#investorTargets .target-card").count()) >= 8, "融资候选库不完整");
assert((await page.locator("#capitalRadar .radar-score-row").count()) === 8, "投行资本适配雷达不完整");

assert(errors.length === 0, `页面控制台错误：${errors.join("；")}`);
await browser.close();
console.log("PASS: simplified light CFO workbench with linked income and cost ledgers");
