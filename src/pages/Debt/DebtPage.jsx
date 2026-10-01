import { useState, useMemo } from 'react';
import { fmtFull } from '../../utils/formatters';
import { computeDebtSummary, filterDebts, sortDebtsByDate } from '../../utils/debtHelpers';
import NavIcon from '../../components/icons/NavIcon';
import DebtFormModal from './DebtFormModal';
import DebtCard from './DebtCard';
import { usePageActions } from '../../context/pageActions';
import PaymentModal from './PaymentModal';

const TODAY = new Date().toISOString().slice(0, 10);

const FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: 'utang', label: 'Utang' },
  { key: 'piutang', label: 'Piutang' },
  { key: 'active', label: 'Aktif' },
  { key: 'settled', label: 'Lunas' },
];

/**
 * DebtPage — Main debt management page.
 *
 * @param {Object} props
 * @param {Array} props.debts - All debt records
 * @param {Array} props.wallets - All wallets
 * @param {(data: Object) => Promise} props.onCreateDebt
 * @param {(id: string, data: Object) => Promise} props.onUpdateDebt
 * @param {(id: string) => Promise} props.onDeleteDebt
 * @param {(debtId: string, payment: Object) => Promise} props.onRecordPayment
 */
export default function DebtPage({
  debts,
  wallets,
  onCreateDebt,
  onUpdateDebt,
  onDeleteDebt,
  onRecordPayment,
}) {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [payItem, setPayItem] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

  // Summary
  const summary = useMemo(() => computeDebtSummary(debts), [debts]);

  // Filtered and sorted debts
  const filteredDebts = useMemo(() => {
    let filters = {};
    if (activeFilter === 'utang') filters.type = 'utang';
    else if (activeFilter === 'piutang') filters.type = 'piutang';
    else if (activeFilter === 'active') filters.status = 'active';
    else if (activeFilter === 'settled') filters.status = 'settled';
    return sortDebtsByDate(filterDebts(debts, filters));
  }, [debts, activeFilter]);

  // Handlers
  const handleSave = async (data) => {
    if (editItem) {
      await onUpdateDebt(editItem.id, data);
    } else {
      await onCreateDebt(data);
    }
    setShowForm(false);
    setEditItem(null);
  };

  const handleDelete = async (id) => {
    await onDeleteDebt(id);
    setShowForm(false);
    setEditItem(null);
  };

  const handlePayment = async (paymentData) => {
    await onRecordPayment(payItem.id, paymentData);
    setPayItem(null);
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setShowForm(true);
  };

  const topbarActions = usePageActions(
    <button className="btnPrimary" onClick={() => { setEditItem(null); setShowForm(true); }}>
      <NavIcon name="plus" size={16} /> Tambah Utang
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
          <h1 className="largeTitle">Utang/Piutang</h1>
          <p className="pageSubtitle">
            Kelola catatan utang dan piutang Anda
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid3">
        <div className="statCard">
          <div className="statLabel">Total Utang</div>
          <div className="statValue num" style={{ color: 'var(--red-ink)' }}>
            {fmtFull(summary.totalUtang)}
          </div>
          <div className="statDetail">yang harus dibayar</div>
        </div>
        <div className="statCard">
          <div className="statLabel">Total Piutang</div>
          <div className="statValue num" style={{ color: 'var(--blue-ink)' }}>
            {fmtFull(summary.totalPiutang)}
          </div>
          <div className="statDetail">yang akan diterima</div>
        </div>
        <div className="statCard">
          <div className="statLabel">Posisi Bersih</div>
          <div className="statValue num" style={{ color: summary.netPosition >= 0 ? 'var(--green-ink)' : 'var(--red-ink)' }}>
            {fmtFull(summary.netPosition)}
          </div>
          <div className="statDetail">piutang − utang</div>
        </div>
      </div>

      {/* Filters */}
      <div className="seg">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={activeFilter === f.key ? 'segBtn segBtnActive' : 'segBtn'}
            aria-pressed={activeFilter === f.key}
            onClick={() => setActiveFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {debts.length === 0 && (
        <div className="emptyState">
          <div className="emptyIcon">📋</div>
          <div className="emptyTitle">Belum ada catatan utang/piutang</div>
          <div className="emptyDesc">
            Catat utang dan piutang Anda di sini. BudgetX akan otomatis membuat transaksi dan memperbarui saldo dompet.
          </div>
          <button className="btnPrimary" onClick={() => setShowForm(true)} style={{ margin: '0 auto' }}>
            <NavIcon name="plus" size={16} /> Tambah Pertama
          </button>
        </div>
      )}

      {/* Debt list */}
      {filteredDebts.map((debt) => (
        <DebtCard
          key={debt.id}
          debt={debt}
          onEdit={() => handleEdit(debt)}
          onPay={() => setPayItem(debt)}
        />
      ))}

      {/* Form Modal */}
      {showForm && (
        <DebtFormModal
          initial={editItem}
          wallets={wallets}
          onClose={() => { setShowForm(false); setEditItem(null); }}
          onSave={handleSave}
          onDelete={editItem ? handleDelete : undefined}
        />
      )}

      {/* Payment Modal */}
      {payItem && (
        <PaymentModal
          debt={payItem}
          wallets={wallets}
          onClose={() => setPayItem(null)}
          onConfirm={handlePayment}
        />
      )}
    </div>
  );
}

/**
 * DebtCard — Single debt record display card.
 */
