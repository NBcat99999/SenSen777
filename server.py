#!/usr/bin/env python3
from __future__ import annotations

import cgi
import copy
import csv
import hashlib
import io
import json
import mimetypes
import os
import shutil
import threading
import time
import uuid
import zipfile
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote_plus, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
STATE_FILE = DATA / "state.json"
UPLOADS = DATA / "evidence"
REIMBURSEMENTS = DATA / "reimbursements"
WEEKLY = DATA / "weekly"
RULES = DATA / "rules"
BACKUPS = ROOT / "backups"
STATE_BACKUPS = BACKUPS / "state-versions"
LOCK = threading.RLock()
SCHEMA_VERSION = 4
DIVIDEND_RULE_FILE = RULES / "FutureFlow_PMF阶段期权分红.xlsx"

INVESTOR_TARGETS = [
    {"id":"cn-oxyz","name":"OXYZ资本","baseScore":88,"focus":["数据","出境出海","电商","人工智能"],"stage":"天使轮/种子轮","channel":"财务投资","ticket":"300万至1500万元","reason":"公开策略聚焦中国及中国团队出海的人工智能应用，和海外获客、数字营销、企业服务交叉度较高。","url":"https://www.oxyzcapital.com/"},
    {"id":"cn-trip","name":"携程集团产业合作及战略投资","baseScore":91,"focus":["旅游","大交通","数据","新兴入境"],"stage":"战略合作/产业投资","channel":"产业资本","ticket":"项目制评估","reason":"旅游、交通、数据和人工智能协同度最高，现阶段更适合先争取业务合作、生态接入和联合案例。","url":"https://group.trip.com/"},
    {"id":"cn-hunan-tourism","name":"湖南旅游产业母基金及马栏山文化科技基金","baseScore":82,"focus":["旅游","新兴入境","数据","文化科技"],"stage":"早期/成长期","channel":"政府产业基金","ticket":"项目制评估","reason":"公开方向覆盖文化旅游、人工智能和数字文旅，适合有区域落地、文旅资源整合及示范项目的企业。","url":"https://gzw.hunan.gov.cn/gzjg/gqdt/202505/t20250523_33680546.html"},
    {"id":"cn-xianghe","name":"襄禾资本","baseScore":79,"focus":["数据","大交通","人工智能"],"stage":"A轮及以后","channel":"财务投资","ticket":"机构评估","reason":"关注技术创新、人工智能及汽车产业链；Future Flow 需要更强产品化、增长和数据壁垒后再重点接触。","url":"https://www.xianghecap.com/"},
    {"id":"cn-ally","name":"曦域资本","baseScore":81,"focus":["数据","企业服务","金融科技"],"stage":"早期/成长期","channel":"财务投资","ticket":"机构评估","reason":"团队背景覆盖数据科学和互联网技术，适合突出数据资产、算法驱动和企业服务效率。","url":"https://www.allycapital.cn/"},
    {"id":"cn-idg","name":"IDG资本","baseScore":76,"focus":["数据","电商","消费科技","出境出海"],"stage":"早期至成长期","channel":"财务投资","ticket":"机构评估","reason":"覆盖消费科技和中国企业全球化，但当前客户规模和标准化程度距离其常见成熟度仍有差距。","url":"https://www.idgcap.com/"},
    {"id":"cn-zhen","name":"真格基金","baseScore":84,"focus":["数据","出境出海","电商","企业服务"],"stage":"天使轮/种子轮","channel":"财务投资","ticket":"早期项目评估","reason":"适合创始人驱动的早期科技项目；需要用客户续费、单位经济和产品市场匹配证据替代概念叙事。","url":"https://www.zhenfund.com/"},
    {"id":"cn-shunwei","name":"顺为资本","baseScore":77,"focus":["数据","电商","出境出海","消费科技"],"stage":"早期至成长期","channel":"财务投资","ticket":"机构评估","reason":"可关注人工智能应用与消费互联网交叉机会，但需要形成可规模化产品与显著增长。","url":"https://www.shunwei.com/"},
    {"id":"cn-qiming","name":"启明创投","baseScore":73,"focus":["数据","企业服务","人工智能"],"stage":"A轮及以后","channel":"财务投资","ticket":"机构评估","reason":"科技和企业服务方向相关，但机构门槛较高，宜在年度经常性收入和留存指标显著提升后进入。","url":"https://www.qimingvc.com/"},
    {"id":"cn-linear","name":"线性资本","baseScore":85,"focus":["数据","企业服务","人工智能"],"stage":"天使轮至A轮","channel":"财务投资","ticket":"早期项目评估","reason":"数据智能与企业服务匹配度较高，应重点证明产品化交付、数据闭环和毛利提升空间。","url":"https://www.linear.vc/"},
    {"id":"cn-gobi","name":"戈壁创投","baseScore":83,"focus":["出境出海","电商","数据"],"stage":"早期投资","channel":"财务投资","ticket":"早期项目评估","reason":"跨境与区域网络具有协同价值，可突出中国旅游服务商连接海外客源的数字基础设施定位。","url":"https://gobi.vc/"},
    {"id":"cn-hiddenhill","name":"隐山资本","baseScore":70,"focus":["大交通","物流","数据"],"stage":"成长期","channel":"产业资本","ticket":"机构评估","reason":"更偏物流与供应链，只有在大交通数据、旅行供应链或跨境履约形成明确产品后才具备较强匹配。","url":"https://www.hiddenhillcap.com/"},
    {"id":"cn-alibaba","name":"阿里巴巴战略投资","baseScore":78,"focus":["电商","出境出海","数据","旅游"],"stage":"战略合作/成长期","channel":"产业资本","ticket":"战略评估","reason":"与电商、飞猪酒旅及企业出海生态存在潜在协同，当前应先从生态合作和客户场景切入。","url":"https://www.alibabagroup.com/"},
    {"id":"cn-tencent","name":"腾讯投资","baseScore":75,"focus":["数据","企业服务","电商","出境出海"],"stage":"多阶段","channel":"产业资本","ticket":"战略评估","reason":"具备流量、企业服务和出海生态协同，但需要产品技术壁垒及规模化证据。","url":"https://www.tencent.com/"},
    {"id":"cn-baidu","name":"百度风投及战略投资","baseScore":77,"focus":["数据","人工智能","大交通"],"stage":"早期至成长期","channel":"产业资本","ticket":"机构评估","reason":"适合强调人工智能搜索、智能营销和数据产品能力，纯代运营模式匹配度较低。","url":"https://www.baidu.com/"},
    {"id":"cn-lenovo","name":"联想创投","baseScore":74,"focus":["数据","人工智能","企业服务"],"stage":"早期至成长期","channel":"产业资本","ticket":"机构评估","reason":"更重技术与产业数字化，需证明核心技术、软件产品和跨行业复制能力。","url":"https://www.lcf.vc/"},
    {"id":"cn-szvc","name":"深圳市创新投资集团","baseScore":76,"focus":["数据","电商","数字经济"],"stage":"早期至成长期","channel":"政府产业基金","ticket":"区域项目评估","reason":"综合型本土创投平台，适合结合注册地、区域贡献、专精特新及数字经济政策申报。","url":"https://www.szvc.com.cn/"},
    {"id":"cn-sdic","name":"国投创业","baseScore":65,"focus":["数据","产业数字化","大交通"],"stage":"成长期","channel":"政府产业基金","ticket":"机构评估","reason":"现阶段成熟度偏低，待产品和收入规模提升后可从产业数字化方向评估。","url":"https://www.sdicvc.com/"},
    {"id":"cn-casstar","name":"中科创星","baseScore":68,"focus":["数据","人工智能","硬科技"],"stage":"早期投资","channel":"财务投资","ticket":"早期项目评估","reason":"更偏硬科技和技术成果转化，只有形成可验证的核心算法或知识产权后匹配度才会上升。","url":"https://www.casstar.com.cn/"},
    {"id":"cn-plum","name":"梅花创投","baseScore":82,"focus":["电商","出境出海","消费科技"],"stage":"天使轮/种子轮","channel":"财务投资","ticket":"早期项目评估","reason":"早期、消费与出海属性相关，适合用创始团队、增长速度和渠道效率切入。","url":"https://www.plumventures.cn/"},
    {"id":"cn-frees","name":"峰瑞资本","baseScore":80,"focus":["数据","电商","企业服务"],"stage":"早期投资","channel":"财务投资","ticket":"早期项目评估","reason":"科技和消费交叉方向相关，需提供清晰的客户价值、增长飞轮和数据资产。","url":"https://www.freesvc.com/"},
    {"id":"cn-gaorong","name":"高榕创投","baseScore":77,"focus":["电商","数据","企业服务"],"stage":"早期至成长期","channel":"财务投资","ticket":"机构评估","reason":"互联网和企业服务相关，但需要更高收入增长和产品标准化程度。","url":"https://www.banyancapital.com/"},
    {"id":"cn-lightspeed","name":"光速光合","baseScore":76,"focus":["数据","电商","企业服务"],"stage":"早期至成长期","channel":"财务投资","ticket":"机构评估","reason":"企业服务和消费互联网具备交集，当前应先补齐留存和单位经济模型。","url":"https://www.lsvp.com/"},
    {"id":"cn-visionplus","name":"元璟资本","baseScore":79,"focus":["电商","出境出海","数据"],"stage":"早期投资","channel":"财务投资","ticket":"早期项目评估","reason":"数字经济和企业创新方向相关，跨境获客及电商场景有一定适配性。","url":"https://www.visionpluscapital.com/"},
]


