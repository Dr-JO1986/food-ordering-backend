
//-------------------------
require('dotenv').config(); // ต้องอยู่บรรทัดแรกสุด
//---------------------
const express = require('express');
const { Pool } = require('pg');

const app = express();
// PostgreSQL Connection Pool Configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // เปลี่ยนมาใช้ DATABASE_URL
  ssl: {
    rejectUnauthorized: false // สำคัญสำหรับ Render/Cloud Database
  }
});
// Test Database Connection (This part is already there)
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error acquiring client', err.stack);
  }
  client.query('SELECT NOW()', (err, result) => {
    release();
    if (err) {
      return console.error('Error executing query', err.stack);
    }
    console.log('Database connected successfully! Current time from DB:', result.rows[0].now);
  });
});

app.use(express.json()); // Middleware to parse JSON request bodies

// --- Existing GET / route ---
app.get('/', (req, res) => {
  res.send('Welcome to My Food Ordering Backend API!');
});

// --- Existing POST /api/order route (will be updated later) ---
app.post('/api/order', (req, res) => {
  const orderData = req.body;
  console.log('Received new order:', orderData);
  res.status(201).json({
    message: 'Order received successfully!',
    order: orderData,
    status: 'pending'
  });
});

// ----------------------------------------------------
// ส่วนใหม่: API Endpoints สำหรับจัดการเมนู (Menus)
// ----------------------------------------------------

// 1. API Endpoint สำหรับเพิ่มเมนูใหม่ (POST /api/menus)
app.post('/api/menus', async (req, res) => {
  const { name, description, price, image_url, category, is_available } = req.body;

  try {
    const result = await pool.query(
      'INSERT INTO menus (name, description, price, image_url, category, is_available) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, description, price, image_url, category, is_available]
    );
    res.status(201).json(result.rows[0]); // ส่งข้อมูลเมนูที่เพิ่มกลับไป
  } catch (err) {
    console.error('Error adding new menu:', err.message);
    res.status(500).json({ error: 'Failed to add new menu item', details: err.message });
  }
});

// 2. API Endpoint สำหรับดึงข้อมูลเมนูทั้งหมด (GET /api/menus)
app.get('/api/menus', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM menus ORDER BY category, name');
    res.status(200).json(result.rows); // ส่งรายการเมนูทั้งหมด
  } catch (err) {
    console.error('Error fetching menus:', err.message);
    res.status(500).json({ error: 'Failed to fetch menu items', details: err.message });
  }
});

// 3. API Endpoint สำหรับดึงข้อมูลเมนูตาม ID (GET /api/menus/:id)
app.get('/api/menus/:id', async (req, res) => {
  const { id } = req.params; // ดึงค่า ID จาก URL parameters

  try {
    const result = await pool.query('SELECT * FROM menus WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    res.status(200).json(result.rows[0]); // ส่งข้อมูลเมนูเดียว
  } catch (err) {
    console.error('Error fetching menu by ID:', err.message);
    res.status(500).json({ error: 'Failed to fetch menu item by ID', details: err.message });
  }
});

app.use(express.json());

// --- Existing GET / route ---
app.get('/', (req, res) => {
  res.send('Welcome to My Food Ordering Backend API!');
});

// --- Existing POST /api/order route (will be updated later) ---
app.post('/api/order', (req, res) => {
  const orderData = req.body;
  console.log('Received new order:', orderData);
  res.status(201).json({
    message: 'Order received successfully!',
    order: orderData,
    status: 'pending'
  });
});

// --- API Endpoints สำหรับจัดการเมนู (Menus)
// 1. API Endpoint สำหรับเพิ่มเมนูใหม่ (POST /api/menus)
app.post('/api/menus', async (req, res) => {
  const { name, description, price, image_url, category, is_available } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO menus (name, description, price, image_url, category, is_available) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, description, price, image_url, category, is_available]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error adding new menu:', err.message);
    res.status(500).json({ error: 'Failed to add new menu item', details: err.message });
  }
});

// 2. API Endpoint สำหรับดึงข้อมูลเมนูทั้งหมด (GET /api/menus)
app.get('/api/menus', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM menus ORDER BY category, name');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching menus:', err.message);
    res.status(500).json({ error: 'Failed to fetch menu items', details: err.message });
  }
});

// 3. API Endpoint สำหรับดึงข้อมูลเมนูตาม ID (GET /api/menus/:id)
app.get('/api/menus/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM menus WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching menu by ID:', err.message);
    res.status(500).json({ error: 'Failed to fetch menu item by ID', details: err.message });
  }
});

