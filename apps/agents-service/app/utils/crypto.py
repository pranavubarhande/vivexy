import base64
import hashlib
import os

from cryptography.fernet import Fernet


def _get_fernet() -> Fernet:
    secret = os.getenv("SECRET_KEY", "your-secret-key-here")
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
    return Fernet(key)


def encrypt_api_key(plain_key: str) -> str:
    return _get_fernet().encrypt(plain_key.encode()).decode()


def decrypt_api_key(encrypted_key: str) -> str:
    return _get_fernet().decrypt(encrypted_key.encode()).decode()
