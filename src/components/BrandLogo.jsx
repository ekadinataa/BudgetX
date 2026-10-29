import lightWordmark from '../assets/brand/budgetx-wordmark-light.png';
import darkWordmark from '../assets/brand/budgetx-wordmark-dark.png';

/** Original supplied lettering, not a font approximation. Theme follows <html>. */
export default function BrandLogo() {
  return <span className="brandLogo" role="img" aria-label="BudgetX">
    <img className="brandLogoLight" src={lightWordmark} alt="" width={124} height={30} />
    <img className="brandLogoDark" src={darkWordmark} alt="" width={124} height={30} />
  </span>;
}
