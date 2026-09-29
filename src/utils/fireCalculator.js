/**
 * FIRE Calculator — Pure calculation functions for Financial Independence, Retire Early planning.
 *
 * All functions are side-effect free and can be tested independently.
 */

/**
 * Default FIRE settings used when no saved settings exist.
 */
export const DEFAULT_FIRE_SETTINGS = {
  currentAge: 25,
  retirementAge: 45,
  monthlyIncome: 10000000,
  monthlyExpenses: 5000000,
  currentAssets: 0,
  allocation: { pokok: 50, hiburan: 20, fire: 25, emas: 5 },
  returnRate: 10,
  salaryGrowth: 5,
  inflation: 4,
  postRetirementReturn: 6,
};

/**
 * Calculate base FIRE Number using the 4% rule.
 * FIRE Number = Monthly Expenses × 12 × 25
 *
 * @param {number} monthlyExpenses - Monthly living expenses in Rupiah
 * @returns {number} Base FIRE Number
 */
export function calcFireNumber(monthlyExpenses) {
  return monthlyExpenses * 12 * 25;
}

/**
 * Calculate inflation-adjusted FIRE Number at retirement.
 *
 * @param {number} baseFireNumber - Base FIRE Number (today's value)
 * @param {number} inflationRate - Annual inflation rate as percentage (e.g. 4 for 4%)
 * @param {number} yearsToRetirement - Number of years until target retirement
 * @returns {number} Inflation-adjusted FIRE Number
 */
export function calcInflationAdjustedFireNumber(baseFireNumber, inflationRate, yearsToRetirement) {
  if (yearsToRetirement <= 0) return baseFireNumber;
  return baseFireNumber * Math.pow(1 + inflationRate / 100, yearsToRetirement);
}

/**
 * Calculate FI Readiness Score (0-100%).
 *
 * @param {number} currentAssets - Current FIRE assets value
 * @param {number} fireNumber - Target FIRE Number (inflation-adjusted)
 * @returns {number} Readiness score as percentage (0-100)
 */
export function calcFiReadinessScore(currentAssets, fireNumber) {
  if (fireNumber <= 0) return 0;
  return Math.min(100, (currentAssets / fireNumber) * 100);
}

/**
 * Generate yearly projection data for portfolio growth chart.
 *
 * @param {Object} params
 * @param {number} params.currentAge
 * @param {number} params.retirementAge
 * @param {number} params.currentAssets
 * @param {number} params.monthlyIncome
 * @param {number} params.fireAllocationPct - Percentage of income allocated to FIRE (e.g. 25)
 * @param {number} params.returnRate - Expected annual return rate as percentage (e.g. 10)
 * @param {number} params.salaryGrowthRate - Annual salary growth rate as percentage (e.g. 5)
 * @param {number} params.inflationRate - Annual inflation rate as percentage (e.g. 4)
 * @returns {Array<{year: number, age: number, optimis: number, moderat: number, pesimis: number, target: number}>}
 */
export function generateProjection(params) {
  const {
    currentAge,
    retirementAge,
    currentAssets,
    monthlyIncome,
    fireAllocationPct,
    returnRate,
    salaryGrowthRate,
    inflationRate,
  } = params;

  const years = retirementAge - currentAge;
  if (years <= 0) return [];

  const annualSavingsBase = monthlyIncome * 12 * (fireAllocationPct / 100);

  const moderatRate = returnRate / 100;
  const optimisRate = (returnRate + 2) / 100;
  const pesimisRate = Math.max(0, (returnRate - 2)) / 100;
  const salaryGrowth = salaryGrowthRate / 100;
  const inflation = inflationRate / 100;

  const projection = [];
  let valOptimis = currentAssets;
  let valModerat = currentAssets;
  let valPesimis = currentAssets;

  for (let i = 0; i <= years; i++) {
    const age = currentAge + i;
    const year = new Date().getFullYear() + i;
    const target = (params.monthlyExpenses || monthlyIncome * 0.5) * 12 * 25 * Math.pow(1 + inflation, i);

    projection.push({
      year,
      age,
      optimis: Math.round(valOptimis),
      moderat: Math.round(valModerat),
      pesimis: Math.round(valPesimis),
      target: Math.round(target),
    });

    if (i < years) {
      const annualSavings = annualSavingsBase * Math.pow(1 + salaryGrowth, i);
      valOptimis = valOptimis * (1 + optimisRate) + annualSavings;
      valModerat = valModerat * (1 + moderatRate) + annualSavings;
      valPesimis = valPesimis * (1 + pesimisRate) + annualSavings;
    }
  }

  return projection;
}

