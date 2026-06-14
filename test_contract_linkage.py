from datetime import date

from server import contract_schedule, financial_snapshot, rebuild_contract_schedule, seed_state


state = seed_state()
base = financial_snapshot(state)
contract = {
    "id": "contract-linkage-test",
    "customerName": "正式客户",
    "contractNo": "FF-2026-001",
    "product": "海外社媒代运营",
    "startDate": str(date.today()),
    "contractMonths": 12,
    "monthlyFee": 20000,
    "setupFee": 10000,
    "directCost": 6000,
    "grossMargin": 70,
    "paymentDays": 30,
    "status": "履约中",
}
state["contracts"].append(contract)
rebuild_contract_schedule(state, contract)
added = financial_snapshot(state)

assert len(contract_schedule(contract)) == 13
assert len(state["incomeEntries"]) == 13
assert added["actualCash"] == base["actualCash"]
assert added["mrr"] == 20000
assert added["openAR"] == 250000
assert added["contractCount"] == 1

contract["monthlyFee"] = 8000
rebuild_contract_schedule(state, contract)
reduced = financial_snapshot(state)
assert reduced["mrr"] == 8000
assert reduced["openAR"] == 106000
assert reduced["actualCash"] == base["actualCash"]

contract["status"] = "暂停"
paused = financial_snapshot(state)
assert paused["mrr"] == 0
assert paused["actualCash"] == base["actualCash"]

print("PASS: formal contracts generate receivable schedules and drive forecasts without fabricating cash")