DEFAULT_FUNDING_SIGNALS = [
    {"title":"携程 TripGenie 人工智能辅助订单量同比增长约 400%","source":"Trip.com Group（携程集团）","date":"2026-02-24","link":"https://www.trip.com/newsroom"},
    {"title":"湖南旅游产业母基金参与设立首期 20 亿元马栏山文化科技基金","source":"湖南省国资委","date":"2025-05-23","link":"https://gzw.hunan.gov.cn/gzjg/gqdt/202505/t20250523_33680546.html"},
    {"title":"文化和旅游部技术创新中心推进文旅大模型、智能体及数据资产可信流通","source":"文化和旅游部","date":"2025-10-16","link":"https://www.mct.gov.cn/preview/special/kygz/whhlykjcxcg/202510/t20251016_962781.htm"},
    {"title":"人工智能未来设计大赛设置文旅应用赛，推动人工智能与文旅产业融合","source":"文化和旅游部","date":"2025-06-11","link":"https://www.mct.gov.cn/whzx/zsdw/zgwhcmjtyxgs/202506/t20250611_960513.html"},
]


def now_iso():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def timestamp_id():
    return datetime.now().astimezone().strftime("%Y%m%d-%H%M%S-%f")


def merge_records_preserving_existing(existing, defaults):
    existing = existing if isinstance(existing, list) else []
    defaults = defaults if isinstance(defaults, list) else []
    known_ids = {item.get("id") for item in existing if isinstance(item, dict)}
    result = copy.deepcopy(existing)
    for item in defaults:
        if isinstance(item, dict) and item.get("id"):
            if item["id"] not in known_ids:
                result.append(copy.deepcopy(item))
                known_ids.add(item["id"])
        elif item not in result:
            result.append(copy.deepcopy(item))
    return result


