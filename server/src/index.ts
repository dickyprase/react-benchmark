import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

const app = express();
app.use(cors());

const pool = mysql.createPool({
  host: '0.0.0.0',
  user: 'root',
  password: '',          // sesuaikan
  database: 'erp_benchmark',
  waitForConnections: true,
  connectionLimit: 10,
});

type Row = {
  id: number;
  ref_no: string;
  ref_date: string; // YYYY-MM-DD
  qty: number;
  amount: string;   // DECIMAL akan diparse ke string oleh mysql2
  status: 'OPEN' | 'CLOSED' | 'HOLD';
  vendor_name: string;
  customer_name: string;
  product_name: string;
};

// Row yang datang dari mysql2
type RowDB = Row & RowDataPacket;

app.get('/api/references', async (req, res) => {
  try {
    const limitReq = parseInt((req.query.limit as string) || '1000', 10);
    const limit = Math.min(Number.isFinite(limitReq) ? limitReq : 1000, 2000);

    const cursorDate = (req.query.cursorDate as string) || null;
    const cursorId = req.query.cursorId ? parseInt(req.query.cursorId as string, 10) : null;
    const q = (req.query.q as string) || '';

    const params: any[] = [];
    let where = '1=1';

    if (q) {
      where += ' AND (v.name LIKE ? OR c.name LIKE ? OR p.name LIKE ? OR r.ref_no LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }

    if (cursorDate && Number.isFinite(cursorId)) {
      where += ' AND (r.ref_date, r.id) > (?, ?)';
      params.push(cursorDate, cursorId as number);
    }

    // ⛔️ JANGAN pakai placeholder untuk LIMIT
    const sql = `
      SELECT r.id, r.ref_no, r.ref_date, r.qty, r.amount, r.status,
             v.name AS vendor_name, c.name AS customer_name, p.name AS product_name
      FROM reference_items r
      JOIN vendors v   ON v.id = r.vendor_id
      JOIN customers c ON c.id = r.customer_id
      JOIN products p  ON p.id = r.product_id
      WHERE ${where}
      ORDER BY r.ref_date ASC, r.id ASC
      LIMIT ${limit + 1}
    `;

    // Pakai query() (non-prepared) untuk kompatibilitas luas
    const [rows] = await pool.query<RowDB[]>(sql, params);

    let nextCursor: { cursorDate: string; cursorId: number } | null = null;
    let data = rows;
    if (rows.length > limit) {
      const last = rows[limit - 1];
      data = rows.slice(0, limit);
      nextCursor = { cursorDate: last.ref_date, cursorId: last.id };
    }

    res.json({ data, nextCursor, count: data.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal error' });
  }
});

const PORT = 5174;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
