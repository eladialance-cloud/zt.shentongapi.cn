import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import risk

p = os.path.join(os.sep, "no-such-dir-xyz", "risk_state.json")
print("path=", p, "exists=", os.path.exists(p))
g = risk.RiskGate({"risk_daily_limit": 1}, "T", state_path=p)
print("first=", g.acquire("publish"))
print("second=", g.acquire("publish"))
