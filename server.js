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

// สร้าง Express application
const app = express();

//----------------------------------------------------
// PostgreSQL Connection Pool Configuration
//----------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // ใช้ DATABASE_URL จาก Render environment variables
  ssl: {
    // สำคัญมากสำหรับ Render/Cloud Database: ต้องตั้งค่า rejectUnauthorized เป็น false
    // เพื่อให้สามารถเชื่อมต่อกับ SSL certificate ของ Render ได้
    rejectUnauthorized: false
  }
});

//----------------------------------------------------
// ทดสอบการเชื่อมต่อ Database
//----------------------------------------------------
pool.connect((err, client, release) => {
  if (err) {
    // หากเกิดข้อผิดพลาดในการเชื่อมต่อ client จาก pool
    return console.error('Error acquiring client from pool', err.stack);
  }
  // รัน Query ง่ายๆ เพื่อทดสอบการเชื่อมต่อ
  client.query('SELECT NOW()', (err, result) => {
    release(); // ปล่อย client กลับไปที่ pool ทันทีหลังจากใช้งานเสร็จ
    if (err) {
      // หากเกิดข้อผิดพลาดในการรัน Query ทดสอบ
      return console.error('Error executing database test query', err.stack);
    }
    // แสดงข้อความยืนยันการเชื่อมต่อสำเร็จ
    console.log('Database connected successfully! Current time from DB:', result.rows[0].now);
  });
});

//----------------------------------------------------
// Middlewares: ควรอยู่ตรงนี้ (หลังจาก app ถูกสร้าง และก่อน routes ทั้งหมด)
//----------------------------------------------------
// Middleware สำหรับ parse JSON request bodies (เช่น ข้อมูลที่ส่งมากับ POST/PUT requests)
app.use(express.json());
// Middleware สำหรับเปิดใช้งาน CORS (Cross-Origin Resource Sharing)
// อนุญาตให้ Front-end ที่อยู่คนละ Domain สามารถเรียก API นี้ได้
app.use(cors());

//----------------------------------------------------
// 1. Root Route
//----------------------------------------------------
// Endpoint สำหรับหน้าแรกของ API
app.get('/', (req, res) => {
  res.send('Welcome to My Food Ordering Backend API!');
});

//----------------------------------------------------
// 2. API Endpoints สำหรับจัดการเมนู (Menus)
//    - GET /api/menus: ดึงข้อมูลเมนูทั้งหมด
//    - GET /api/menus/:menu_id: ดึงข้อมูลเมนูตาม ID
//    - POST /api/menus: เพิ่มเมนูใหม่
//    - PUT /api/menus/:menu_id: อัปเดตข้อมูลเมนู
//----------------------------------------------------

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
  const { menu_id } = req.params; // ดึงค่า menu_id จาก URL parameters
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

  // ตรวจสอบข้อมูลที่จำเป็น (name และ price)
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

// PUT: อัปเดตข้อมูลเมนู
app.put('/api/menus/:menu_id', async (req, res) => {
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
    res.status(500).json({ error: 'Failed to update menu', details: err.message });
  }
});


//----------------------------------------------------
// 3. API Endpoints สำหรับจัดการโต๊ะ (Tables)
//    - GET /api/tables: ดึงข้อมูลโต๊ะทั้งหมด
//    - GET /api/tables/:table_id: ดึงข้อมูลโต๊ะตาม ID
//    - POST /api/tables: เพิ่มโต๊ะใหม่
//    - PUT /api/tables/:table_id: อัปเดตข้อมูลโต๊ะ
//----------------------------------------------------

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
  const { table_id } = req.params; // ใช้ table_id
  try {
    const result = await pool.query('SELECT * FROM tables WHERE table_id = $1', [table_id]);
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

  // เพิ่ม console.log เพื่อ debug ค่าที่ได้รับ
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
    if (err.code === '23505') { // '23505' คือ PostgreSQL error code สำหรับ unique_violation
        return res.status(409).json({ error: 'Table number already exists', details: err.message });
    }
    res.status(500).json({ error: 'Failed to add new table', details: err.message });
  }
});

// PUT: อัปเดตข้อมูลโต๊ะ
app.put('/api/tables/:table_id', async (req, res) => {
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
    if (err.code === '23505') { // Unique constraint violation for table_number
      return res.status(409).json({ error: 'Table number already exists.', details: err.message });
    }
    res.status(500).json({ error: 'Failed to update table', details: err.message });
  }
});


//----------------------------------------------------
// 4. API Endpoints สำหรับจัดการออเดอร์ (Orders)
//    - GET /api/orders: ดึงข้อมูลออเดอร์ทั้งหมดพร้อมรายละเอียดโต๊ะ
//    - GET /api/orders/:order_id: ดึงข้อมูลออเดอร์ตาม ID พร้อมรายการอาหารและโต๊ะ
//    - POST /api/orders: สร้างออเดอร์ใหม่พร้อมรายการอาหาร
//    - PUT /api/orders/:order_id: อัปเดตข้อมูลออเดอร์ทั่วไป
//    - PUT /api/orders/:order_id/status: อัปเดตสถานะออเดอร์
//----------------------------------------------------

