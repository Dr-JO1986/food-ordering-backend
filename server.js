//----------------------------------------------------
// ต้องอยู่บรรทัดแรกสุดเสมอ เพื่อโหลด environment variables จากไฟล์ .env
//----------------------------------------------------
require('dotenv').config();

//----------------------------------------------------
// Import Modules ที่จำเป็น
//----------------------------------------------------
const express = require('express'); // Express.js สำหรับสร้าง Web API
const { Pool } = require('pg');     // Node-Postgres สำหรับเชื่อมต่อกับ PostgreSQL
const cors = require('cors');       // CORS Middleware สำหรับจัดการ Cross-Origin Requests
const bcrypt = require('bcrypt');   // สำหรับเข้ารหัสรหัสผ่าน
const jwt = require('jsonwebtoken'); // สำหรับสร้างและตรวจสอบ JSON Web Token

// สร้าง Express application
const app = express();

//----------------------------------------------------
// PostgreSQL Connection Pool Configuration
//----------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // ใช้ DATABASE_URL จาก Render environment variables
  ssl: {
    rejectUnauthorized: false // สำคัญมากสำหรับ Render/Cloud Database
  }
});

//----------------------------------------------------
// ทดสอบการเชื่อมต่อ Database
//----------------------------------------------------
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error acquiring client from pool', err.stack);
  }
  client.query('SELECT NOW()', (err, result) => {
    release();
    if (err) {
      return console.error('Error executing database test query', err.stack);
    }
    console.log('Database connected successfully! Current time from DB:', result.rows[0].now);
  });
});

//----------------------------------------------------
// Middlewares
//----------------------------------------------------
app.use(express.json());
app.use(cors());

//----------------------------------------------------
// JWT Secret Key
//----------------------------------------------------
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL ERROR: JWT_SECRET is not defined. Please set it in your .env file or environment variables.');
    process.exit(1); // หยุดการทำงานของ Server ถ้าไม่มี JWT_SECRET
}

//----------------------------------------------------
// Authentication Middleware
//----------------------------------------------------
/**
 * Middleware สำหรับตรวจสอบ JWT และแนบข้อมูลผู้ใช้ (user_id, role) เข้าไปใน req
 * @param {object} req - Request object
 * @param {object} res - Response object
 * @param {function} next - Next middleware function
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token == null) {
        return res.status(401).json({ error: 'Access Denied', details: 'No token provided.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.error('JWT verification failed:', err.message);
            return res.status(403).json({ error: 'Access Denied', details: 'Invalid or expired token.' });
        }
        req.user = user; // เก็บข้อมูลผู้ใช้ (user_id, role) ไว้ใน req.user
        next();
    });
}

/**
 * Middleware สำหรับตรวจสอบบทบาทของผู้ใช้
 * @param {Array<string>} allowedRoles - Array ของบทบาทที่ได้รับอนุญาต (เช่น ['owner', 'chef'])
 */
function authorizeRoles(allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden', details: 'You do not have permission to perform this action.' });
        }
        next();
    };
}

//----------------------------------------------------
// 1. Root Route
//----------------------------------------------------
app.get('/', (req, res) => {
  res.send('Welcome to My Food Ordering Backend API!');
});

//----------------------------------------------------
// 2. API Endpoints สำหรับจัดการผู้ใช้ (Users) - New Section
//    - POST /api/register: สมัครสมาชิกใหม่ (สำหรับทดสอบ/Admin)
//    - POST /api/login: เข้าสู่ระบบ
//----------------------------------------------------

// POST: สมัครสมาชิกใหม่ (สำหรับทดสอบหรือ Admin สร้างผู้ใช้)
app.post('/api/register', async (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ error: 'Username, password, and role are required.' });
    }
    if (!['owner', 'chef', 'waiter'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be owner, chef, or waiter.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10); // เข้ารหัสรหัสผ่าน
        const result = await pool.query(
            'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING user_id, username, role;',
            [username, hashedPassword, role]
        );
        res.status(201).json({ message: 'User registered successfully', user: result.rows[0] });
    } catch (err) {
        console.error('Error registering user:', err.message);
        if (err.code === '23505') { // Unique constraint violation (username already exists)
            return res.status(409).json({ error: 'Username already exists.', details: err.message });
        }
        res.status(500).json({ error: 'Failed to register user', details: err.message });
    }
});

// POST: เข้าสู่ระบบ
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];

        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials.', details: 'User not found.' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(400).json({ error: 'Invalid credentials.', details: 'Incorrect password.' });
        }

        // สร้าง JWT
        const token = jwt.sign(
            { user_id: user.user_id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '1h' } // Token จะหมดอายุใน 1 ชั่วโมง
        );

        res.status(200).json({ message: 'Login successful', token, role: user.role, username: user.username });
    } catch (err) {
        console.error('Error during login:', err.message);
        res.status(500).json({ error: 'Login failed', details: err.message });
    }
});


