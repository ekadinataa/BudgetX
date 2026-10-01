import { useState, useMemo } from 'react';
import { usePageActions } from '../../context/pageActions';
import { fmtFull, fmtDate } from '../../utils/formatters';
import {
  computeInvestmentMetrics,
  computePortfolioSummary,
  filterInvestments,
  sortTransactionsByDate,
  computeTotalUnits,
  getDaysUntilMaturity,
  calcDepositoProjectedReturn,
} from '../../utils/investmentHelpers';
import NavIcon from '../../components/icons/NavIcon';
import InvestmentFormModal from './InvestmentFormModal';
import BuyModal from './BuyModal';
import SellModal from './SellModal';
import UpdateValueModal from './UpdateValueModal';

const TODAY = new Date().toISOString().slice(0, 10);

const ASSET_TYPE_LABELS = {
  deposito: 'Deposito',
  saham: 'Saham',
  crypto: 'Crypto',
  emas: 'Emas',
  reksadana: 'Reksadana',
  obligasi: 'Obligasi',
  p2p: 'P2P Lending',
  lainnya: 'Lainnya',
};

const FILTERS = [
  { key: null, label: 'Semua' },
  { key: 'deposito', label: 'Deposito' },
  { key: 'saham', label: 'Saham' },
  { key: 'crypto', label: 'Crypto' },
  { key: 'emas', label: 'Emas' },
  { key: 'reksadana', label: 'Reksadana' },
  { key: 'obligasi', label: 'Obligasi' },
  { key: 'p2p', label: 'P2P' },
  { key: 'lainnya', label: 'Lainnya' },
];

/**
 * InvestmentPage — Main investment portfolio page.
 */
