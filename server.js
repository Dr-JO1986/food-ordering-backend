//-------------------------
require('dotenv').config(); // ต้องอยู่บรรทัดแรกสุดเสมอ เพื่อโหลด environment variables
//---------------------
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors'); // สำหรับ Cross-Origin Resource Sharing

const app = express();

// PostgreSQL Connection Pool Configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // ใช้ DATABASE_URL จาก Render environment
  ssl: {
    rejectUnauthorized: false // สำคัญสำหรับ Render/Cloud Database
  }
});

// Test Database Connection
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error acquiring client from pool', err.stack);
  }
  client.query('SELECT NOW()', (err, result) => {
    release(); // ปล่อย client กลับไปที่ pool
    if (err) {
      return console.error('Error executing database test query', err.stack);
    }
    console.log('Database connected successfully! Current time from DB:', result.rows[0].now);
  });
});

// Middlewares ควรอยู่ตรงนี้ (หลังจาก app ถูกสร้าง และก่อน routes ทั้งหมด)
app.use(express.json()); // Middleware สำหรับ parse JSON request bodies
app.use(cors());         // Middleware สำหรับเปิดใช้งาน CORS

// ----------------------------------------------------
// 1. Root Route
// ----------------------------------------------------
app.get('/', (req, res) => {
  res.send('Welcome to My Food Ordering Backend API!');
});

// ----------------------------------------------------
// 2. API Endpoints สำหรับจัดการเมนู (Menus)
//    - GET /api/menus: ดึงข้อมูลเมนูทั้งหมด
//    - GET /api/menus/:menu_id: ดึงข้อมูลเมนูตาม ID
//    - POST /api/menus: เพิ่มเมนูใหม่
// ----------------------------------------------------

// GET: ดึงข้อมูลเมนูทั้งหมด
app.get('/api/menus', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM menus ORDER BY menu_id ASC');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching menus:', err.message);
    res.status(500).json({ error: 'Failed to fetch menus', details: err.message });
  }
});

// GET: ดึงข้อมูลเมนูตาม ID
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

// POST: เพิ่มเมนูใหม่
app.post('/api/menus', async (req, res) => {
  const { name, description, price, image_url, category, is_available } = req.body;
  
  // ตรวจสอบข้อมูลที่จำเป็น
  if (!name || !price) {
      return res.status(400).json({ error: 'Name and price are required.' });
  }

  try {
    const result = await pool.query(`
      INSERT INTO menus (name, description, price, image_url, category, is_available)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `, [name, description || null, price, image_url || null, category || 'ทั่วไป', is_available !== undefined ? is_available : true]); // กำหนดค่าเริ่มต้นถ้าไม่ระบุ

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error adding new menu:', err.message);
    res.status(500).json({ error: 'Failed to add new menu', details: err.message });
  }
});


// ----------------------------------------------------
// 3. API Endpoints สำหรับจัดการโต๊ะ (Tables)
//    - GET /api/tables: ดึงข้อมูลโต๊ะทั้งหมด
//    - GET /api/tables/:table_id: ดึงข้อมูลโต๊ะตาม ID
//    - POST /api/tables: เพิ่มโต๊ะใหม่
// ----------------------------------------------------

// GET: ดึงข้อมูลโต๊ะทั้งหมด
app.get('/api/tables', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tables ORDER BY table_id ASC');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching tables:', err.message);
    res.status(500).json({ error: 'Failed to fetch tables', details: err.message });
  }
});

// GET: ดึงข้อมูลโต๊ะตาม ID
app.get('/api/tables/:table_id', async (req, res) => {
  const { table_id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM tables WHERE table_id = $1', [table_id]); // ใช้ table_id
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Table not found.' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(`Error fetching table with ID ${table_id}:`, err.message);
    res.status(500).json({ error: 'Failed to fetch table', details: err.message });
  }
});

