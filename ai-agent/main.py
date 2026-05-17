import asyncio
import os
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI
from prometheus_client import Counter, Gauge, generate_latest
from starlette.responses import Response

from traffic_analyzer import TrafficAnalyzer


BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:3000")
POLL_SECONDS = int(os.getenv("POLL_SECONDS", "5"))

app = FastAPI(title="AI Traffic Shaper Agent")
analyzer = TrafficAnalyzer()

decision_counter = Counter(
    "ai_traffic_shaper_decisions_total",
    "AI traffic shaping decisions by mode",
    ["mode"]
)
mode_gauge = Gauge(
    "ai_traffic_shaper_mode",
    "AI mode as numeric value: normal=0, surge=1, critical=2, bot_attack=3"
)

last_decision = {
    "mode": "booting",
    "reason": "agent has not polled backend yet",
    "updatedAt": None
}


def mode_number(mode: str) -> int:
    return {"normal": 0, "surge": 1, "critical": 2, "bot_attack": 3}.get(mode, -1)


async def shape_once() -> dict:
    async with httpx.AsyncClient(timeout=5.0) as client:
        health = (await client.get(f"{BACKEND_URL}/internal/health")).json()
        decision = analyzer.decide(health)
        payload = {
            "mode": decision.mode,
            "checkoutRatePerMinute": decision.checkout_rate_per_minute,
            "botThrottlePerMinute": decision.bot_throttle_per_minute,
            "recommendationsDegraded": decision.recommendations_degraded,
            "reason": decision.reason
        }
        updated = (await client.put(f"{BACKEND_URL}/internal/config", json=payload)).json()

    decision_counter.labels(mode=decision.mode).inc()
    mode_gauge.set(mode_number(decision.mode))

    global last_decision
    last_decision = {
        **payload,
        "backendConfig": updated,
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }
    return last_decision


async def control_loop() -> None:
    while True:
        try:
            await shape_once()
        except Exception as exc:
            global last_decision
            last_decision = {
                "mode": "error",
                "reason": str(exc),
                "updatedAt": datetime.now(timezone.utc).isoformat()
            }
        await asyncio.sleep(POLL_SECONDS)


@app.on_event("startup")
async def startup() -> None:
    asyncio.create_task(control_loop())


@app.get("/")
async def root():
    return {
        "name": "AI Traffic Shaper Agent",
        "backend": BACKEND_URL,
        "lastDecision": last_decision
    }


@app.post("/shape-now")
async def shape_now():
    return await shape_once()


@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type="text/plain; version=0.0.4")