export default function InvestmentPage({
  investments,
  wallets,
  onCreateInvestment,
  onUpdateInvestment,
  onDeleteInvestment,
  onRecordBuy,
  onRecordSell,
  onUpdateValue,
}) {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [buyItem, setBuyItem] = useState(null);
  const [sellItem, setSellItem] = useState(null);
  const [updateItem, setUpdateItem] = useState(null);
  const [activeFilter, setActiveFilter] = useState(null);

  // Portfolio summary
  const summary = useMemo(() => computePortfolioSummary(investments), [investments]);

  // Filtered investments
  const filtered = useMemo(
    () => filterInvestments(investments, activeFilter),
    [investments, activeFilter]
  );

  // Handlers
  const handleSave = async (data) => {
    if (editItem) {
      await onUpdateInvestment(editItem.id, data);
    } else {
      await onCreateInvestment(data);
    }
    setShowForm(false);
    setEditItem(null);
  };

  const handleDelete = async (id) => {
    await onDeleteInvestment(id);
    setShowForm(false);
    setEditItem(null);
  };

  const handleBuy = async (txData) => {
    await onRecordBuy(buyItem.id, txData);
    setBuyItem(null);
  };

  const handleSell = async (txData) => {
    await onRecordSell(sellItem.id, txData);
    setSellItem(null);
  };

  const handleUpdateValue = async (value) => {
    await onUpdateValue(updateItem.id, value);
    setUpdateItem(null);
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setShowForm(true);
  };

  const topbarActions = usePageActions(
    <button className="btnPrimary" onClick={() => { setEditItem(null); setShowForm(true); }}>
      <NavIcon name="plus" size={16} /> Tambah Investasi
    </button>,
  );

  // See BudgetPage: `display: contents` keeps `.container`'s flex `gap` working.
  return (
    <div className="pageStack">
      {topbarActions}
      {/* Page header */}
      <div className="largeTitleBlock">
        <div>
          <h1 className="largeTitle">Investasi</h1>
          <p className="pageSubtitle">
            Kelola portofolio investasi Anda
          </p>
        </div>
      </div>

      {/* Summary cards */}
      {investments.length > 0 && (
        <div className="statGrid">
          <div className="statCard">
            <div className="statLabel">Total Nilai</div>
            <div className="statValue">
              {fmtFull(summary.totalValue)}
            </div>
            <div className="statDetail">nilai pasar saat ini</div>
          </div>
          <div className="statCard">
            <div className="statLabel">Total Modal</div>
            <div className="statValue">
              {fmtFull(summary.totalCostBasis)}
            </div>
            <div className="statDetail">total investasi</div>
          </div>
          <div className="statCard">
            <div className="statLabel">Profit/Loss</div>
            <div className="statValue" style={{ color: summary.totalUnrealizedGain >= 0 ? 'var(--green-ink)' : 'var(--red-ink)' }}>
              {summary.totalUnrealizedGain >= 0 ? '+' : ''}{fmtFull(summary.totalUnrealizedGain)}
            </div>
            <div className="statDetail">unrealized gain/loss</div>
          </div>
          <div className="statCard">
            <div className="statLabel">Return</div>
            <div className="statValue" style={{ color: summary.totalReturnPercentage >= 0 ? 'var(--green-ink)' : 'var(--red-ink)' }}>
              {summary.totalReturnPercentage >= 0 ? '+' : ''}{summary.totalReturnPercentage.toFixed(1)}%
            </div>
            <div className="statDetail">persentase return</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="chipGroup">
        {FILTERS.map((f) => (
          <button
            key={f.key || 'all'}
            className="filterChip investFilter"
            aria-pressed={activeFilter === f.key}
            onClick={() => setActiveFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {investments.length === 0 && (
        <div className="card emptyState">
          <div className="emptyIcon investEmptyIcon">📈</div>
          <div className="emptyTitle">Belum ada investasi</div>
          <div className="emptyDesc">
            Catat investasi Anda di sini. BudgetX akan otomatis melacak profit/loss dan membuat transaksi di dompet.
          </div>
          <button className="btnPrimary" onClick={() => setShowForm(true)} style={{ margin: '0 auto' }}>
            <NavIcon name="plus" size={16} /> Tambah Pertama
          </button>
        </div>
      )}

      {/* Investment list */}
      {filtered.map((inv) => (
        <InvestmentCard
          key={inv.id}
          investment={inv}
          onEdit={() => handleEdit(inv)}
          onBuy={() => setBuyItem(inv)}
          onSell={() => setSellItem(inv)}
          onUpdateValue={() => setUpdateItem(inv)}
        />
      ))}

      {/* Modals */}
      {showForm && (
        <InvestmentFormModal
          initial={editItem}
          onClose={() => { setShowForm(false); setEditItem(null); }}
          onSave={handleSave}
          onDelete={editItem ? handleDelete : undefined}
        />
      )}

      {buyItem && (
        <BuyModal
          investment={buyItem}
          wallets={wallets}
          onClose={() => setBuyItem(null)}
          onConfirm={handleBuy}
        />
      )}

      {sellItem && (
        <SellModal
          investment={sellItem}
          wallets={wallets}
          onClose={() => setSellItem(null)}
          onConfirm={handleSell}
        />
      )}

      {updateItem && (
        <UpdateValueModal
          investment={updateItem}
          onClose={() => setUpdateItem(null)}
          onConfirm={handleUpdateValue}
        />
      )}
    </div>
  );
}

/**
 * InvestmentCard — Single investment record display card.
 */
function InvestmentCard({ investment, onEdit, onBuy, onSell, onUpdateValue }) {
  const [showHistory, setShowHistory] = useState(false);

  const metrics = computeInvestmentMetrics(investment);
  const totalUnits = computeTotalUnits(investment.transactions || []);
  const isDeposito = investment.assetType === 'deposito';

  // Deposito maturity info
  let maturityInfo = null;
  if (isDeposito && investment.maturityDate) {
    const daysLeft = getDaysUntilMaturity(investment.maturityDate, TODAY);
    const buyTx = (investment.transactions || []).find((t) => t.type === 'buy');
    const principal = buyTx?.totalAmount || buyTx?.pricePerUnit || 0;
    const projectedReturn = calcDepositoProjectedReturn(
      principal,
      investment.interestRate || 0,
      buyTx?.date || TODAY,
      investment.maturityDate
    );
    maturityInfo = { daysLeft, projectedReturn, principal };
  }

  const sortedTxs = sortTransactionsByDate(investment.transactions || []);

  return (
    <div className="card">
      <div className="investRow">
        <div
          className="recIcon investIcon"
          style={{ background: 'var(--blue-soft)', color: 'var(--blue-ink)' }}
        >
          📊
        </div>

        <div className="itemInfo">
          <div className="itemName investName">{investment.name}</div>
          <div className="investMeta">
            <span className="badge badgeTransfer investBadge">
              {ASSET_TYPE_LABELS[investment.assetType] || investment.assetType}
            </span>
            {investment.tickerSymbol && <span>{investment.tickerSymbol}</span>}
            {investment.coinName && <span>{investment.coinName}</span>}
            {totalUnits > 0 && !isDeposito && <span>{totalUnits} unit</span>}
            {metrics.unrealizedGain !== 0 && (
              <span className={`badge investBadge ${metrics.unrealizedGain >= 0 ? 'badgeGain' : 'badgeLoss'}`}>
                {metrics.unrealizedGain >= 0 ? '+' : ''}{metrics.returnPercentage.toFixed(1)}%
              </span>
            )}
            {maturityInfo && maturityInfo.daysLeft <= 0 && (
              <span className="badge badgeSoon investBadge">Jatuh Tempo</span>
            )}
          </div>
          {isDeposito && maturityInfo && maturityInfo.daysLeft > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>
              {maturityInfo.daysLeft} hari lagi · Proyeksi bunga: {fmtFull(maturityInfo.projectedReturn)}
            </div>
          )}
        </div>

        <div className="investRight">
          <div>
            <div className="investValue">{fmtFull(metrics.currentValue)}</div>
            <div className="investSub">
              Modal: {fmtFull(metrics.costBasis)}
            </div>
            {metrics.unrealizedGain !== 0 && (
              <div className="investSub" style={{ color: metrics.unrealizedGain >= 0 ? 'var(--green-ink)' : 'var(--red-ink)' }}>
                {metrics.unrealizedGain >= 0 ? '+' : ''}{fmtFull(metrics.unrealizedGain)}
              </div>
            )}
          </div>

          <div className="investActions">
            <button className="btnSmallGhost investBuy" onClick={onBuy}>Beli</button>
            {totalUnits > 0 && (
              <button className="btnSmallGhost investSell" onClick={onSell}>Jual</button>
            )}
            {!isDeposito && (
              <button className="btnSmallGhost" onClick={onUpdateValue}>Nilai</button>
            )}
            <button className="btnSmallGhost" onClick={onEdit} aria-label={`Edit investasi ${investment.name}`}>
              <NavIcon name="edit" size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Transaction history toggle */}
      {sortedTxs.length > 0 && (
        <>
          <button
            className="linkBtn investHistoryToggle"
            onClick={() => setShowHistory((v) => !v)}
          >
            {showHistory ? '▲ Sembunyikan' : '▼ Riwayat transaksi'} ({sortedTxs.length})
          </button>
          {showHistory && (
            <div className="investHistory">
              <div className="investHistoryTitle">Riwayat Transaksi</div>
              {sortedTxs.map((tx) => (
                <div key={tx.id} className="investHistoryRow">
                  <span className="investHistoryDate">{fmtDate(tx.date)}</span>
                  <span style={{ color: tx.type === 'buy' ? 'var(--green-ink)' : 'var(--red-ink)' }}>
                    {tx.type === 'buy' ? 'Beli' : 'Jual'} {tx.units} unit
                  </span>
                  <span className="investHistoryAmount">
                    {fmtFull(tx.totalAmount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
