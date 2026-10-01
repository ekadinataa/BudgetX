import { useState, useMemo } from 'react';
import { fmtFull, fmt } from '../../utils/formatters';
import { computeNetWorth, computeHealthRatios } from '../../utils/assetHelpers';
import NavIcon from '../../components/icons/NavIcon';
import FixedAssetFormModal from './FixedAssetFormModal';

const FIXED_ASSET_CATEGORIES = [
  { value: 'rumah', label: 'Rumah/Properti', emoji: '🏠' },
  { value: 'kendaraan', label: 'Kendaraan', emoji: '🚗' },
  { value: 'elektronik', label: 'Elektronik/Gadget', emoji: '📱' },
  { value: 'jam', label: 'Jam Tangan', emoji: '⌚' },
  { value: 'perhiasan', label: 'Perhiasan', emoji: '💎' },
  { value: 'furnitur', label: 'Furnitur', emoji: '🪑' },
  { value: 'lainnya', label: 'Lainnya', emoji: '📦' },
];

function getCategoryEmoji(value) {
  const cat = FIXED_ASSET_CATEGORIES.find((c) => c.value === value);
  return cat ? cat.emoji : '📦';
}

function getCategoryLabel(value) {
  const cat = FIXED_ASSET_CATEGORIES.find((c) => c.value === value);
  return cat ? cat.label : 'Lainnya';
}

/**
 * AssetPage — Financial Health Overview (Aset) with Fixed Assets.
 */
