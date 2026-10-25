import {
  Home,
  ListChecks,
  Wallet,
  PieChart,
  Info,
  Calendar,
  Target,
  RefreshCcwDot,
  Pencil,
  Plus,
  X,
  ChevronRight,
  ArrowRight,
  Filter,
  Search,
  Trash2,
  AlertTriangle,
  Check,
  TrendingUp,
  Zap,
  TrendingDown,
  Sun,
  Moon,
  Flame,
  CreditCard,
  Settings,
  LogOut,
  ChevronLeft,
  Menu,
  LayoutDashboard,
  ArrowLeftRight,
  ChartColumn,
  LifeBuoy,
  Scale,
  Download,
} from 'lucide-react';

/**
 * NavIcon — consistent outline icons mapped to the approved financial reference.
 *
 * @param {Object} props
 * @param {string} props.name - Icon name
 * @param {number} [props.size=20] - Icon size in pixels
 * @param {Object} rest - Additional props
 */
export default function NavIcon({ name, size = 20, ...rest }) {
  const props = { size, strokeWidth: 1.8, 'aria-hidden': true, ...rest };

  const icons = {
    wishlist: <ListChecks {...props} />,
    dashboard: <LayoutDashboard {...props} />,
    wallet: <Wallet {...props} />,
    tx: <ArrowLeftRight {...props} />,
    budget: <PieChart {...props} />,
    calendar: <Calendar {...props} />,
    report: <ChartColumn {...props} />,
    plus: <Plus {...props} />,
    close: <X {...props} />,
    chevron: <ChevronRight {...props} />,
    arrow: <ArrowRight {...props} />,
    filter: <Filter {...props} />,
    search: <Search {...props} />,
    edit: <Pencil {...props} />,
    trash: <Trash2 {...props} />,
    transfer: <ArrowLeftRight {...props} />,
    warning: <AlertTriangle {...props} />,
    check: <Check {...props} />,
    income: <TrendingUp {...props} />,
    expense: <TrendingDown {...props} />,
    sun: <Sun {...props} />,
    moon: <Moon {...props} />,
    recurring: <RefreshCcwDot {...props} />,
    debt: <Scale {...props} />,
    invest: <TrendingUp {...props} />,
    asset: <Home {...props} />,
    fire: <Flame {...props} />,
    target: <Target {...props} />,
    subscription: <CreditCard {...props} />,
    settings: <Settings {...props} />,
    help: <LifeBuoy {...props} />,
    download: <Download {...props} />,
    menu: <Menu {...props} />,
    info: <Info {...props} />,
    bolt: <Zap {...props} />,
    logout: <LogOut {...props} />,
    chevronLeft: <ChevronLeft {...props} />,
    chevronRight: <ChevronRight {...props} />,
  };

  return icons[name] || null;
}
