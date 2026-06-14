from datetime import date

from server import financial_snapshot, seed_state


state = seed_state()
state["accounts"][0]["openingBalance"] = 50000
state["employees"].append({
    "id": "employee-1", "name": "员工", "role": "运营",
    "startDate": str(date.today()), "baseSalary": 10000,
    "employerSocial": 2500, "housingFund": 1000,
    "monthlyBonus": 500, "status": "在职",
})
snapshot = financial_snapshot(state)
assert snapshot["employeeCount"] == 1
assert snapshot["payrollBudget"] == 14000
assert snapshot["monthBudgetCosts"] == 14000
assert snapshot["actualCash"] == 50000

state["employees"][0]["status"] = "离职"
inactive = financial_snapshot(state)
assert inactive["employeeCount"] == 0
assert inactive["payrollBudget"] == 0

state["fundraisingRounds"].append({
    "id": "round-1", "name": "天使轮", "targetAmount": 3000000,
    "preMoneyValuation": 12000000, "actualAmount": 1000000, "status": "已交割",
})
funded = financial_snapshot(state)
assert funded["actualCash"] == 1050000

print("PASS: employees drive payroll budgets, while only opening cash and closed financing affect cash")
