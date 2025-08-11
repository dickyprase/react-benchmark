import * as Dialog from '@radix-ui/react-dialog';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import dayjs from 'dayjs';

type Status = 'OPEN' | 'CLOSED' | 'HOLD';

type Row = {
  id: number;
  ref_no: string;
  ref_date: string; // YYYY-MM-DD
  qty: number;
  amount: string;
  status: Status;
  vendor_name: string;
  customer_name: string;
  product_name: string;
};

type ApiResp = {
  data: Row[];
  nextCursor: { cursorDate: string; cursorId: number } | null;
  count: number;
};

const PAGE_SIZE = 1000;
// ganti sesuai IP/port API kamu atau pakai proxy Vite
const API_BASE_URL = 'http://localhost:5174';

const GRID_COLS = '140px 110px 160px 160px 220px 80px 120px 90px';

const styles = {
  // wrapper seluruh halaman -> pusatkan vertikal & horizontal
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: '#fff',
    fontFamily: 'Inter, system-ui, Arial, sans-serif',
  },
  // konten utama -> column & center
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 1200,
  },

  // judul & deskripsi
  app: { padding: 32, width: '100%' },
  title: { fontSize: 28, marginBottom: 4, textAlign: 'center' as const },
  subtitle: { color: '#555', marginBottom: 16, textAlign: 'center' as const },

  // kontrol input + tombol -> center
  controlBar: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    width: '100%',
  },
  input: { padding: '10px 14px', borderRadius: 10, border: '1px solid #ccc', width: 380 },
  cta: {
    padding: '12px 16px',
    borderRadius: 12,
    border: 'none',
    background: '#2563eb',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
  },

  // modal tengah layar
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,.45)',
  },
  modal: {
    position: 'fixed' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '90vw',
    maxWidth: 1200,
    height: '85vh',
    maxHeight: '85vh',
    background: '#fff',
    borderRadius: 16,
    padding: 16,
    display: 'flex',
    flexDirection: 'column' as const,
    boxShadow: '0 20px 60px rgba(0,0,0,.2)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: 700, textAlign: 'center' as const, width: '100%' },
  modalClose: { border: 'none', background: 'transparent', fontSize: 16, cursor: 'pointer' },
  meta: { fontSize: 12, color: '#666', marginBottom: 8, textAlign: 'center' as const },

  gridHead: {
    display: 'grid',
    gridTemplateColumns: GRID_COLS,
    fontWeight: 700,
    fontSize: 13,
    padding: '8px 12px',
    background: '#f3f4f6',
    borderRadius: 8,
    marginBottom: 6,
  },
  scroller: {
    flex: '1 1 auto',
    overflow: 'auto' as const,
    border: '1px solid #eee',
    borderRadius: 12,
    padding: 6,
  },
  rowWrap: { position: 'absolute' as const, top: 0, left: 0, right: 0, willChange: 'transform' as const },
  row: {
    display: 'grid',
    gridTemplateColumns: GRID_COLS,
    padding: '8px 12px',
    fontSize: 13,
    borderBottom: '1px solid #f0f0f0',
  },
  badge: {
    padding: '2px 8px',
    borderRadius: 999,
    fontWeight: 600,
  },
} as const;

async function fetchPage(
  baseUrl: string,
  cursor?: { cursorDate: string; cursorId: number },
  q?: string
): Promise<ApiResp> {
  const params = new URLSearchParams();
  params.set('limit', String(PAGE_SIZE));
  if (cursor) {
    params.set('cursorDate', cursor.cursorDate);
    params.set('cursorId', String(cursor.cursorId));
  }
  if (q) params.set('q', q);

  const r = await fetch(`${baseUrl}/api/references?${params.toString()}`);
  if (!r.ok) throw new Error('Failed to load');
  return r.json();
}

function statusBg(status: Status) {
  if (status === 'OPEN') return '#dbeafe';
  if (status === 'CLOSED') return '#dcfce7';
  return '#fee2e2'; // HOLD
}

