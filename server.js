
//-------------------------
require('dotenv').config(); // ต้องอยู่บรรทัดแรกสุด

//---------------------
const express = require('express');
const { Pool } = require('pg');

const app = express();
// PostgreSQL Connection Pool Configuration
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
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

// --- API Endpoints สำหรับจัดการเมนู (Menus) (โค้ดที่เราสร้างไปเมื่อวานนี้) ---
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
        o.id AS order_id,
        o.customer_name,
        o.order_time,
        o.status,
        o.total_amount,
        t.table_number,
        t.qr_code_path
      FROM orders o
      JOIN tables t ON o.table_id = t.id
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
  const { id } = req.params;
  try {
    // ดึงข้อมูล Order หลัก
    const orderResult = await pool.query(`
      SELECT
        o.id AS order_id,
        o.customer_name,
        o.order_time,
        o.status,
        o.total_amount,
        t.table_number,
        t.qr_code_path
      FROM orders o
      JOIN tables t ON o.table_id = t.id
      WHERE o.id = $1
    `, [id]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const order = orderResult.rows[0];

    // ดึงรายการอาหารในออเดอร์นั้น
    const orderItemsResult = await pool.query(`
      SELECT
        oi.id AS order_item_id,
        oi.menu_id,
        m.name AS menu_name,
        m.description AS menu_description,
        oi.quantity,
        oi.price_at_order,
        oi.notes
      FROM order_items oi
      JOIN menus m ON oi.menu_id = m.id
      WHERE oi.order_id = $1
      ORDER BY oi.id
    `, [id]);

    // รวมข้อมูล Order หลักและรายการอาหารเข้าด้วยกัน
    order.items = orderItemsResult.rows;

    res.status(200).json(order);

  } catch (err) {
    console.error('Error fetching order by ID:', err.message);
    res.status(500).json({ error: 'Failed to fetch order by ID', details: err.message });
  }
});
// server.js

// ... (โค้ดเดิมส่วนบนทั้งหมด, express, pg, pool config, test connection, API menus, API tables, API orders) ...

// ----------------------------------------------------
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
// server.js

// ... (โค้ดเดิมส่วนบนทั้งหมด เช่น require, pool config, test connection, API menus, API tables, API orders) ...

// ----------------------------------------------------
// ส่วนใหม่: API Endpoint สำหรับอัปเดตสถานะออเดอร์ (PUT /api/orders/:id/status)
// นี่คือโค้ดที่คุณต้องเพิ่มเข้าไปใน server.js
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

// ... (โค้ดส่วนที่เหลือ เช่น app.listen) ...
const PORT = process.env.PORT || 5000; // จะใช้ค่าจาก .env หรือ 5000 เป็นค่าเริ่มต้น
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Access it at: http://localhost:${PORT}`);
});