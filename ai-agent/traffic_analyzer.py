from dataclasses import dataclass


@dataclass
class TrafficDecision:
    mode: str
    checkout_rate_per_minute: int
    bot_throttle_per_minute: int
    recommendations_degraded: bool
    reason: str


class TrafficAnalyzer:
    """Small rule-assisted model for demo-friendly traffic shaping.

    The class is intentionally simple: production systems would train on real
    traffic, release events, cache hit rate, payment dependency health, and bot
    fingerprints. This implementation keeps the behavior explainable for demos.
    """

    def decide(self, health: dict) -> TrafficDecision:
        queue_depth = health.get("queue", {}).get("depth", 0)
        latency = health.get("dependencyLatencyMs", 0)
        error_rate = health.get("errorRate", 0)
        suspicious_ratio = health.get("suspiciousRatio", 0)
        circuit_state = health.get("circuitState", "closed")

        if suspicious_ratio >= 0.35:
            return TrafficDecision(
                mode="bot_attack",
                checkout_rate_per_minute=220,
                bot_throttle_per_minute=3,
                recommendations_degraded=True,
                reason=f"suspicious traffic ratio {suspicious_ratio:.2f}"
            )

        if latency > 200 or queue_depth > 1500 or circuit_state == "open":
            return TrafficDecision(
                mode="critical",
                checkout_rate_per_minute=80,
                bot_throttle_per_minute=5,
                recommendations_degraded=True,
                reason=f"critical pressure latency={latency}ms queue={queue_depth} circuit={circuit_state}"
            )

        if latency > 140 or queue_depth > 500 or error_rate > 0.05:
            return TrafficDecision(
                mode="surge",
                checkout_rate_per_minute=240,
                bot_throttle_per_minute=10,
                recommendations_degraded=True,
                reason=f"surge pressure latency={latency}ms queue={queue_depth} errors={error_rate:.2f}"
            )

        return TrafficDecision(
            mode="normal",
            checkout_rate_per_minute=600,
            bot_throttle_per_minute=20,
            recommendations_degraded=False,
            reason="system healthy"
        )

