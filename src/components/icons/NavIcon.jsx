import {
  Home,
  Receipt,
  Wallet,
  PieChart,
  Info,
  Calendar,
  Target,
  Handshake,
  RefreshCcwDot,
  CalendarRange,
  CalendarDays,
  LayoutGrid,
  ClipboardList,
  Pencil,
  Plus,
  X,
  ChevronRight,
  ArrowRight,
  Filter,
  Search,
  Trash2,
  ArrowUpDown,
  AlertTriangle,
  Check,
  TrendingUp,
  Zap,
  TrendingDown,
  Sun,
  Moon,
  Activity,
  ShieldCheck,
  Flame,
  CreditCard,
  Settings,
  LogOut,
  ChevronLeft,
  HelpCircle,
} from 'lucide-react';

/**
 * NavIcon — Icon component using Lucide React icons (Cashew-inspired filled style).
 *
 * @param {Object} props
 * @param {string} props.name - Icon name
 * @param {number} [props.size=20] - Icon size in pixels
 * @param {Object} rest - Additional props
 */
export default function NavIcon({ name, size = 20, ...rest }) {
  const props = { size, strokeWidth: 2, ...rest };

  const icons = {
    dashboard: <Home {...props} />,
    wallet: <Wallet {...props} />,
    tx: <Receipt {...props} />,
    budget: <PieChart {...props} />,
    calendar: <Calendar {...props} />,
    report: <ClipboardList {...props} />,
    plus: <Plus {...props} strokeWidth={2.5} />,
    close: <X {...props} strokeWidth={2.5} />,
    chevron: <ChevronRight {...props} />,
    arrow: <ArrowRight {...props} />,
    filter: <Filter {...props} />,
    search: <Search {...props} />,
    edit: <Pencil {...props} />,
    trash: <Trash2 {...props} />,
    transfer: <ArrowUpDown {...props} />,
    warning: <AlertTriangle {...props} />,
    check: <Check {...props} strokeWidth={2.5} />,
    income: <TrendingUp {...props} />,
    expense: <TrendingDown {...props} />,
    sun: <Sun {...props} />,
    moon: <Moon {...props} />,
    recurring: <RefreshCcwDot {...props} />,
    debt: <Handshake {...props} />,
    invest: <Activity {...props} />,
    asset: <ShieldCheck {...props} />,
    fire: <Flame {...props} />,
    subscription: <CreditCard {...props} />,
    settings: <Settings {...props} />,
    help: <HelpCircle {...props} />,
    info: <Info {...props} />,
    bolt: <Zap {...props} />,
    logout: <LogOut {...props} />,
    chevronLeft: <ChevronLeft {...props} />,
    chevronRight: <ChevronRight {...props} />,
  };

  return icons[name] || null;
}
