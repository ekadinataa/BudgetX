import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { fmtFull, fmt } from '../../utils/formatters';
import {
  calcFireNumber,
  calcInflationAdjustedFireNumber,
  calcFiReadinessScore,
  generateProjection,
  calcRetirementSustainability,
  generateRecommendations,
  DEFAULT_FIRE_SETTINGS,
} from '../../utils/fireCalculator';
import ProgressBar from '../../components/ui/ProgressBar';
import NavIcon from '../../components/icons/NavIcon';

/**
 * FirePage — FIRE Calculator page.
 *
 * Single scrollable page with card-based sections for FIRE planning.
 * All calculations are client-side only; does not modify transactions or wallets.
 *
 * @param {Object} props
 * @param {Array} props.transactions - User transactions for auto-fill
 * @param {Array} props.investments - User investments for auto-fill
 * @param {(page: string) => void} props.setPage - Navigation callback
 * @param {(settings: Object) => void} props.onSaveFireSettings - Save callback
 * @param {Object} props.fireSettings - Saved FIRE settings
 */
/**
 * FireLegend — recharts legend with an accessible label colour.
 *
 * The built-in legend renders the series name in the series colour. At 11px on
 * the page background that is 2.2:1 for --green and --orange, well under WCAG
 * AA. Here the swatch keeps the series identity and the text uses --label-2.
 */
function FireLegend({ payload }) {
  if (!payload?.length) return null;
  return (
    <ul className="fireLegend">
      {payload.map((entry) => (
        <li key={entry.value} className="fireLegendItem">
          <span className="fireLegendDot" style={{ background: entry.color }} />
          {entry.value}
        </li>
      ))}
    </ul>
  );
}

