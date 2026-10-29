import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Check, Save, Shield, Settings2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

const MODULES = [
  {
    id: 'dashboard_quickstart',
    name: 'Dashboard & Quick Start',
    icon: <Settings2 size={18} />,
    permissions: [
      { id: 'dashboard_access', name: 'Dashboard' },
      { id: 'quick_start', name: 'Quick Start' },
    ]
  },
  {
    id: 'master',
    name: 'Master / Settings',
    icon: <Settings2 size={18} />,
    permissions: [
      { id: 'master_products', name: 'Products' },
      { id: 'master_brands', name: 'Brands' },
      { id: 'master_categories', name: 'Categories' },
      { id: 'master_units', name: 'Units' },
      { id: 'master_suppliers', name: 'Suppliers' },
      { id: 'master_customers', name: 'Customers' },
      { id: 'master_employees', name: 'Employee' },
      { id: 'employee_attendance', name: 'Employee Attendance' },
      { id: 'master_payment_modes', name: 'Payment Modes' },
      { id: 'master_payment_types', name: 'Payment Types' },
      { id: 'master_expense_categories', name: 'Expense Categories' },
      { id: 'master_store_settings', name: 'My Account & Store Settings' },
    ]
  },
  {
    id: 'purchases',
    name: 'Purchases',
    icon: <Shield size={18} />,
    permissions: [
      { id: 'purchase_entry', name: 'Purchase Entry' },
      { id: 'purchase_list', name: 'Purchase List' },
      { id: 'purchase_return', name: 'Purchase Return' },
      { id: 'purchase_payments', name: 'Supplier Payments' },
    ]
  },
  {
    id: 'sales',
    name: 'Sales',
    icon: <Shield size={18} />,
    permissions: [
      { id: 'sales_pos', name: 'Sales Entry (POS)' },
      { id: 'sales_list', name: 'Sales List' },
      { id: 'sales_return', name: 'Sales Return' },
      { id: 'sales_receipts', name: 'Customer Receipts' },
    ]
  },
  {
    id: 'expenses',
    name: 'Expenses',
    icon: <Shield size={18} />,
    permissions: [
      { id: 'expenses_entry', name: 'Expenses' },
    ]
  },
  {
    id: 'reports',
    name: 'Reports',
    icon: <Shield size={18} />,
    permissions: [
      { id: 'reports_purchase', name: 'Purchase Report' },
      { id: 'reports_purchase_return', name: 'Purchase Return Report' },
      { id: 'reports_sales', name: 'Sales Report' },
      { id: 'reports_sales_return', name: 'Sales Return Report' },
      { id: 'reports_product_wise_sales', name: 'Product Wise Sales' },
      { id: 'reports_stock', name: 'Stock As On Date' },
      { id: 'reports_profit_ledger', name: 'Profit / Ledger' },
      { id: 'reports_expense', name: 'Expense Report' },
      { id: 'reports_customer_receipts', name: 'Customer Receipts & Overdue Report' },
      { id: 'reports_supplier_payments', name: 'Supplier Payments & Payables Report' },
    ]
  },
  {
    id: 'user_management',
    name: 'User Management',
    icon: <Users size={18} />,
    permissions: [
      { id: 'master_users', name: 'Users & Roles' },
      { id: 'master_permissions', name: 'Menu Permissions' },
    ]
  }
];

