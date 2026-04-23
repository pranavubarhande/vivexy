from flask import Blueprint, jsonify, request
from pydantic import ValidationError

from app.middlewares.auth import auth_middleware
from app.schemas import UserCreate, UserLogin, UserResponse
from app.utils.auth import (
    authenticate_user,
    create_user,
    exclude_password,
    generate_token,
)

bp = Blueprint("auth", __name__, url_prefix="/auth")


@bp.route("/login", methods=["POST"])
def login():
    """Authenticate user and return JWT token.
    ---
    tags:
      - Auth
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - email
            - password
          properties:
            email:
              type: string
              example: user@example.com
            password:
              type: string
              example: mypassword123
    responses:
      200:
        description: Login successful
        schema:
          type: object
          properties:
            user:
              type: object
            token:
              type: string
      401:
        description: Invalid credentials
      400:
        description: Validation error
    """
    try:
        data = request.get_json()
        login_data = UserLogin(**data)
        user = authenticate_user(login_data.email, login_data.password)

        if not user:
            return jsonify({"error": "Invalid email or password"}), 401

        token = generate_token(user.id, user.email)
        user_data = exclude_password(user)

        return jsonify({"user": user_data, "token": token})

    except ValidationError as e:
        return jsonify({"error": "Invalid input data", "details": e.errors()}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/register", methods=["POST"])
def register():
    """Register a new user account.
    ---
    tags:
      - Auth
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - name
            - email
            - password
          properties:
            name:
              type: string
              example: John Doe
            email:
              type: string
              example: newuser@example.com
            password:
              type: string
              example: securepass123
    responses:
      201:
        description: User created successfully
        schema:
          type: object
          properties:
            user:
              type: object
            token:
              type: string
      400:
        description: Validation error or duplicate email
    """
    try:
        data = request.get_json()
        user_data = UserCreate(**data)
        user = create_user(user_data)
        token = generate_token(user.id, user.email)

        user_response = UserResponse.from_orm(user)
        return jsonify({"user": user_response.dict(), "token": token}), 201

    except ValidationError as e:
        return jsonify({"error": "Invalid input data", "details": e.errors()}), 400
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/me", methods=["GET"])
@auth_middleware
def me():
    """Get current authenticated user.
    ---
    tags:
      - Auth
    security:
      - BearerAuth: []
    responses:
      200:
        description: Current user info
        schema:
          type: object
          properties:
            user:
              type: object
      401:
        description: Unauthorized
    """
    user = request.user
    user_data = exclude_password(user)
    return jsonify({"user": user_data})