// ส่วนใหม่: API Endpoints สำหรับจัดการโต๊ะอาหาร (Tables)
// 1. API Endpoint สำหรับเพิ่มโต๊ะใหม่ (POST /api/tables)
app.post('/api/tables', async (req, res) => {
  const { table_number, qr_code_path } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO tables (table_number, qr_code_path) VALUES ($1, $2) RETURNING *',
      [table_number, qr_code_path]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error adding new table:', err.message);
    // ตรวจสอบว่า Error เกิดจาก table_number ซ้ำหรือไม่ (UNIQUE constraint violation)
    if (err.code === '23505') { // PostgreSQL error code for unique_violation
      return res.status(409).json({ error: 'Table number already exists', details: err.message });
    }
    res.status(500).json({ error: 'Failed to add new table', details: err.message });
  }
});

// 2. API Endpoint สำหรับดึงข้อมูลโต๊ะทั้งหมด (GET /api/tables)
app.get('/api/tables', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tables ORDER BY table_number');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching tables:', err.message);
    res.status(500).json({ error: 'Failed to fetch tables', details: err.message });
  }
});

// 3. API Endpoint สำหรับดึงข้อมูลโต๊ะตาม ID (GET /api/tables/:id)
app.get('/api/tables/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM tables WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Table not found' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching table by ID:', err.message);
    res.status(500).json({ error: 'Failed to fetch table by ID', details: err.message });
  }
});

// 4. API Endpoint สำหรับอัปเดตข้อมูลโต๊ะ (PUT /api/tables/:id)
app.put('/api/tables/:id', async (req, res) => {
  const { id } = req.params; // ดึงค่า ID ของโต๊ะจาก URL (เช่น /api/tables/1)
  const { table_number, qr_code_path } = req.body; // ดึงข้อมูลที่ต้องการอัปเดตจาก Body ของ Request

  // ตรวจสอบว่ามีข้อมูลที่จำเป็นครบถ้วนหรือไม่
  if (!table_number) {
    return res.status(400).json({ error: 'Table number is required for update.' });
  }

  try {
    const result = await pool.query(
      'UPDATE tables SET table_number = $1, qr_code_path = $2 WHERE id = $3 RETURNING *',
      [table_number, qr_code_path, id]
    );

    // ถ้าไม่พบโต๊ะที่มี ID นั้นใน Database
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Table not found for update.' });
    }

    // ถ้าอัปเดตสำเร็จ
    res.status(200).json(result.rows[0]); // ส่งข้อมูลโต๊ะที่ถูกอัปเดตกลับไป

  } catch (err) {
    console.error('Error updating table:', err.message);

    // ตรวจสอบ Error Code สำหรับ Unique Constraint Violation (table_number ซ้ำ)
    if (err.code === '23505') { // '23505' คือ PostgreSQL error code สำหรับ unique_violation
      return res.status(409).json({ error: 'Table number already exists. Please choose a different one.', details: err.message });
    }

    // สำหรับ Error อื่นๆ ที่ไม่คาดคิด
    res.status(500).json({ error: 'Failed to update table.', details: err.message });
  }
});

