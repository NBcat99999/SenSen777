from datetime import date

from server import financial_snapshot, seed_state


today = str(date.today())
state = seed_state()
base = financial_snapshot(state)

income = {
    "id": "income-linkage",
    "date": today,
    "customer": "客户联动核验",
    "amount": 20000,
    "status": "已确认",
}
state["incomeEntries"].append(income)
recognized_income = financial_snapshot(state)
assert recognized_income["monthAccruedRevenue"] == base["monthAccruedRevenue"] + 20000
assert recognized_income["actualCash"] == base["actualCash"]

income["status"] = "已回款"
received_income = financial_snapshot(state)
assert received_income["actualCash"] == base["actualCash"] + 20000
assert received_income["monthIncome"] == base["monthIncome"] + 20000

cost = {
    "id": "cost-linkage",
    "date": today,
    "name": "运营团队人工",
    "category": "员工人工",
    "costNature": "operating",
    "unitAmount": 8000,
    "quantity": 5,
    "frequency": "monthly",
    "status": "预算",
    "invoiceNo": "",
}
state["costItems"].append(cost)
budgeted = financial_snapshot(state)
assert budgeted["monthBudgetCosts"] == 40000
assert budgeted["accrualExpense"] == base["accrualExpense"]
assert budgeted["actualCash"] == received_income["actualCash"]

cost["status"] = "已发生"
accrued = financial_snapshot(state)
assert accrued["monthRecognizedCosts"] == 40000
assert accrued["accrualExpense"] == base["accrualExpense"] + 40000
assert accrued["actualCash"] == received_income["actualCash"]
assert accrued["openAP"] == base["openAP"] + 40000

cost["status"] = "已支付"
paid = financial_snapshot(state)
assert paid["actualCash"] == received_income["actualCash"] - 40000
assert paid["monthPaidCosts"] == 40000
assert paid["cashOutflow"] == base["cashOutflow"] + 40000
assert paid["openAP"] == base["openAP"]

cost["unitAmount"] = 9000
adjusted = financial_snapshot(state)
assert adjusted["monthBudgetCosts"] == 45000
assert adjusted["actualCash"] == received_income["actualCash"] - 45000

print("PASS: income and cost source fields drive accrual, cash, payable and forecast metrics")