export default function FirePage({
  transactions = [],
  investments = [],
  setPage,
  onSaveFireSettings,
  fireSettings: savedSettings,
}) {
  // Initialize settings from saved or defaults
  const initial = savedSettings && Object.keys(savedSettings).length > 0
    ? { ...DEFAULT_FIRE_SETTINGS, ...savedSettings }
    : DEFAULT_FIRE_SETTINGS;

  const [currentAge, setCurrentAge] = useState(initial.currentAge);
  const [retirementAge, setRetirementAge] = useState(initial.retirementAge);
  const [monthlyIncome, setMonthlyIncome] = useState(initial.monthlyIncome);
  const [monthlyExpenses, setMonthlyExpenses] = useState(initial.monthlyExpenses);
  const [currentAssets, setCurrentAssets] = useState(initial.currentAssets);
  const [allocation, setAllocation] = useState(initial.allocation);
  const [returnRate, setReturnRate] = useState(initial.returnRate);
  const [salaryGrowth, setSalaryGrowth] = useState(initial.salaryGrowth);
  const [inflation, setInflation] = useState(initial.inflation);
  const [postRetirementReturn, setPostRetirementReturn] = useState(initial.postRetirementReturn);
  const [activeTab, setActiveTab] = useState('saran');

  // Debounced auto-save
  useEffect(() => {
    const timer = setTimeout(() => {
      if (onSaveFireSettings) {
        onSaveFireSettings({
          currentAge, retirementAge, monthlyIncome, monthlyExpenses,
          currentAssets, allocation, returnRate, salaryGrowth, inflation, postRetirementReturn,
        });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [currentAge, retirementAge, monthlyIncome, monthlyExpenses, currentAssets, allocation, returnRate, salaryGrowth, inflation, postRetirementReturn, onSaveFireSettings]);

  // Validations
  const validations = useMemo(() => {
    const errors = {};
    if (currentAge < 15 || currentAge > 80) errors.currentAge = 'Usia harus 15-80 tahun';
    if (retirementAge <= currentAge) errors.retirementAge = 'Target harus lebih dari usia saat ini';
    if (monthlyIncome <= 0) errors.monthlyIncome = 'Pendapatan harus lebih dari 0';
    if (monthlyExpenses < 0) errors.monthlyExpenses = 'Pengeluaran tidak boleh negatif';
    if (monthlyExpenses >= monthlyIncome && monthlyIncome > 0 && monthlyExpenses > 0) {
      errors.expenseWarning = 'Pengeluaran ≥ pendapatan, tidak ada margin tabungan';
    }
    return errors;
  }, [currentAge, retirementAge, monthlyIncome, monthlyExpenses]);

  // Core calculations
  const yearsToRetirement = Math.max(0, retirementAge - currentAge);
  const baseFireNumber = useMemo(() => calcFireNumber(monthlyExpenses), [monthlyExpenses]);
  const inflationAdjustedFire = useMemo(
    () => calcInflationAdjustedFireNumber(baseFireNumber, inflation, yearsToRetirement),
    [baseFireNumber, inflation, yearsToRetirement]
  );
  const fiScore = useMemo(
    () => calcFiReadinessScore(currentAssets, inflationAdjustedFire),
    [currentAssets, inflationAdjustedFire]
  );

  // Score color
  const scoreColor = fiScore < 25 ? 'var(--red-ink)' : fiScore < 50 ? 'var(--orange-ink)' : fiScore < 75 ? 'var(--yellow-ink)' : 'var(--green-ink)';

  // Projection chart data
  const projectionData = useMemo(
    () => generateProjection({
      currentAge, retirementAge, currentAssets, monthlyIncome,
      fireAllocationPct: allocation.fire,
      returnRate, salaryGrowthRate: salaryGrowth, inflationRate: inflation,
      monthlyExpenses,
    }),
    [currentAge, retirementAge, currentAssets, monthlyIncome, allocation.fire, returnRate, salaryGrowth, inflation, monthlyExpenses]
  );

  // Retirement sustainability
  const retirementData = useMemo(() => {
    if (projectionData.length === 0) return { years: 0, data: [] };
    const portfolioAtRetirement = projectionData[projectionData.length - 1]?.moderat || 0;
    const annualExpensesAtRetirement = monthlyExpenses * 12 * Math.pow(1 + inflation / 100, yearsToRetirement);
    return calcRetirementSustainability(portfolioAtRetirement, annualExpensesAtRetirement, postRetirementReturn, inflation, retirementAge);
  }, [projectionData, monthlyExpenses, inflation, yearsToRetirement, postRetirementReturn, retirementAge]);

  // Recommendations
  const recommendations = useMemo(
    () => generateRecommendations({
      savingsRate: allocation.fire,
      readinessScore: fiScore,
      yearsToRetirement,
      monthlyExpenses,
      monthlyIncome,
      currentAssets,
      fireNumber: inflationAdjustedFire,
    }),
    [allocation.fire, fiScore, yearsToRetirement, monthlyExpenses, monthlyIncome, currentAssets, inflationAdjustedFire]
  );

  // Allocation total
  const allocTotal = Object.values(allocation).reduce((s, v) => s + (Number(v) || 0), 0);

  // Auto-fill helpers
  const calcAvgIncome = useCallback(() => {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const dateStr = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}`;
    const recentIncome = transactions.filter(t => t.type === 'income' && t.date >= dateStr);
    if (recentIncome.length === 0) return null;
    const total = recentIncome.reduce((s, t) => s + t.amount, 0);
    return Math.round(total / 3);
  }, [transactions]);

  const calcAvgExpense = useCallback(() => {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const dateStr = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}`;
    const recentExpenses = transactions.filter(t => t.type === 'expense' && t.date >= dateStr);
    if (recentExpenses.length === 0) return null;
    const total = recentExpenses.reduce((s, t) => s + t.amount, 0);
    return Math.round(total / 3);
  }, [transactions]);

  const calcTotalInvestments = useCallback(() => {
    if (investments.length === 0) return null;
    return investments.reduce((s, inv) => s + (inv.currentValue || 0), 0);
  }, [investments]);

  // Allocation handler
  const handleAllocChange = (key, value) => {
    const num = value === '' ? 0 : Math.max(0, Math.min(100, Number(value)));
    setAllocation(prev => ({ ...prev, [key]: num }));
  };

  // Chart tooltip formatter
  const chartTooltipFormatter = (value) => fmtFull(value);

  return (
    <div className="fireLayout">
      {/* Header */}
      <div className="largeTitleBlock">
        <div className="pageHeading">
        <button className="iconBtn" onClick={() => setPage('dashboard')} aria-label="Kembali">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="largeTitle">Kalkulator FIRE 🔥</h1>
        </div>
      </div>

      {/* FI Readiness Score */}
      <div className="card fireCard fireScoreCard">
        <div className="fireScoreValue" style={{ color: scoreColor }}>
          {fiScore.toFixed(1)}%
        </div>
        <div className="fireScoreLabel">FI Readiness Score</div>
        <ProgressBar value={fiScore} max={100} color={scoreColor} height={10} />
        {fiScore >= 100 && (
          <div className="fireCongrats">
            🎉 Selamat! Anda telah mencapai Financial Independence!
          </div>
        )}
      </div>

      {/* FIRE Number Cards */}
      <div className="fireProjectionRows">
        <div className="statCard">
          <div className="fireProjectionLabel">FIRE Number (Saat Ini)</div>
          <div className="fireProjectionValue">{fmtFull(baseFireNumber)}</div>
        </div>
        <div className="statCard">
          <div className="fireProjectionLabel">FIRE Number (Pensiun)</div>
          <div className="fireProjectionValue">{fmtFull(Math.round(inflationAdjustedFire))}</div>
        </div>
      </div>

      {/* Data Finansial */}
      <div className="card fireCard">
        <h3 className="cardTitle contentTitle">Data Finansial</h3>
        <div className="fireInputGrid">
          <div className="fireInputGroup">
            <label className="fireInputLabel">Usia Saat Ini</label>
            <input
              type="number"
              className="inputField fireNumberInput"
              aria-label="Usia Saat Ini"
              value={currentAge}
              onChange={e => setCurrentAge(Number(e.target.value) || 0)}
              min={15}
              max={80}
            />
            {validations.currentAge && <span className="fireValidationError">{validations.currentAge}</span>}
          </div>
          <div className="fireInputGroup">
            <label className="fireInputLabel">Target Usia Pensiun</label>
            <input
              type="number"
              className="inputField fireNumberInput"
              aria-label="Target Usia Pensiun"
              value={retirementAge}
              onChange={e => setRetirementAge(Number(e.target.value) || 0)}
            />
            {validations.retirementAge && <span className="fireValidationError">{validations.retirementAge}</span>}
          </div>
          <div className="fireInputGroup">
            <label className="fireInputLabel">Pendapatan Bulanan</label>
            <div className="fireInputWithBtn">
              <input
                type="number"
                className="inputField fireNumberInput"
                aria-label="Pendapatan Bulanan"
                value={monthlyIncome}
                onChange={e => setMonthlyIncome(Number(e.target.value) || 0)}
              />
              {transactions.length > 0 && (
                <button
                  className="btnGhost"
                  onClick={() => { const v = calcAvgIncome(); if (v) setMonthlyIncome(v); }}
                  title="Auto-fill dari data transaksi"
                >
                  Auto
                </button>
              )}
            </div>
            {validations.monthlyIncome && <span className="fireValidationError">{validations.monthlyIncome}</span>}
          </div>
          <div className="fireInputGroup">
            <label className="fireInputLabel">Pengeluaran Bulanan</label>
            <div className="fireInputWithBtn">
              <input
                type="number"
                className="inputField fireNumberInput"
                aria-label="Pengeluaran Bulanan"
                value={monthlyExpenses}
                onChange={e => setMonthlyExpenses(Number(e.target.value) || 0)}
              />
              {transactions.length > 0 && (
                <button
                  className="btnGhost"
                  onClick={() => { const v = calcAvgExpense(); if (v) setMonthlyExpenses(v); }}
                  title="Auto-fill dari data transaksi"
                >
                  Auto
                </button>
              )}
            </div>
            {validations.monthlyExpenses && <span className="fireValidationError">{validations.monthlyExpenses}</span>}
            {validations.expenseWarning && <span className="fireValidationWarning">{validations.expenseWarning}</span>}
          </div>
          <div className="fireInputGroup" style={{ gridColumn: '1 / -1' }}>
            <label className="fireInputLabel">Aset FIRE Saat Ini</label>
            <div className="fireInputWithBtn">
              <input
                type="number"
                className="inputField fireNumberInput"
                aria-label="Aset FIRE Saat Ini"
                value={currentAssets}
                onChange={e => setCurrentAssets(Number(e.target.value) || 0)}
              />
              {investments.length > 0 && (
                <button
                  className="btnGhost"
                  onClick={() => { const v = calcTotalInvestments(); if (v !== null) setCurrentAssets(v); }}
                  title="Auto-fill dari portofolio investasi"
                >
                  Auto
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Alokasi Pendapatan */}
      <div className="card fireCard">
        <h3 className="cardTitle contentTitle">Alokasi Pendapatan</h3>
        {[
          { key: 'pokok', label: 'Pokok' },
          { key: 'hiburan', label: 'Hiburan' },
          { key: 'fire', label: 'FIRE' },
          { key: 'emas', label: 'Emas' },
        ].map(({ key, label }) => (
          <div key={key} className="fireAllocationRow">
            <span className="fireAllocationLabel">{label}</span>
            <input
              type="number"
              className="inputField fireAllocationInput"
              aria-label={`Alokasi ${label}`}
              value={allocation[key]}
              onChange={e => handleAllocChange(key, e.target.value)}
              min={0}
              max={100}
            />
            <span className="fireAllocationPct">%</span>
            <span className="fireAllocationNominal">
              {fmt(Math.round(monthlyIncome * (allocation[key] || 0) / 100))}
            </span>
          </div>
        ))}
        <div className="fireAllocationTotal">
          <span className="fireAllocationTotalLabel">Total</span>
          <span className="fireAllocationTotalValue" style={{ color: allocTotal === 100 ? 'var(--green-ink)' : allocTotal > 100 ? 'var(--red-ink)' : 'var(--orange-ink)' }}>
            {allocTotal}%
          </span>
        </div>
        {allocTotal > 100 && <span className="fireValidationError">Total melebihi 100% ({allocTotal - 100}% lebih)</span>}
        {allocTotal < 100 && <span className="fireValidationWarning">Sisa {100 - allocTotal}% belum dialokasikan</span>}
      </div>

      {/* Asumsi Pasar */}
      <div className="card fireCard">
        <h3 className="cardTitle contentTitle">Asumsi Pasar</h3>
        <div className="fireSliderRow">
          <div className="fireSliderHead">
            <span className="fireSliderLabel">Return Investasi Pra-Pensiun</span>
            <span className="fireSliderValue">{returnRate}%</span>
          </div>
          <input type="range" className="fireSlider" min={1} max={20} step={0.5} value={returnRate} onChange={e => setReturnRate(Number(e.target.value))} />
          <div className="fireSliderRange"><span>1%</span><span>20%</span></div>
        </div>
        <div className="fireSliderRow">
          <div className="fireSliderHead">
            <span className="fireSliderLabel">Kenaikan Gaji Tahunan</span>
            <span className="fireSliderValue">{salaryGrowth}%</span>
          </div>
          <input type="range" className="fireSlider" min={0} max={15} step={0.5} value={salaryGrowth} onChange={e => setSalaryGrowth(Number(e.target.value))} />
          <div className="fireSliderRange"><span>0%</span><span>15%</span></div>
        </div>
        <div className="fireSliderRow">
          <div className="fireSliderHead">
            <span className="fireSliderLabel">Estimasi Inflasi</span>
            <span className="fireSliderValue">{inflation}%</span>
          </div>
          <input type="range" className="fireSlider" min={1} max={12} step={0.5} value={inflation} onChange={e => setInflation(Number(e.target.value))} />
          <div className="fireSliderRange"><span>1%</span><span>12%</span></div>
        </div>
        <div className="fireSliderRow">
          <div className="fireSliderHead">
            <span className="fireSliderLabel">Return Konservatif Pasca-Pensiun</span>
            <span className="fireSliderValue">{postRetirementReturn}%</span>
          </div>
          <input type="range" className="fireSlider" min={1} max={12} step={0.5} value={postRetirementReturn} onChange={e => setPostRetirementReturn(Number(e.target.value))} />
          <div className="fireSliderRange"><span>1%</span><span>12%</span></div>
        </div>
      </div>

      {/* Proyeksi Pertumbuhan Chart */}
      <div className="card fireCard">
        <h3 className="cardTitle contentTitle">Proyeksi Pertumbuhan Portofolio</h3>
        <div className="fireChart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={projectionData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <XAxis dataKey="age" tick={{ fontSize: 11 }} label={{ value: 'Usia', position: 'bottom', fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmt(v)} width={50} />
              <Tooltip formatter={chartTooltipFormatter} labelFormatter={l => `Usia ${l}`} />
              <Legend content={<FireLegend />} />
              <ReferenceLine y={inflationAdjustedFire} stroke="var(--red)" strokeDasharray="5 5" label={{ value: 'Target', fontSize: 10, fill: 'var(--red)' }} />
              <Line type="monotone" dataKey="optimis" name="Optimis" stroke="var(--green)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="moderat" name="Moderat" stroke="var(--blue)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="pesimis" name="Pesimis" stroke="var(--orange)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Results Tabs */}
      <div className="card fireCard">
        <div className="fireTabs">
          <button className="fireTab" aria-pressed={activeTab === 'saran'} onClick={() => setActiveTab('saran')}>Saran</button>
          <button className="fireTab" aria-pressed={activeTab === 'akumulasi'} onClick={() => setActiveTab('akumulasi')}>Akumulasi</button>
          <button className="fireTab" aria-pressed={activeTab === 'pensiun'} onClick={() => setActiveTab('pensiun')}>Pensiun</button>
        </div>

        {activeTab === 'saran' && (
          <div className="fireRecommendationList">
            {recommendations.map((rec, i) => (
              <div key={i} className={`rekomItem fireRecommendation ${rec.type === 'warning' ? 'rekomPerhatian' : rec.type === 'success' ? 'rekomSehat' : 'fireRecommendationInfo'}`}>
                <span className="fireRecommendationIcon">
                  {rec.type === 'warning' ? '⚠️' : rec.type === 'success' ? '✅' : 'ℹ️'}
                </span>
                <span>{rec.text}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'akumulasi' && (
          <div className="tableWrap">
            <table className="fireResultsTable">
              <thead>
                <tr>
                  <th>Tahun</th>
                  <th>Usia</th>
                  <th>Tabungan/Thn</th>
                  <th>Portofolio</th>
                  <th>Growth</th>
                </tr>
              </thead>
              <tbody>
                {projectionData.map((row, i) => {
                  const annualSavings = monthlyIncome * 12 * (allocation.fire / 100) * Math.pow(1 + salaryGrowth / 100, i);
                  const growth = i === 0 ? 0 : ((row.moderat - projectionData[0].moderat) / Math.max(1, projectionData[0].moderat) * 100);
                  return (
                    <tr key={row.year}>
                      <td>{row.year}</td>
                      <td>{row.age}</td>
                      <td>{fmt(Math.round(annualSavings))}</td>
                      <td>{fmt(row.moderat)}</td>
                      <td style={{ color: growth >= 0 ? 'var(--green-ink)' : 'var(--red-ink)' }}>
                        {i === 0 ? '—' : `${growth.toFixed(0)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'pensiun' && (
          <>
            <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-3)' }}>
              Portofolio cukup untuk <strong style={{ color: 'var(--text-1)' }}>{retirementData.years} tahun</strong> pensiun
            </div>
            <div className="tableWrap">
              <table className="fireResultsTable">
                <thead>
                  <tr>
                    <th>Tahun</th>
                    <th>Usia</th>
                    <th>Penarikan</th>
                    <th>Sisa</th>
                    <th>Return</th>
                  </tr>
                </thead>
                <tbody>
                  {retirementData.data.slice(0, 30).map(row => (
                    <tr key={row.year}>
                      <td>{row.year}</td>
                      <td>{row.age}</td>
                      <td>{fmt(row.withdrawal)}</td>
                      <td>{fmt(row.remaining)}</td>
                      <td style={{ color: 'var(--green-ink)' }}>{fmt(row.returnAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
