from copy import deepcopy

from server import financial_snapshot, seed_state


state = seed_state()
state["demoMode"] = True
base = financial_snapshot(state)

contract = {
    "id": "contract-linkage-test",
    "displayName": "上海某入境旅行社",
    "mrr": 20000,
    "grossMargin": 65,
    "acquisitionCost": 5000,
    "renewalProbability": 85,
    "status": "交付中",
    "active": True,
}
state["demoCustomers"].append(contract)
added = financial_snapshot(state)

assert added["actualCash"] == base["actualCash"]
assert added["mrr"] == base["mrr"] + 20000
assert added["projectedNetBurn"] <= base["projectedNetBurn"]
assert added["runway"] >= base["runway"]

contract["mrr"] = 8000
reduced = financial_snapshot(state)
assert reduced["actualCash"] == base["actualCash"]
assert reduced["mrr"] == base["mrr"] + 8000
assert reduced["projectedNetBurn"] >= added["projectedNetBurn"]

contract["status"] = "暂停服务"
contract["active"] = False
paused = financial_snapshot(state)
assert paused["mrr"] == base["mrr"]
assert paused["actualCash"] == base["actualCash"]

print("PASS: contract additions, budget reductions and pauses update forecast metrics without fabricating cash")