const MenuPermissions = () => {
  const [roles, setRoles] = useState<any[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [activePermissions, setActivePermissions] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  
  const location = useLocation();

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    try {
      const { data } = await api.get('/roles');
      setRoles(data);
      if (data.length > 0) {
        const passedRoleId = location.state?.roleId;
        const initialRoleId = passedRoleId || data[0].id;
        
        setSelectedRoleId(initialRoleId);
        
        const targetRole = data.find((r: any) => r.id === initialRoleId) || data[0];
        setActivePermissions(targetRole.permissions || []);
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to load roles');
    }
  };

  const handleRoleChange = async (roleId: number) => {
    setSelectedRoleId(roleId);
    try {
      const { data } = await api.get(`/roles/${roleId}`);
      setActivePermissions(data.permissions || []);
    } catch (error) {
      toast.error('Failed to load permissions');
    }
  };

  const togglePermission = (permId: string) => {
    setActivePermissions(prev => 
      prev.includes(permId) 
        ? prev.filter(p => p !== permId)
        : [...prev, permId]
    );
  };

  const toggleModule = (moduleId: string, isChecked: boolean) => {
    const modulePerms = MODULES.find(m => m.id === moduleId)?.permissions.map(p => p.id) || [];
    if (isChecked) {
      setActivePermissions(prev => [...new Set([...prev, ...modulePerms])]);
    } else {
      setActivePermissions(prev => prev.filter(p => !modulePerms.includes(p)));
    }
  };

  const handleSave = async () => {
    if (!selectedRoleId) return;
    setIsSaving(true);
    try {
      await api.put(`/roles/${selectedRoleId}/permissions`, { permissions: activePermissions });
      
      const storedUser = localStorage.getItem('user');
      let isCurrentUserRole = false;
      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          if (parsed.roleId === selectedRoleId) {
            isCurrentUserRole = true;
            parsed.role = parsed.role || {};
            parsed.role.permissions = activePermissions;
            localStorage.setItem('user', JSON.stringify(parsed));
          }
        } catch (e) {}
      }

      toast.success('Permissions saved successfully!');
      
      if (isCurrentUserRole) {
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    } catch (error) {
      toast.error('Failed to save permissions');
    } finally {
      setIsSaving(false);
    }
  };

  const selectAll = () => {
    const allPerms = MODULES.flatMap(m => m.permissions.map(p => p.id));
    setActivePermissions(allPerms);
  };

  const deselectAll = () => {
    setActivePermissions([]);
  };

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) return;
    try {
      const { data } = await api.post('/roles', { name: newRoleName });
      toast.success('Role created successfully!');
      setNewRoleName('');
      setIsCreatingRole(false);
      await fetchRoles();
      setSelectedRoleId(data.id);
    } catch (error) {
      toast.error('Failed to create role');
    }
  };

  const handleDeleteRole = () => {
    if (!selectedRoleId) return;
    setDeleteConfirmationText('');
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteRole = async () => {
    if (!selectedRoleId || deleteConfirmationText !== 'DELETE') return;
    try {
      await api.delete(`/roles/${selectedRoleId}`);
      toast.success('Role deleted successfully!');
      setIsDeleteModalOpen(false);
      fetchRoles();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete role');
    }
  };

  return (
    <div className="absolute inset-0 bg-[#F3F4F6] flex flex-col font-sans overflow-hidden">
      {/* Header */}
      <div className="bg-[#0F172A] text-white px-4 py-2 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div>
          <h1 className="text-base font-bold flex items-center gap-2">
            <Shield className="text-[#3B82F6]" size={16} /> 
            Menu Permissions
          </h1>
          <p className="text-black font-bold text-xs">Control module access</p>
        </div>
        <div className="flex gap-2 items-center">
          <Link
            to="/master/users"
            className="bg-indigo-50/10 text-indigo-200 hover:text-white px-3 py-1.5 rounded font-bold text-xs flex items-center gap-1.5 transition-colors border border-indigo-400/30 hover:bg-indigo-500/30 mr-2"
          >
            <Users size={14} /> Users & Roles
          </Link>
          <button onClick={deselectAll} className="text-black font-bold hover:text-white px-3 py-1.5 rounded font-bold text-xs transition-colors border border-[#334155] hover:bg-[#1E293B]">
            Uncheck All
          </button>
          <button onClick={selectAll} className="text-[#3B82F6] hover:text-white px-3 py-1.5 rounded font-bold text-xs transition-colors border border-[#3B82F6] hover:bg-[#3B82F6]">
            Select All
          </button>
          <button 
            onClick={handleSave} 
            disabled={isSaving}
            className="bg-[#10B981] hover:bg-[#059669] text-white px-4 py-1.5 rounded font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
          >
            <Save size={14} /> {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          
          {/* Role Selector */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-1 w-full">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                <Users size={24} />
              </div>
              <div className="flex-1 w-full max-w-md">
                <label className="text-sm font-bold text-black font-bold block mb-1">Select Role to Modify</label>
                <select 
                  value={selectedRoleId || ''}
                  onChange={(e) => handleRoleChange(Number(e.target.value))}
                  className="w-full border-0 bg-gray-50 px-4 py-2.5 rounded-lg font-bold text-black font-bold outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-500 transition-all"
                >
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>{r.name.toUpperCase()}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              {isCreatingRole ? (
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <input
                    type="text"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="Role Name..."
                    className="border-0 bg-gray-50 px-3 py-2 rounded-lg text-sm font-bold outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-500 w-full md:w-40"
                    autoFocus
                  />
                  <button onClick={handleCreateRole} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-bold">Save</button>
                  <button onClick={() => setIsCreatingRole(false)} className="bg-gray-200 hover:bg-gray-300 text-black font-bold px-3 py-2 rounded-lg text-sm font-bold">Cancel</button>
                </div>
              ) : (
                <>
                  <button 
                    onClick={() => setIsCreatingRole(true)}
                    className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                  >
                    + New Role
                  </button>
                  <button 
                    onClick={handleDeleteRole}
                    className="bg-red-50 text-red-600 hover:bg-red-100 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                  >
                    Delete Role
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Permissions Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {MODULES.map(module => {
              const modulePermIds = module.permissions.map(p => p.id);
              const isAllChecked = modulePermIds.length > 0 && modulePermIds.every(id => activePermissions.includes(id));
              const isSomeChecked = modulePermIds.some(id => activePermissions.includes(id));

              return (
                <div key={module.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col hover:border-blue-300 transition-colors">
                  <div className={`px-5 py-3 border-b flex items-center justify-between ${isAllChecked ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-gray-200'}`}>
                    <h3 className={`font-bold flex items-center gap-2 ${isAllChecked ? 'text-blue-700' : 'text-black font-bold'}`}>
                      {module.icon} {module.name}
                    </h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={isAllChecked}
                        ref={input => {
                          if (input) input.indeterminate = isSomeChecked && !isAllChecked;
                        }}
                        onChange={(e) => toggleModule(module.id, e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  
                  <div className="p-2 flex-1 flex flex-col gap-1">
                    {module.permissions.map(perm => {
                      const isChecked = activePermissions.includes(perm.id);
                      return (
                        <label 
                          key={perm.id} 
                          onClick={(e) => {
                            e.preventDefault(); // Prevent double trigger
                            togglePermission(perm.id);
                          }}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${isChecked ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}
                        >
                          <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isChecked ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}>
                            {isChecked && <Check size={14} className="text-white" />}
                          </div>
                          <span className={`text-sm font-bold ${isChecked ? 'text-black font-bold' : 'text-black font-bold'}`}>
                            {perm.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-red-50/50">
              <h2 className="text-xl font-bold text-red-600 flex items-center gap-2">
                <Shield size={24} />
                Delete Role
              </h2>
            </div>
            <div className="p-6">
              <p className="text-black font-bold text-sm mb-4 font-bold">
                Are you sure you want to delete this role? This action cannot be undone and may affect users assigned to this role.
              </p>
              <label className="block text-sm font-bold text-black font-bold mb-2">
                Type <span className="text-red-600 font-mono bg-red-50 px-1 rounded border border-red-100">DELETE</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                placeholder="DELETE"
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 font-mono uppercase"
              />
              <div className="mt-8 flex justify-end gap-3">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="px-5 py-2.5 text-black font-bold hover:bg-gray-100 rounded-xl font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteRole}
                  disabled={deleteConfirmationText !== 'DELETE'}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-red-200"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MenuPermissions;
