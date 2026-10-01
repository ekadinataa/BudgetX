import { useState, useMemo } from 'react';
import { fmtFull } from '../../utils/formatters';
import { getCatById } from '../../utils/helpers';
import { getTotalAmortizedCost, groupByStatus } from '../../utils/recurring';
import NavIcon from '../../components/icons/NavIcon';
import { usePageActions } from '../../context/pageActions';
import ItemCard from './ItemCard';
import RecurringFormModal from './RecurringFormModal';
import RepurchaseModal from './RepurchaseModal';

/**
 * RecurringPage — Manage recurring/periodic purchase items.
 *
 * Displays items grouped by restock urgency, shows amortized monthly cost,
 * and provides CRUD + repurchase flow.
 *
 * @param {Object} props
 * @param {Array} props.recurringItems - All recurring items
 * @param {Array} props.categories - All categories
 * @param {Array} props.wallets - All wallets
 * @param {(data: Object) => Promise} props.onCreateItem - Create handler
 * @param {(id: string, data: Object) => Promise} props.onUpdateItem - Update handler
 * @param {(id: string) => Promise} props.onDeleteItem - Delete handler
 * @param {(id: string, data: Object) => Promise} props.onRepurchase - Repurchase handler
 */
export default function RecurringPage({
  recurringItems,
  categories,
  wallets,
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
  onRepurchase,
}) {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [repurchaseItem, setRepurchaseItem] = useState(null);

  const getCat = (id) => getCatById(id, categories);

  // Group items by status
  const { needsRestock, available, inactive } = useMemo(
    () => groupByStatus(recurringItems),
    [recurringItems]
  );

  // Summary stats
  const activeItems = recurringItems.filter((i) => i.isActive);
  const totalAmortized = getTotalAmortizedCost(recurringItems);

  // Handlers
  const handleSave = async (data) => {
    if (editItem) {
      await onUpdateItem(editItem.id, data);
    } else {
      await onCreateItem(data);
    }
    setShowForm(false);
    setEditItem(null);
  };

  const handleDelete = async (id) => {
    await onDeleteItem(id);
    setShowForm(false);
    setEditItem(null);
  };

  const handleRepurchase = async (data) => {
    await onRepurchase(repurchaseItem.id, data);
    setRepurchaseItem(null);
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setShowForm(true);
  };

  const handleToggleActive = async (item) => {
    await onUpdateItem(item.id, { isActive: !item.isActive });
  };

  // Primary action goes to the sticky topbar (reference `pageHeader(…, actions)`).
  const topbarActions = usePageActions(
    <button
      className="btnPrimary"
      onClick={() => { setEditItem(null); setShowForm(true); }}
    >
      <NavIcon name="plus" size={16} /> Tambah Item
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
          <h1 className="largeTitle">Barang Berkala</h1>
          <p className="pageSubtitle">
            Kelola item yang dibeli secara berkala (skincare, shampo, dll)
          </p>
        </div>

      </div>

      {/* Summary cards */}
      <div className="grid3">
        <div className="statCard">
          <div className="statLabel">Biaya Bulanan (Amortized)</div>
          <div className="statValue num" style={{ color: 'var(--blue-ink)' }}>
            {fmtFull(Math.round(totalAmortized))}
          </div>
          <div className="statDetail">per bulan dari {activeItems.length} item aktif</div>
        </div>
        <div className="statCard">
          <div className="statLabel">Perlu Restock</div>
          <div className="statValue num" style={{ color: needsRestock.length > 0 ? 'var(--red-ink)' : 'var(--green-ink)' }}>
            {needsRestock.length}
          </div>
          <div className="statDetail">item dalam 7 hari ke depan</div>
        </div>
        <div className="statCard">
          <div className="statLabel">Total Item</div>
          <div className="statValue num">{recurringItems.length}</div>
          <div className="statDetail">
            {activeItems.length} aktif · {inactive.length} non-aktif
          </div>
        </div>
      </div>

      {/* Empty state */}
      {recurringItems.length === 0 && (
        <div className="emptyState">
          <div className="emptyIcon">📦</div>
          <div className="emptyTitle">Belum ada barang berkala</div>
          <div className="emptyDesc">
            Tambahkan item yang kamu beli secara berkala seperti skincare, shampo, pasta gigi, dll.
            BudgetX akan menghitung biaya bulanan sebenarnya dan mengingatkan kapan harus beli ulang.
          </div>
          <button className="btnPrimary" onClick={() => setShowForm(true)}>
            <NavIcon name="plus" size={16} /> Tambah Item Pertama
          </button>
        </div>
      )}

      {/* Needs Restock Section */}
      {needsRestock.length > 0 && (
        <div className="sectionBlock">
          <h2 className="sectionTitle">
            <span style={{ color: 'var(--red-ink)' }}>🔴</span> Perlu Restock
            <span className="tag">{needsRestock.length}</span>
          </h2>
          {needsRestock.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              getCat={getCat}
              urgent
              onEdit={() => handleEdit(item)}
              onRepurchase={() => setRepurchaseItem(item)}
              onToggleActive={() => handleToggleActive(item)}
            />
          ))}
        </div>
      )}

      {/* Available Section */}
      {available.length > 0 && (
        <div className="sectionBlock">
          <h2 className="sectionTitle">
            <span style={{ color: 'var(--green-ink)' }}>✅</span> Masih Tersedia
            <span className="tag">{available.length}</span>
          </h2>
          {available.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              getCat={getCat}
              onEdit={() => handleEdit(item)}
              onRepurchase={() => setRepurchaseItem(item)}
              onToggleActive={() => handleToggleActive(item)}
            />
          ))}
        </div>
      )}

      {/* Inactive Section */}
      {inactive.length > 0 && (
        <div className="sectionBlock">
          <h2 className="sectionTitle">
            <span>⏸️</span> Non-aktif
            <span className="tag">{inactive.length}</span>
          </h2>
          {inactive.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              getCat={getCat}
              inactive
              onEdit={() => handleEdit(item)}
              onToggleActive={() => handleToggleActive(item)}
            />
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <RecurringFormModal
          initial={editItem}
          categories={categories}
          wallets={wallets}
          onClose={() => { setShowForm(false); setEditItem(null); }}
          onSave={handleSave}
          onDelete={editItem ? handleDelete : undefined}
        />
      )}

      {/* Repurchase Modal */}
      {repurchaseItem && (
        <RepurchaseModal
          item={repurchaseItem}
          wallets={wallets}
          onClose={() => setRepurchaseItem(null)}
          onConfirm={handleRepurchase}
        />
      )}
    </div>
  );
}