//----------------------------------------------------
// 3. API Endpoints สำหรับจัดการเมนู (Menus)
//    - GET /api/menus: ดึงข้อมูลเมนูทั้งหมด
//    - GET /api/menus/:menu_id: ดึงข้อมูลเมนูตาม ID
//    - POST /api/menus: เพิ่มเมนูใหม่ (Owner only)
//    - PUT /api/menus/:menu_id: อัปเดตข้อมูลเมนู (Owner only)
//    - DELETE /api/menus/:menu_id: ลบข้อมูลเมนู (Owner only)
//----------------------------------------------------

// GET: ดึงข้อมูลเมนูทั้งหมด (ทุกคนเข้าถึงได้)
app.get('/api/menus', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM menus ORDER BY menu_id ASC');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching menus:', err.message);
    res.status(500).json({ error: 'Failed to fetch menus', details: err.message });
  }
});

// GET: ดึงข้อมูลเมนูตาม ID (ทุกคนเข้าถึงได้)
app.get('/api/menus/:menu_id', async (req, res) => {
  const { menu_id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM menus WHERE menu_id = $1', [menu_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Menu not found.' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(`Error fetching menu with ID ${menu_id}:`, err.message);
    res.status(500).json({ error: 'Failed to fetch menu', details: err.message });
  }
});

// POST: เพิ่มเมนูใหม่ (เฉพาะ Owner)
app.post('/api/menus', authenticateToken, authorizeRoles(['owner']), async (req, res) => {
  const { name, description, price, image_url, category, is_available } = req.body;

  if (!name || price === undefined || price === null) {
      return res.status(400).json({ error: 'Name and price are required.' });
  }

  try {
    const result = await pool.query(`
      INSERT INTO menus (name, description, price, image_url, category, is_available)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `, [name, description || null, price, image_url || null, category || 'ทั่วไป', is_available !== undefined ? is_available : true]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error adding new menu:', err.message);
    res.status(500).json({ error: 'Failed to add new menu', details: err.message });
  }
});

// PUT: อัปเดตข้อมูลเมนู (เฉพาะ Owner)
app.put('/api/menus/:menu_id', authenticateToken, authorizeRoles(['owner']), async (req, res) => {
  const { menu_id } = req.params;
  const { name, description, price, image_url, category, is_available } = req.body;

  try {
    const result = await pool.query(`
      UPDATE menus
      SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        price = COALESCE($3, price),
        image_url = COALESCE($4, image_url),
        category = COALESCE($5, category),
        is_available = COALESCE($6, is_available)
      WHERE menu_id = $7
      RETURNING *;
    `, [name, description, price, image_url, category, is_available, menu_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Menu not found for update.' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(`Error updating menu with ID ${menu_id}:`, err.message);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Table number already exists.', details: err.message });
    }
    res.status(500).json({ error: 'Failed to update menu', details: err.message });
  }
});