// POST: เพิ่มโต๊ะใหม่
app.post('/api/tables', async (req, res) => {
  const { table_number, qr_code_path, capacity } = req.body;
  
  // เพิ่ม console.log เพื่อ debug
  console.log('Received POST /api/tables request. Body:', req.body);
  console.log('Extracted table_number:', table_number, 'qr_code_path:', qr_code_path, 'capacity:', capacity);

  // ตรวจสอบค่าที่จำเป็นสำหรับคอลัมน์ NOT NULL ใน DB (จาก DDL และ pgAdmin)
  if (table_number === undefined || table_number === null || typeof table_number !== 'number') {
      console.error('Validation Error: table_number is required and must be a number.');
      return res.status(400).json({ error: 'Failed to add new table', details: 'Table number is required and must be a number.' });
  }
  if (capacity === undefined || capacity === null || typeof capacity !== 'number') {
      console.error('Validation Error: capacity is required and must be a number.');
      return res.status(400).json({ error: 'Failed to add new table', details: 'Capacity is required and must be a number.' });
  }
  // qr_code_path ไม่ใช่ NOT NULL (จาก pgAdmin) จึงสามารถเป็น null ได้

  try {
    const result = await pool.query(
      'INSERT INTO tables (table_number, qr_code_path, capacity) VALUES ($1, $2, $3) RETURNING *',
      [table_number, qr_code_path || null, capacity] // ส่ง null ถ้า qr_code_path ไม่ได้ให้มา
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


// ----------------------------------------------------
// 4. API Endpoints สำหรับจัดการออเดอร์ (Orders)
//    - GET /api/orders: ดึงข้อมูลออเดอร์ทั้งหมดพร้อมรายละเอียดโต๊ะ
//    - GET /api/orders/:order_id: ดึงข้อมูลออเดอร์ตาม ID พร้อมรายการอาหารและโต๊ะ
//    - POST /api/orders: สร้างออเดอร์ใหม่พร้อมรายการอาหาร
// ----------------------------------------------------

// GET: ดึงข้อมูลออเดอร์ทั้งหมดพร้อมรายละเอียดโต๊ะ
app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        o.order_id,          -- แก้ไข: ใช้ order_id แทน id
        o.customer_name,
        o.order_time,
        o.status,
        o.total_amount,
        t.table_number,
        t.qr_code_path,
        t.capacity,          -- เพิ่ม capacity
        t.is_occupied        -- เพิ่ม is_occupied
      FROM orders o
      JOIN tables t ON o.table_id = t.table_id -- แก้ไข: ใช้ t.table_id แทน t.id
      ORDER BY o.order_time DESC;
    `);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching orders:', err.message);
    res.status(500).json({ error: 'Failed to fetch orders', details: err.message });
  }
});

// GET: ดึงข้อมูลออเดอร์ตาม ID พร้อมรายการอาหารและโต๊ะ
app.get('/api/orders/:order_id', async (req, res) => {
  const { order_id } = req.params; // ใช้ order_id
  try {
    // ดึงข้อมูล Order หลัก
    const orderResult = await pool.query(`
      SELECT
        o.order_id,             -- แก้ไข: ใช้ order_id แทน id
        o.customer_name,
        o.order_time,
        o.status,
        o.total_amount,
        t.table_number,
        t.qr_code_path,
        t.capacity,             -- เพิ่ม capacity
        t.is_occupied           -- เพิ่ม is_occupied
      FROM orders o
      JOIN tables t ON o.table_id = t.table_id -- แก้ไข: ใช้ t.table_id แทน t.id
      WHERE o.order_id = $1     -- แก้ไข: ใช้ o.order_id แทน o.id
    `, [order_id]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const order = orderResult.rows[0];

    // ดึงรายการอาหารในออเดอร์นั้น
    const orderItemsResult = await pool.query(`
      SELECT
        oi.order_item_id,      -- แก้ไข: ใช้ order_item_id แทน id
        oi.menu_id,
        m.name AS menu_name,
        m.description AS menu_description,
        oi.quantity,
        oi.price_at_order,
        oi.notes
      FROM order_items oi
      JOIN menus m ON oi.menu_id = m.menu_id  -- แก้ไข: ใช้ m.menu_id แทน m.id
      WHERE oi.order_id = $1                  -- แก้ไข: ใช้ oi.order_id แทน oi.id
      ORDER BY oi.order_item_id;
    `, [order_id]);

    // รวมข้อมูล Order หลักและรายการอาหารเข้าด้วยกัน
    order.items = orderItemsResult.rows;

    res.status(200).json(order);
  } catch (err) {
    console.error(`Error fetching order by ID ${order_id}:`, err.message);
    res.status(500).json({ error: 'Failed to fetch order by ID', details: err.message });
  }
});

// POST: สร้างออเดอร์ใหม่ (พร้อมรายการอาหาร)
app.post('/api/orders', async (req, res) => {
  const { table_id, customer_name, order_items } = req.body; // order_items เป็น array ของ { menu_id, quantity, notes }
  
  // ตรวจสอบค่าที่จำเป็น
  if (!table_id || !Array.isArray(order_items) || order_items.length === 0) {
      return res.status(400).json({ error: 'Table ID and order items are required.' });
  }

  const client = await pool.connect(); // ใช้ transaction เพื่อความสมบูรณ์ของข้อมูล
  try {
    await client.query('BEGIN'); // เริ่ม transaction

    // 1. สร้าง Order หลัก
    const orderResult = await client.query(
      'INSERT INTO orders (table_id, customer_name, order_time, status, total_amount) VALUES ($1, $2, NOW(), $3, $4) RETURNING order_id, order_time', // แก้ไข: ใช้ order_id แทน id
      [table_id, customer_name || 'Guest', 'pending', 0] // total_amount เริ่มต้นเป็น 0
    );
    const orderId = orderResult.rows[0].order_id; // แก้ไข: ใช้ order_id แทน id
    let totalAmount = 0;

    // 2. เพิ่มรายการ Order Items
    for (const item of order_items) {
      const { menu_id, quantity, notes } = item;
      
      if (!menu_id || !quantity || quantity <= 0) {
          throw new Error(`Invalid order item: menu_id and quantity are required and quantity must be positive. Item: ${JSON.stringify(item)}`);
      }

      // ดึงราคาเมนูจากตาราง menus
      const menuPriceResult = await client.query('SELECT price FROM menus WHERE menu_id = $1', [menu_id]); // แก้ไข: ใช้ menu_id แทน id
      if (menuPriceResult.rows.length === 0) {
        throw new Error(`Menu item with ID ${menu_id} not found.`);
      }
      const priceAtOrder = menuPriceResult.rows[0].price;

      // แทรกรายการอาหาร
      await client.query(`
        INSERT INTO order_items (order_id, menu_id, quantity, price_at_order, notes)
        VALUES ($1, $2, $3, $4, $5);
      `, [orderId, menu_id, quantity, priceAtOrder, notes || null]);

      totalAmount += priceAtOrder * quantity;
    }

    // 3. อัปเดต total_amount ใน Order หลัก
    await client.query(
      'UPDATE orders SET total_amount = $1 WHERE order_id = $2', // แก้ไข: ใช้ order_id แทน id
      [totalAmount, orderId]
    );

    // 4. (Optional) ตั้งค่า is_occupied ของโต๊ะเป็น true
    await client.query(
        'UPDATE tables SET is_occupied = TRUE WHERE table_id = $1', // แก้ไข: ใช้ table_id
        [table_id]
    );

    await client.query('COMMIT'); // Commit transaction

    res.status(201).json({
      message: 'Order created successfully!',
      order_id: orderId,
      total_amount: totalAmount,
      order_time: orderResult.rows[0].order_time
    });

  } catch (err) {
    await client.query('ROLLBACK'); // Rollback transaction หากเกิด error
    console.error('Error creating order:', err.message);
    res.status(500).json({ error: 'Failed to create order', details: err.message });
  } finally {
    client.release(); // ปล่อย client กลับไปที่ pool
  }
});


// ----------------------------------------------------
// 5. API Endpoints สำหรับจัดการรายการอาหารในออเดอร์ (Order Items)
//    - GET /api/order_items: ดึงข้อมูลรายการอาหารในออเดอร์ทั้งหมด (ไม่ค่อยใช้โดยตรง)
//    - GET /api/order_items/:order_item_id: ดึงข้อมูลรายการอาหารในออเดอร์ตาม ID
//    - POST /api/order_items: เพิ่มรายการอาหารในออเดอร์ที่มีอยู่แล้ว (ถ้าจำเป็น)
// ----------------------------------------------------

// GET: ดึงข้อมูลรายการอาหารในออเดอร์ทั้งหมด
app.get('/api/order_items', async (req, res) => {
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
        oi.notes
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

// GET: ดึงข้อมูลรายการอาหารในออเดอร์ตาม ID
app.get('/api/order_items/:order_item_id', async (req, res) => {
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
        oi.notes
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

// POST: เพิ่มรายการอาหารในออเดอร์ที่มีอยู่แล้ว (ถ้าจำเป็นต้องเพิ่มทีหลัง)
app.post('/api/order_items', async (req, res) => {
    const { order_id, menu_id, quantity, notes } = req.body; 
    
    // ตรวจสอบค่าที่จำเป็น
    if (!order_id || !menu_id || !quantity || typeof quantity !== 'number' || quantity <= 0) {
        return res.status(400).json({ error: 'Order ID, menu ID, and positive quantity are required.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // เริ่ม transaction

        // ตรวจสอบว่า order_id มีอยู่จริง
        const orderExists = await client.query('SELECT order_id FROM orders WHERE order_id = $1 FOR UPDATE', [order_id]); // FOR UPDATE เพื่อ lock row
        if (orderExists.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Invalid order_id.', details: 'Order does not exist.' });
        }
        
        // ดึงราคาเมนูจากตาราง menus
        const menuResult = await client.query('SELECT price FROM menus WHERE menu_id = $1', [menu_id]);
        if (menuResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Invalid menu_id.', details: 'Menu item does not exist.' });
        }
        const priceAtOrder = menuResult.rows[0].price; 

        // แทรกรายการอาหารใหม่
        const result = await client.query(`
            INSERT INTO order_items (order_id, menu_id, quantity, price_at_order, notes)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *;
        `, [order_id, menu_id, quantity, priceAtOrder, notes || null]);

        // อัปเดต total_amount ในตาราง orders
        await client.query(
            'UPDATE orders SET total_amount = total_amount + ($1 * $2) WHERE order_id = $3',
            [priceAtOrder, quantity, order_id]
        );

        await client.query('COMMIT'); // Commit transaction
        res.status(201).json(result.rows[0]);

    } catch (err) {
        await client.query('ROLLBACK'); // Rollback transaction หากเกิด error
        console.error('Error adding order item:', err.message);
        res.status(500).json({ error: 'Failed to add order item', details: err.message });
    } finally {
        client.release();
    }
});


// ----------------------------------------------------
// 6. API Endpoints สำหรับจัดการการชำระเงิน (Payments)
//    - GET /api/payments: ดึงข้อมูลการชำระเงินทั้งหมด
//    - GET /api/payments/:payment_id: ดึงข้อมูลการชำระเงินตาม ID
//    - POST /api/payments: บันทึกการชำระเงิน
// ----------------------------------------------------

// GET: ดึงข้อมูลการชำระเงินทั้งหมด
app.get('/api/payments', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM payments ORDER BY payment_date DESC');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching payments:', err.message);
    res.status(500).json({ error: 'Failed to fetch payments', details: err.message });
  }
});

// GET: ดึงข้อมูลการชำระเงินตาม ID
app.get('/api/payments/:payment_id', async (req, res) => {
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

// POST: บันทึกการชำระเงิน
app.post('/api/payments', async (req, res) => {
  const { order_id, amount, payment_method, transaction_id, status } = req.body;

  // ตรวจสอบค่าที่จำเป็น
  if (!order_id || !amount || typeof amount !== 'number' || amount <= 0 || !payment_method) {
      return res.status(400).json({ error: 'Order ID, amount, and payment method are required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN'); // เริ่ม transaction

    // ตรวจสอบว่า order_id มีอยู่จริง
    const orderCheck = await client.query('SELECT order_id FROM orders WHERE order_id = $1 FOR UPDATE', [order_id]); // FOR UPDATE เพื่อ lock row
    if (orderCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid order_id.', details: 'Order does not exist.' });
    }

    // แทรกข้อมูลการชำระเงิน
    const result = await client.query(`
      INSERT INTO payments (order_id, amount, payment_method, transaction_id, payment_date, status)
      VALUES ($1, $2, $3, $4, NOW(), $5)
      RETURNING *;
    `, [order_id, amount, payment_method, transaction_id || null, status || 'completed']); // กำหนดค่าเริ่มต้น status เป็น 'completed'

    // อัปเดตสถานะของออเดอร์เป็น 'paid' หรือ 'completed' (ถ้าชำระครบถ้วน)
    // คุณอาจจะเพิ่ม logic ตรวจสอบ total_amount ของออเดอร์กับ amount ที่จ่ายด้วยก็ได้
    await client.query(
        'UPDATE orders SET status = $1 WHERE order_id = $2',
        ['completed', order_id] // อัปเดต status เป็น 'completed'
    );
    
    // (Optional) ตั้งค่า is_occupied ของโต๊ะกลับเป็น false หากออเดอร์เสร็จสมบูรณ์และจ่ายเงินแล้ว
    const tableIdResult = await client.query('SELECT table_id FROM orders WHERE order_id = $1', [order_id]);
    if (tableIdResult.rows.length > 0) {
        const tableId = tableIdResult.rows[0].table_id;
        await client.query('UPDATE tables SET is_occupied = FALSE WHERE table_id = $1', [tableId]);
    }

    await client.query('COMMIT'); // Commit transaction
    res.status(201).json(result.rows[0]);

  } catch (err) {
    await client.query('ROLLBACK'); // Rollback transaction หากเกิด error
    console.error('Error processing payment:', err.message);
    res.status(500).json({ error: 'Failed to process payment', details: err.message });
  } finally {
    client.release();
  }
});


// ----------------------------------------------------
// Server Listener
// ----------------------------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});