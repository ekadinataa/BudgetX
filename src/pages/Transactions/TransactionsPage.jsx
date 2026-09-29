import { useState, useMemo } from 'react';
import { fmtFull, fmt, monthKey } from '../../utils/formatters';
import { getCatById, getCatIcon } from '../../utils/helpers';
import NavIcon from '../../components/icons/NavIcon';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import MultiChip from '../../components/ui/MultiChip';
import TxBadge from '../../components/ui/TxBadge';
import AmountText from '../../components/ui/AmountText';
import TxFormModal from './TxFormModal';
import styles from './TransactionsPage.module.css';

/**
 * TransactionsPage — Filterable transaction list with CRUD.
 * Filters support multiple selection via chip toggles.
 */
export default function TransactionsPage({ wallets, setWallets, transactions, setTransactions, categories, onCreateTransaction, onUpdateTransaction, onDeleteTransaction }) {
  const [search, setSearch] = useState('');
  const [fWallets, setFWallets] = useState(new Set());
  const [fTypes, setFTypes] = useState(new Set());
  const [fCats, setFCats] = useState(new Set());
  const [fTags, setFTags] = useState(new Set());
  // Date filter: 'month' | 'all' | 'custom'
  const [dateMode, setDateMode] = useState('month');
  const [fPeriod, setFPeriod] = useState(() => monthKey(new Date()));
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editTx, setEditTx] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedTxId, setExpandedTxId] = useState(null);

  // All unique tags
  const allTags = useMemo(
    () => [...new Set(transactions.flatMap((t) => t.tags || []))].sort(),
    [transactions],
  );

  // Period options
  const periods = useMemo(() => {
    const monthSet = new Set();
    transactions.forEach((t) => { if (t.date) monthSet.add(t.date.slice(0, 7)); });
    const sorted = [...monthSet].sort().reverse();
    const opts = sorted.map((mk) => {
      const [y, m] = mk.split('-').map(Number);
      const label = new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      return { value: mk, label };
    });
    opts.push({ value: '', label: 'Semua Waktu' });
    return opts;
  }, [transactions]);

  // Chip options
  const walletOpts = wallets.map((w) => ({ value: w.id, label: w.name, color: w.color }));
  const typeOpts = [
    { value: 'income', label: 'Pemasukan', color: '#16A34A' },
    { value: 'expense', label: 'Pengeluaran', color: '#DC2626' },
    { value: 'transfer', label: 'Transfer', color: '#4F46E5' },
  ];
  const catOpts = categories.map((c) => ({ value: c.id, label: c.name, color: c.color }));
  const tagOpts = allTags.map((t) => ({ value: t, label: `#${t}` }));

  // Active filter count (for badge)
  const activeFilterCount = (fWallets.size > 0 ? 1 : 0) + (fTypes.size > 0 ? 1 : 0)
    + (fCats.size > 0 ? 1 : 0) + (fTags.size > 0 ? 1 : 0);

  // Filtered & sorted transactions
  // The date predicate is inlined here so the dependency list below stays
  // honest and exhaustive (no function reference to track).
  const filtered = useMemo(() => {
    return transactions
      .filter((t) => {
        if (fWallets.size > 0 && !fWallets.has(t.walletId) && !(t.toWalletId && fWallets.has(t.toWalletId))) return false;
        if (fTypes.size > 0 && !fTypes.has(t.type)) return false;
        if (fCats.size > 0 && !fCats.has(t.categoryId)) return false;
        if (dateMode !== 'all') {
          if (dateMode === 'custom') {
            if (customStart && t.date < customStart) return false;
            if (customEnd && t.date > customEnd) return false;
          } else if (fPeriod && !t.date.startsWith(fPeriod)) {
            // month mode
            return false;
          }
        }
        if (fTags.size > 0 && !(t.tags || []).some((tag) => fTags.has(tag))) return false;
        if (search && !t.note.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  }, [transactions, fWallets, fTypes, fCats, fPeriod, fTags, search, dateMode, customStart, customEnd]);

  const totalIn = filtered.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalOut = filtered.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  /** Adjust wallet balance for a transaction */
  const adjustBalance = (tx, reverse = false) => {
    const mult = reverse ? -1 : 1;
    if (tx.type === 'transfer' && tx.toWalletId) {
      setWallets((ws) =>
        ws.map((w) => {
          if (w.id === tx.walletId) return { ...w, balance: w.balance - tx.amount * mult };
          if (w.id === tx.toWalletId) return { ...w, balance: w.balance + tx.amount * mult };
          return w;
        })
      );
    } else if (tx.type === 'expense') {
      setWallets((ws) =>
        ws.map((w) => w.id === tx.walletId ? { ...w, balance: w.balance - tx.amount * mult } : w)
      );
    } else if (tx.type === 'income') {
      setWallets((ws) =>
        ws.map((w) => w.id === tx.walletId ? { ...w, balance: w.balance + tx.amount * mult } : w)
      );
    }
  };

  const handleSave = async (data) => {
    try {
      if (editTx) {
        if (onUpdateTransaction) {
          await onUpdateTransaction(editTx.id, data);
        } else {
          adjustBalance(editTx, true);
          adjustBalance(data);
          setTransactions((ts) => ts.map((t) => (t.id === editTx.id ? { ...t, ...data } : t)));
        }
        setEditTx(null);
      } else {
        if (onCreateTransaction) {
          await onCreateTransaction(data);
        } else {
          adjustBalance(data);
          setTransactions((ts) => [{ id: 'tx' + Date.now(), ...data }, ...ts]);
        }
        setShowAdd(false);
      }
    } catch { /* error shown via toast */ }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Hapus transaksi ini?')) return;
    try {
      if (onDeleteTransaction) {
        await onDeleteTransaction(id);
      } else {
        const tx = transactions.find((t) => t.id === id);
        if (tx) adjustBalance(tx, true);
        setTransactions((ts) => ts.filter((t) => t.id !== id));
      }
    } catch { /* error shown via toast */ }
  };

  const clearAllFilters = () => {
    setFWallets(new Set());
    setFTypes(new Set());
    setFCats(new Set());
    setFTags(new Set());
    setSearch('');
    setDateMode('all');
    setFPeriod('');
    setCustomStart('');
    setCustomEnd('');
  };

  // Group transactions by date
  const grouped = useMemo(() => {
    const items = [];
    let lastDate = null;
    filtered.forEach((t) => {
      if (t.date !== lastDate) {
        items.push({ type: 'header', date: t.date });
        lastDate = t.date;
      }
      items.push({ type: 'tx', tx: t });
    });
    return items;
  }, [filtered]);

  return (
    <div>
      {/* Page header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Transaksi</h1>
          <p className={styles.pageSubtitle}>{filtered.length} transaksi ditemukan</p>
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowAdd(true)}>
          <NavIcon name="plus" size={16} /> Tambah
        </button>
      </div>

      {/* Search + date filter + filter toggle */}
      <div className={styles.filterCard}>
        <div className={styles.filterTopRow}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>
              <NavIcon name="search" size={16} />
            </span>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari transaksi…"
              style={{ paddingLeft: 34 }}
            />
          </div>
          <button
            className={`${styles.filterToggleBtn} ${showFilters ? styles.filterToggleBtnActive : ''}`}
            onClick={() => setShowFilters((v) => !v)}
          >
            <NavIcon name="filter" size={15} />
            Filter
            {activeFilterCount > 0 && (
              <span className={styles.filterBadge}>{activeFilterCount}</span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button className={styles.clearBtn} onClick={clearAllFilters}>
              Hapus Filter
            </button>
          )}
        </div>

        {/* Date range selector */}
        <div className={styles.dateFilterRow}>
          <div className={styles.dateModeTabs}>
            <button
              className={`${styles.dateModeTab} ${dateMode === 'month' ? styles.dateModeTabActive : ''}`}
              onClick={() => { setDateMode('month'); if (!fPeriod) setFPeriod(monthKey(new Date())); }}
            >
              Per Bulan
            </button>
            <button
              className={`${styles.dateModeTab} ${dateMode === 'custom' ? styles.dateModeTabActive : ''}`}
              onClick={() => setDateMode('custom')}
            >
              Custom Range
            </button>
            <button
              className={`${styles.dateModeTab} ${dateMode === 'all' ? styles.dateModeTabActive : ''}`}
              onClick={() => setDateMode('all')}
            >
              Semua Waktu
            </button>
          </div>
          {dateMode === 'month' && (
            <Select value={fPeriod} onChange={(e) => setFPeriod(e.target.value)} style={{ width: 'auto' }}>
              {periods.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </Select>
          )}
          {dateMode === 'custom' && (
            <div className={styles.customDateRow}>
              <label className={styles.customDateLabel}>Dari</label>
              <Input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                style={{ width: 160 }}
              />
              <label className={styles.customDateLabel}>Sampai</label>
              <Input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                style={{ width: 160 }}
              />
            </div>
          )}
        </div>

        {/* Expandable multi-select filter chips */}
        {showFilters && (
          <div className={styles.filterChipArea}>
            <div className={styles.filterChipRow}>
              <span className={styles.filterChipLabel}>Tipe</span>
              <MultiChip options={typeOpts} selected={fTypes} onChange={setFTypes} allLabel="Semua Tipe" />
            </div>
            <div className={styles.filterChipRow}>
              <span className={styles.filterChipLabel}>Dompet</span>
              <MultiChip options={walletOpts} selected={fWallets} onChange={setFWallets} allLabel="Semua Dompet" />
            </div>
            <div className={styles.filterChipRow}>
              <span className={styles.filterChipLabel}>Kategori</span>
              <MultiChip options={catOpts} selected={fCats} onChange={setFCats} allLabel="Semua Kategori" />
            </div>
            {tagOpts.length > 0 && (
              <div className={styles.filterChipRow}>
                <span className={styles.filterChipLabel}>Tag</span>
                <MultiChip options={tagOpts} selected={fTags} onChange={setFTags} allLabel="Semua Tag" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary bar */}
      <div className={styles.summaryBar}>
        <div className={`${styles.summaryPill} ${styles.summaryPillIncome}`}>
          <span className={styles.summaryPillLabel} style={{ color: '#16A34A' }}>↑ Pemasukan</span>
          <span className={styles.summaryPillValue} style={{ color: '#166534' }}>{fmtFull(totalIn)}</span>
        </div>
        <div className={`${styles.summaryPill} ${styles.summaryPillExpense}`}>
          <span className={styles.summaryPillLabel} style={{ color: '#DC2626' }}>↓ Pengeluaran</span>
          <span className={styles.summaryPillValue} style={{ color: '#991B1B' }}>{fmtFull(totalOut)}</span>
        </div>
        <div className={`${styles.summaryPill} ${styles.summaryPillNet}`}>
          <span className={styles.summaryPillLabel} style={{ color: '#7C3AED' }}>= Net</span>
          <span className={styles.summaryPillValue} style={{ color: '#4C1D95' }}>{fmtFull(totalIn - totalOut)}</span>
        </div>
      </div>

      {/* Transaction list */}
      <div className={styles.card}>
        {grouped.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📭</div>
            <div className={styles.emptyText}>Tidak ada transaksi ditemukan</div>
          </div>
        )}
        {grouped.map((item, i) => {
          if (item.type === 'header') {
            const d = new Date(item.date + 'T00:00:00');
            const dayTxs = filtered.filter((t) => t.date === item.date);
            const dayIn = dayTxs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
            const dayOut = dayTxs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
            return (
              <div key={item.date} className={`${styles.dateHeader} ${i > 0 ? styles.dateHeaderNotFirst : ''}`}>
                <span className={styles.dateLabel}>
                  {d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <div className={styles.dateTotals}>
                  {dayIn > 0 && <span className={styles.dateTotalIncome}>+{fmt(dayIn)}</span>}
                  {dayOut > 0 && <span className={styles.dateTotalExpense}>-{fmt(dayOut)}</span>}
                </div>
              </div>
            );
          }

          const { tx: t } = item;
          const cat = getCatById(t.categoryId, categories);
          const wallet = wallets.find((w) => w.id === t.walletId);
          const toW = t.toWalletId ? wallets.find((w) => w.id === t.toWalletId) : null;

          return (
            <div
              key={t.id}
              className={styles.txRow}
              onClick={() => setExpandedTxId(expandedTxId === t.id ? null : t.id)}
            >
              <div className={styles.txIcon} style={{ background: (cat?.color || 'var(--text-6)') + '20', color: cat?.color || 'var(--text-4)' }}>
                {t.type === 'transfer' ? '⇄' : getCatIcon(cat)}
              </div>
              <div className={styles.txBody}>
                <div className={styles.txNote}>{t.note}</div>
                <div className={styles.txMeta}>
                  <TxBadge type={t.type} />
                  {cat && <span className={styles.txCatName}>{cat.name}</span>}
                  <span className={styles.txSep}>·</span>
                  <span className={styles.txWallet}>{wallet?.name}{toW ? ` → ${toW.name}` : ''}</span>
                  {(t.tags || []).map((tag) => (
                    <span key={tag} className={styles.txTag}>#{tag}</span>
                  ))}
                </div>
              </div>
              <div className={styles.txAmount}>
                <AmountText type={t.type} amount={t.amount} />
              </div>
              <div className={`${styles.txActions} ${expandedTxId === t.id ? styles.txActionsVisible : ''}`}>
                <button className={styles.iconBtn} onClick={(e) => { e.stopPropagation(); setEditTx(t); }}>
                  <NavIcon name="edit" size={15} />
                </button>
                <button className={styles.iconBtnDanger} onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}>
                  <NavIcon name="trash" size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit modal */}
      {(showAdd || editTx) && (
        <TxFormModal
          wallets={wallets}
          initial={editTx}
          categories={categories}
          onClose={() => { setShowAdd(false); setEditTx(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