// GET: ดึงข้อมูลออเดอร์ทั้งหมดพร้อมรายละเอียดโต๊ะ
app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        o.order_id,          -- ใช้ order_id เป็น Primary Key
        o.customer_name,
        o.order_time,
        o.status,
        o.total_amount,
        t.table_number,
        t.qr_code_path,
        t.capacity,
        t.is_occupied
      FROM orders o
      JOIN tables t ON o.table_id = t.table_id -- เชื่อมด้วย table_id
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
  const { order_id } = req.params; // ใช้ order_id จาก URL parameters
  try {
    // ดึงข้อมูล Order หลัก
    const orderResult = await pool.query(`
      SELECT
        o.order_id,
        o.customer_name,
        o.order_time,
        o.status,
        o.total_amount,
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

    // ดึงรายการอาหารในออเดอร์นั้น
    const orderItemsResult = await pool.query(`
      SELECT
        oi.order_item_id,
        oi.order_id,
        oi.menu_id,
        m.name AS menu_name,
        m.description AS menu_description,
        oi.quantity,
        oi.price_at_order,
        oi.notes
      FROM order_items oi
      JOIN menus m ON oi.menu_id = m.menu_id
      WHERE oi.order_id = $1
      ORDER BY oi.order_item_id ASC;
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
      'INSERT INTO orders (table_id, customer_name, order_time, status, total_amount) VALUES ($1, $2, NOW(), $3, $4) RETURNING order_id, order_time',
      [table_id, customer_name || 'Guest', 'pending', 0] // total_amount เริ่มต้นเป็น 0
    );
    const orderId = orderResult.rows[0].order_id;
    let totalAmount = 0;

    // 2. เพิ่มรายการ Order Items
    for (const item of order_items) {
      const { menu_id, quantity, notes } = item;

      if (!menu_id || !quantity || typeof quantity !== 'number' || quantity <= 0) {
          throw new Error(`Invalid order item: menu_id and positive quantity are required. Item: ${JSON.stringify(item)}`);
      }

      // ดึงราคาเมนูจากตาราง menus
      const menuPriceResult = await client.query('SELECT price FROM menus WHERE menu_id = $1', [menu_id]);
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
      'UPDATE orders SET total_amount = $1 WHERE order_id = $2',
      [totalAmount, orderId]
    );

    // 4. (Optional) ตั้งค่า is_occupied ของโต๊ะเป็น true เมื่อมีการสร้างออเดอร์
    await client.query(
        'UPDATE tables SET is_occupied = TRUE WHERE table_id = $1',
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

// PUT: อัปเดตข้อมูลออเดอร์ทั่วไป (เช่น customer_name, table_id)
app.put('/api/orders/:order_id', async (req, res) => {
  const { order_id } = req.params;
  const { table_id, customer_name, status, total_amount } = req.body; // order_time ไม่ควรอัปเดตโดยตรง

  try {
    const result = await pool.query(`
      UPDATE orders
      SET
        table_id = COALESCE($1, table_id),
        customer_name = COALESCE($2, customer_name),
        status = COALESCE($3, status),
        total_amount = COALESCE($4, total_amount)
      WHERE order_id = $5
      RETURNING *;
    `, [table_id, customer_name, status, total_amount, order_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found for update.' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(`Error updating order with ID ${order_id}:`, err.message);
    res.status(500).json({ error: 'Failed to update order', details: err.message });
  }
});

// PUT: อัปเดตสถานะออเดอร์โดยเฉพาะ
app.put('/api/orders/:order_id/status', async (req, res) => {
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


//----------------------------------------------------
// 5. API Endpoints สำหรับจัดการรายการอาหารในออเดอร์ (Order Items)
//    - GET /api/order_items: ดึงข้อมูลรายการอาหารในออเดอร์ทั้งหมด
//    - GET /api/order_items/:order_item_id: ดึงข้อมูลรายการอาหารในออเดอร์ตาม ID
//    - POST /api/order_items: เพิ่มรายการอาหารในออเดอร์ที่มีอยู่แล้ว (ถ้าจำเป็น)
//    - PUT /api/order_items/:order_item_id: อัปเดตข้อมูลรายการอาหารในออเดอร์
//----------------------------------------------------

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
        const orderExists = await client.query('SELECT order_id FROM orders WHERE order_id = $1 FOR UPDATE', [order_id]); // FOR UPDATE เพื่อ lock row ป้องกันการแก้ไขพร้อมกัน
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
            'UPDATE orders SET total_amount = total_amount + ($1::NUMERIC * $2::NUMERIC) WHERE order_id = $3',
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

// PUT: อัปเดตข้อมูลรายการอาหารในออเดอร์
app.put('/api/order_items/:order_item_id', async (req, res) => {
  const { order_item_id } = req.params;
  const { order_id, menu_id, quantity, notes } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ดึงข้อมูล order_item เดิมเพื่อคำนวณ total_amount ใหม่
    const oldOrderItemResult = await client.query('SELECT order_id, menu_id, quantity, price_at_order FROM order_items WHERE order_item_id = $1 FOR UPDATE', [order_item_id]);
    if (oldOrderItemResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order item not found for update.' });
    }
    const oldOrderItem = oldOrderItemResult.rows[0];
    const oldTotalItemPrice = oldOrderItem.price_at_order * oldOrderItem.quantity;

    let newPriceAtOrder = oldOrderItem.price_at_order; // ใช้ราคาเดิมเป็นค่าเริ่มต้น
    if (menu_id && menu_id !== oldOrderItem.menu_id) { // ถ้ามีการเปลี่ยน menu_id ให้ดึงราคาใหม่
      const newMenuPriceResult = await client.query('SELECT price FROM menus WHERE menu_id = $1', [menu_id]);
      if (newMenuPriceResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid menu_id.', details: 'New menu item does not exist.' });
      }
      newPriceAtOrder = newMenuPriceResult.rows[0].price;
    }

    const newQuantity = quantity !== undefined ? quantity : oldOrderItem.quantity;
    const newTotalItemPrice = newPriceAtOrder * newQuantity;

    // อัปเดต order_item
    const updateResult = await client.query(`
      UPDATE order_items
      SET
        order_id = COALESCE($1, order_id),
        menu_id = COALESCE($2, menu_id),
        quantity = COALESCE($3, quantity),
        price_at_order = COALESCE($4, price_at_order), -- สามารถอัปเดตราคาได้ถ้าต้องการ
        notes = COALESCE($5, notes)
      WHERE order_item_id = $6
      RETURNING *;
    `, [order_id, menu_id, newQuantity, newPriceAtOrder, notes, order_item_id]);

    // อัปเดต total_amount ในตาราง orders
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


//----------------------------------------------------
// 6. API Endpoints สำหรับจัดการการชำระเงิน (Payments)
//    - GET /api/payments: ดึงข้อมูลการชำระเงินทั้งหมด
//    - GET /api/payments/:payment_id: ดึงข้อมูลการชำระเงินตาม ID
//    - POST /api/payments: บันทึกการชำระเงิน
//    - PUT /api/payments/:payment_id: อัปเดตข้อมูลการชำระเงิน
//----------------------------------------------------

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
    const orderCheck = await client.query('SELECT table_id FROM orders WHERE order_id = $1 FOR UPDATE', [order_id]); // FOR UPDATE เพื่อ lock row
    if (orderCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid order_id.', details: 'Order does not exist.' });
    }
    const tableId = orderCheck.rows[0].table_id; // ดึง table_id จาก order เพื่อนำไปอัปเดตสถานะโต๊ะ

    // แทรกข้อมูลการชำระเงิน
    const result = await client.query(`
      INSERT INTO payments (order_id, amount, payment_method, transaction_id, payment_date, status)
      VALUES ($1, $2, $3, $4, NOW(), $5)
      RETURNING *;
    `, [order_id, amount, payment_method, transaction_id || null, status || 'completed']); // กำหนดค่าเริ่มต้น status เป็น 'completed'

    // อัปเดตสถานะของออเดอร์เป็น 'completed'
    await client.query(
        'UPDATE orders SET status = $1 WHERE order_id = $2',
        ['completed', order_id]
    );

    // ตั้งค่า is_occupied ของโต๊ะกลับเป็น FALSE หากออเดอร์เสร็จสมบูรณ์และจ่ายเงินแล้ว
    await client.query('UPDATE tables SET is_occupied = FALSE WHERE table_id = $1', [tableId]);

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

// PUT: อัปเดตข้อมูลการชำระเงิน
app.put('/api/payments/:payment_id', async (req, res) => {
  const { payment_id } = req.params;
  const { order_id, amount, payment_method, transaction_id, status } = req.body;

  try {
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
    `, [order_id, amount, payment_method, transaction_id, status, payment_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found for update.' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(`Error updating payment with ID ${payment_id}:`, err.message);
    res.status(500).json({ error: 'Failed to update payment', details: err.message });
  }
});


//----------------------------------------------------
// Server Listener
//----------------------------------------------------
const PORT = process.env.PORT || 5000; // ใช้ค่าจาก .env (ถ้ามี) หรือใช้ 5000 เป็นค่าเริ่มต้น
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
