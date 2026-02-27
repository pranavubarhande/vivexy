from flask import request, jsonify
from functools import wraps
from app.utils.auth import get_user_from_token

def auth_middleware(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Authorization header missing or invalid'}), 401

        token = auth_header.split(' ')[1]
        try:
            user = get_user_from_token(token)
            request.user = user  # Attach user to request
        except ValueError as e:
            return jsonify({'error': str(e)}), 401

        return f(*args, **kwargs)
    return decorated_function