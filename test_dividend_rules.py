from server import seed_state


state = seed_state()
rules = state["dividendRules"]

pool_total = rules["founderPool"] + rules["cofounderPool"] + rules["employeeEsop"]
assert pool_total == 100

distributable_profit = rules["afterTaxProfit"] * (1 - rules["retentionReserveRate"] / 100)
dividend_pool = distributable_profit * rules["pmfDividendRate"] / 100
assert dividend_pool == 0

financing_compensation = min(
    rules["qualifiedFinancing"] * rules["financingBonusRate"] / 100,
    rules["founderDeferredCompCap"],
)
assert financing_compensation == 0
assert rules["vestingYearsMin"] == 4
assert rules["vestingYearsMax"] == 5
assert rules["cliffMonths"] == 12
assert rules["leaverRepurchase"] == "无离职回购"

print("PASS: dividend pools, PMF dividend discipline, vesting and financing compensation rules")
