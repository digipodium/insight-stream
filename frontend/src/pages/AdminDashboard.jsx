import React, { useState } from 'react';
import AdminStats from '../components/AdminStats';
import AdminUserTable from '../components/AdminUserTable';
import AdminSettings from '../components/AdminSettings';
import { LayoutDashboard, Users, Settings } from 'lucide-react';

const AdminDashboard = () => {
    const [activeTab, setActiveTab] = useState('overview');

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin Dashboard</h1>

            {/* Tabs */}
            <div className="flex space-x-4 mb-6 border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`pb-2 px-1 flex items-center space-x-2 ${activeTab === 'overview' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <LayoutDashboard size={18} />
                    <span>Overview</span>
                </button>
                <button
                    onClick={() => setActiveTab('users')}
                    className={`pb-2 px-1 flex items-center space-x-2 ${activeTab === 'users' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Users size={18} />
                    <span>User Management</span>
                </button>
                <button
                    onClick={() => setActiveTab('settings')}
                    className={`pb-2 px-1 flex items-center space-x-2 ${activeTab === 'settings' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Settings size={18} />
                    <span>Settings</span>
                </button>
            </div>

            {/* Content */}
            {activeTab === 'overview' && (
                <div>
                    <AdminStats />
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Users</h2>
                    <AdminUserTable />
                </div>
            )}

            {activeTab === 'users' && <AdminUserTable />}

            {activeTab === 'settings' && <AdminSettings />}
        </div>
    );
};

export default AdminDashboard;
