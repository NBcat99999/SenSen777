#!/bin/zsh
cd "$(dirname "$0")"
PORT=8876
python3 protect_data.py >/tmp/futureflow-cfo-backup.log 2>&1
python3 weekly_update.py >/tmp/futureflow-cfo-weekly.log 2>&1
PID=$(lsof -tiTCP:$PORT -sTCP:LISTEN)
if [ -n "$PID" ]; then
  kill "$PID" >/dev/null 2>&1
  sleep 1
fi
python3 server.py --port $PORT >/tmp/futureflow-cfo-workbench.log 2>&1 &
sleep 1
open "http://127.0.0.1:$PORT"
