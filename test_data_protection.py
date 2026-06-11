import json
import tempfile
from pathlib import Path

import server


with tempfile.TemporaryDirectory() as temp_dir:
    root = Path(temp_dir)
    data = root / "data"
    backups = root / "backups"
    data.mkdir()

    original_state_file = server.STATE_FILE
    original_state_backups = server.STATE_BACKUPS
    try:
        server.STATE_FILE = data / "state.json"
        server.STATE_BACKUPS = backups

        state = server.seed_state()
        server.save_state(state, "initial")
        original = json.loads(server.STATE_FILE.read_text(encoding="utf-8"))

        state["transactions"].append({
            "id": "protected-test",
            "date": "2026-06-07",
            "type": "income",
            "amount": 100,
        })
        server.save_state(state, "mutation")

        versions = sorted(backups.glob("*.json"))
        assert len(versions) == 1
        snapshot = json.loads(versions[0].read_text(encoding="utf-8"))
        assert snapshot["transactions"] == original["transactions"]
        assert "protected-test" not in {x.get("id") for x in snapshot["transactions"]}
        assert versions[0].with_suffix(".sha256").exists()

        imported = {"transactions": [{"id": "imported-test", "amount": 200}], "newFeature": {"enabled": True}}
        merged = server.merge_state_preserving_current(state, imported)
        ids = {x.get("id") for x in merged["transactions"]}
        assert "protected-test" in ids
        assert "imported-test" in ids
        assert merged["newFeature"]["enabled"] is True

        old = {"transactions": [], "reimbursements": [], "accounts": [], "audit": [], "legacyField": "keep-me"}
        migrated = server.migrate_state_preserving_data(old)
        assert migrated["legacyField"] == "keep-me"
        assert len(migrated["demoCustomers"]) == 40
        assert len(migrated["investorTargets"]) >= 24
    finally:
        server.STATE_FILE = original_state_file
        server.STATE_BACKUPS = original_state_backups

print("PASS: snapshots, checksums, imports and schema upgrades preserve original data")