// 5. API Endpoint สำหรับลบโต๊ะ (DELETE /api/tables/:id)
app.delete('/api/tables/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM tables WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Table not found for deletion' });
    }
    res.status(204).send(); // 204 No Content for successful deletion
  } catch (err) {
    console.error('Error deleting table:', err.message);
    res.status(500).json({ error: 'Failed to delete table', details: err.message });
  }
});
// 1. API Endpoint สำหรับสร้างออเดอร์ใหม่ (POST /api/orders)
// รับข้อมูลออเดอร์และรายการอาหารในออเดอร์นั้น
app.post('/api/orders', async (req, res) => {
  const { table_id, customer_name, order_items } = req.body;

  // ตรวจสอบข้อมูลที่จำเป็น
  if (!table_id || !order_items || order_items.length === 0) {
    return res.status(400).json({ error: 'Table ID and at least one order item are required.' });
  }

  const client = await pool.connect(); // ใช้ client เพื่อทำ Transaction
  try {
    await client.query('BEGIN'); // เริ่ม Transaction

    // 1.1 สร้าง Order หลักในตาราง 'orders'
    const orderResult = await client.query(
      'INSERT INTO orders (table_id, customer_name, order_time, status, total_amount) VALUES ($1, $2, NOW(), $3, $4) RETURNING id, order_time',
      [table_id, customer_name || 'Guest', 'pending', 0] // total_amount จะคำนวณทีหลัง
    );
    const orderId = orderResult.rows[0].id;
    const orderTime = orderResult.rows[0].order_time;
    let totalAmount = 0;

    // 1.2 เพิ่มรายการอาหารในตาราง 'order_items' และคำนวณราคารวม
    for (const item of order_items) {
      const { menu_id, quantity, notes } = item;

      if (!menu_id || !quantity || quantity <= 0) {
        throw new Error('Invalid order item: menu_id and quantity (must be > 0) are required.');
      }

      // ดึงราคาเมนูจากตาราง 'menus'
      const menuPriceResult = await client.query('SELECT price FROM menus WHERE id = $1', [menu_id]);
      if (menuPriceResult.rows.length === 0) {
        throw new Error(`Menu item with ID ${menu_id} not found.`);
      }
      const itemPrice = parseFloat(menuPriceResult.rows[0].price);
      const itemTotalPrice = itemPrice * quantity;
      totalAmount += itemTotalPrice;

      await client.query(
        'INSERT INTO order_items (order_id, menu_id, quantity, price_at_order, notes) VALUES ($1, $2, $3, $4, $5)',
        [orderId, menu_id, quantity, itemPrice, notes || null]
      );
    }

    // 1.3 อัปเดต total_amount ในตาราง 'orders'
    await client.query(
      'UPDATE orders SET total_amount = $1 WHERE id = $2',
      [totalAmount, orderId]
    );

    await client.query('COMMIT'); // ยืนยัน Transaction

    res.status(201).json({
      message: 'Order created successfully!',
      order_id: orderId,
      table_id: table_id,
      customer_name: customer_name || 'Guest',
      order_time: orderTime,
      total_amount: totalAmount,
      order_items: order_items // ส่งรายการที่ได้รับกลับไป
    });

  } catch (err) {
    await client.query('ROLLBACK'); // ยกเลิก Transaction หากมี Error
    console.error('Error creating order:', err.message);
    res.status(500).json({ error: 'Failed to create order', details: err.message });
  } finally {
    client.release(); // คืน client กลับสู่ pool
  }
});

// 2. API Endpoint สำหรับดึงข้อมูลออเดอร์ทั้งหมด (GET /api/orders)
// ดึงข้อมูลออเดอร์พร้อมรายละเอียดโต๊ะ
app.get('/api/orders', async (req, res) => {
    try {
       const result = await pool.query(`
        SELECT
            o.order_id,
            o.customer_name,
            o.order_time,
            o.status,
            o.total_amount,
            t.table_number,
            t.capacity
        FROM orders o
        JOIN tables t ON o.table_id = t.table_id
        ORDER BY o.order_time DESC
    `);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching orders:', err.message);
        res.status(500).json({ error: 'Failed to fetch orders', details: err.message });
    }
});

