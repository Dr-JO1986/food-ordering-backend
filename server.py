# server.py (หรือ app.py)

# ... (ส่วน import และโค้ดที่มีอยู่เดิม) ...
from flask import Flask, request, jsonify
from flask_cors import CORS
import psycopg2
from psycopg2 import sql
import os
import jwt
import datetime
from functools import wraps

app = Flask(__name__)
CORS(app) # Enable CORS for all routes

# Database connection details (ensure these are correctly set in your Render environment variables)
DB_NAME = os.environ.get("DB_NAME")
DB_USER = os.environ.get("DB_USER")
DB_PASSWORD = os.environ.get("DB_PASSWORD")
DB_HOST = os.environ.get("DB_HOST")
DB_PORT = os.environ.get("DB_PORT")

# Secret key for JWT (use a strong, random key in production)
SECRET_KEY = os.environ.get("SECRET_KEY", "your_super_secret_key")

def get_db_connection():
    conn = psycopg2.connect(
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        host=DB_HOST,
        port=DB_PORT
    )
    return conn

# Middleware for JWT authentication
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            token = request.headers['Authorization'].split(" ")[1]

        if not token:
            return jsonify({"message": "Token is missing!"}), 401

        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            request.user_id = data['user_id']
            request.user_role = data['role'] # Attach role to request
        except jwt.ExpiredSignatureError:
            return jsonify({"message": "Token has expired!"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"message": "Invalid Token!"}), 401

        return f(*args, **kwargs)
    return decorated

# ... (Endpoint สำหรับ Login, Register, Menu, Order, Order_items, Payments ที่มีอยู่เดิม) ...

# --- NEW ENDPOINT: Update Table Status ---
@app.route('/api/tables/<int:table_number>/status', methods=['PUT'])
@token_required
def update_table_status(table_number):
    """
    Endpoint สำหรับอัปเดตสถานะของโต๊ะ
    รับ: JSON body ที่มี 'status' (เช่น 'available', 'occupied')
    ต้องเป็นบทบาท 'waiter' เท่านั้น
    """
    if request.user_role not in ['waiter', 'admin']: # Allow admin to update table status as well
        return jsonify({"error": "Unauthorized: Only waiters or admins can update table status"}), 403

    data = request.get_json()
    new_status = data.get('status')

    if not new_status:
        return jsonify({"error": "Status is required"}), 400

    # Validate allowed statuses (optional but recommended)
    allowed_statuses = ['available', 'occupied', 'cleaning', 'reserved'] # Add more as needed
    if new_status not in allowed_statuses:
        return jsonify({"error": f"Invalid status. Allowed statuses are: {', '.join(allowed_statuses)}"}), 400

    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Update the table status in the 'tables' table
        cur.execute(
            sql.SQL("UPDATE tables SET status = %s WHERE table_number = %s RETURNING *"),
            (new_status, table_number)
        )
        updated_table = cur.fetchone()
        conn.commit()

        if updated_table:
            return jsonify({
                "message": f"Table {table_number} status updated to {new_status}",
                "table_number": updated_table[0],
                "status": updated_table[1]
            }), 200
        else:
            return jsonify({"error": f"Table {table_number} not found"}), 404

    except psycopg2.Error as e:
        conn.rollback()
        print(f"Database error: {e}")
        return jsonify({"error": "Failed to update table status due to a database error."}), 500
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return jsonify({"error": "An unexpected error occurred."}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

# ... (ส่วน if __name__ == '__main__': ที่มีอยู่เดิม) ...
if __name__ == '__main__':
    # Initialize database tables if they don't exist
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        # Create 'tables' table if it doesn't exist
        cur.execute("""
            CREATE TABLE IF NOT EXISTS tables (
                table_number SERIAL PRIMARY KEY,
                status VARCHAR(50) DEFAULT 'available'
            );
        """)
        # Insert some initial tables if they don't exist
        for i in range(1, 6): # Example: 5 tables
            cur.execute(sql.SQL("INSERT INTO tables (table_number, status) VALUES (%s, %s) ON CONFLICT (table_number) DO NOTHING"), (i, 'available'))
        
        # Create 'users' table if it doesn't exist
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL
            );
        """)

        # Create 'menu_items' table if it doesn't exist
        cur.execute("""
            CREATE TABLE IF NOT EXISTS menu_items (
                menu_id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                price DECIMAL(10, 2) NOT NULL,
                category VARCHAR(50),
                image_url VARCHAR(255),
                is_available BOOLEAN DEFAULT TRUE
            );
        """)

        # Create 'orders' table if it doesn't exist
        cur.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                order_id SERIAL PRIMARY KEY,
                table_number INTEGER NOT NULL,
                customer_name VARCHAR(100),
                order_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status VARCHAR(50) DEFAULT 'pending',
                total_amount DECIMAL(10, 2) NOT NULL,
                notes TEXT,
                FOREIGN KEY (table_number) REFERENCES tables(table_number)
            );
        """)

        # Create 'order_items' table if it doesn't exist
        cur.execute("""
            CREATE TABLE IF NOT EXISTS order_items (
                order_item_id SERIAL PRIMARY KEY,
                order_id INTEGER NOT NULL,
                menu_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                item_price DECIMAL(10, 2) NOT NULL,
                item_status VARCHAR(50) DEFAULT 'pending',
                notes TEXT,
                FOREIGN KEY (order_id) REFERENCES orders(order_id),
                FOREIGN KEY (menu_id) REFERENCES menu_items(menu_id)
            );
        """)

        # Create 'payments' table if it doesn't exist
        cur.execute("""
            CREATE TABLE IF NOT EXISTS payments (
                payment_id SERIAL PRIMARY KEY,
                order_id INTEGER NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                payment_method VARCHAR(50) NOT NULL,
                transaction_id VARCHAR(100),
                payment_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status VARCHAR(50) DEFAULT 'pending',
                FOREIGN KEY (order_id) REFERENCES orders(order_id)
            );
        """)
        conn.commit()
        print("Database tables checked/created successfully.")
    except Exception as e:
        print(f"Error initializing database: {e}")
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

    app.run(debug=True, host='0.0.0.0', port=os.environ.get('PORT', 5000))