// DELETE: ลบข้อมูลเมนู (เฉพาะ Owner)
app.delete('/api/menus/:menu_id', authenticateToken, authorizeRoles(['owner']), async (req, res) => {
  const { menu_id } = req.params;
  try {
    const result = await pool.query('DELETE FROM menus WHERE menu_id = $1 RETURNING *;', [menu_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Menu not found for deletion.' });
    }
    res.status(200).json({ message: 'Menu deleted successfully.', deletedMenu: result.rows[0] });
  } catch (err) {
    console.error(`Error deleting menu with ID ${menu_id}:`, err.message);
    if (err.code === '23503') {
        return res.status(409).json({ error: 'Cannot delete menu. It is associated with existing order items.', details: err.message });
    }
    res.status(500).json({ error: 'Failed to delete menu', details: err.message });
  }
});


//----------------------------------------------------
// 4. API Endpoints สำหรับจัดการโต๊ะ (Tables)
//    - GET /api/tables: ดึงข้อมูลโต๊ะทั้งหมด (ทุกคนเข้าถึงได้)
//    - GET /api/tables/:table_id: ดึงข้อมูลโต๊ะตาม ID (ทุกคนเข้าถึงได้)
//    - POST /api/tables: เพิ่มโต๊ะใหม่ (Owner only)
//    - PUT /api/tables/:table_id: อัปเดตข้อมูลโต๊ะ (Owner only)
//    - DELETE /api/tables/:table_id: ลบข้อมูลโต๊ะ (Owner only)
//----------------------------------------------------

// GET: ดึงข้อมูลโต๊ะทั้งหมด (ทุกคนเข้าถึงได้)
app.get('/api/tables', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
          t.*, 
          o.customer_name AS current_customer_name 
      FROM tables t
      LEFT JOIN orders o ON t.current_order_id = o.order_id
      ORDER BY t.table_id ASC;
    `);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching tables:', err.message);
    res.status(500).json({ error: 'Failed to fetch tables', details: err.message });
  }
});

// GET: ดึงข้อมูลโต๊ะตาม ID (ทุกคนเข้าถึงได้)
app.get('/api/tables/:table_id', async (req, res) => {
  const { table_id } = req.params;
  try {
    const result = await pool.query(`
      SELECT 
          t.*, 
          o.customer_name AS current_customer_name 
      FROM tables t
      LEFT JOIN orders o ON t.current_order_id = o.order_id
      WHERE t.table_id = $1;
    `, [table_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Table not found.' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(`Error fetching table with ID ${table_id}:`, err.message);
    res.status(500).json({ error: 'Failed to fetch table', details: err.message });
  }
});

// POST: เพิ่มโต๊ะใหม่ (เฉพาะ Owner)
app.post('/api/tables', authenticateToken, authorizeRoles(['owner']), async (req, res) => {
  const { table_number, qr_code_path, capacity } = req.body;

  if (table_number === undefined || table_number === null || typeof table_number !== 'number') {
      return res.status(400).json({ error: 'Failed to add new table', details: 'Table number is required and must be a number.' });
  }
  if (capacity === undefined || capacity === null || typeof capacity !== 'number') {
      return res.status(400).json({ error: 'Failed to add new table', details: 'Capacity is required and must be a number.' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO tables (table_number, qr_code_path, capacity) VALUES ($1, $2, $3) RETURNING *',
      [table_number, qr_code_path || null, capacity]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error adding new table:', err.message);
    if (err.code === '23505') {
        return res.status(409).json({ error: 'Table number already exists', details: err.message });
    }
    res.status(500).json({ error: 'Failed to add new table', details: err.message });
  }
});

// PUT: อัปเดตข้อมูลโต๊ะ (เฉพาะ Owner)
app.put('/api/tables/:table_id', authenticateToken, authorizeRoles(['owner']), async (req, res) => {
  const { table_id } = req.params;
  const { table_number, qr_code_path, capacity, is_occupied, current_order_id } = req.body;

  try {
    const result = await pool.query(`
      UPDATE tables
      SET
        table_number = COALESCE($1, table_number),
        qr_code_path = COALESCE($2, qr_code_path),
        capacity = COALESCE($3, capacity),
        is_occupied = COALESCE($4, is_occupied),
        current_order_id = COALESCE($5, current_order_id)
      WHERE table_id = $6
      RETURNING *;
    `, [table_number, qr_code_path, capacity, is_occupied, current_order_id, table_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Table not found for update.' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(`Error updating table with ID ${table_id}:`, err.message);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Table number already exists.', details: err.message });
    }
    res.status(500).json({ error: 'Failed to update table', details: err.message });
  }
});

// DELETE: ลบข้อมูลโต๊ะ (เฉพาะ Owner)
app.delete('/api/tables/:table_id', authenticateToken, authorizeRoles(['owner']), async (req, res) => {
  const { table_id } = req.params;
  try {
    const result = await pool.query('DELETE FROM tables WHERE table_id = $1 RETURNING *;', [table_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Table not found for deletion.' });
    }
    res.status(200).json({ message: 'Table deleted successfully.', deletedTable: result.rows[0] });
  } catch (err) {
    console.error(`Error deleting table with ID ${table_id}:`, err.message);
    if (err.code === '23503') {
        return res.status(409).json({ error: 'Cannot delete table. It is associated with existing orders.', details: err.message });
    }
    res.status(500).json({ error: 'Failed to delete table', details: err.message });
  }
});


//----------------------------------------------------
// 5. API Endpoints สำหรับจัดการออเดอร์ (Orders)
//    - GET /api/orders: ดึงข้อมูลออเดอร์ทั้งหมดพร้อมรายละเอียดโต๊ะ (Owner, Chef, Waiter)
//    - GET /api/orders/:order_id: ดึงข้อมูลออเดอร์ตาม ID พร้อมรายการอาหารและโต๊ะ (Owner, Chef, Waiter)
//    - POST /api/orders: สร้างออเดอร์ใหม่พร้อมรายการอาหาร (ทุกคนเข้าถึงได้ - ลูกค้า)
//    - PUT /api/orders/:order_id: อัปเดตข้อมูลออเดอร์ทั่วไป (Owner, Waiter)
//    - PUT /api/orders/:order_id/status: อัปเดตสถานะออเดอร์ (Owner, Waiter)
//    - PUT /api/orders/:order_id/bill_request: อัปเดตสถานะการเรียกบิล (Waiter)
//    - DELETE /api/orders/:order_id: ลบข้อมูลออเดอร์ (Owner only)
//----------------------------------------------------

// GET: ดึงข้อมูลออเดอร์ทั้งหมดพร้อมรายละเอียดโต๊ะ (Owner, Chef, Waiter)
app.get('/api/orders', authenticateToken, authorizeRoles(['owner', 'chef', 'waiter']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        o.order_id,
        o.customer_name,
        o.order_time,
        o.status,
        o.total_amount,
        o.bill_requested,
        t.table_number,
        t.qr_code_path,
        t.capacity,
        t.is_occupied
      FROM orders o
      JOIN tables t ON o.table_id = t.table_id
      ORDER BY o.order_time DESC;
    `);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching orders:', err.message);
    res.status(500).json({ error: 'Failed to fetch orders', details: err.message });
  }
});

