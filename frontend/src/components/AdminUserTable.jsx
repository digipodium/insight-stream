import React, { useEffect, useState, useContext } from 'react';
import adminService from '../services/adminService';
import AuthContext from '../context/AuthContext';
import { Trash2, Ban, CheckCircle } from 'lucide-react';

const AdminUserTable = () => {
    const { user } = useContext(AuthContext);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const data = await adminService.getUsers(user.token);
            if (data.success) {
                setUsers(data.users);
            }
        } catch (error) {
            console.error('Failed to fetch users', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user && user.token) {
            fetchUsers();
        }
    }, [user]);

    const handleAction = async (userId, action) => {
        if (!window.confirm(`Are you sure you want to ${action} this user?`)) return;

        try {
            const data = await adminService.manageUser(userId, action, user.token);
            if (data.success) {
                alert(data.message);
                fetchUsers(); // Refresh list
            }
        } catch (error) {
            console.error('Action failed', error);
            alert('Action failed: ' + (error.response?.data?.message || error.message));
        }
    };

    if (loading) return <div className="p-4 text-center">Loading users...</div>

    return (
        <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Files / Prompts</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {users.map((u) => (
                            <tr key={u._id}>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium text-gray-900">{u.name}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-gray-500">{u.email}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-gray-500">{u.fileCount} files / {u.promptCount} prompts</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${u.isAdmin ? 'bg-purple-100 text-purple-800' : (u.isBlocked ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800')}`}>
                                        {u.isAdmin ? 'Admin' : (u.isBlocked ? 'Blocked' : 'Active')}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                    {!u.isAdmin && (
                                        <div className="flex space-x-2">
                                            {u.isBlocked ? (
                                                <button onClick={() => handleAction(u._id, 'unblock')} className="text-green-600 hover:text-green-900" title="Unblock">
                                                    <CheckCircle size={18} />
                                                </button>
                                            ) : (
                                                <button onClick={() => handleAction(u._id, 'block')} className="text-orange-600 hover:text-orange-900" title="Block">
                                                    <Ban size={18} />
                                                </button>
                                            )}
                                            <button onClick={() => handleAction(u._id, 'delete')} className="text-red-600 hover:text-red-900" title="Delete">
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AdminUserTable;