// 3. API Endpoint สำหรับดึงข้อมูลออเดอร์ตาม ID พร้อมรายละเอียดรายการอาหาร (GET /api/orders/:id)
app.get('/api/orders/:id', async (req, res) => {
    const { id } = req.params; // ตรงนี้ id คือ order_id ที่ส่งมาจาก URL
    try {
        // ดึงข้อมูล Order หลัก
        // ส่วนดึง Order หลัก
        const orderResult = await pool.query(`
            SELECT
                o.order_id,
                o.customer_name,
                o.order_time,
                o.status,
                o.total_amount,
                t.table_number,
                t.capacity
            FROM orders o
            JOIN tables t ON o.table_id = t.table_id
            WHERE o.order_id = $1 // <-- ตรวจสอบบรรทัดนี้
            `, [id]);

        // ส่วนดึง Order Items
        const orderItemsResult = await pool.query(`
            SELECT
                oi.order_item_id,
                oi.menu_id,
                m.name AS menu_name,
                m.description AS menu_description,
                oi.quantity,
                oi.price_at_order
            FROM order_items oi
            JOIN menus m ON oi.menu_id = m.menu_id
            WHERE oi.order_id = $1 // <-- ตรวจสอบบรรทัดนี้
            ORDER BY oi.order_item_id
            `, [id]);
        order.items = orderItemsResult.rows;
        res.status(200).json(order);

    } catch (err) {
        console.error('Error fetching order by ID:', err.message);
        res.status(500).json({ error: 'Failed to fetch order by ID', details: err.message });
    }
});
// ส่วนใหม่: API Endpoint สำหรับลบออเดอร์ (DELETE /api/orders/:id)
// ----------------------------------------------------
app.delete('/api/orders/:id', async (req, res) => {
  const { id } = req.params; // ID ของออเดอร์จาก URL

  const client = await pool.connect(); // ใช้ client เพื่อทำ Transaction
  try {
    await client.query('BEGIN'); // เริ่ม Transaction

    // 1. ลบรายการอาหารทั้งหมดที่เกี่ยวข้องกับออเดอร์นี้ในตาราง 'order_items' ก่อน
    const deleteOrderItemsResult = await client.query('DELETE FROM order_items WHERE order_id = $1 RETURNING *', [id]);

    // 2. ลบออเดอร์หลักจากตาราง 'orders'
    const deleteOrderResult = await client.query('DELETE FROM orders WHERE id = $1 RETURNING *', [id]);

    // ถ้าไม่พบออเดอร์หลักที่มี ID นั้นใน Database
    if (deleteOrderResult.rows.length === 0) {
      await client.query('ROLLBACK'); // ยกเลิกการลบ order_items ที่อาจเกิดขึ้น
      return res.status(404).json({ error: 'Order not found for deletion.' });
    }

    await client.query('COMMIT'); // ยืนยัน Transaction

    // ส่ง Status 204 No Content สำหรับการลบที่สำเร็จ
    res.status(204).send();

  } catch (err) {
    await client.query('ROLLBACK'); // ยกเลิก Transaction หากมี Error
    console.error('Error deleting order:', err.message);
    res.status(500).json({ error: 'Failed to delete order.', details: err.message });
  } finally {
    client.release(); // คืน client กลับสู่ pool
  }
});
// ----------------------------------------------------
// ส่วนใหม่: API Endpoint สำหรับอัปเดตสถานะออเดอร์ (PUT /api/orders/:id/status)
// ----------------------------------------------------
app.put('/api/orders/:id/status', async (req, res) => {
  const { id } = req.params; // ID ของออเดอร์จาก URL
  const { status } = req.body; // สถานะใหม่จาก Body ของ Request

  // กำหนดสถานะที่ถูกต้องตามที่คุณต้องการ
  const validStatuses = ['pending', 'preparing', 'completed', 'cancelled'];

  // ตรวจสอบว่ามีการส่งสถานะมาและสถานะนั้นถูกต้องตามที่กำหนด
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Valid statuses are: ' + validStatuses.join(', ') });
  }

  try {
    const result = await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    // ถ้าไม่พบออเดอร์ที่มี ID นั้นใน Database
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found for status update.' });
    }

    // ถ้าอัปเดตสถานะสำเร็จ
    res.status(200).json(result.rows[0]); // ส่งข้อมูลออเดอร์ที่ถูกอัปเดตกลับไป

  } catch (err) {
    console.error('Error updating order status:', err.message);
    res.status(500).json({ error: 'Failed to update order status.', details: err.message });
  }
});
// API Endpoint สำหรับดึงข้อมูลรายการออเดอร์ทั้งหมด (GET /api/order_items)
// ตรวจสอบให้แน่ใจว่าอยู่ภายในไฟล์ server.js และหลังจากบรรทัด app.use(express.json()); และ app.use(cors());

// API Endpoint สำหรับดึงข้อมูลรายการออเดอร์ทั้งหมด (GET /api/order_items)
app.get('/api/order_items', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                oi.order_item_id,
                oi.order_id,
                oi.menu_id,
                m.name AS menu_name,
                oi.quantity,
                oi.price_at_order
                -- เพิ่มคอลัมน์อื่น ๆ จาก order_items หรือ menus ที่คุณต้องการ
            FROM order_items oi
            JOIN menus m ON oi.menu_id = m.menu_id 
            ORDER BY oi.order_item_id DESC
        `);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching order items:', err.message);
        res.status(500).json({ error: 'Failed to fetch order items', details: err.message });
    }
});

// หากคุณมี GET /api/order_items/:id ด้วย ก็เพิ่มโค้ดที่ถูกต้องเข้าไป (คล้ายกับ GET /api/orders/:id)
app.get('/api/order_items/:id', async (req, res) => {
    const { id } = req.params; // id ในที่นี้คือ order_item_id
    try {
        const result = await pool.query(`
            SELECT
                oi.order_item_id,
                oi.order_id,
                oi.menu_id,
                m.name AS menu_name,
                oi.quantity,
                oi.price_at_order
            FROM order_items oi
            JOIN menus m ON oi.menu_id = m.menu_id
            WHERE oi.order_item_id = $1 
            `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Order item not found.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching order item by ID:', err.message);
        res.status(500).json({ error: 'Failed to fetch order item by ID', details: err.message });
    }
});
// --- API Endpoints สำหรับ Payments ---

// 1. API Endpoint สำหรับดึงข้อมูลการชำระเงินทั้งหมด (GET /api/payments)
app.get('/api/payments', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                p.payment_id,
                p.order_id,
                o.customer_name, -- ดึงจากตาราง orders (ตรวจสอบว่ามีคอลัมน์นี้จริงใน DB)
                o.order_time,    -- ดึงจากตาราง orders (ตรวจสอบว่ามีคอลัมน์นี้จริงใน DB)
                p.amount,
                p.payment_date,
                p.payment_method,
                p.transaction_id,
                p.status
            FROM payments p
            JOIN orders o ON p.order_id = o.order_id -- เชื่อมกับตาราง orders
            ORDER BY p.payment_date DESC
        `);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching payments:', err.message);
        res.status(500).json({ error: 'Failed to fetch payments', details: err.message });
    }
});