/**
 * Calculate retirement sustainability — how many years the portfolio lasts.
 *
 * @param {number} portfolioAtRetirement - Portfolio value at retirement
 * @param {number} annualExpenses - Annual expenses at retirement (already inflation-adjusted)
 * @param {number} postRetirementReturn - Conservative return rate as percentage (e.g. 6)
 * @param {number} inflationRate - Annual inflation rate as percentage (e.g. 4)
 * @returns {{ years: number, data: Array<{year: number, age: number, withdrawal: number, remaining: number, returnAmount: number}> }}
 */
export function calcRetirementSustainability(portfolioAtRetirement, annualExpenses, postRetirementReturn, inflationRate, retirementAge = 45) {
  const data = [];
  let remaining = portfolioAtRetirement;
  const returnRateFrac = postRetirementReturn / 100;
  const inflationFrac = inflationRate / 100;
  let yearlyExpenses = annualExpenses;
  const maxYears = 60; // simulate up to 60 years

  for (let i = 0; i < maxYears; i++) {
    if (remaining <= 0) break;

    const year = i + 1;
    const age = retirementAge + i;
    const returnAmount = Math.round(remaining * returnRateFrac);
    const withdrawal = Math.round(yearlyExpenses);

    remaining = remaining + returnAmount - withdrawal;
    if (remaining < 0) remaining = 0;

    data.push({
      year,
      age,
      withdrawal,
      remaining: Math.round(remaining),
      returnAmount,
    });

    if (remaining <= 0) break;

    // Expenses grow with inflation
    yearlyExpenses = yearlyExpenses * (1 + inflationFrac);
  }

  return {
    years: data.length,
    data,
  };
}

/**
 * Generate personalized recommendations based on user's FIRE data.
 *
 * @param {Object} params
 * @param {number} params.savingsRate - FIRE allocation percentage
 * @param {number} params.readinessScore - FI Readiness Score (0-100)
 * @param {number} params.yearsToRetirement - Years until target retirement
 * @param {number} params.monthlyExpenses
 * @param {number} params.monthlyIncome
 * @param {number} params.currentAssets
 * @returns {Array<{type: string, text: string}>}
 */
export function generateRecommendations(params) {
  const {
    savingsRate,
    readinessScore,
    yearsToRetirement,
    monthlyExpenses,
    monthlyIncome,
    currentAssets,
  } = params;

  const recommendations = [];

  // Savings rate recommendations
  if (savingsRate < 20) {
    recommendations.push({
      type: 'warning',
      text: `Alokasi FIRE Anda hanya ${savingsRate}%. Tingkatkan ke minimal 20-30% untuk mempercepat perjalanan FIRE.`,
    });
  } else if (savingsRate >= 40) {
    recommendations.push({
      type: 'success',
      text: `Alokasi FIRE ${savingsRate}% sangat baik! Anda berada di jalur yang tepat.`,
    });
  }

  // Expense ratio
  const expenseRatio = monthlyIncome > 0 ? (monthlyExpenses / monthlyIncome) * 100 : 0;
  if (expenseRatio > 50) {
    recommendations.push({
      type: 'warning',
      text: `Pengeluaran Anda ${Math.round(expenseRatio)}% dari pendapatan. Coba kurangi ke bawah 50% untuk meningkatkan tabungan FIRE.`,
    });
  }

  // Readiness score
  if (readinessScore >= 100) {
    recommendations.push({
      type: 'success',
      text: '🎉 Selamat! Anda telah mencapai Financial Independence! Portofolio Anda sudah mencukupi.',
    });
  } else if (readinessScore >= 75) {
    recommendations.push({
      type: 'info',
      text: `Anda sudah ${readinessScore.toFixed(1)}% menuju FI. Tinggal sedikit lagi!`,
    });
  } else if (readinessScore < 25 && yearsToRetirement < 10) {
    recommendations.push({
      type: 'warning',
      text: `Skor FI masih ${readinessScore.toFixed(1)}% dengan ${yearsToRetirement} tahun menuju pensiun. Pertimbangkan untuk menaikkan target usia atau tingkatkan alokasi.`,
    });
  }

  // Years to retirement
  if (yearsToRetirement > 25) {
    recommendations.push({
      type: 'info',
      text: 'Waktu investasi Anda panjang — manfaatkan compound interest dengan konsisten berinvestasi.',
    });
  }

  // Emergency fund check
  if (currentAssets < monthlyExpenses * 6) {
    recommendations.push({
      type: 'warning',
      text: 'Pastikan Anda sudah memiliki dana darurat minimal 6 bulan pengeluaran sebelum agresif berinvestasi FIRE.',
    });
  }

  // If no warnings, add generic positive
  if (recommendations.length === 0) {
    recommendations.push({
      type: 'info',
      text: 'Perjalanan FIRE Anda sedang berjalan dengan baik. Tetap konsisten!',
    });
  }

  return recommendations;
}
