from typing import Dict, List, Optional

from agents_core.business_logic.features import user_has_feature
from agents_core.constants.features import FEATURE_API_KEYS
from agents_core.models import db
from agents_core.models.user_api_key import UserApiKey
from agents_core.utils.crypto import decrypt_api_key, encrypt_api_key

SUPPORTED_PROVIDERS = [
    "openai",
    "anthropic",
    "google",
    "groq",
    "mistral",
    "together",
    "fireworks",
    "cohere",
    "xai",
    "ollama",
]


def get_user_api_keys(user_id: str) -> List[Dict]:
    keys = UserApiKey.query.filter_by(user_id=user_id).all()
    return [
        {
            "provider": k.provider,
            "hasKey": True,
            "createdAt": k.created_at.isoformat(),
            "updatedAt": k.updated_at.isoformat(),
        }
        for k in keys
    ]


def upsert_user_api_key(user_id: str, provider: str, api_key: str) -> Dict:
    if provider not in SUPPORTED_PROVIDERS:
        raise ValueError(f"Unsupported provider: {provider}")

    encrypted = encrypt_api_key(api_key)
    existing = UserApiKey.query.filter_by(user_id=user_id, provider=provider).first()

    if existing:
        existing.encrypted_key = encrypted
    else:
        record = UserApiKey(user_id=user_id, provider=provider, encrypted_key=encrypted)
        db.session.add(record)

    db.session.commit()
    return {"provider": provider, "hasKey": True}


def delete_user_api_key(user_id: str, provider: str) -> None:
    record = UserApiKey.query.filter_by(user_id=user_id, provider=provider).first()
    if not record:
        raise ValueError(f"No API key found for provider: {provider}")
    db.session.delete(record)
    db.session.commit()


def get_decrypted_api_keys(user_id: str) -> Dict[str, str]:
    """Returns a dict of provider -> plain-text API key for use by the agent.
    Empty when the user's organization has turned bring-your-own keys off."""
    if not user_has_feature(user_id, FEATURE_API_KEYS):
        return {}
    keys = UserApiKey.query.filter_by(user_id=user_id).all()
    result = {}
    for k in keys:
        try:
            result[k.provider] = decrypt_api_key(k.encrypted_key)
        except Exception:
            pass
    return result


def get_decrypted_key_for_provider(user_id: str, provider: str) -> Optional[str]:
    if not user_has_feature(user_id, FEATURE_API_KEYS):
        return None
    record = UserApiKey.query.filter_by(user_id=user_id, provider=provider).first()
    if not record:
        return None
    try:
        return decrypt_api_key(record.encrypted_key)
    except Exception:
        return None