// GET: ดึงข้อมูลออเดอร์ตาม ID พร้อมรายการอาหารและโต๊ะ (Owner, Chef, Waiter)
app.get('/api/orders/:order_id', authenticateToken, authorizeRoles(['owner', 'chef', 'waiter']), async (req, res) => {
  const { order_id } = req.params;
  try {
    const orderResult = await pool.query(`
      SELECT
        o.order_id,
        o.customer_name,
        o.order_time,
        o.status,
        o.total_amount,
        o.bill_requested,
        t.table_number,
        t.qr_code_path,
        t.capacity,
        t.is_occupied
      FROM orders o
      JOIN tables t ON o.table_id = t.table_id
      WHERE o.order_id = $1
    `, [order_id]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const order = orderResult.rows[0];

    const orderItemsResult = await pool.query(`
      SELECT
        oi.order_item_id,
        oi.order_id,
        oi.menu_id,
        m.name AS menu_name,
        m.description AS menu_description,
        oi.quantity,
        oi.price_at_order,
        oi.notes,
        oi.item_status
      FROM order_items oi
      JOIN menus m ON oi.menu_id = m.menu_id
      WHERE oi.order_id = $1
      ORDER BY oi.order_item_id ASC;
    `, [order_id]);

    order.items = orderItemsResult.rows;

    res.status(200).json(order);
  } catch (err) {
    console.error(`Error fetching order by ID ${order_id}:`, err.message);
    res.status(500).json({ error: 'Failed to fetch order by ID', details: err.message });
  }
});

// POST: สร้างออเดอร์ใหม่ (ลูกค้าเข้าถึงได้โดยไม่ต้อง Login)
app.post('/api/orders', async (req, res) => {
  const { table_id, customer_name, order_items } = req.body;

  if (!table_id || !Array.isArray(order_items) || order_items.length === 0) {
      return res.status(400).json({ error: 'Table ID and order items are required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      'INSERT INTO orders (table_id, customer_name, order_time, status, total_amount, bill_requested) VALUES ($1, $2, NOW(), $3, $4, $5) RETURNING order_id, order_time',
      [table_id, customer_name || 'Guest', 'pending', 0, false]
    );
    const orderId = orderResult.rows[0].order_id;
    let totalAmount = 0;

    for (const item of order_items) {
      const { menu_id, quantity, notes } = item;

      if (!menu_id || !quantity || typeof quantity !== 'number' || quantity <= 0) {
          throw new Error(`Invalid order item: menu_id and positive quantity are required. Item: ${JSON.stringify(item)}`);
      }

      const menuPriceResult = await client.query('SELECT price FROM menus WHERE menu_id = $1', [menu_id]);
      if (menuPriceResult.rows.length === 0) {
        throw new Error(`Menu item with ID ${menu_id} not found.`);
      }
      const priceAtOrder = menuPriceResult.rows[0].price;

      await client.query(`
        INSERT INTO order_items (order_id, menu_id, quantity, price_at_order, notes, item_status)
        VALUES ($1, $2, $3, $4, $5, $6);
      `, [orderId, menu_id, quantity, priceAtOrder, notes || null, 'pending']);

      totalAmount += priceAtOrder * quantity;
    }

    await client.query(
      'UPDATE orders SET total_amount = $1 WHERE order_id = $2',
      [totalAmount, orderId]
    );

    // อัปเดต current_order_id ด้วย
    await client.query(
        'UPDATE tables SET is_occupied = TRUE, current_order_id = $1 WHERE table_id = $2',
        [orderId, table_id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Order created successfully!',
      order_id: orderId,
      total_amount: totalAmount,
      order_time: orderResult.rows[0].order_time
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating order:', err.message);
    res.status(500).json({ error: 'Failed to create order', details: err.message });
  } finally {
    client.release();
  }
});

// PUT: อัปเดตข้อมูลออเดอร์ทั่วไปและรายการอาหาร (Owner, Waiter)
app.put('/api/orders/:order_id', authenticateToken, authorizeRoles(['owner', 'waiter']), async (req, res) => {
  const { order_id } = req.params;
  const { table_id, customer_name, status, total_amount, order_items, bill_requested } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updateOrderQuery = `
      UPDATE orders
      SET
        table_id = COALESCE($1, table_id),
        customer_name = COALESCE($2, customer_name),
        status = COALESCE($3, status),
        total_amount = COALESCE($4, total_amount),
        bill_requested = COALESCE($5, bill_requested)
      WHERE order_id = $6
      RETURNING *;
    `;
    const orderResult = await client.query(updateOrderQuery, [table_id, customer_name, status, total_amount, bill_requested, order_id]);

    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found for update.' });
    }

    let recalculatedTotalAmount = orderResult.rows[0].total_amount;

    if (order_items !== undefined) {
      await client.query('DELETE FROM order_items WHERE order_id = $1', [order_id]);

      recalculatedTotalAmount = 0;
      for (const item of order_items) {
        const { menu_id, quantity, notes, item_status } = item;

        if (!menu_id || !quantity || typeof quantity !== 'number' || quantity <= 0) {
          throw new Error(`Invalid order item in update: menu_id and positive quantity are required. Item: ${JSON.stringify(item)}`);
        }

        const menuPriceResult = await client.query('SELECT price FROM menus WHERE menu_id = $1', [menu_id]);
        if (menuPriceResult.rows.length === 0) {
          throw new Error(`Menu item with ID ${menu_id} not found during order item update.`);
        }
        const priceAtOrder = menuPriceResult.rows[0].price;

        await client.query(`
          INSERT INTO order_items (order_id, menu_id, quantity, price_at_order, notes, item_status)
          VALUES ($1, $2, $3, $4, $5, $6);
        `, [order_id, menu_id, quantity, priceAtOrder, notes || null, item_status || 'pending']);

        recalculatedTotalAmount += priceAtOrder * quantity;
      }

      await client.query(
        'UPDATE orders SET total_amount = $1 WHERE order_id = $2',
        [recalculatedTotalAmount, order_id]
      );
    }

    await client.query('COMMIT');

    const updatedOrderResult = await client.query(`
      SELECT
        o.order_id,
        o.customer_name,
        o.order_time,
        o.status,
        o.total_amount,
        o.bill_requested,
        t.table_number,
        t.qr_code_path,
        t.capacity,
        t.is_occupied
      FROM orders o
      JOIN tables t ON o.table_id = t.table_id
      WHERE o.order_id = $1
    `, [order_id]);

    const updatedOrder = updatedOrderResult.rows[0];

    const updatedOrderItemsResult = await client.query(`
      SELECT
        oi.order_item_id,
        oi.order_id,
        oi.menu_id,
        m.name AS menu_name,
        m.description AS menu_description,
        oi.quantity,
        oi.price_at_order,
        oi.notes,
        oi.item_status
      FROM order_items oi
      JOIN menus m ON oi.menu_id = m.menu_id
      WHERE oi.order_id = $1
      ORDER BY oi.order_item_id ASC;
    `, [order_id]);

    updatedOrder.items = updatedOrderItemsResult.rows;

    res.status(200).json(updatedOrder);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`Error updating order with ID ${order_id}:`, err.message);
    res.status(500).json({ error: 'Failed to update order', details: err.message });
  } finally {
    client.release();
  }
});

// PUT: อัปเดตสถานะออเดอร์โดยเฉพาะ (Owner, Waiter)
app.put('/api/orders/:order_id/status', authenticateToken, authorizeRoles(['owner', 'waiter']), async (req, res) => {
  const { order_id } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'preparing', 'completed', 'cancelled'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Valid statuses are: ' + validStatuses.join(', ') });
  }

  try {
    const result = await pool.query(
      'UPDATE orders SET status = $1 WHERE order_id = $2 RETURNING *',
      [status, order_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found for status update.' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(`Error updating order status for ID ${order_id}:`, err.message);
    res.status(500).json({ error: 'Failed to update order status', details: err.message });
  }
});

// PUT: อัปเดตสถานะการเรียกบิล (bill_requested) (Waiter)
app.put('/api/orders/:order_id/bill_request', authenticateToken, authorizeRoles(['waiter']), async (req, res) => {
    const { order_id } = req.params;
    const { requested } = req.body;

    if (typeof requested !== 'boolean') {
        return res.status(400).json({ error: 'Invalid value for "requested". Must be true or false.' });
    }

    try {
        const result = await pool.query(
            'UPDATE orders SET bill_requested = $1 WHERE order_id = $2 RETURNING *',
            [requested, order_id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error(`Error updating bill request status for order ID ${order_id}:`, err.message);
        res.status(500).json({ error: 'Failed to update bill request status', details: err.message });
    }
});


// DELETE: ลบข้อมูลออเดอร์ (Owner only)
app.delete('/api/orders/:order_id', authenticateToken, authorizeRoles(['owner']), async (req, res) => {
  const { order_id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM order_items WHERE order_id = $1', [order_id]);
    await client.query('DELETE FROM payments WHERE order_id = $1', [order_id]);

    const deleteOrderResult = await client.query('DELETE FROM orders WHERE order_id = $1 RETURNING *', [order_id]);

    if (deleteOrderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found for deletion.' });
    }

    const tableId = deleteOrderResult.rows[0].table_id;
    const remainingOrders = await client.query('SELECT order_id FROM orders WHERE table_id = $1', [tableId]);
    if (remainingOrders.rows.length === 0) {
        await client.query('UPDATE tables SET is_occupied = FALSE, current_order_id = NULL WHERE table_id = $1', [tableId]);
    }

    await client.query('COMMIT');

    res.status(200).json({ message: `Order with ID ${order_id} and its associated items/payments deleted successfully.` });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting order:', err.message);
    res.status(500).json({ error: 'Failed to delete order.', details: err.message });
  } finally {
    client.release();
  }
});


//----------------------------------------------------
// 6. API Endpoints สำหรับจัดการรายการอาหารในออเดอร์ (Order Items)
//    - GET /api/order_items: ดึงข้อมูลรายการอาหารในออเดอร์ทั้งหมด (Owner, Chef, Waiter)
//    - GET /api/order_items/:order_item_id: ดึงข้อมูลรายการอาหารในออเดอร์ตาม ID (Owner, Chef, Waiter)
//    - POST /api/order_items: เพิ่มรายการอาหารในออเดอร์ที่มีอยู่แล้ว (Owner, Waiter)
//    - PUT /api/order_items/:order_item_id: อัปเดตข้อมูลรายการอาหารในออเดอร์ (Owner, Chef, Waiter)
//    - PUT /api/order_items/:order_item_id/status: อัปเดตสถานะของรายการอาหารแต่ละชิ้น (Chef, Waiter)
//    - DELETE /api/order_items/:order_item_id: ลบข้อมูลรายการอาหารในออเดอร์ (Owner, Waiter)
//----------------------------------------------------

// GET: ดึงข้อมูลรายการอาหารในออเดอร์ทั้งหมด (Owner, Chef, Waiter)
app.get('/api/order_items', authenticateToken, authorizeRoles(['owner', 'chef', 'waiter']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        oi.order_item_id,
        oi.order_id,
        oi.menu_id,
        m.name AS menu_name,
        m.price AS menu_price,
        oi.quantity,
        oi.price_at_order,
        oi.notes,
        oi.item_status
      FROM order_items oi
      JOIN menus m ON oi.menu_id = m.menu_id
      ORDER BY oi.order_id, oi.order_item_id ASC;
    `);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching order items:', err.message);
    res.status(500).json({ error: 'Failed to fetch order items', details: err.message });
  }
});

// GET: ดึงข้อมูลรายการอาหารในออเดอร์ตาม ID (Owner, Chef, Waiter)
app.get('/api/order_items/:order_item_id', authenticateToken, authorizeRoles(['owner', 'chef', 'waiter']), async (req, res) => {
  const { order_item_id } = req.params;
  try {
    const result = await pool.query(`
      SELECT
        oi.order_item_id,
        oi.order_id,
        oi.menu_id,
        m.name AS menu_name,
        m.price AS menu_price,
        oi.quantity,
        oi.price_at_order,
        oi.notes,
        oi.item_status
      FROM order_items oi
      JOIN menus m ON oi.menu_id = m.menu_id
      WHERE oi.order_item_id = $1;
    `, [order_item_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order item not found.' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(`Error fetching order item with ID ${order_item_id}:`, err.message);
    res.status(500).json({ error: 'Failed to fetch order item', details: err.message });
  }
});

// POST: เพิ่มรายการอาหารในออเดอร์ที่มีอยู่แล้ว (Owner, Waiter)
app.post('/api/order_items', authenticateToken, authorizeRoles(['owner', 'waiter']), async (req, res) => {
    const { order_id, menu_id, quantity, notes } = req.body;

    if (!order_id || !menu_id || !quantity || typeof quantity !== 'number' || quantity <= 0) {
        return res.status(400).json({ error: 'Order ID, menu ID, and positive quantity are required.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const orderExists = await client.query('SELECT order_id FROM orders WHERE order_id = $1 FOR UPDATE', [order_id]);
        if (orderExists.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Invalid order_id.', details: 'Order does not exist.' });
        }

        const menuResult = await client.query('SELECT price FROM menus WHERE menu_id = $1', [menu_id]);
        if (menuResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Invalid menu_id.', details: 'Menu item does not exist.' });
        }
        const priceAtOrder = menuResult.rows[0].price;

        const result = await client.query(`
            INSERT INTO order_items (order_id, menu_id, quantity, price_at_order, notes, item_status)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *;
        `, [order_id, menu_id, quantity, priceAtOrder, notes || null, 'pending']);

        await client.query(
            'UPDATE orders SET total_amount = total_amount + ($1::NUMERIC * $2::NUMERIC) WHERE order_id = $3',
            [priceAtOrder, quantity, order_id]
        );

        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error adding order item:', err.message);
        res.status(500).json({ error: 'Failed to add order item', details: err.message });
    } finally {
        client.release();
    }
});

// PUT: อัปเดตข้อมูลรายการอาหารในออเดอร์ (Owner, Chef, Waiter)
app.put('/api/order_items/:order_item_id', authenticateToken, authorizeRoles(['owner', 'chef', 'waiter']), async (req, res) => {
  const { order_item_id } = req.params;
  const { order_id, menu_id, quantity, notes, item_status } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const oldOrderItemResult = await client.query('SELECT order_id, menu_id, quantity, price_at_order, item_status FROM order_items WHERE order_item_id = $1 FOR UPDATE', [order_item_id]);
    if (oldOrderItemResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order item not found for update.' });
    }
    const oldOrderItem = oldOrderItemResult.rows[0];
    const oldTotalItemPrice = oldOrderItem.price_at_order * oldOrderItem.quantity;

    let newPriceAtOrder = oldOrderItem.price_at_order;
    if (menu_id && menu_id !== oldOrderItem.menu_id) {
      const newMenuPriceResult = await client.query('SELECT price FROM menus WHERE menu_id = $1', [menu_id]);
      if (newMenuPriceResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid menu_id.', details: 'New menu item does not exist.' });
      }
      newPriceAtOrder = newMenuPriceResult.rows[0].price;
    }

    const newQuantity = quantity !== undefined ? quantity : oldOrderItem.quantity;
    const newTotalItemPrice = newPriceAtOrder * newQuantity;

    const updateResult = await client.query(`
      UPDATE order_items
      SET
        order_id = COALESCE($1, order_id),
        menu_id = COALESCE($2, menu_id),
        quantity = COALESCE($3, quantity),
        price_at_order = COALESCE($4, price_at_order),
        notes = COALESCE($5, notes),
        item_status = COALESCE($6, item_status)
      WHERE order_item_id = $7
      RETURNING *;
    `, [order_id, menu_id, newQuantity, newPriceAtOrder, notes, item_status, order_item_id]);

    const orderToUpdateId = order_id || oldOrderItem.order_id;
    await client.query(
      'UPDATE orders SET total_amount = total_amount - ($1::NUMERIC) + ($2::NUMERIC) WHERE order_id = $3',
      [oldTotalItemPrice, newTotalItemPrice, orderToUpdateId]
    );

    await client.query('COMMIT');
    res.status(200).json(updateResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`Error updating order item with ID ${order_item_id}:`, err.message);
    res.status(500).json({ error: 'Failed to update order item', details: err.message });
  } finally {
    client.release();
  }
});

// PUT: อัปเดตสถานะของรายการอาหารแต่ละชิ้น (Chef, Waiter)
app.put('/api/order_items/:order_item_id/status', authenticateToken, authorizeRoles(['chef', 'waiter']), async (req, res) => {
    const { order_item_id } = req.params;
    const { status } = req.body;

    const validItemStatuses = ['pending', 'preparing', 'ready', 'served', 'cancelled'];
    if (!status || !validItemStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid item status. Valid statuses are: ' + validItemStatuses.join(', ') });
    }

    try {
        const result = await pool.query(
            'UPDATE order_items SET item_status = $1 WHERE order_item_id = $2 RETURNING *',
            [status, order_item_id]
        );

        if (!result.rows.length) {
            return res.status(404).json({ error: 'Order item not found for status update.' });
        }

        const orderId = result.rows[0].order_id;
        const allItemsServedOrReady = await pool.query(
            "SELECT COUNT(*) FROM order_items WHERE order_id = $1 AND item_status NOT IN ('served', 'cancelled')",
            [orderId]
        );

        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error(`Error updating order item status for ID ${order_item_id}:`, err.message);
        res.status(500).json({ error: 'Failed to update order item status', details: err.message });
    }
});


// DELETE: ลบข้อมูลรายการอาหารในออเดอร์ (Owner, Waiter)
app.delete('/api/order_items/:order_item_id', authenticateToken, authorizeRoles(['owner', 'waiter']), async (req, res) => {
  const { order_item_id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderItemToDeleteResult = await client.query('SELECT order_id, quantity, price_at_order FROM order_items WHERE order_item_id = $1 FOR UPDATE', [order_item_id]);
    if (orderItemToDeleteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order item not found for deletion.' });
    }
    const orderItemToDelete = orderItemToDeleteResult.rows[0];
    const itemTotalPrice = orderItemToDelete.quantity * orderItemToDelete.price_at_order;

    const deleteResult = await client.query('DELETE FROM order_items WHERE order_item_id = $1 RETURNING *;', [order_item_id]);

    await client.query(
      'UPDATE orders SET total_amount = total_amount - ($1::NUMERIC) WHERE order_id = $2',
      [itemTotalPrice, orderItemToDelete.order_id]
    );

    await client.query('COMMIT');
    res.status(200).json({ message: 'Order item deleted successfully.', deletedOrderItem: deleteResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`Error deleting order item with ID ${order_item_id}:`, err.message);
    res.status(500).json({ error: 'Failed to delete order item', details: err.message });
  } finally {
    client.release();
  }
});


//----------------------------------------------------
// 7. API Endpoints สำหรับจัดการการชำระเงิน (Payments)
//    - GET /api/payments: ดึงข้อมูลการชำระเงินทั้งหมด (Owner, Waiter)
//    - GET /api/payments/:payment_id: ดึงข้อมูลการชำระเงินตาม ID (Owner, Waiter)
//    - POST /api/payments: บันทึกการชำระเงิน (Waiter)
//    - PUT /api/payments/:payment_id: อัปเดตข้อมูลการชำระเงิน (Owner, Waiter)
//    - DELETE /api/payments/:payment_id: ลบข้อมูลการชำระเงิน (Owner)
//----------------------------------------------------

// GET: ดึงข้อมูลการชำระเงินทั้งหมด (Owner, Waiter)
app.get('/api/payments', authenticateToken, authorizeRoles(['owner', 'waiter']), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM payments ORDER BY payment_date DESC');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching payments:', err.message);
    res.status(500).json({ error: 'Failed to fetch payments', details: err.message });
  }
});

// GET: ดึงข้อมูลการชำระเงินตาม ID (Owner, Waiter)
app.get('/api/payments/:payment_id', authenticateToken, authorizeRoles(['owner', 'waiter']), async (req, res) => {
  const { payment_id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM payments WHERE payment_id = $1', [payment_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found.' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(`Error fetching payment with ID ${payment_id}:`, err.message);
    res.status(500).json({ error: 'Failed to fetch payment', details: err.message });
  }
});

// POST: บันทึกการชำระเงิน (Waiter)
app.post('/api/payments', authenticateToken, authorizeRoles(['waiter']), async (req, res) => {
  const { order_id, amount, payment_method, transaction_id, status } = req.body;

  if (!order_id || !amount || typeof amount !== 'number' || amount <= 0 || !payment_method) {
      return res.status(400).json({ error: 'Order ID, amount, and payment method are required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderCheck = await client.query('SELECT table_id FROM orders WHERE order_id = $1 FOR UPDATE', [order_id]);
    if (orderCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid order_id.', details: 'Order does not exist.' });
    }
    const tableId = orderCheck.rows[0].table_id;

    const result = await client.query(`
      INSERT INTO payments (order_id, amount, payment_method, transaction_id, payment_date, status)
      VALUES ($1, $2, $3, $4, NOW(), $5)
      RETURNING *;
    `, [order_id, amount, payment_method, transaction_id || null, status || 'completed']);

    if (result.rows[0].status === 'completed') {
        await client.query(
            'UPDATE orders SET status = $1 WHERE order_id = $2',
            ['completed', order_id]
        );
        await client.query('UPDATE tables SET is_occupied = FALSE, current_order_id = NULL WHERE table_id = $1', [tableId]);
    }

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error processing payment:', err.message);
    res.status(500).json({ error: 'Failed to process payment', details: err.message });
  } finally {
    client.release();
  }
});

// PUT: อัปเดตข้อมูลการชำระเงิน (Owner, Waiter)
app.put('/api/payments/:payment_id', authenticateToken, authorizeRoles(['owner', 'waiter']), async (req, res) => {
  const { payment_id } = req.params;
  const { order_id, amount, payment_method, transaction_id, status } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const oldPaymentResult = await client.query('SELECT order_id, status FROM payments WHERE payment_id = $1 FOR UPDATE', [payment_id]);
    if (oldPaymentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Payment not found for update.' });
    }
    const oldPayment = oldPaymentResult.rows[0];
    const targetOrderId = order_id || oldPayment.order_id;

    const orderResult = await client.query('SELECT table_id FROM orders WHERE order_id = $1', [targetOrderId]);
    if (orderResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Associated order not found.', details: 'The order linked to this payment does not exist.' });
    }
    const tableId = orderResult.rows[0].table_id;

    const result = await pool.query(`
      UPDATE payments
      SET
        order_id = COALESCE($1, order_id),
        amount = COALESCE($2, amount),
        payment_method = COALESCE($3, payment_method),
        transaction_id = COALESCE($4, transaction_id),
        status = COALESCE($5, status)
      WHERE payment_id = $6
      RETURNING *;
    `, [targetOrderId, amount, payment_method, transaction_id, status, payment_id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Payment not found for update.' });
    }

    if (result.rows[0].status === 'completed' && oldPayment.status !== 'completed') {
        await client.query(
            'UPDATE orders SET status = $1 WHERE order_id = $2',
            ['completed', targetOrderId]
        );
        await client.query('UPDATE tables SET is_occupied = FALSE, current_order_id = NULL WHERE table_id = $1', [tableId]);
    }

    await client.query('COMMIT');
    res.status(200).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`Error updating payment with ID ${payment_id}:`, err.message);
    res.status(500).json({ error: 'Failed to update payment', details: err.message });
  } finally {
    client.release();
  }
});

// DELETE: ลบข้อมูลการชำระเงิน (Owner only)
app.delete('/api/payments/:payment_id', authenticateToken, authorizeRoles(['owner']), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM payments WHERE payment_id = $1 RETURNING *;', [payment_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found for deletion.' });
    }
    res.status(200).json({ message: 'Payment deleted successfully.', deletedPayment: result.rows[0] });
  } catch (err) {
    console.error(`Error deleting payment with ID ${payment_id}:`, err.message);
    res.status(500).json({ error: 'Failed to delete payment', details: err.message });
  }
});


//----------------------------------------------------
// Server Listener
//----------------------------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