const DataRow: React.FC<{ row: Row; even: boolean }> = ({ row, even }) => (
  <div
    style={{
      ...styles.row,
      background: even ? '#fff' : '#fcfcfd',
    }}
  >
    <div style={{ fontVariantNumeric: 'tabular-nums' }}>{row.ref_no}</div>
    <div>{dayjs(row.ref_date).format('YYYY-MM-DD')}</div>
    <div title={row.vendor_name}>{row.vendor_name}</div>
    <div title={row.customer_name}>{row.customer_name}</div>
    <div title={row.product_name}>{row.product_name}</div>
    <div style={{ textAlign: 'right' }}>{row.qty.toLocaleString()}</div>
    <div style={{ textAlign: 'right' }}>{Number(row.amount).toLocaleString()}</div>
    <div>
      <span style={{ ...styles.badge, background: statusBg(row.status) }}>{row.status}</span>
    </div>
  </div>
);

export default function App() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [nextCursor, setNextCursor] = useState<{ cursorDate: string; cursorId: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const parentRef = useRef<HTMLDivElement | null>(null);

  const baseUrl = useMemo(() => API_BASE_URL, []);

  // initial load on open / query change
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setRows([]);
      setNextCursor(null);
      setLoading(true);
      try {
        const res = await fetchPage(baseUrl, undefined, q);
        if (!cancelled) {
          setRows(res.data);
          setNextCursor(res.nextCursor);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, q, baseUrl]);

  // virtualization
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 10,
  });

  // infinite scroll
  useEffect(() => {
    if (!open) return;
    const el = parentRef.current;
    if (!el) return;

    const onScroll = async () => {
      if (loading || !nextCursor) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      const nearBottom = scrollTop + clientHeight >= scrollHeight - 200;
      if (!nearBottom) return;

      setLoading(true);
      try {
        const res = await fetchPage(baseUrl, nextCursor, q);
        setRows((prev) => prev.concat(res.data));
        setNextCursor(res.nextCursor);
      } finally {
        setLoading(false);
      }
    };

    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [open, nextCursor, loading, q, baseUrl]);

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.app}>
          <h1 style={styles.title}>Benchmark Modern React + MySQL (300k rows)</h1>
          <p style={styles.subtitle}>
            Klik tombol di bawah untuk membuka modal tabel 300k data dengan keyset pagination + virtual scroll.
          </p>

          <div style={styles.controlBar}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari (vendor, customer, product, ref no)"
              style={styles.input}
            />
            <button onClick={() => setOpen(true)} style={styles.cta}>
              Buka Modal (300k)
            </button>
          </div>

          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Portal>
              <Dialog.Overlay style={styles.overlay} />
              <Dialog.Content style={styles.modal}>
                <div style={styles.modalHeader}>
                  <Dialog.Title style={styles.modalTitle}>Reference Table (virtualized)</Dialog.Title>
                  <Dialog.Close asChild>
                    <button style={styles.modalClose}>✕</button>
                  </Dialog.Close>
                </div>

                <div style={styles.meta}>
                  Loaded rows: <b>{rows.length.toLocaleString()}</b>
                  {nextCursor ? ' (scroll untuk load berikutnya)' : ' (end)'}
                  {loading ? ' • loading…' : ''}
                </div>

                <div style={styles.gridHead}>
                  <div>Ref No</div>
                  <div>Tanggal</div>
                  <div>Vendor</div>
                  <div>Customer</div>
                  <div>Product</div>
                  <div>Qty</div>
                  <div>Amount</div>
                  <div>Status</div>
                </div>

                <div ref={parentRef} style={styles.scroller}>
                  <div
                    style={{
                      height: `${rowVirtualizer.getTotalSize()}px`,
                      position: 'relative',
                    }}
                  >
                    {rowVirtualizer.getVirtualItems().map((vi) => {
                      const r = rows[vi.index];
                      if (!r) return null;

                      return (
                        <div
                          key={r.id}
                          style={{ ...styles.rowWrap, transform: `translateY(${vi.start}px)` }}
                        >
                          <DataRow row={r} even={vi.index % 2 === 0} />
                        </div>
                      );
                    })}
                  </div>

                  {loading && (
                    <div style={{ textAlign: 'center', padding: 12, color: '#666' }}>Loading…</div>
                  )}
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </div>
  );
}
