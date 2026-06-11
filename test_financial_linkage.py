from copy import deepcopy

from server import financial_snapshot, seed_state


state = seed_state()
base = financial_snapshot(state)

claim = {
    "id": "claim-test",
    "date": str(__import__("datetime").date.today()),
    "applicant": "测试员工",
    "amount": 1000,
    "category": "软件与云服务",
    "payee": "测试供应商",
    "invoiceNo": "",
    "description": "联动测试",
    "status": "待审核",
    "attachmentId": "",
}
state["reimbursements"].append(claim)
pending = financial_snapshot(state)
assert pending["actualCash"] == base["actualCash"]
assert pending["availableCash"] == base["availableCash"] - 1000
assert pending["committedReimbursements"] == 1000
assert pending["accrualExpense"] == base["accrualExpense"]
assert pending["ticketRate"] < base["ticketRate"]

claim["status"] = "已审核"
approved = financial_snapshot(state)
assert approved["actualCash"] == base["actualCash"]
assert approved["availableCash"] == base["availableCash"] - 1000
assert approved["accrualExpense"] == base["accrualExpense"] + 1000
assert approved["openAP"] == base["openAP"] + 1000
assert approved["projectedNetBurn"] >= base["projectedNetBurn"]

claim["status"] = "已支付"
paid = financial_snapshot(state)
assert paid["actualCash"] == base["actualCash"] - 1000
assert paid["availableCash"] == base["availableCash"] - 1000
assert paid["committedReimbursements"] == 0
assert paid["openAP"] == base["openAP"]
assert paid["cashOutflow"] == base["cashOutflow"] + 1000

claim["status"] = "已驳回"
rejected = financial_snapshot(state)
assert rejected == base

print("PASS: reimbursement status drives cash, available cash, expense, payable, runway inputs and evidence coverage")
