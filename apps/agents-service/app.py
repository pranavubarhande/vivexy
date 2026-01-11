import os

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend communication


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy", "service": "agents-service"})


@app.route("/api/agents/stock-analysis", methods=["POST"])
def stock_analysis():
    # Placeholder for stock analysis endpoint
    # Will integrate with the existing stock-agent logic
    data = request.get_json()
    return jsonify({"message": "Stock analysis endpoint", "received": data})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