export default function AssetPage({
  wallets,
  debts,
  investments,
  transactions,
  fixedAssets = [],
  onCreateFixedAsset,
  onUpdateFixedAsset,
  onDeleteFixedAsset,
}) {
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);

  // Compute net worth breakdown (now includes fixed assets)
  const netWorthData = useMemo(
    () => computeNetWorth(wallets || [], debts || [], investments || [], fixedAssets || []),
    [wallets, debts, investments, fixedAssets]
  );

  // Compute health ratios
  const ratios = useMemo(
    () => computeHealthRatios(netWorthData, transactions || [], debts || []),
    [netWorthData, transactions, debts]
  );

  // Ratio status helpers
  const getDebtToAssetStatus = (v) => {
    if (v < 30) return 'sehat';
    if (v < 50) return 'perhatian';
    return 'bahaya';
  };
  const getEmergencyStatus = (v) => {
    if (v >= 6) return 'sehat';
    if (v >= 3) return 'perhatian';
    return 'bahaya';
  };
  const getDebtServiceStatus = (v) => {
    if (v < 30) return 'sehat';
    if (v < 50) return 'perhatian';
    return 'bahaya';
  };
  const getSavingsStatus = (v) => {
    if (v > 20) return 'sehat';
    if (v > 10) return 'perhatian';
    return 'bahaya';
  };
  const getInvestmentStatus = (v) => {
    if (v > 20) return 'sehat';
    if (v > 5) return 'perhatian';
    return 'bahaya';
  };

  const statusBadge = (status) => {
    const labels = { sehat: 'Sehat', perhatian: 'Perhatian', bahaya: 'Bahaya' };
    const cls = { sehat: 'badgeSehat', perhatian: 'badgePerhatian', bahaya: 'badgeBahaya' };
    return <span className={`badge assetBadge ${cls[status]}`}>{labels[status]}</span>;
  };

  // Generate recommendations
  const recommendations = useMemo(() => {
    const recs = [];
    const dtaStatus = getDebtToAssetStatus(ratios.debtToAsset);
    const efStatus = getEmergencyStatus(ratios.emergencyFundMonths);
    const dsStatus = getDebtServiceStatus(ratios.debtServiceRatio);
    const srStatus = getSavingsStatus(ratios.savingsRate);
    const irStatus = getInvestmentStatus(ratios.investmentRatio);

    if (dtaStatus === 'bahaya') {
      recs.push({ type: 'bahaya', icon: '🚨', text: 'Rasio utang terhadap aset sangat tinggi (>50%). Prioritaskan pelunasan utang sebelum menambah aset baru.' });
    } else if (dtaStatus === 'perhatian') {
      recs.push({ type: 'perhatian', icon: '⚠️', text: 'Rasio utang cukup tinggi (30-50%). Pertimbangkan untuk mengurangi utang secara bertahap.' });
    }

    if (efStatus === 'bahaya') {
      recs.push({ type: 'bahaya', icon: '🛡️', text: 'Dana darurat kurang dari 3 bulan pengeluaran. Sisihkan minimal 10% pemasukan untuk dana darurat.' });
    } else if (efStatus === 'perhatian') {
      recs.push({ type: 'perhatian', icon: '🛡️', text: 'Dana darurat belum ideal (3-6 bulan). Targetkan minimal 6 bulan pengeluaran sebagai dana darurat.' });
    }

    if (dsStatus === 'bahaya') {
      recs.push({ type: 'bahaya', icon: '💸', text: 'Cicilan utang melebihi 50% pemasukan. Ini sangat berat — pertimbangkan restrukturisasi atau pelunasan lebih cepat.' });
    } else if (dsStatus === 'perhatian') {
      recs.push({ type: 'perhatian', icon: '💸', text: 'Cicilan utang 30-50% dari pemasukan. Coba hindari menambah utang baru untuk menjaga cashflow.' });
    }

    if (srStatus === 'bahaya') {
      recs.push({ type: 'bahaya', icon: '📉', text: 'Savings rate di bawah 10%. Cari area pengeluaran yang bisa dikurangi agar tabungan meningkat.' });
    } else if (srStatus === 'perhatian') {
      recs.push({ type: 'perhatian', icon: '💰', text: 'Savings rate 10-20%. Sudah cukup baik, tapi coba tingkatkan ke >20% untuk percepat capai target finansial.' });
    }

    if (irStatus === 'bahaya') {
      recs.push({ type: 'perhatian', icon: '📈', text: 'Porsi investasi masih kecil (<5% dari total aset). Mulailah investasi rutin meskipun kecil.' });
    } else if (irStatus === 'perhatian') {
      recs.push({ type: 'perhatian', icon: '📈', text: 'Porsi investasi 5-20%. Tingkatkan secara bertahap untuk memaksimalkan pertumbuhan aset jangka panjang.' });
    }

    if (recs.length === 0) {
      recs.push({ type: 'sehat', icon: '🎉', text: 'Kesehatan keuanganmu sangat baik! Pertahankan kebiasaan ini dan terus tingkatkan investasi.' });
    }

    return recs;
  }, [ratios]);

  // Ratio definitions for rendering
  const ratioItems = [
    {
      label: 'Debt-to-Asset Ratio',
      value: ratios.debtToAsset,
      displayValue: `${ratios.debtToAsset.toFixed(1)}%`,
      target: 'Target: <50%',
      status: getDebtToAssetStatus(ratios.debtToAsset),
      max: 100,
    },
    {
      label: 'Dana Darurat',
      value: ratios.emergencyFundMonths,
      displayValue: `${ratios.emergencyFundMonths.toFixed(1)} bulan`,
      target: 'Target: ≥6 bulan',
      status: getEmergencyStatus(ratios.emergencyFundMonths),
      max: 12,
    },
    {
      label: 'Debt Service Ratio',
      value: ratios.debtServiceRatio,
      displayValue: `${ratios.debtServiceRatio.toFixed(1)}%`,
      target: 'Target: <30%',
      status: getDebtServiceStatus(ratios.debtServiceRatio),
      max: 100,
    },
    {
      label: 'Savings Rate',
      value: ratios.savingsRate,
      displayValue: `${ratios.savingsRate.toFixed(1)}%`,
      target: 'Target: >20%',
      status: getSavingsStatus(ratios.savingsRate),
      max: 100,
    },
    {
      label: 'Investment Ratio',
      value: ratios.investmentRatio,
      displayValue: `${ratios.investmentRatio.toFixed(1)}%`,
      target: 'Target: >20%',
      status: getInvestmentStatus(ratios.investmentRatio),
      max: 100,
    },
  ];

  const statusColor = (s) => {
    if (s === 'sehat') return 'var(--green-ink)';
    if (s === 'perhatian') return 'var(--orange-ink)';
    return 'var(--red-ink)';
  };

  const handleEditAsset = (asset) => {
    setEditingAsset(asset);
    setShowAssetForm(true);
  };

  const handleSaveAsset = async (data) => {
    if (editingAsset) {
      await onUpdateFixedAsset(editingAsset.id, data);
    } else {
      await onCreateFixedAsset(data);
    }
    setShowAssetForm(false);
    setEditingAsset(null);
  };

  const handleDeleteAsset = async (id) => {
    await onDeleteFixedAsset(id);
    setShowAssetForm(false);
    setEditingAsset(null);
  };

  return (
    <div className="pageStack">
      {/* Page Header */}
      <div className="largeTitleBlock">
        <div>
          <h1 className="largeTitle">Kesehatan Keuangan</h1>
          <p className="pageSubtitle">Ringkasan aset, kewajiban, dan rasio keuanganmu</p>
        </div>
      </div>

      {/* Health Score Hero */}
      <div className="card assetHero">
        <div className="assetScoreCircle">
          <svg width="100" height="100" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--bg-3)" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="42"
              fill="none"
              stroke={ratios.grade.ring}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${(ratios.overallScore / 100) * 264} 264`}
              transform="rotate(-90 50 50)"
              style={{ transition: 'stroke-dasharray 0.8s ease-out' }}
            />
          </svg>
          <span className="assetScoreNumber" style={{ position: 'absolute' }}>
            {ratios.overallScore}
          </span>
        </div>
        <div className="scoreInfo">
          <div
            className="scoreGrade assetGrade"
            style={{ background: ratios.grade.soft, color: ratios.grade.ink }}
          >
            <NavIcon name={ratios.overallScore >= 60 ? 'check' : 'warning'} size={14} />
            <span>{ratios.grade.label}</span>
          </div>
          <div className="assetScoreLabel">
            Skor dihitung dari rasio utang, dana darurat, tingkat tabungan, cicilan, dan porsi investasi.
          </div>
          <div className="assetScoreBar">
            <div
              className="assetBarFill"
              style={{ width: `${ratios.overallScore}%`, background: ratios.grade.ring }}
            />
          </div>
        </div>
      </div>

      {/* Net Worth Card */}
      <div className="card">
        <h3 className="cardTitle contentTitle">Net Worth</h3>
        <div className="netWorthGrid">
          <div className="assetWorthItem">
            <span className="assetWorthLabel">Total Aset</span>
            <span className="assetWorthValue" style={{ color: 'var(--green-ink)' }}>
              {fmtFull(netWorthData.totalAssets)}
            </span>
          </div>
          <div className="assetWorthItem">
            <span className="assetWorthLabel">Total Kewajiban</span>
            <span className="assetWorthValue" style={{ color: 'var(--red-ink)' }}>
              {fmtFull(netWorthData.totalLiabilities)}
            </span>
          </div>
          <div className="assetWorthItem">
            <span className="assetWorthLabel">Net Worth</span>
            <span className="assetWorthValue" style={{ color: netWorthData.netWorth >= 0 ? 'var(--green-ink)' : 'var(--red-ink)' }}>
              {fmtFull(netWorthData.netWorth)}
            </span>
          </div>
        </div>
      </div>

      {/* Breakdown Cards */}
      <div className="assetBreakdown">
        {/* Asset Breakdown */}
        <div className="card">
          <h3 className="cardTitle contentTitle">Komposisi Aset</h3>
          <div className="assetBreakdownRow">
            <div className="assetBreakdownLeft">
              <span className="dot assetDot" style={{ background: 'var(--blue)' }} />
              <span className="assetBreakdownLabel">Saldo Dompet</span>
            </div>
            <span className="assetBreakdownValue">{fmt(netWorthData.breakdown.walletPositive)}</span>
          </div>
          <div className="assetBreakdownRow">
            <div className="assetBreakdownLeft">
              <span className="dot assetDot" style={{ background: 'var(--green)' }} />
              <span className="assetBreakdownLabel">Investasi</span>
            </div>
            <span className="assetBreakdownValue">{fmt(netWorthData.breakdown.investments)}</span>
          </div>
          <div className="assetBreakdownRow">
            <div className="assetBreakdownLeft">
              <span className="dot assetDot" style={{ background: 'var(--teal)' }} />
              <span className="assetBreakdownLabel">Piutang</span>
            </div>
            <span className="assetBreakdownValue">{fmt(netWorthData.breakdown.piutang)}</span>
          </div>
          <div className="assetBreakdownRow">
            <div className="assetBreakdownLeft">
              <span className="dot assetDot" style={{ background: 'var(--orange)' }} />
              <span className="assetBreakdownLabel">Aset Tetap</span>
            </div>
            <span className="assetBreakdownValue">{fmt(netWorthData.breakdown.fixedAssets)}</span>
          </div>
        </div>

        {/* Liability Breakdown */}
        <div className="card">
          <h3 className="cardTitle contentTitle">Komposisi Kewajiban</h3>
          <div className="assetBreakdownRow">
            <div className="assetBreakdownLeft">
              <span className="dot assetDot" style={{ background: 'var(--red)' }} />
              <span className="assetBreakdownLabel">Utang</span>
            </div>
            <span className="assetBreakdownValue">{fmt(netWorthData.breakdown.utang)}</span>
          </div>
          <div className="assetBreakdownRow">
            <div className="assetBreakdownLeft">
              <span className="dot assetDot" style={{ background: 'var(--orange)' }} />
              <span className="assetBreakdownLabel">Saldo Kredit/PayLater</span>
            </div>
            <span className="assetBreakdownValue">{fmt(netWorthData.breakdown.walletNegative)}</span>
          </div>
        </div>
      </div>

      {/* Aset Tetap Section */}
      <div className="card">
        <div className="assetTitleRow">
          <h3 className="cardTitle contentTitle" style={{ margin: 0 }}>🏠 Aset Tetap</h3>
          <button className="btnSmallPrimary" onClick={() => { setEditingAsset(null); setShowAssetForm(true); }}>
            + Tambah Aset
          </button>
        </div>

        {fixedAssets.length === 0 ? (
          <p style={{ color: 'var(--text-4)', fontSize: 13, margin: 0 }}>
            Belum ada aset tetap. Tambahkan rumah, mobil, elektronik, dll.
          </p>
        ) : (
          fixedAssets.map((asset) => {
            const change = asset.purchasePrice > 0
              ? ((asset.currentValue - asset.purchasePrice) / asset.purchasePrice) * 100
              : 0;
            return (
              <div key={asset.id} className="fixedAssetRow" onClick={() => handleEditAsset(asset)}>
                <div>
                  <span className="fixedAssetBadge">
                    {getCategoryEmoji(asset.category)} {getCategoryLabel(asset.category)}
                  </span>
                  <div className="fixedAssetName">{asset.name}</div>
                  <div className="fixedAssetValue">{fmtFull(asset.currentValue)}</div>
                  <div className="fixedAssetBuy">Beli: {fmtFull(asset.purchasePrice)}</div>
                </div>
                <div className="fixedAssetChange" style={{ color: change >= 0 ? 'var(--green-ink)' : 'var(--red-ink)' }}>
                  {change >= 0 ? '↗' : '↘'} {Math.abs(change).toFixed(1)}%
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Rasio Keuangan */}
      <div className="card">
        <h3 className="cardTitle contentTitle">Rasio Keuangan</h3>
        {ratioItems.map((item) => (
          <div key={item.label} className="assetRatioRow">
            <div className="itemInfo">
              <div className="assetRatioHead">
                <span className="assetRatioLabel">{item.label}</span>
                <span className="assetRatioValue">{item.displayValue}</span>
              </div>
              <div className="assetRatioBar">
                <div
                  className="assetBarFill"
                  style={{
                    width: `${Math.min((Math.abs(item.value) / item.max) * 100, 100)}%`,
                    background: statusColor(item.status),
                  }}
                />
              </div>
              <div className="assetRatioTarget">{item.target}</div>
            </div>
            {statusBadge(item.status)}
          </div>
        ))}
      </div>

      {/* Rekomendasi */}
      <div className="card">
        <h3 className="cardTitle contentTitle">Rekomendasi</h3>
        <div className="assetRecommendationList">
          {recommendations.map((rec, i) => {
            const cls = rec.type === 'bahaya' ? 'rekomBahaya'
              : rec.type === 'perhatian' ? 'rekomPerhatian'
              : 'rekomSehat';
            return (
              <div key={i} className={`rekomItem assetRecommendation ${cls}`}>
                <span className="assetRecommendationIcon">{rec.icon}</span>
                <span className="itemInfo">{rec.text}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fixed Asset Form Modal */}
      {showAssetForm && (
        <FixedAssetFormModal
          initial={editingAsset}
          onClose={() => { setShowAssetForm(false); setEditingAsset(null); }}
          onSave={handleSaveAsset}
          onDelete={handleDeleteAsset}
        />
      )}
    </div>
  );
}