def merge_state_preserving_current(current, incoming):
    """Import without deleting current values or records."""
    result = copy.deepcopy(current)
    for key, value in incoming.items():
        if key not in result:
            result[key] = copy.deepcopy(value)
        elif isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = merge_state_preserving_current(result[key], value)
        elif isinstance(result[key], list) and isinstance(value, list):
            result[key] = merge_records_preserving_existing(result[key], value)
    return result


def add_missing_fields(target, defaults):
    """Only add missing structure. Existing values and records always win."""
    if not isinstance(target, dict) or not isinstance(defaults, dict):
        return target
    for key, default in defaults.items():
        if key not in target:
            target[key] = default
        elif isinstance(target[key], dict) and isinstance(default, dict):
            add_missing_fields(target[key], default)
    return target


def migrate_state_preserving_data(state):
    if not isinstance(state, dict):
        raise ValueError("核心数据必须是 JSON 对象")
    defaults = seed_state()
    add_missing_fields(state, defaults)
    state["investorTargets"] = merge_records_preserving_existing(
        state.get("investorTargets"), INVESTOR_TARGETS
    )
    state["schemaVersion"] = max(int(state.get("schemaVersion", 0)), SCHEMA_VERSION)
    return state


def validate_state(state):
    if not isinstance(state, dict):
        raise ValueError("核心数据格式错误")
    for key in ("transactions", "incomeEntries", "costItems", "reimbursements", "accounts", "audit"):
        if not isinstance(state.get(key), list):
            raise ValueError(f"{key} 必须为列表")
    json.dumps(state, ensure_ascii=False)


def snapshot_state(reason="save"):
    if not STATE_FILE.exists():
        return None
    STATE_BACKUPS.mkdir(parents=True, exist_ok=True)
    safe_reason = "".join(char if char.isalnum() or char in "-_" else "-" for char in reason)[:60]
    destination = STATE_BACKUPS / f"{timestamp_id()}-{safe_reason or 'save'}.json"
    shutil.copy2(STATE_FILE, destination)
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    destination.with_suffix(".sha256").write_text(
        f"{digest}  {destination.name}\n", encoding="utf-8"
    )
    return destination


def seed_state():
    today = date.today()
    return {
        "settings": {"companyName": "Future Flow", "reportOwner": "", "currency": "CNY", "weeklyDay": "0"},
        "schemaVersion": SCHEMA_VERSION,
        "accounts": [
            {"id": "acc-bank", "name": "公司基本户", "openingBalance": 0},
            {"id": "acc-cash", "name": "备用金", "openingBalance": 0},
        ],
        "transactions": [],
        "incomeEntries": [],
        "costItems": [],
        "dividendRules": {
            "founderPool": 60,
            "cofounderPool": 30,
            "employeeEsop": 10,
            "vestingYearsMin": 4,
            "vestingYearsMax": 5,
            "cliffMonths": 12,
            "pmfDividendRate": 0,
            "retentionReserveRate": 20,
            "afterTaxProfit": 1000000,
            "qualifiedFinancing": 5000000,
            "founderDeferredCompCap": 300000,
            "financingBonusRate": 5,
            "leaverRepurchase": "无离职回购",
            "updatedFrom": "FutureFlow_PMF阶段期权分红.xlsx",
        },
        "evidence": [],
        "reimbursements": [],
        "demoMode": True,
        "demoCustomers": [],
        "operating": {"customers": 0, "mrr": 0},
        "investorTargets": INVESTOR_TARGETS,
        "fundingSignals": DEFAULT_FUNDING_SIGNALS,
        "assumptions": {"openingCash": 0, "employees": 0, "fixedCost": 0, "grossMargin": 0, "growthRate": 0, "churnRate": 0, "fundingTarget": 0, "postFundingBurn": 0},
        "budgets": [],
        "obligations": [],
        "investors": [],
        "shareholders": [],
        "risks": [],
        "governance": {
            "规范会计账簿": False, "合同台账完整": False, "发票与流水一致": False, "工资社保合规": False,
            "知识产权归属完整": False, "数据隐私文件完整": False, "股权无代持争议": False, "重大付款双人审批": False,
        },
        "readiness": {
            "客户合同与回款可核验": False, "经常性收入可单独识别": False, "至少一批客户完成续费": False,
            "毛利率与交付工时可核验": False, "案例数据具有原始证据": False, "知识产权归属清晰": False,
            "劳动与社保合规": False, "融资数据房已建立": False,
        },
        "weeklyReports": [],
        "audit": [{"id": uuid.uuid4().hex, "at": now_iso(), "action": "系统初始化", "detail": "创建 CFO 工作中台基础数据"}],
        "updatedAt": now_iso(),
    }


