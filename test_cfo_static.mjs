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
    if (endpoint === "object") state[payload.key] = { ...(state[payload.key] || {}), ...payload.value };
    if (endpoint === "item") {
      state[payload.collection] ||= [];
      state[payload.collection].unshift(payload.item);
    }
    if (endpoint === "contract") {
      state.contracts ||= [];
      state.contracts.unshift(payload.item);
    }
    if (endpoint === "update" || endpoint === "contract-update") {
      const collection = endpoint === "contract-update" ? "contracts" : payload.collection;
      const item = (state[collection] || []).find((x) => x.id === payload.id);
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
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
await page.route("**/api/**", apiRoute);
await page.goto(pathToFileURL(path.join(root, "index.html")).href, { waitUntil: "networkidle" });

assert((await page.locator("#dashboardMetrics .metric").count()) === 6, "驾驶舱指标数量错误");
assert((await page.locator("#compassDimensions .dimension-row").count()) === 5, "经营罗盘不完整");
assert((await page.locator("#professionalMetrics .metric").count()) === 6, "专业指标不完整");
assert((await page.locator("#glossaryRows tr").count()) >= 12, "指标词典不完整");
assert((await page.locator("dialog").count()) === 0, "页面包含对话框");

await page.getByRole("button", { name: "合同与回款", exact: true }).click();
assert((await page.locator("#contractForm").count()) === 1, "缺少合同录入口");
assert((await page.locator("#incomeForm").count()) === 1, "缺少收入回款录入口");
assert((await page.locator("#contractMetrics .metric").count()) === 6, "合同指标不完整");

await page.getByRole("button", { name: "成本与工资", exact: true }).click();
assert((await page.locator("#employeeForm").count()) === 1, "缺少员工录入口");
assert((await page.locator("#costForm").count()) === 1, "缺少成本录入口");

await page.getByRole("button", { name: "股权与分红", exact: true }).click();
assert((await page.locator("#shareholderForm").count()) === 1, "缺少股东录入口");
assert((await page.locator("#dividendRulesForm").count()) === 1, "缺少分红参数录入口");

await page.getByRole("button", { name: "融资执行", exact: true }).click();
assert((await page.locator("#fundingRoundForm").count()) === 1, "缺少融资轮次录入口");
assert((await page.locator("#investorForm").count()) === 1, "缺少机构管线录入口");
assert((await page.locator("#dataRoomRows .check-row").count()) === 8, "融资资料室清单不完整");

await page.getByRole("button", { name: "报销与代账", exact: true }).click();
assert((await page.locator("#reimbursementForm").count()) === 1, "缺少报销录入口");
assert((await page.locator("#accountingMetrics .metric").count()) === 6, "代账指标不完整");

assert(errors.length === 0, `页面控制台错误：${errors.join("；")}`);
await browser.close();
console.log("PASS: operational CFO workbench exposes all core input workflows");
