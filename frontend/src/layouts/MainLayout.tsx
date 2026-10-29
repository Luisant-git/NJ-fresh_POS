import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, LogOut, Settings as SettingsIcon, Zap, ArrowLeft, Menu, X, Shield, Users as UsersIcon } from 'lucide-react';
import api from '../services/api';

const NavItem = ({ title, icon, to, onClick }: { title: string, icon: string, to: string, onClick?: () => void }) => (
  <NavLink 
    to={to} 
    onClick={onClick}
    className={({ isActive }) => `flex items-center gap-2 px-2 xl:px-3 h-full text-sm font-bold transition-colors ${isActive ? 'bg-[#1E3A8A] text-white border-b-2 lg:border-white' : 'text-[#E0E7FF] hover:bg-[#1E40AF] hover:text-white border-b-2 lg:border-transparent'}`}
  >
    <i className={`fa ${icon}`}></i>
    <span className="whitespace-nowrap">{title}</span>
  </NavLink>
);

const NavDropdown = ({ title, icon, children, isActive }: { title: string, icon: string, children: React.ReactNode, isActive?: boolean }) => {
  return (
    <div className="relative group h-full flex items-center">
      <button className={`flex items-center gap-2 px-2 xl:px-3 h-full text-sm font-bold transition-colors ${isActive ? 'bg-[#1E3A8A] text-white border-b-2 border-white' : 'text-[#E0E7FF] hover:bg-[#1E40AF] hover:text-white border-b-2 border-transparent'}`}>
        <i className={`fa ${icon}`}></i>
        <span className="whitespace-nowrap">{title}</span>
        <ChevronDown size={14} className="ml-1 opacity-70" />
      </button>
      <div className="absolute left-0 top-full mt-0 w-64 bg-white border border-gray-200 shadow-2xl rounded-b-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 overflow-hidden transform origin-top group-hover:scale-100 scale-95">
        <div className="py-2">
          {children}
        </div>
      </div>
    </div>
  );
};

const DropdownItem = ({ to, icon, title, isDanger = false, isWarning = false, onClick }: { to: string, icon: string, title: string, isDanger?: boolean, isWarning?: boolean, onClick?: () => void }) => (
  <NavLink
    to={to}
    onClick={onClick}
    className={({ isActive }) => `flex items-center gap-3 px-4 py-2.5 text-sm font-bold transition-colors ${isActive ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-600' : 'text-black font-bold hover:bg-gray-50 hover:text-blue-600 border-l-4 border-transparent'}`}
  >
    <div className={`w-6 flex justify-center ${isDanger ? 'text-red-500' : isWarning ? 'text-amber-500' : 'text-black font-bold'}`}>
      <i className={`fa ${icon} text-base`}></i>
    </div>
    <span>{title}</span>
  </NavLink>
);

