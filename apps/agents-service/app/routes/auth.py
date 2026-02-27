from flask import Blueprint, request, jsonify
from app.schemas import UserLogin, UserCreate, UserResponse
from app.utils.auth import authenticate_user, create_user, generate_token, exclude_password
from app.middlewares.auth import auth_middleware
from pydantic import ValidationError

bp = Blueprint('auth', __name__, url_prefix='/auth')

@bp.route('/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        login_data = UserLogin(**data)
        user = authenticate_user(login_data.email, login_data.password)

        if not user:
            return jsonify({'error': 'Invalid email or password'}), 401

        token = generate_token(user.id, user.email)
        user_data = exclude_password(user)

        return jsonify({
            'user': user_data,
            'token': token
        })

    except ValidationError as e:
        return jsonify({'error': 'Invalid input data', 'details': e.errors()}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        user_data = UserCreate(**data)
        user = create_user(user_data)
        token = generate_token(user.id, user.email)

        user_response = UserResponse.from_orm(user)
        return jsonify({
            'user': user_response.dict(),
            'token': token
        }), 201

    except ValidationError as e:
        return jsonify({'error': 'Invalid input data', 'details': e.errors()}), 400
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/me', methods=['GET'])
@auth_middleware
def me():
    user = request.user
    user_data = exclude_password(user)
    return jsonify({'user': user_data})