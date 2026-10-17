import os

PLAN_PRICES_USD = {
    "FREE": 0.0,
    "PRO": float(os.environ.get("PRO_PRICE_USD", 29)),
    "ENTERPRISE": float(os.environ.get("ENTERPRISE_PRICE_USD", 99)),
}

MANUAL_SUBSCRIPTION_PREFIX = "manual_"
IMPERSONATION_TTL_MINUTES = 30
