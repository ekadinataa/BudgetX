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
import TxCalendar from './TxCalendar';
import { usePageActions } from '../../context/pageActions';

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
  // Reference `V.txView`: 'list' or 'cal' — one card, two views.
  const [txView, setTxView] = useState('list');

  // All unique tags
  const allTags = useMemo(
    () => [...new Set(transactions.flatMap((t) => t.tags || []))].sort(),
    [transactions],
  );

  // Period options
  const periods = useMemo(() => {
    const monthSet = new Set();
    monthSet.add(monthKey(new Date()));
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
    { value: 'income', label: 'Pemasukan', color: 'var(--green-ink)' },
    { value: 'expense', label: 'Pengeluaran', color: 'var(--red-ink)' },
    { value: 'transfer', label: 'Transfer', color: 'var(--indigo-ink)' },
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

  const topbarActions = usePageActions(
    <button className="btnPrimary" onClick={() => setShowAdd(true)}>
      <NavIcon name="plus" size={16} /> Tambah
    </button>,
  );

  // `display: contents` so this wrapper does not become a single flex child of
  // `.container`. As a plain `<div>` it absorbed the container's `gap` for the
  // whole page, leaving every card below it flush against its neighbour — which
  // is why the spacing read as cramped rather than merely tight. `{topbarActions}`
  // is a portal and renders null, so nothing else depends on this element.
  return (
    <div className="pageStack">
      {topbarActions}

      {/* Page header */}
      <div className="largeTitleBlock">
        <div>
          <h1 className="largeTitle">Transaksi</h1>
          <p className="pageSubtitle">{filtered.length} transaksi ditemukan</p>
        </div>

      </div>

      {/* Search + date filter + filter toggle */}
      <div className="filterCard">
        <div className="filterSearchRow">
          <div className="searchWrap">
            <span className="searchIcon">
              <NavIcon name="search" size={16} />
            </span>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari transaksi…"
              aria-label="Cari transaksi"
            />
          </div>
          <button
            className={showFilters ? 'btnSmallPrimary' : 'btnSmallGhost'}
            aria-pressed={showFilters}
            onClick={() => setShowFilters((v) => !v)}
          >
            <NavIcon name="filter" size={15} />
            Filter
            {activeFilterCount > 0 && (
              <span className="badge">{activeFilterCount}</span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button className="btnSmallGhost" onClick={clearAllFilters}>
              <NavIcon name="close" size={14} /> Hapus Filter
            </button>
          )}
        </div>

        <div className="filterScopeRow">
          <div className="seg">
            <button
              className={dateMode === 'month' ? 'segBtn segBtnActive' : 'segBtn'}
              aria-pressed={dateMode === 'month'}
              onClick={() => { setDateMode('month'); if (!fPeriod) setFPeriod(monthKey(new Date())); }}
            >
              Per Bulan
            </button>
            <button
              className={dateMode === 'custom' ? 'segBtn segBtnActive' : 'segBtn'}
              aria-pressed={dateMode === 'custom'}
              onClick={() => setDateMode('custom')}
            >
              Custom Range
            </button>
            <button
              className={dateMode === 'all' ? 'segBtn segBtnActive' : 'segBtn'}
              aria-pressed={dateMode === 'all'}
              onClick={() => setDateMode('all')}
            >
              Semua Waktu
            </button>
          </div>
          {dateMode === 'month' && (
            <Select value={fPeriod} onChange={(e) => setFPeriod(e.target.value)} aria-label="Periode transaksi">
              {periods.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </Select>
          )}
          {dateMode === 'custom' && (
            <div className="dateRangeFields">
              <label>Dari
                <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              </label>
              <label>Sampai
                <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </label>
            </div>
          )}
        </div>

        {/* Expandable multi-select filter chips */}
        {showFilters && (
          <div className="filterDetails">
            <div className="filterField">
              <span className="inputLabel">Tipe</span>
              <MultiChip options={typeOpts} selected={fTypes} onChange={setFTypes} allLabel="Semua Tipe" />
            </div>
            <div className="filterField">
              <span className="inputLabel">Dompet</span>
              <MultiChip options={walletOpts} selected={fWallets} onChange={setFWallets} allLabel="Semua Dompet" />
            </div>
            <div className="filterField">
              <span className="inputLabel">Kategori</span>
              <MultiChip options={catOpts} selected={fCats} onChange={setFCats} allLabel="Semua Kategori" />
            </div>
            {tagOpts.length > 0 && (
              <div className="filterField">
                <span className="inputLabel">Tag</span>
                <MultiChip options={tagOpts} selected={fTags} onChange={setFTags} allLabel="Semua Tag" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary bar */}
      {/* The reference stacks these as blocks (`summaryPillLabel` then
          `summaryPillValue`) and colours only the value. As inline spans they
          ran together on one line. */}
      <div className="summaryPills">
        <div className="summaryPill">
          <div className="summaryPillLabel">Pemasukan</div>
          <div className="summaryPillValue num amountIn">{fmtFull(totalIn)}</div>
        </div>
        <div className="summaryPill">
          <div className="summaryPillLabel">Pengeluaran</div>
          <div className="summaryPillValue num">{fmtFull(totalOut)}</div>
        </div>
        <div className="summaryPill">
          <div className="summaryPillLabel">Bersih</div>
          <div
            className="summaryPillValue num"
            style={{ color: totalIn - totalOut >= 0 ? 'var(--green-ink)' : 'var(--red-ink)' }}
          >
            {fmtFull(totalIn - totalOut)}
          </div>
        </div>
      </div>

      {/* View switch, as in the reference: `.seg` above the single `tx-list`
          card, which then renders either the rows or the month grid. */}
      <div className="viewSwitch">
        <div className="seg" role="group" aria-label="Tampilan">
          <button
            type="button"
            className={txView === 'list' ? 'segBtn segBtnActive' : 'segBtn'}
            aria-pressed={txView === 'list'}
            onClick={() => setTxView('list')}
          >
            <NavIcon name="tx" size={14} /> Daftar
          </button>
          <button
            type="button"
            className={txView === 'cal' ? 'segBtn segBtnActive' : 'segBtn'}
            aria-pressed={txView === 'cal'}
            onClick={() => setTxView('cal')}
          >
            <NavIcon name="calendar" size={14} /> Kalender
          </button>
        </div>
        {txView === 'list' && (
          <span className="cardSub desktopOnly">
            Klik baris untuk mengedit atau menghapus
          </span>
        )}
      </div>

      {/* Transaction list / month grid */}
      <div className={txView === 'cal' ? 'card' : 'card cardFlush'}>
        {txView === 'cal' ? (
          <TxCalendar transactions={transactions} categories={categories} />
        ) : (
          <>
        {grouped.length === 0 && (
          <div className="emptyState">
            <div className="emptyIcon">📭</div>
            <div className="emptyTitle">Tidak ada transaksi ditemukan</div>
          </div>
        )}
        {grouped.map((item) => {
          if (item.type === 'header') {
            const d = new Date(item.date + 'T00:00:00');
            const dayTxs = filtered.filter((t) => t.date === item.date);
            const dayIn = dayTxs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
            const dayOut = dayTxs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
            return (
              <div key={item.date} className="dateHeader">
                <span className="dateLabel">
                  {d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <div className="dateTotals">
                  {dayIn > 0 && <span className="dateTotal amountIn">+{fmt(dayIn)}</span>}
                  {dayOut > 0 && <span className="dateTotal">-{fmt(dayOut)}</span>}
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
              className="listRow"
              onClick={() => setExpandedTxId(expandedTxId === t.id ? null : t.id)}
            >
              <div className="itemIcon" style={{ background: `color-mix(in srgb, ${cat?.color || 'var(--gray)'} 15%, transparent)`, color: 'var(--label)' }}>
                {t.type === 'transfer' ? '⇄' : getCatIcon(cat)}
              </div>
              <div className="itemInfo">
                <div className="itemName truncate">{t.note}</div>
                <div className="itemMeta">
                  <TxBadge type={t.type} />
                  {cat && <span>{cat.name}</span>}
                  <span>·</span>
                  <span>{wallet?.name}{toW ? ` → ${toW.name}` : ''}</span>
                  {(t.tags || []).slice(0, 2).map((tag) => (
                    <span key={tag} className="tag">#{tag}</span>
                  ))}
                </div>
              </div>
              <div className="itemAmount">
                <AmountText type={t.type} amount={t.amount} />
              </div>
              <div className={expandedTxId === t.id ? 'rowActions rowActionsVisible' : 'rowActions'}>
                <button className="iconBtn" aria-label={`Edit transaksi ${t.note}`} onClick={(e) => { e.stopPropagation(); setEditTx(t); }}>
                  <NavIcon name="edit" size={15} />
                </button>
                <button className="iconBtn iconBtnDanger" aria-label={`Hapus transaksi ${t.note}`} onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}>
                  <NavIcon name="trash" size={15} />
                </button>
              </div>
            </div>
          );
        })}
          </>
        )}
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
