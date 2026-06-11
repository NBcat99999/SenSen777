#!/usr/bin/env python3
from server import LOCK, STATE, ensure_weekly

with LOCK:
    ensure_weekly(STATE)

print("FutureFlow CFO weekly pack checked.")