// 2. API Endpoint สำหรับดึงข้อมูลการชำระเงินตาม ID (GET /api/payments/:id)
app.get('/api/payments/:id', async (req, res) => {
    const { id } = req.params; // id ในที่นี้คือ payment_id
    try {
        const result = await pool.query(`
            SELECT
                p.payment_id,
                p.order_id,
                o.customer_name, -- ดึงจากตาราง orders (ตรวจสอบว่ามีคอลัมน์นี้จริงใน DB)
                o.order_time,    -- ดึงจากตาราง orders (ตรวจสอบว่ามีคอลัมน์นี้จริงใน DB)
                p.amount,
                p.payment_date,
                p.payment_method,
                p.transaction_id,
                p.status
            FROM payments p
            JOIN orders o ON p.order_id = o.order_id
            WHERE p.payment_id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Payment not found.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching payment by ID:', err.message);
        res.status(500).json({ error: 'Failed to fetch payment by ID', details: err.message });
    }
});

// 3. API Endpoint สำหรับเพิ่มการชำระเงินใหม่ (POST /api/payments)
app.post('/api/payments', async (req, res) => {
    const { order_id, amount, payment_method, transaction_id, status } = req.body;
    try {
        // ตรวจสอบว่า order_id ที่ส่งมามีอยู่จริงในตาราง orders หรือไม่ (Optional แต่ดีต่อการป้องกันข้อมูลผิดพลาด)
        const orderCheck = await pool.query('SELECT order_id FROM orders WHERE order_id = $1', [order_id]);
        if (orderCheck.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid order_id.', details: 'Order does not exist.' });
        }

        const result = await pool.query(`
            INSERT INTO payments (order_id, amount, payment_method, transaction_id, status)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *;
        `, [order_id, amount, payment_method, transaction_id, status]);

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error adding new payment:', err.message);
        res.status(500).json({ error: 'Failed to add new payment', details: err.message });
    }
});

// 4. API Endpoint สำหรับอัปเดตข้อมูลการชำระเงิน (PUT /api/payments/:id)
app.put('/api/payments/:id', async (req, res) => {
    const { id } = req.params; // id ในที่นี้คือ payment_id
    const { order_id, amount, payment_method, transaction_id, status } = req.body;
    try {
        // คุณอาจจะต้องเพิ่มการตรวจสอบ order_id ที่อัปเดตคล้ายกับ POST
        const result = await pool.query(`
            UPDATE payments
            SET
                order_id = COALESCE($1, order_id), -- COALESCE ใช้เพื่อให้สามารถอัปเดตบางฟิลด์ได้
                amount = COALESCE($2, amount),
                payment_method = COALESCE($3, payment_method),
                transaction_id = COALESCE($4, transaction_id),
                status = COALESCE($5, status)
            WHERE payment_id = $6
            RETURNING *;
        `, [order_id, amount, payment_method, transaction_id, status, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Payment not found.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('Error updating payment:', err.message);
        res.status(500).json({ error: 'Failed to update payment', details: err.message });
    }
});

// 5. API Endpoint สำหรับลบการชำระเงิน (DELETE /api/payments/:id)
app.delete('/api/payments/:id', async (req, res) => {
    const { id } = req.params; // id ในที่นี้คือ payment_id
    try {
        const result = await pool.query('DELETE FROM payments WHERE payment_id = $1 RETURNING *;', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Payment not found.' });
        }
        res.status(200).json({ message: 'Payment deleted successfully.', deletedPayment: result.rows[0] });
    } catch (err) {
        console.error('Error deleting payment:', err.message);
        res.status(500).json({ error: 'Failed to delete payment', details: err.message });
    }
});

const PORT = process.env.PORT || 5000; // จะใช้ค่าจาก .env หรือ 5000 เป็นค่าเริ่มต้น
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Access it at: http://localhost:${PORT}`);
});