def load_state():
    DATA.mkdir(exist_ok=True)
    UPLOADS.mkdir(exist_ok=True)
    REIMBURSEMENTS.mkdir(exist_ok=True)
    WEEKLY.mkdir(exist_ok=True)
    RULES.mkdir(exist_ok=True)
    if not STATE_FILE.exists():
        state = seed_state()
        save_state(state, "initial-create")
        return state
    try:
        state = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        state = migrate_state_preserving_data(state)
        validate_state(state)
    except Exception:
        versions = sorted(STATE_BACKUPS.glob("*.json"), reverse=True)
        state = None
        for version in versions:
            try:
                candidate = json.loads(version.read_text(encoding="utf-8"))
                candidate = migrate_state_preserving_data(candidate)
                validate_state(candidate)
                state = candidate
                break
            except Exception:
                continue
        if state is None:
            raise
    return state


def save_state(state, reason="save"):
    validate_state(state)
    snapshot_state(reason)
    state["updatedAt"] = now_iso()
    state["schemaVersion"] = max(int(state.get("schemaVersion", 0)), SCHEMA_VERSION)
    temp = STATE_FILE.with_suffix(f".{uuid.uuid4().hex}.tmp")
    try:
        with temp.open("w", encoding="utf-8") as handle:
            json.dump(state, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        json.loads(temp.read_text(encoding="utf-8"))
        temp.replace(STATE_FILE)
    except Exception:
        temp.unlink(missing_ok=True)
        raise


def audit(state, action, detail):
    state.setdefault("audit", []).insert(0, {"id": uuid.uuid4().hex, "at": now_iso(), "action": action, "detail": detail})
    state["audit"] = state["audit"][:500]


def money(value):
    return f"¥{float(value or 0):,.0f}"


def financial_snapshot(state, month=None):
    month = month or str(date.today())[:7]
    transactions = state.get("transactions", [])
    income_entries = state.get("incomeEntries", [])
    cost_items = state.get("costItems", [])
    claims = [x for x in state.get("reimbursements", []) if x.get("status") != "已驳回"]
    pending = [x for x in claims if x.get("status") == "待审核"]
    approved = [x for x in claims if x.get("status") == "已审核"]
    paid = [x for x in claims if x.get("status") == "已支付"]
    recognized = [x for x in claims if x.get("status") in ("已审核", "已支付")]
    amount = lambda rows: sum(float(x.get("amount", 0)) for x in rows)
    cost_amount = lambda row: float(row.get("unitAmount", 0)) * float(row.get("quantity", 0))
    in_month = lambda rows: [x for x in rows if x.get("date", "").startswith(month)]
    def cost_in_month(row):
        if row.get("frequency") != "monthly":
            return row.get("date", "").startswith(month)
        start = str(row.get("date") or row.get("startDate") or "")[:7]
        end = str(row.get("endDate") or "")[:7]
        return bool(start) and start <= month and (not end or end >= month)
    income = [x for x in transactions if x.get("type") == "income"]
    financing = [x for x in transactions if x.get("type") == "financing"]
    expense = [x for x in transactions if x.get("type") == "expense"]
    recognized_income = [x for x in income_entries if x.get("status") in ("已确认", "已回款")]
    received_income = [x for x in income_entries if x.get("status") == "已回款"]
    recognized_costs = [x for x in cost_items if x.get("status") in ("已发生", "已支付")]
    paid_costs = [x for x in cost_items if x.get("status") == "已支付"]
    month_costs = [x for x in cost_items if x.get("status") != "暂停" and cost_in_month(x)]
    opening = sum(float(x.get("openingBalance", 0)) for x in state.get("accounts", []))
    actual_cash = opening + amount(income) + amount(financing) + amount(received_income) - amount(expense) - sum(cost_amount(x) for x in paid_costs) - amount(paid)
    committed = amount(pending) + amount(approved)
    committed_costs = sum(cost_amount(x) for x in month_costs if x.get("status") == "已发生")
    available_cash = actual_cash - committed - committed_costs
    month_income = amount(in_month(income)) + amount(in_month(received_income))
    month_accrued_revenue = amount(in_month(recognized_income))
    month_transaction_expense = amount(in_month(expense))
    month_recognized_costs = sum(cost_amount(x) for x in month_costs if x.get("status") in ("已发生", "已支付"))
    month_paid_costs = sum(cost_amount(x) for x in in_month(paid_costs))
    month_budget_costs = sum(cost_amount(x) for x in month_costs)
    direct_cost_run_rate = sum(cost_amount(x) for x in month_costs if x.get("costNature") == "direct")
    operating_cost_run_rate = month_budget_costs - direct_cost_run_rate
    month_paid_claims = amount(in_month(paid))
    month_recognized_claims = amount(in_month(recognized))
    cash_outflow = month_transaction_expense + month_paid_costs + month_paid_claims
    accrual_expense = month_transaction_expense + month_recognized_costs + month_recognized_claims
    assumptions = state.get("assumptions", {})
    operating = state.get("operating", {})
    detailed_costs = any(x.get("status") != "暂停" for x in cost_items)
    fixed_cost = month_budget_costs if detailed_costs else float(assumptions.get("fixedCost", 0))
    planning_customers = [
        x for x in state.get("demoCustomers", [])
        if x.get("active", True) and x.get("status") not in ("暂停服务", "已流失")
    ] if state.get("demoMode") else []
    if planning_customers:
        mrr = sum(float(x.get("mrr", 0)) for x in planning_customers)
        gross_margin = (
            sum(float(x.get("mrr", 0)) * float(x.get("grossMargin", 0)) for x in planning_customers) / mrr
            if mrr else 0
        )
    else:
        mrr = float(operating.get("mrr", 0))
        gross_margin = float(assumptions.get("grossMargin", 0))
    modeled_income = mrr + sum(
        float(x.get("setupRevenue", 0)) for x in planning_customers
        if str(x.get("startDate", "")).startswith(month)
    )
    if detailed_costs and modeled_income:
        gross_margin = max(0, (modeled_income - direct_cost_run_rate) / modeled_income * 100)
    projected_gross_profit = max(0, modeled_income - direct_cost_run_rate)
    projected_net_burn = max(0, fixed_cost + month_recognized_claims - modeled_income)
    runway = available_cash / projected_net_burn if projected_net_burn else 99
    open_ar = amount([x for x in state.get("obligations", []) if x.get("type") == "receivable" and x.get("status") != "已结清"])
    trade_ap = amount([x for x in state.get("obligations", []) if x.get("type") == "payable" and x.get("status") != "已结清"])
    cost_ap = sum(cost_amount(x) for x in recognized_costs if x.get("status") == "已发生")
    open_ap = trade_ap + amount(approved) + cost_ap
    ticket_rows = [
        bool(x.get("invoiceNo") or any(e.get("transactionId") == x.get("id") for e in state.get("evidence", [])))
        for x in expense
    ] + [bool(x.get("invoiceNo") or x.get("attachmentId")) for x in claims] + [
        bool(x.get("invoiceNo")) for x in recognized_costs
    ]
    ticket_rate = round(sum(ticket_rows) / len(ticket_rows) * 100) if ticket_rows else 100
    return {
        "actualCash": actual_cash, "availableCash": available_cash, "committedReimbursements": committed,
        "committedOperatingCosts": committed_costs, "monthIncome": month_income,
        "monthAccruedRevenue": month_accrued_revenue, "cashOutflow": cash_outflow, "accrualExpense": accrual_expense,
        "monthPaidCosts": month_paid_costs, "monthRecognizedCosts": month_recognized_costs,
        "monthBudgetCosts": month_budget_costs, "directCostRunRate": direct_cost_run_rate,
        "operatingCostRunRate": operating_cost_run_rate,
        "monthRecognizedClaims": month_recognized_claims, "mrr": mrr, "grossMargin": gross_margin,
        "projectedNetBurn": projected_net_burn, "runway": runway, "openAR": open_ar, "openAP": open_ap,
        "ticketRate": ticket_rate, "cashBurn": max(0, cash_outflow - month_income),
    }


def weekly_report(state):
    today = date.today()
    start = today - timedelta(days=today.weekday())
    txs = state.get("transactions", [])
    income = sum(float(x["amount"]) for x in txs if x["type"] in ("income", "financing") and x["date"] >= str(start))
    income += sum(float(x.get("amount", 0)) for x in state.get("incomeEntries", []) if x.get("status") == "已回款" and x.get("date", "") >= str(start))
    week_paid_claims = sum(float(x.get("amount", 0)) for x in state.get("reimbursements", []) if x.get("status") == "已支付" and x.get("date", "") >= str(start))
    week_paid_costs = sum(float(x.get("unitAmount", 0)) * float(x.get("quantity", 0)) for x in state.get("costItems", []) if x.get("status") == "已支付" and x.get("date", "") >= str(start))
    expense = sum(float(x["amount"]) for x in txs if x["type"] == "expense" and x["date"] >= str(start)) + week_paid_costs + week_paid_claims
    snapshot = financial_snapshot(state)
    open_risks = [x for x in state.get("risks", []) if x.get("status") != "已关闭"]
    financing = sum(float(x.get("amount", 0)) * float(x.get("probability", 0)) / 100 for x in state.get("investors", []) if x.get("stage") != "已关闭")
    alerts = []
    if snapshot["runway"] < 6: alerts.append("现金可支撑时间低于 6 个月，应立即控制招聘与非核心支出。")
    if snapshot["ticketRate"] < 90: alerts.append("资金证据完整度低于 90%，需优先补齐合同、发票和银行回单。")
    if snapshot["committedReimbursements"] > 0: alerts.append(f"待审核及待支付报销合计 {money(snapshot['committedReimbursements'])}，已从可用现金中预留。")
    if any(x.get("level") in ("高", "重大") for x in open_risks): alerts.append("存在高等级未关闭风险，应在董事会/管理层会议中跟踪。")
    overdue = [x for x in state.get("obligations", []) if x.get("status") != "已结清" and x.get("dueDate", "9999") < str(today)]
    if overdue: alerts.append(f"存在 {len(overdue)} 笔逾期应收/应付，需要立即处理。")
    report = {
        "id": f"week-{start.isoformat()}", "weekStart": start.isoformat(), "generatedAt": now_iso(),
        "summary": {"weekIncome": income, "weekExpense": expense, "netCash": income-expense, "cash": snapshot["actualCash"], "availableCash": snapshot["availableCash"], "runway": snapshot["runway"], "evidenceRate": snapshot["ticketRate"], "weightedFinancing": financing},
        "alerts": alerts or ["本周未触发重大财务预警。"],
        "actions": [
            "逐笔核对本周资金流水与证据文件。",
            "更新未来 13 周现金预测及到期应收应付。",
            "推动融资管道中到期的下一步行动。",
            "复核高风险事项及整改责任人。",
        ],
    }
    return report


def ensure_weekly(state):
    report = weekly_report(state)
    reports = state.setdefault("weeklyReports", [])
    existing_index = next((i for i, item in enumerate(reports) if item["id"] == report["id"]), None)
    if existing_index is None:
        state["weeklyReports"].insert(0, report)
        audit(state, "自动生成周报", report["id"])
    else:
        state["weeklyReports"][existing_index] = report
        save_state(state, "weekly-refresh")


STATE = load_state()
ensure_weekly(STATE)


class Server(ThreadingHTTPServer):
    daemon_threads = True


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        if not self.path.startswith("/api/"):
            super().log_message(fmt, *args)

    def end_headers(self):
        if urlparse(self.path).path.endswith((".html", ".css", ".js")) or urlparse(self.path).path == "/":
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
            self.send_header("Pragma", "no-cache")
        super().end_headers()

    def json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def body_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length) or b"{}")

    def do_GET(self):
        global STATE
        path = urlparse(self.path).path
        if path == "/api/health":
            return self.json({"ok": True, "updatedAt": STATE.get("updatedAt")})
        if path == "/api/state":
            with LOCK: return self.json(STATE)
        if path == "/api/backup":
            body = json.dumps(STATE, ensure_ascii=False, indent=2).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Disposition", f'attachment; filename="futureflow-cfo-backup-{date.today()}.json"')
            self.send_header("Content-Length", str(len(body)))
            self.end_headers(); self.wfile.write(body); return
        if path == "/api/rule-file/dividend":
            if not DIVIDEND_RULE_FILE.exists(): return self.send_error(404)
            body = DIVIDEND_RULE_FILE.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            self.send_header("Content-Disposition", 'attachment; filename="FutureFlow_PMF阶段期权分红.xlsx"')
            self.send_header("Content-Length", str(len(body)))
            self.end_headers(); self.wfile.write(body); return
        if path.startswith("/api/evidence/"):
            evidence_id = path.rsplit("/", 1)[-1]
            item = next((x for x in STATE.get("evidence", []) if x["id"] == evidence_id), None)
            if not item: return self.send_error(404)
            file = UPLOADS / item["storedName"]
            if not file.exists(): return self.send_error(404)
            body = file.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(item["fileName"])[0] or "application/octet-stream")
            self.send_header("Content-Disposition", f'attachment; filename="{item["fileName"]}"')
            self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body); return
        if path.startswith("/api/reimbursement-file/"):
            attachment_id = path.rsplit("/", 1)[-1]
            item = next((x for x in STATE.get("reimbursements", []) if x.get("attachmentId") == attachment_id), None)
            if not item or not item.get("storedName"): return self.send_error(404)
            file = REIMBURSEMENTS / item["storedName"]
            if not file.exists(): return self.send_error(404)
            body = file.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(item.get("fileName", ""))[0] or "application/octet-stream")
            self.send_header("Content-Disposition", f'attachment; filename="{item.get("fileName", "attachment")}"')
            self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body); return
        if path == "/api/export/accounting":
            month = parse_qs(urlparse(self.path).query).get("month", [str(date.today())[:7]])[0]
            return self.export_accounting(month)
        if path.startswith("/api/export/"):
            kind = path.rsplit("/", 1)[-1]
            return self.export_csv(kind)
        super().do_GET()

    def export_csv(self, kind):
        rows = STATE.get("transactions" if kind == "ledger" else "investors", [])
        if kind == "ledger":
            fields = ["date","type","amount","account","counterparty","category","project","contractNo","invoiceNo","bankRef","purpose"]
        else:
            fields = ["name","type","stage","amount","probability","nextDate","owner","thesis","nextAction"]
        out = io.StringIO(); writer = csv.DictWriter(out, fieldnames=fields); writer.writeheader()
        for row in rows: writer.writerow({k: row.get(k, "") for k in fields})
        body = ("\ufeff" + out.getvalue()).encode("utf-8")
        self.send_response(200); self.send_header("Content-Type","text/csv; charset=utf-8")
        self.send_header("Content-Disposition", f'attachment; filename="{kind}-{date.today()}.csv"')
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

    def export_accounting(self, month):
        transactions = [x for x in STATE.get("transactions", []) if x.get("date", "").startswith(month)]
        income_entries = [x for x in STATE.get("incomeEntries", []) if x.get("date", "").startswith(month)]
        cost_items = [
            x for x in STATE.get("costItems", [])
            if x.get("date", "").startswith(month) or (
                x.get("frequency") == "monthly"
                and str(x.get("date", ""))[:7] <= month
                and (not x.get("endDate") or str(x.get("endDate"))[:7] >= month)
            )
        ]
        reimbursements = [x for x in STATE.get("reimbursements", []) if x.get("date", "").startswith(month)]
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
            ledger = io.StringIO()
            fields = ["date", "type", "amount", "counterparty", "category", "project", "contractNo", "invoiceNo", "bankRef", "purpose"]
            writer = csv.DictWriter(ledger, fieldnames=fields); writer.writeheader()
            for row in transactions: writer.writerow({k: row.get(k, "") for k in fields})
            bundle.writestr(f"01_资金流水_{month}.csv", "\ufeff" + ledger.getvalue())

            claims = io.StringIO()
            claim_fields = ["date", "applicant", "amount", "category", "payee", "invoiceNo", "description", "status", "accountingTreatment", "cashImpact", "fileName"]
            claim_writer = csv.DictWriter(claims, fieldnames=claim_fields); claim_writer.writeheader()
            for row in reimbursements:
                treatment = {
                    "待审核": ("暂不入账，仅列承诺支出", "降低可用现金，不减少银行现金"),
                    "已审核": ("计入费用及其他应付款", "降低可用现金，不减少银行现金"),
                    "已支付": ("计入费用，冲减其他应付款", "减少银行现金"),
                    "已驳回": ("不入账，保留审计记录", "无影响"),
                }.get(row.get("status"), ("待确认", "待确认"))
                output = {k: row.get(k, "") for k in claim_fields}
                output["accountingTreatment"], output["cashImpact"] = treatment
                claim_writer.writerow(output)
            bundle.writestr(f"02_员工报销_{month}.csv", "\ufeff" + claims.getvalue())

            revenues = io.StringIO()
            revenue_fields = ["date", "customer", "contractNo", "category", "amount", "status", "invoiceNo", "account", "description"]
            revenue_writer = csv.DictWriter(revenues, fieldnames=revenue_fields); revenue_writer.writeheader()
            for row in income_entries:
                revenue_writer.writerow({k: row.get(k, "") for k in revenue_fields})
            bundle.writestr(f"03_收入确认与回款_{month}.csv", "\ufeff" + revenues.getvalue())

            costs = io.StringIO()
            cost_fields = ["date", "name", "category", "costNature", "unitAmount", "quantity", "totalAmount", "frequency", "status", "counterparty", "contractNo", "invoiceNo", "endDate", "description"]
            cost_writer = csv.DictWriter(costs, fieldnames=cost_fields); cost_writer.writeheader()
            for row in cost_items:
                output = {k: row.get(k, "") for k in cost_fields}
                output["totalAmount"] = float(row.get("unitAmount", 0)) * float(row.get("quantity", 0))
                cost_writer.writerow(output)
            bundle.writestr(f"04_经营成本_{month}.csv", "\ufeff" + costs.getvalue())

            index = io.StringIO()
            index.write("日期,业务类型,对象,金额,发票号码,附件文件\n")
            for row in transactions:
                attachments = [x.get("fileName", "") for x in STATE.get("evidence", []) if x.get("transactionId") == row.get("id")]
                index.write(f'{row.get("date","")},资金流水,{row.get("counterparty","")},{row.get("amount",0)},{row.get("invoiceNo","")},{"|".join(attachments)}\n')
            for row in reimbursements:
                index.write(f'{row.get("date","")},员工报销,{row.get("applicant","")}/{row.get("payee","")},{row.get("amount",0)},{row.get("invoiceNo","")},{row.get("fileName","")}\n')
            for row in income_entries:
                index.write(f'{row.get("date","")},客户收入,{row.get("customer","")},{row.get("amount",0)},{row.get("invoiceNo","")},\n')
            for row in cost_items:
                total = float(row.get("unitAmount", 0)) * float(row.get("quantity", 0))
                index.write(f'{row.get("date","")},经营成本,{row.get("counterparty") or row.get("name","")},{total},{row.get("invoiceNo","")},\n')
            bundle.writestr(f"05_票据索引_{month}.csv", "\ufeff" + index.getvalue())

            for item in STATE.get("evidence", []):
                tx = next((x for x in transactions if x.get("id") == item.get("transactionId")), None)
                file = UPLOADS / item.get("storedName", "")
                if tx and file.is_file(): bundle.write(file, f"原始附件/资金流水/{item.get('fileName', file.name)}")
            for row in reimbursements:
                file = REIMBURSEMENTS / row.get("storedName", "")
                if row.get("storedName") and file.is_file(): bundle.write(file, f"原始附件/员工报销/{row.get('fileName', file.name)}")

            readme = f"""FutureFlow {month} 月代账交接说明

本压缩包包含：
1. 资金流水表
2. 员工报销表
3. 收入确认与回款表
4. 经营成本表
5. 票据索引及已上传的原始附件

客户合同预算未作为现金或已确认收入导出；收入与成本台账按各自状态完整保留。

请代账公司结合银行流水核对收入确认、成本费用归类、可抵扣进项税和员工报销合规性。
"""
            bundle.writestr("00_交接说明.txt", readme)
        body = archive.getvalue()
        self.send_response(200); self.send_header("Content-Type", "application/zip")
        self.send_header("Content-Disposition", f'attachment; filename="FutureFlow-accounting-{month}.zip"')
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

    def do_POST(self):
        global STATE
        path = urlparse(self.path).path
        if path == "/api/evidence": return self.upload_evidence()
        if path == "/api/reimbursement": return self.upload_reimbursement()
        if path == "/api/investor-scout": return self.investor_scout()
        try: payload = self.body_json()
        except Exception as exc: return self.json({"ok":False,"message":str(exc)},400)
        with LOCK:
            if path == "/api/item":
                collection = payload["collection"]; item = payload["item"]; item.setdefault("id", uuid.uuid4().hex)
                STATE.setdefault(collection, []).insert(0, item); audit(STATE, f"新增{collection}", item.get("name") or item.get("counterparty") or item.get("description") or item["id"])
            elif path == "/api/update":
                collection, item_id, changes = payload["collection"], payload["id"], payload["changes"]
                item = next((x for x in STATE.get(collection, []) if x.get("id") == item_id), None)
                if not item: return self.json({"ok":False,"message":"记录不存在"},404)
                if collection == "reimbursements":
                    changes.setdefault("statusUpdatedAt", now_iso())
                    if changes.get("status") == "已支付": changes.setdefault("paidAt", now_iso())
                item.update(changes); audit(STATE, f"更新{collection}", item_id)
            elif path == "/api/object":
                key, value = payload["key"], payload["value"]
                if isinstance(STATE.get(key), dict) and isinstance(value, dict):
                    STATE[key].update(value)
                elif isinstance(STATE.get(key), list) and isinstance(value, list):
                    STATE[key] = merge_records_preserving_existing(STATE[key], value)
                else:
                    STATE[key] = value
                audit(STATE, f"更新{key}", "保存结构化设置")
            elif path == "/api/weekly":
                report = weekly_report(STATE)
                STATE["weeklyReports"] = [report] + [x for x in STATE.get("weeklyReports", []) if x["id"] != report["id"]]
                audit(STATE, "手动生成周报", report["id"])
            elif path == "/api/import":
                imported = payload.get("state")
                if not isinstance(imported, dict): return self.json({"ok":False,"message":"备份格式错误"},400)
                imported = migrate_state_preserving_data(imported)
                validate_state(imported)
                STATE = merge_state_preserving_current(STATE, imported)
                audit(STATE, "合并导入备份", "保留当前全部数据，仅追加导入内容")
            else: return self.send_error(404)
            ensure_weekly(STATE)
            return self.json({"ok": True, "state": STATE})

    def upload_evidence(self):
        global STATE
        form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={"REQUEST_METHOD":"POST","CONTENT_TYPE":self.headers.get("Content-Type","")})
        upload = form["file"]
        content = upload.file.read()
        evidence_id = uuid.uuid4().hex
        suffix = Path(upload.filename).suffix[:12]
        stored = f"{evidence_id}{suffix}"
        (UPLOADS / stored).write_bytes(content)
        item = {"id": evidence_id, "transactionId": form.getfirst("transactionId",""), "kind": form.getfirst("kind","其他"), "note": form.getfirst("note",""), "fileName": Path(upload.filename).name, "storedName": stored, "size": len(content), "sha256": hashlib.sha256(content).hexdigest(), "uploadedAt": now_iso()}
        with LOCK:
            STATE.setdefault("evidence", []).insert(0,item); audit(STATE,"上传证据",item["fileName"]); ensure_weekly(STATE)
        return self.json({"ok":True,"state":STATE})

    def upload_reimbursement(self):
        global STATE
        form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={"REQUEST_METHOD":"POST","CONTENT_TYPE":self.headers.get("Content-Type","")})
        upload = form["file"] if "file" in form and getattr(form["file"], "filename", "") else None
        attachment_id = uuid.uuid4().hex if upload else ""
        stored = ""
        file_name = ""
        file_hash = ""
        if upload:
            content = upload.file.read()
            file_name = Path(upload.filename).name
            stored = f"{attachment_id}{Path(file_name).suffix[:12]}"
            (REIMBURSEMENTS / stored).write_bytes(content)
            file_hash = hashlib.sha256(content).hexdigest()
        item = {
            "id": uuid.uuid4().hex, "date": form.getfirst("date", str(date.today())),
            "applicant": form.getfirst("applicant", ""), "amount": float(form.getfirst("amount", "0")),
            "category": form.getfirst("category", "其他费用"), "payee": form.getfirst("payee", ""),
            "invoiceNo": form.getfirst("invoiceNo", ""), "description": form.getfirst("description", ""),
            "status": "待审核", "attachmentId": attachment_id, "fileName": file_name,
            "storedName": stored, "sha256": file_hash, "createdAt": now_iso(),
        }
        with LOCK:
            STATE.setdefault("reimbursements", []).insert(0, item)
            audit(STATE, "新增员工报销", f'{item["applicant"]} {money(item["amount"])}')
            ensure_weekly(STATE)
        return self.json({"ok": True, "state": STATE})

    def investor_scout(self):
        global STATE
        queries = ["中国 数据 智能 融资", "中国 大交通 旅游科技 融资", "中国 入境旅游 出海 电商 投资"]
        signals = []
        seen = set()
        try:
            for query in queries:
                url = f"https://news.google.com/rss/search?q={quote_plus(query + ' when:120d')}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans"
                request = Request(url, headers={"User-Agent": "Mozilla/5.0 FutureFlow-CFO/1.0"})
                with urlopen(request, timeout=8) as response:
                    root = ET.fromstring(response.read())
                for node in root.findall("./channel/item")[:5]:
                    title = node.findtext("title", "").strip()
                    link = node.findtext("link", "").strip()
                    published = node.findtext("pubDate", "")
                    source_node = node.find("source")
                    source = source_node.text.strip() if source_node is not None and source_node.text else "公开新闻"
                    key = title.lower()
                    if not title or key in seen: continue
                    seen.add(key)
                    signals.append({"title": title, "link": link, "date": published[:16], "source": source})
            message = f"已更新 {len(signals)} 条近期公开融资信号"
        except Exception:
            message = "联网暂不可用，已保留机构候选库和上次融资信号"
        with LOCK:
            STATE["investorTargets"] = INVESTOR_TARGETS
            if signals: STATE["fundingSignals"] = signals[:12]
            STATE["investorScoutUpdatedAt"] = now_iso()
            audit(STATE, "更新融资雷达", message)
            ensure_weekly(STATE)
        return self.json({"ok": True, "state": STATE, "message": message})


def scheduler():
    global STATE
    while True:
        time.sleep(3600)
        with LOCK: ensure_weekly(STATE)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8876)
    args = parser.parse_args()
    threading.Thread(target=scheduler, daemon=True).start()
    print(f"CFO 工作中台：http://127.0.0.1:{args.port}", flush=True)
    Server(("127.0.0.1", args.port), Handler).serve_forever()
