import ScoreDonut, { RatioBar, SectionTitle } from '../../pages/Dashboard/ScoreParts';

export default function FinancialHealthCard({ health }) {
  return <section className="card">
    <SectionTitle icon="target">Kesehatan keuangan</SectionTitle>
    <div className="scoreHero">
      <ScoreDonut score={health.overallScore} color={health.grade.ring} inkColor={health.grade.ink} />
      <div className="scoreInfo"><span className="scoreGrade" style={{ color: health.grade.ink }}>{health.grade.label}</span><p className="cardSub">Berdasarkan saldo, utang, dan dana darurat.</p></div>
    </div>
    <div className="divider" />
    <RatioBar label="Dana darurat" value={`${health.emergencyFundMonths.toFixed(1)} bulan`} pct={health.emergencyFundMonths / 6 * 100} />
    <RatioBar label="Rasio utang / aset" value={`${health.debtToAsset.toFixed(1)}%`} pct={health.debtToAsset} />
    <RatioBar label="Rasio tabungan" value={`${health.savingsRate.toFixed(1)}%`} pct={health.savingsRate / 30 * 100} />
  </section>;
}
