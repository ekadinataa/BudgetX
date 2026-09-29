import { useState, useMemo } from 'react';
import { fmtFull, fmt } from '../../utils/formatters';
import { computeNetWorth, computeHealthRatios } from '../../utils/assetHelpers';
import FixedAssetFormModal from './FixedAssetFormModal';
import styles from './AssetPage.module.css';

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
    const cls = { sehat: styles.badgeSehat, perhatian: styles.badgePerhatian, bahaya: styles.badgeBahaya };
    return <span className={`${styles.badge} ${cls[status]}`}>{labels[status]}</span>;
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
    if (s === 'sehat') return '#22C55E';
    if (s === 'perhatian') return '#F59E0B';
    return '#EF4444';
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
    <div className={styles.wrapper}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Kesehatan Keuangan</h1>
          <p className={styles.pageSubtitle}>Ringkasan aset, kewajiban, dan rasio keuanganmu</p>
        </div>
      </div>

      {/* Health Score Hero */}
      <div className={styles.scoreHero}>
        <div className={styles.scoreCircle}>
          <svg width="100" height="100" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--bg-3)" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="42"
              fill="none"
              stroke={ratios.grade.color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${(ratios.overallScore / 100) * 264} 264`}
              transform="rotate(-90 50 50)"
              style={{ transition: 'stroke-dasharray 0.8s ease-out' }}
            />
          </svg>
          <span className={styles.scoreNumber} style={{ position: 'absolute' }}>
            {ratios.overallScore}
          </span>
        </div>
        <div className={styles.scoreInfo}>
          <div
            className={styles.scoreGrade}
            style={{ background: ratios.grade.color + '18', color: ratios.grade.color }}
          >
            <span>{ratios.grade.emoji}</span>
            <span>{ratios.grade.label}</span>
          </div>
          <div className={styles.scoreLabel}>
            Skor dihitung dari rasio utang, dana darurat, tingkat tabungan, cicilan, dan porsi investasi.
          </div>
          <div className={styles.scoreBar}>
            <div
              className={styles.scoreBarFill}
              style={{ width: `${ratios.overallScore}%`, background: ratios.grade.color }}
            />
          </div>
        </div>
      </div>

      {/* Net Worth Card */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Net Worth</h3>
        <div className={styles.netWorthGrid}>
          <div className={styles.netWorthItem}>
            <span className={styles.netWorthLabel}>Total Aset</span>
            <span className={styles.netWorthValue} style={{ color: '#22C55E' }}>
              {fmtFull(netWorthData.totalAssets)}
            </span>
          </div>
          <div className={styles.netWorthItem}>
            <span className={styles.netWorthLabel}>Total Kewajiban</span>
            <span className={styles.netWorthValue} style={{ color: '#EF4444' }}>
              {fmtFull(netWorthData.totalLiabilities)}
            </span>
          </div>
          <div className={styles.netWorthItem}>
            <span className={styles.netWorthLabel}>Net Worth</span>
            <span className={styles.netWorthValue} style={{ color: netWorthData.netWorth >= 0 ? '#22C55E' : '#EF4444' }}>
              {fmtFull(netWorthData.netWorth)}
            </span>
          </div>
        </div>
      </div>

      {/* Breakdown Cards */}
      <div className={styles.breakdownGrid}>
        {/* Asset Breakdown */}
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Komposisi Aset</h3>
          <div className={styles.breakdownRow}>
            <div className={styles.breakdownLeft}>
              <span className={styles.breakdownDot} style={{ background: '#4F6EF7' }} />
              <span className={styles.breakdownLabel}>Saldo Dompet</span>
            </div>
            <span className={styles.breakdownValue}>{fmt(netWorthData.breakdown.walletPositive)}</span>
          </div>
          <div className={styles.breakdownRow}>
            <div className={styles.breakdownLeft}>
              <span className={styles.breakdownDot} style={{ background: '#22C55E' }} />
              <span className={styles.breakdownLabel}>Investasi</span>
            </div>
            <span className={styles.breakdownValue}>{fmt(netWorthData.breakdown.investments)}</span>
          </div>
          <div className={styles.breakdownRow}>
            <div className={styles.breakdownLeft}>
              <span className={styles.breakdownDot} style={{ background: '#06B6D4' }} />
              <span className={styles.breakdownLabel}>Piutang</span>
            </div>
            <span className={styles.breakdownValue}>{fmt(netWorthData.breakdown.piutang)}</span>
          </div>
          <div className={styles.breakdownRow}>
            <div className={styles.breakdownLeft}>
              <span className={styles.breakdownDot} style={{ background: '#F59E0B' }} />
              <span className={styles.breakdownLabel}>Aset Tetap</span>
            </div>
            <span className={styles.breakdownValue}>{fmt(netWorthData.breakdown.fixedAssets)}</span>
          </div>
        </div>

        {/* Liability Breakdown */}
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Komposisi Kewajiban</h3>
          <div className={styles.breakdownRow}>
            <div className={styles.breakdownLeft}>
              <span className={styles.breakdownDot} style={{ background: '#EF4444' }} />
              <span className={styles.breakdownLabel}>Utang</span>
            </div>
            <span className={styles.breakdownValue}>{fmt(netWorthData.breakdown.utang)}</span>
          </div>
          <div className={styles.breakdownRow}>
            <div className={styles.breakdownLeft}>
              <span className={styles.breakdownDot} style={{ background: '#F59E0B' }} />
              <span className={styles.breakdownLabel}>Saldo Kredit/PayLater</span>
            </div>
            <span className={styles.breakdownValue}>{fmt(netWorthData.breakdown.walletNegative)}</span>
          </div>
        </div>
      </div>

      {/* Aset Tetap Section */}
      <div className={styles.card}>
        <div className={styles.cardTitleRow}>
          <h3 className={styles.cardTitle} style={{ margin: 0 }}>🏠 Aset Tetap</h3>
          <button className={styles.addAssetBtn} onClick={() => { setEditingAsset(null); setShowAssetForm(true); }}>
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
              <div key={asset.id} className={styles.fixedAssetRow} onClick={() => handleEditAsset(asset)}>
                <div>
                  <span className={styles.fixedAssetBadge}>
                    {getCategoryEmoji(asset.category)} {getCategoryLabel(asset.category)}
                  </span>
                  <div className={styles.fixedAssetName}>{asset.name}</div>
                  <div className={styles.fixedAssetValue}>{fmtFull(asset.currentValue)}</div>
                  <div className={styles.fixedAssetBuy}>Beli: {fmtFull(asset.purchasePrice)}</div>
                </div>
                <div className={styles.fixedAssetChange} style={{ color: change >= 0 ? '#22C55E' : '#EF4444' }}>
                  {change >= 0 ? '↗' : '↘'} {Math.abs(change).toFixed(1)}%
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Rasio Keuangan */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Rasio Keuangan</h3>
        {ratioItems.map((item) => (
          <div key={item.label} className={styles.ratioRow}>
            <div className={styles.ratioInfo}>
              <div className={styles.ratioHeader}>
                <span className={styles.ratioLabel}>{item.label}</span>
                <span className={styles.ratioValue}>{item.displayValue}</span>
              </div>
              <div className={styles.ratioBar}>
                <div
                  className={styles.ratioBarFill}
                  style={{
                    width: `${Math.min((Math.abs(item.value) / item.max) * 100, 100)}%`,
                    background: statusColor(item.status),
                  }}
                />
              </div>
              <div className={styles.ratioTarget}>{item.target}</div>
            </div>
            {statusBadge(item.status)}
          </div>
        ))}
      </div>

      {/* Rekomendasi */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Rekomendasi</h3>
        <div className={styles.rekomList}>
          {recommendations.map((rec, i) => {
            const cls = rec.type === 'bahaya' ? styles.rekomBahaya
              : rec.type === 'perhatian' ? styles.rekomPerhatian
              : styles.rekomSehat;
            return (
              <div key={i} className={`${styles.rekomItem} ${cls}`}>
                <span className={styles.rekomIcon}>{rec.icon}</span>
                <span className={styles.rekomText}>{rec.text}</span>
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