// Mobile specific components
const MobileNavDropdown = ({ title, icon, children, isActive }: { title: string, icon: string, children: React.ReactNode, isActive?: boolean }) => {
  const [isOpen, setIsOpen] = useState(isActive || false);
  return (
    <div className="flex flex-col border-b border-[#2A3F54]/30">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between px-4 py-3 text-sm font-bold transition-colors ${isActive ? 'bg-[#1E3A8A]/50 text-white' : 'text-[#E0E7FF] hover:bg-[#1E40AF]'}`}
      >
        <div className="flex items-center gap-3">
          <i className={`fa ${icon} w-5 text-center`}></i>
          <span>{title}</span>
        </div>
        <ChevronDown size={16} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="bg-[#172D44]/30 py-2 flex flex-col pl-4">
          {children}
        </div>
      )}
    </div>
  );
};

const MobileDropdownItem = ({ to, icon, title, onClick, isDanger = false, isWarning = false }: { to: string, icon: string, title: string, onClick?: () => void, isDanger?: boolean, isWarning?: boolean }) => (
  <NavLink
    to={to}
    onClick={onClick}
    className={({ isActive }) => `flex items-center gap-3 px-4 py-2.5 text-sm font-bold transition-colors ${isActive ? 'text-white font-bold bg-[#1E3A8A]/30 border-l-2 border-blue-400' : 'text-blue-200 hover:text-white hover:bg-[#1E40AF]/50 border-l-2 border-transparent'}`}
  >
    <div className={`w-5 flex justify-center ${isDanger ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-blue-300'}`}>
      <i className={`fa ${icon} text-[13px]`}></i>
    </div>
    <span>{title}</span>
  </NavLink>
);

const MobileNavItem = ({ title, icon, to, onClick }: { title: string, icon: string, to: string, onClick?: () => void }) => (
  <NavLink 
    to={to} 
    onClick={onClick}
    className={({ isActive }) => `flex items-center gap-3 px-4 py-3 text-sm font-bold transition-colors border-b border-[#2A3F54]/30 ${isActive ? 'bg-[#1E3A8A]/50 text-white' : 'text-[#E0E7FF] hover:bg-[#1E40AF]'}`}
  >
    <i className={`fa ${icon} w-5 text-center`}></i>
    <span>{title}</span>
  </NavLink>
);

const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [user] = useState<any>(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        return JSON.parse(storedUser);
      } catch (e) {}
    }
    return { name: 'Pro X Admin' };
  });
  
  const [permissions, setPermissions] = useState<string[]>(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        if (parsed?.role?.permissions) {
          return parsed.role.permissions;
        }
      } catch (e) {}
    }
    return [];
  });

  useEffect(() => {
    if (!user?.roleId && permissions.length === 0) {
      // Fallback for demo before setup
      api.get('/roles').then(res => {
        if (res.data.length > 0) {
          setPermissions(res.data[0].permissions || []);
        }
      }).catch(err => console.error(err));
    }
  }, [user?.roleId, permissions.length]);

  const hasPerm = (perm: string) => {
    if (permissions.includes('ALL')) return true;
    if (permissions.length === 0 && !user?.roleId) return true;
    return permissions.includes(perm);
  };

  const hasAnyPerm = (perms: string[]) => {
    if (permissions.includes('ALL')) return true;
    if (permissions.length === 0 && !user?.roleId) return true;
    return perms.some(p => permissions.includes(p));
  };

  const [currentDate, setCurrentDate] = useState(new Date());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [desktopLayout] = useState(() => localStorage.getItem('desktopLayout') || 'topbar');
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentDate(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName);
      if (e.key === 'Escape' && !isInput) {
        // If we are not on the dashboard/home, navigate back
        const path = window.location.pathname;
        if (
          path !== '/dashboard' && 
          path !== '/quick-start' && 
          path !== '/' &&
          path !== '/purchase/new' &&
          path !== '/sales/pos'
        ) {
          navigate(-1);
        }
      }
    };
    
    // Add listener
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [navigate]);

  const formattedDate = `${currentDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' })} ${currentDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kuala_Lumpur' })}`;

  const isMasterActive = location.pathname.startsWith('/master');
  const isSalesActive = location.pathname.startsWith('/sales');
  const isPurchaseActive = location.pathname.startsWith('/purchase');
  const isReportsActive = location.pathname.startsWith('/reports');

  const showBackButton = location.pathname !== '/dashboard' && location.pathname !== '/quick-start' && location.pathname !== '/';

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className={`flex ${desktopLayout === 'sidebar' ? 'flex-row' : 'flex-col'} h-screen bg-[#F3F5F8] overflow-hidden font-sans text-[13px] print:h-auto print:overflow-visible print:bg-white`}>
      
      {/* Desktop Sidebar Navigation */}
      {desktopLayout === 'sidebar' && (
        <aside className="hidden lg:flex flex-col w-64 h-full bg-[#111827] text-white shadow-2xl z-40 overflow-y-auto print:hidden">
          <div className="flex items-center gap-3 p-4 border-b border-[#2563EB] shrink-0 h-[60px] bg-gradient-to-r from-[#1E40AF] to-[#2563EB]">
            <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center shadow-md">
              <span className="text-[#2563EB] font-bold text-sm tracking-tighter">P<span className="text-amber-500">O</span>S</span>
            </div>
            <span className="font-bold tracking-wider leading-tight">SUITE 360</span>
          </div>
          
          <nav className="flex-1 py-2 overflow-y-auto custom-scrollbar">
            {hasPerm('dashboard_access') && <NavItem to="/dashboard" icon="fa-dashboard" title="Dashboard" />}
            
            {hasAnyPerm(['master_products', 'master_brands', 'master_categories', 'master_units', 'master_suppliers', 'master_customers', 'master_payment_modes', 'master_payment_types', 'master_expense_categories']) && (
              <MobileNavDropdown title="Master" icon="fa-database" isActive={isMasterActive}>
                {hasPerm('master_products') && <MobileDropdownItem to="/master/products" icon="fa-cubes" title="Products" />}
                {hasPerm('master_brands') && <MobileDropdownItem to="/master/brands" icon="fa-tags" title="Brands" />}
                {hasPerm('master_categories') && <MobileDropdownItem to="/master/categories" icon="fa-sitemap" title="Categories" />}
                {hasPerm('master_units') && <MobileDropdownItem to="/master/units" icon="fa-balance-scale" title="Units" />}
                <div className="my-1 border-t border-[#2A3F54]/30"></div>
                {hasPerm('master_suppliers') && <MobileDropdownItem to="/master/suppliers" icon="fa-building-o" title="Suppliers" />}
                {hasPerm('master_customers') && <MobileDropdownItem to="/master/customers" icon="fa-users" title="Customers" />}
                {hasPerm('master_employees') && <MobileDropdownItem to="/master/employees" icon="fa-user" title="Employee" />}
                {hasPerm('employee_attendance') && <MobileDropdownItem to="/employees/attendance" icon="fa-clock-o" title="Employee Attendance" />}
                <div className="my-1 border-t border-[#2A3F54]/30"></div>
                {hasPerm('master_payment_modes') && <MobileDropdownItem to="/master/payment-modes" icon="fa-credit-card-alt" title="Payment Modes" />}
                {hasPerm('master_payment_types') && <MobileDropdownItem to="/master/payment-types" icon="fa-money" title="Payment Types" />}
                {hasPerm('master_expense_categories') && <MobileDropdownItem to="/master/expense-categories" icon="fa-list-alt" title="Expense Categories" />}
              </MobileNavDropdown>
            )}

            {hasAnyPerm(['purchase_entry', 'purchase_list', 'purchase_return', 'purchase_payments']) && (
              <MobileNavDropdown title="Purchases" icon="fa-truck" isActive={isPurchaseActive}>
                {hasPerm('purchase_entry') && <MobileDropdownItem to="/purchase/new" icon="fa-shopping-basket" title="Purchase Entry" />}
                {hasPerm('purchase_list') && <MobileDropdownItem to="/purchase" icon="fa-list-alt" title="Purchase List" />}
                {hasPerm('purchase_return') && <MobileDropdownItem to="/purchase/return" icon="fa-undo" title="Purchase Return" isWarning />}
                {hasPerm('purchase_payments') && <MobileDropdownItem to="/purchase/payments" icon="fa-credit-card" title="Supplier Payments" />}
              </MobileNavDropdown>
            )}

            {hasAnyPerm(['sales_pos', 'sales_list', 'sales_return', 'sales_receipts']) && (
              <MobileNavDropdown title="Sales" icon="fa-shopping-cart" isActive={isSalesActive}>
                {hasPerm('sales_pos') && <MobileDropdownItem to="/sales/pos" icon="fa-th-large" title="Sales Entry (POS)" />}
                {hasPerm('sales_list') && <MobileDropdownItem to="/sales" icon="fa-list-alt" title="Sales List" />}
                {hasPerm('sales_return') && <MobileDropdownItem to="/sales/return" icon="fa-reply" title="Sales Return" isDanger />}
                {hasPerm('sales_receipts') && <MobileDropdownItem to="/sales/receipts" icon="fa-money" title="Customer Receipts" />}
              </MobileNavDropdown>
            )}

            {hasPerm('expenses_entry') && <NavItem to="/expenses/new" icon="fa-calculator" title="Expenses" />}
            {hasPerm('reports_financial') && (
              <MobileNavDropdown title="Banking" icon="fa-university" isActive={location.pathname.startsWith('/bank-deposits') || location.pathname.startsWith('/cheque-entries')}>
                <MobileDropdownItem to="/bank-deposits" icon="fa-building" title="Bank Deposit Entry" />
                <MobileDropdownItem to="/cheque-entries" icon="fa-credit-card" title="Cheque Entry" />
              </MobileNavDropdown>
            )}

            {hasAnyPerm(['reports_sales', 'reports_purchase', 'reports_financial', 'reports_purchase_return', 'reports_sales_return', 'reports_product_wise_sales', 'reports_stock', 'reports_profit_ledger', 'reports_expense', 'reports_customer_receipts', 'reports_supplier_payments']) && (
              <MobileNavDropdown title="Reports" icon="fa-pie-chart" isActive={isReportsActive}>
                {hasPerm('reports_sales') && <MobileDropdownItem to="/reports/sales" icon="fa-line-chart" title="Sales Report" />}
                {hasPerm('reports_sales_return') && <MobileDropdownItem to="/reports/sales-return" icon="fa-mail-reply" title="Sales Return Report" isDanger />}
                {hasPerm('reports_product_wise_sales') && <MobileDropdownItem to="/reports/product-wise-sales" icon="fa-cube" title="Product Wise Sales" />}
                {hasPerm('reports_purchase') && <MobileDropdownItem to="/reports/purchase" icon="fa-file-text-o" title="Purchase Report" />}
                {hasPerm('reports_purchase_return') && <MobileDropdownItem to="/reports/purchase-return" icon="fa-mail-reply" title="Purchase Return Report" isWarning />}
                <div className="my-1 border-t border-[#2A3F54]/30"></div>
                {hasPerm('reports_stock') && <MobileDropdownItem to="/reports/stock" icon="fa-cubes" title="Stock As On Date" />}
                {hasPerm('reports_profit_ledger') && <MobileDropdownItem to="/reports/profit-ledger" icon="fa-bar-chart" title="Profit / Ledger" />}
                {hasPerm('reports_expense') && <MobileDropdownItem to="/reports/expenses" icon="fa-calculator" title="Expense Report" />}
                {hasPerm('reports_financial') && <MobileDropdownItem to="/reports/bank-deposits" icon="fa-building" title="Bank Deposit Report" />}
                {hasPerm('reports_financial') && <MobileDropdownItem to="/reports/cheque-entries" icon="fa-credit-card" title="Cheque Entry Report" />}
                {hasPerm('reports_customer_receipts') && <MobileDropdownItem to="/reports/customer-receipts" icon="fa-users" title="Customer Receipts & Overdue Report" />}
                {hasPerm('reports_supplier_payments') && <MobileDropdownItem to="/reports/supplier-payments" icon="fa-truck" title="Supplier Payments & Payables Report" />}
              </MobileNavDropdown>
            )}
          </nav>
        </aside>
      )}

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:overflow-visible print:block print:h-auto">
        {/* Top Navigation Bar - Premium Blue */}
      <header className="bg-gradient-to-r from-[#1E40AF] to-[#2563EB] text-white shadow-lg z-30 print:hidden flex-shrink-0 border-b border-blue-800">
        <div className="flex items-center justify-between px-3 sm:px-4 h-[60px]">
          {/* Logo & Main Nav */}
          <div className="flex items-center h-full">
            <button 
              className="lg:hidden p-2 mr-2 hover:bg-white/10 rounded-lg transition-colors"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu size={24} />
            </button>

            <Link to="/dashboard" className={`items-center gap-2 sm:gap-3 mr-2 sm:mr-6 group ${showBackButton ? 'hidden sm:flex' : 'flex'} ${desktopLayout === 'sidebar' ? 'lg:hidden' : ''}`}>
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white rounded-xl flex items-center justify-center shadow-md group-hover:shadow-lg transition-all transform group-hover:-translate-y-0.5 shrink-0">
                <span className="text-[#2563EB] font-bold text-sm sm:text-lg tracking-tighter">P<span className="text-amber-500">O</span>S</span>
              </div>
              <div className="hidden sm:block">
                <span className="text-base sm:text-lg font-bold tracking-wider whitespace-nowrap leading-tight">SUITE 360</span>
              </div>
            </Link>

            {/* Universal Back Button */}
            {showBackButton && (
              <button 
                onClick={() => navigate(-1)}
                className="flex items-center gap-1.5 px-3 py-1.5 mr-2 sm:mr-6 bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg transition-all font-bold text-[12px] sm:text-[13px] text-white shadow-sm shrink-0"
                title="Go Back"
              >
                <ArrowLeft size={16} /> <span className="hidden sm:inline">Back (Esc)</span>
              </button>
            )}

            {desktopLayout === 'topbar' && (
              <nav className="hidden lg:flex h-full items-center">
                {hasPerm('dashboard_access') && <NavItem to="/dashboard" icon="fa-dashboard" title="Dashboard" />}
              
            {hasAnyPerm(['master_products', 'master_brands', 'master_categories', 'master_units', 'master_suppliers', 'master_customers', 'master_employees', 'employee_attendance', 'master_payment_modes', 'master_payment_types', 'master_expense_categories']) && (
              <NavDropdown title="Master" icon="fa-database" isActive={isMasterActive}>
                <div className="px-4 py-1.5 text-[11px] font-bold text-black font-bold uppercase tracking-wider">Inventory</div>
                {hasPerm('master_products') && <DropdownItem to="/master/products" icon="fa-cubes" title="Products" />}
                {hasPerm('master_brands') && <DropdownItem to="/master/brands" icon="fa-tags" title="Brands" />}
                {hasPerm('master_categories') && <DropdownItem to="/master/categories" icon="fa-sitemap" title="Categories" />}
                {hasPerm('master_units') && <DropdownItem to="/master/units" icon="fa-balance-scale" title="Units" />}
                
                <div className="h-px bg-gray-100 my-1 mx-4"></div>
                <div className="px-4 py-1.5 text-[11px] font-bold text-black font-bold uppercase tracking-wider">People</div>
                {hasPerm('master_suppliers') && <DropdownItem to="/master/suppliers" icon="fa-building-o" title="Suppliers" />}
                {hasPerm('master_customers') && <DropdownItem to="/master/customers" icon="fa-users" title="Customers" />}
                {hasPerm('master_employees') && <DropdownItem to="/master/employees" icon="fa-user" title="Employee" />}
                {hasPerm('employee_attendance') && <DropdownItem to="/employees/attendance" icon="fa-clock-o" title="Employee Attendance" />}
                
                <div className="h-px bg-gray-100 my-1 mx-4"></div>
                <div className="px-4 py-1.5 text-[11px] font-bold text-black font-bold uppercase tracking-wider">Settings</div>
                {hasPerm('master_payment_modes') && <DropdownItem to="/master/payment-modes" icon="fa-credit-card-alt" title="Payment Modes" />}
                {hasPerm('master_payment_types') && <DropdownItem to="/master/payment-types" icon="fa-money" title="Payment Types" />}
                {hasPerm('master_expense_categories') && <DropdownItem to="/master/expense-categories" icon="fa-list-alt" title="Expense Categories" />}
              </NavDropdown>
            )}

            {hasAnyPerm(['purchase_entry', 'purchase_list', 'purchase_return', 'purchase_payments']) && (
              <NavDropdown title="Purchases" icon="fa-truck" isActive={isPurchaseActive}>
                {hasPerm('purchase_entry') && <DropdownItem to="/purchase/new" icon="fa-shopping-basket" title="Purchase Entry" />}
                {hasPerm('purchase_list') && <DropdownItem to="/purchase" icon="fa-list-alt" title="Purchase List" />}
                {hasPerm('purchase_return') && <DropdownItem to="/purchase/return" icon="fa-undo" title="Purchase Return" isWarning />}
                <div className="h-px bg-gray-100 my-1 mx-4"></div>
                {hasPerm('purchase_payments') && <DropdownItem to="/purchase/payments" icon="fa-credit-card" title="Supplier Payments" />}
              </NavDropdown>
            )}

            {hasAnyPerm(['sales_pos', 'sales_list', 'sales_return', 'sales_receipts']) && (
              <NavDropdown title="Sales" icon="fa-shopping-cart" isActive={isSalesActive}>
                {hasPerm('sales_pos') && <DropdownItem to="/sales/pos" icon="fa-th-large" title="Sales Entry (POS)" />}
                {hasPerm('sales_list') && <DropdownItem to="/sales" icon="fa-list-alt" title="Sales List" />}
                {hasPerm('sales_return') && <DropdownItem to="/sales/return" icon="fa-reply" title="Sales Return" isDanger />}
                <div className="h-px bg-gray-100 my-1 mx-4"></div>
                {hasPerm('sales_receipts') && <DropdownItem to="/sales/receipts" icon="fa-money" title="Customer Receipts" />}
              </NavDropdown>
            )}

            {hasPerm('expenses_entry') && <NavItem to="/expenses/new" icon="fa-calculator" title="Expenses" />}
            {hasPerm('reports_financial') && (
              <NavDropdown title="Banking" icon="fa-university" isActive={location.pathname.startsWith('/bank-deposits') || location.pathname.startsWith('/cheque-entries')}>
                <DropdownItem to="/bank-deposits" icon="fa-building" title="Bank Deposit Entry" />
                <DropdownItem to="/cheque-entries" icon="fa-credit-card" title="Cheque Entry" />
              </NavDropdown>
            )}

            {hasAnyPerm(['reports_sales', 'reports_purchase', 'reports_financial', 'reports_purchase_return', 'reports_sales_return', 'reports_product_wise_sales', 'reports_stock', 'reports_profit_ledger', 'reports_expense', 'reports_customer_receipts', 'reports_supplier_payments']) && (
              <NavDropdown title="Reports" icon="fa-pie-chart" isActive={isReportsActive}>
                <div className="px-4 py-1.5 text-[11px] font-bold text-black font-bold uppercase tracking-wider">Purchase & Sales</div>
                {hasPerm('reports_purchase') && <DropdownItem to="/reports/purchase" icon="fa-file-text-o" title="Purchase Report" />}
                {hasPerm('reports_purchase_return') && <DropdownItem to="/reports/purchase-return" icon="fa-mail-reply" title="Purchase Return Report" isWarning />}
                {hasPerm('reports_sales') && <DropdownItem to="/reports/sales" icon="fa-line-chart" title="Sales Report" />}
                {hasPerm('reports_sales_return') && <DropdownItem to="/reports/sales-return" icon="fa-mail-reply" title="Sales Return Report" isDanger />}
                {hasPerm('reports_product_wise_sales') && <DropdownItem to="/reports/product-wise-sales" icon="fa-cube" title="Product Wise Sales" />}
                
                <div className="h-px bg-gray-100 my-1 mx-4"></div>
                <div className="px-4 py-1.5 text-[11px] font-bold text-black font-bold uppercase tracking-wider">Financial & Ledger</div>
                {hasPerm('reports_stock') && <DropdownItem to="/reports/stock" icon="fa-cubes" title="Stock As On Date" />}
                {hasPerm('reports_profit_ledger') && <DropdownItem to="/reports/profit-ledger" icon="fa-bar-chart" title="Profit / Ledger" />}
                {hasPerm('reports_expense') && <DropdownItem to="/reports/expenses" icon="fa-calculator" title="Expense Report" />}
                {hasPerm('reports_financial') && <DropdownItem to="/reports/bank-deposits" icon="fa-building" title="Bank Deposit Report" />}
                {hasPerm('reports_financial') && <DropdownItem to="/reports/cheque-entries" icon="fa-credit-card" title="Cheque Entry Report" />}
                {hasPerm('reports_customer_receipts') && <DropdownItem to="/reports/customer-receipts" icon="fa-users" title="Customer Receipts & Overdue Report" />}
                {hasPerm('reports_supplier_payments') && <DropdownItem to="/reports/supplier-payments" icon="fa-truck" title="Supplier Payments & Payables Report" />}
              </NavDropdown>
            )}
            </nav>
            )}
          </div>

          {/* Right side Tools */}
          <div className="flex items-center gap-2 sm:gap-4 h-full">
            <Link 
              to="/quick-start"
              className="hidden md:flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white px-4 sm:px-5 py-1.5 sm:py-2 rounded-md font-bold transition-all shadow-lg shadow-orange-500/40 text-[12px] sm:text-[13px] transform hover:-translate-y-0.5 shrink-0"
            >
              <Zap size={14} fill="currentColor" /> <span className="hidden sm:inline">Quick Start</span>
            </Link>
            
            {!showBackButton && (
              <div className="hidden 2xl:flex items-center text-sm font-bold text-blue-50 bg-[#1E3A8A]/50 px-4 py-1.5 rounded-md border border-blue-400/30 backdrop-blur-sm shadow-inner shrink-0">
                <i className="fa fa-clock-o mr-2 text-blue-300"></i>
                {formattedDate}
              </div>
            )}

            {!showBackButton && <div className="h-8 w-px bg-blue-400/30 mx-2 hidden md:block"></div>}

            <div 
              ref={profileRef}
              className="relative group h-full flex items-center shrink-0"
            >
              <button 
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-2 hover:bg-[#1E3A8A] px-2 py-2 rounded-xl transition-all duration-200"
              >
                <div className="w-7 h-7 sm:w-8 sm:h-8 bg-white text-[#2563EB] rounded-full flex items-center justify-center font-bold text-xs sm:text-sm shadow-md ring-2 ring-blue-400/50 shrink-0">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <ChevronDown size={14} className={`opacity-70 transition-transform duration-300 ${isProfileOpen ? 'rotate-180' : ''}`} />
              </button>
              
              <div className={`absolute right-0 top-[90%] mt-2 w-56 bg-white border border-gray-100 shadow-2xl rounded-2xl transition-all duration-300 z-50 overflow-hidden transform origin-top-right ${isProfileOpen ? 'opacity-100 visible scale-100' : 'opacity-0 invisible scale-95'}`}>
                <div className="p-4 bg-gray-50 border-b border-gray-100">
                  <p className="text-base font-bold text-black font-bold">{user?.name || 'User'}</p>
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mt-1">{user?.role?.name || 'User'}</p>
                </div>
                <div className="py-2 px-2">
                  {hasPerm('master_store_settings') && (
                    <Link to="/settings" className="flex items-center gap-3 px-3 py-2.5 text-sm text-black font-bold hover:bg-blue-50 hover:text-blue-700 rounded-lg transition-colors font-bold">
                      <div className="w-8 h-8 rounded-md bg-gray-100 flex items-center justify-center text-black font-bold">
                        <SettingsIcon size={16} />
                      </div>
                      Settings
                    </Link>
                  )}
                  {hasPerm('master_users') && (
                    <Link to="/master/users" className="flex items-center gap-3 px-3 py-2.5 text-sm text-black font-bold hover:bg-blue-50 hover:text-blue-700 rounded-lg transition-colors font-bold">
                      <div className="w-8 h-8 rounded-md bg-blue-50 flex items-center justify-center text-blue-600">
                        <UsersIcon size={16} />
                      </div>
                      Users & Roles
                    </Link>
                  )}
                  {hasPerm('master_permissions') && (
                    <Link to="/master/permissions" className="flex items-center gap-3 px-3 py-2.5 text-sm text-black font-bold hover:bg-blue-50 hover:text-blue-700 rounded-lg transition-colors font-bold">
                      <div className="w-8 h-8 rounded-md bg-purple-50 flex items-center justify-center text-purple-600">
                        <Shield size={16} />
                      </div>
                      Menu Permissions
                    </Link>
                  )}
                  {/* <button 
                    onClick={toggleDesktopLayout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-bold mt-1"
                  >
                    <div className="w-8 h-8 rounded-md bg-blue-100 flex items-center justify-center text-blue-600">
                      <LayoutTemplate size={16} />
                    </div>
                    {desktopLayout === 'topbar' ? 'Switch to Sidebar' : 'Switch to Topbar'}
                  </button> */}
                  <button 
                    onClick={() => { localStorage.removeItem('token'); window.location.href = '/login'; }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors font-bold mt-1"
                  >
                    <div className="w-8 h-8 rounded-md bg-red-100 flex items-center justify-center text-red-500">
                      <LogOut size={16} />
                    </div>
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Navigation */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={closeMobileMenu}></div>
          <div className="relative flex flex-col w-72 max-w-sm h-full bg-gradient-to-b from-[#1E40AF] to-[#1E3A8A] text-white shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-[#2563EB]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center shadow-md">
                  <span className="text-[#2563EB] font-bold text-sm tracking-tighter">P<span className="text-amber-500">O</span>S</span>
                </div>
                <span className="font-bold tracking-wider leading-tight">SUITE 360</span>
              </div>
              <button onClick={closeMobileMenu} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <nav className="flex-1 py-2 overflow-y-auto custom-scrollbar">
              <MobileNavItem to="/dashboard" icon="fa-dashboard" title="Dashboard" onClick={closeMobileMenu} />
              
              {hasAnyPerm(['master_products', 'master_brands', 'master_categories', 'master_units', 'master_suppliers', 'master_customers', 'master_employees', 'employee_attendance', 'master_payment_modes', 'master_payment_types', 'master_expense_categories']) && (
                <MobileNavDropdown title="Master" icon="fa-database" isActive={isMasterActive}>
                  {hasPerm('master_products') && <MobileDropdownItem to="/master/products" icon="fa-cubes" title="Products" onClick={closeMobileMenu} />}
                  {hasPerm('master_brands') && <MobileDropdownItem to="/master/brands" icon="fa-tags" title="Brands" onClick={closeMobileMenu} />}
                  {hasPerm('master_categories') && <MobileDropdownItem to="/master/categories" icon="fa-sitemap" title="Categories" onClick={closeMobileMenu} />}
                  {hasPerm('master_units') && <MobileDropdownItem to="/master/units" icon="fa-balance-scale" title="Units" onClick={closeMobileMenu} />}
                  <div className="my-1 border-t border-[#2A3F54]/30"></div>
                  {hasPerm('master_suppliers') && <MobileDropdownItem to="/master/suppliers" icon="fa-building-o" title="Suppliers" onClick={closeMobileMenu} />}
                  {hasPerm('master_customers') && <MobileDropdownItem to="/master/customers" icon="fa-users" title="Customers" onClick={closeMobileMenu} />}
                  {hasPerm('master_employees') && <MobileDropdownItem to="/master/employees" icon="fa-user" title="Employee" onClick={closeMobileMenu} />}
                  {hasPerm('employee_attendance') && <MobileDropdownItem to="/employees/attendance" icon="fa-clock-o" title="Employee Attendance" onClick={closeMobileMenu} />}
                  <div className="my-1 border-t border-[#2A3F54]/30"></div>
                  {hasPerm('master_payment_modes') && <MobileDropdownItem to="/master/payment-modes" icon="fa-credit-card-alt" title="Payment Modes" onClick={closeMobileMenu} />}
                  {hasPerm('master_payment_types') && <MobileDropdownItem to="/master/payment-types" icon="fa-money" title="Payment Types" onClick={closeMobileMenu} />}
                  {hasPerm('master_expense_categories') && <MobileDropdownItem to="/master/expense-categories" icon="fa-list-alt" title="Expense Categories" onClick={closeMobileMenu} />}
                </MobileNavDropdown>
              )}

              {hasAnyPerm(['purchase_entry', 'purchase_list', 'purchase_return', 'purchase_payments']) && (
                <MobileNavDropdown title="Purchases" icon="fa-truck" isActive={isPurchaseActive}>
                  {hasPerm('purchase_entry') && <MobileDropdownItem to="/purchase/new" icon="fa-shopping-basket" title="Purchase Entry" onClick={closeMobileMenu} />}
                  {hasPerm('purchase_list') && <MobileDropdownItem to="/purchase" icon="fa-list-alt" title="Purchase List" onClick={closeMobileMenu} />}
                  {hasPerm('purchase_return') && <MobileDropdownItem to="/purchase/return" icon="fa-undo" title="Purchase Return" isWarning onClick={closeMobileMenu} />}
                  {hasPerm('purchase_payments') && <MobileDropdownItem to="/purchase/payments" icon="fa-credit-card" title="Supplier Payments" onClick={closeMobileMenu} />}
                </MobileNavDropdown>
              )}

              {hasAnyPerm(['sales_pos', 'sales_list', 'sales_return', 'sales_receipts']) && (
                <MobileNavDropdown title="Sales" icon="fa-shopping-cart" isActive={isSalesActive}>
                  {hasPerm('sales_pos') && <MobileDropdownItem to="/sales/pos" icon="fa-th-large" title="Sales Entry (POS)" onClick={closeMobileMenu} />}
                  {hasPerm('sales_list') && <MobileDropdownItem to="/sales" icon="fa-list-alt" title="Sales List" onClick={closeMobileMenu} />}
                  {hasPerm('sales_return') && <MobileDropdownItem to="/sales/return" icon="fa-reply" title="Sales Return" isDanger onClick={closeMobileMenu} />}
                  {hasPerm('sales_receipts') && <MobileDropdownItem to="/sales/receipts" icon="fa-money" title="Customer Receipts" onClick={closeMobileMenu} />}
                </MobileNavDropdown>
              )}

              {hasPerm('expenses_entry') && <MobileNavItem to="/expenses/new" icon="fa-calculator" title="Expenses" onClick={closeMobileMenu} />}
              {hasPerm('reports_financial') && (
                <MobileNavDropdown title="Banking" icon="fa-university" isActive={location.pathname.startsWith('/bank-deposits') || location.pathname.startsWith('/cheque-entries')}>
                  <MobileDropdownItem to="/bank-deposits" icon="fa-building" title="Bank Deposit Entry" onClick={closeMobileMenu} />
                  <MobileDropdownItem to="/cheque-entries" icon="fa-credit-card" title="Cheque Entry" onClick={closeMobileMenu} />
                </MobileNavDropdown>
              )}

              {hasAnyPerm(['reports_sales', 'reports_purchase', 'reports_financial', 'reports_purchase_return', 'reports_sales_return', 'reports_product_wise_sales', 'reports_stock', 'reports_profit_ledger', 'reports_expense', 'reports_customer_receipts', 'reports_supplier_payments']) && (
                <MobileNavDropdown title="Reports" icon="fa-pie-chart" isActive={isReportsActive}>
                  {hasPerm('reports_sales') && <MobileDropdownItem to="/reports/sales" icon="fa-line-chart" title="Sales Report" onClick={closeMobileMenu} />}
                  {hasPerm('reports_sales_return') && <MobileDropdownItem to="/reports/sales-return" icon="fa-mail-reply" title="Sales Return Report" isDanger onClick={closeMobileMenu} />}
                  {hasPerm('reports_product_wise_sales') && <MobileDropdownItem to="/reports/product-wise-sales" icon="fa-cube" title="Product Wise Sales" onClick={closeMobileMenu} />}
                  {hasPerm('reports_purchase') && <MobileDropdownItem to="/reports/purchase" icon="fa-file-text-o" title="Purchase Report" onClick={closeMobileMenu} />}
                  {hasPerm('reports_purchase_return') && <MobileDropdownItem to="/reports/purchase-return" icon="fa-mail-reply" title="Purchase Return Report" isWarning onClick={closeMobileMenu} />}
                  {hasPerm('reports_stock') && <MobileDropdownItem to="/reports/stock" icon="fa-cubes" title="Stock As On Date" onClick={closeMobileMenu} />}
                  {hasPerm('reports_profit_ledger') && <MobileDropdownItem to="/reports/profit-ledger" icon="fa-bar-chart" title="Profit / Ledger" onClick={closeMobileMenu} />}
                  {hasPerm('reports_expense') && <MobileDropdownItem to="/reports/expenses" icon="fa-calculator" title="Expense Report" onClick={closeMobileMenu} />}
                  {hasPerm('reports_financial') && <MobileDropdownItem to="/reports/bank-deposits" icon="fa-building" title="Bank Deposit Report" onClick={closeMobileMenu} />}
                  {hasPerm('reports_financial') && <MobileDropdownItem to="/reports/cheque-entries" icon="fa-credit-card" title="Cheque Entry Report" onClick={closeMobileMenu} />}
                  {hasPerm('reports_customer_receipts') && <MobileDropdownItem to="/reports/customer-receipts" icon="fa-users" title="Customer Receipts & Overdue Report" onClick={closeMobileMenu} />}
                  {hasPerm('reports_supplier_payments') && <MobileDropdownItem to="/reports/supplier-payments" icon="fa-truck" title="Supplier Payments & Payables" onClick={closeMobileMenu} />}
                </MobileNavDropdown>
              )}
            </nav>
            
            <div className="p-4 border-t border-[#2563EB]">
              <Link 
                to="/quick-start"
                onClick={closeMobileMenu}
                className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white px-5 py-3 rounded-md font-bold transition-all shadow-lg"
              >
                <Zap size={16} fill="currentColor" /> Quick Start
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto relative bg-[#F3F5F8] print:overflow-visible print:bg-white custom-scrollbar">
        <div className="max-w-full mx-auto w-full h-full flex flex-col p-2 sm:p-4 lg:p-8">
          <Outlet context={{ desktopLayout }} />
        </div>
      </main>
      </div>
    </div>
  );
};

export default MainLayout;
