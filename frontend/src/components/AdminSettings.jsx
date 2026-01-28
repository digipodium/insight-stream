import React, { useEffect, useState, useContext } from 'react';
import adminService from '../services/adminService';
import AuthContext from '../context/AuthContext';
import { Save } from 'lucide-react';

const AdminSettings = () => {
    const { user } = useContext(AuthContext);
    const [settings, setSettings] = useState({ maxFileSize: 10 });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const data = await adminService.getSettings(user.token);
                if (data.success) {
                    setSettings(data.settings);
                }
            } catch (error) {
                console.error('Failed to fetch settings', error);
            }
        };

        if (user && user.token) {
            fetchSettings();
        }
    }, [user]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const data = await adminService.updateSettings(settings, user.token);
            if (data.success) {
                alert('Settings updated successfully');
            }
        } catch (error) {
            console.error('Failed to update settings', error);
            alert('Failed to update settings');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">System Configuration</h3>
            <form onSubmit={handleSubmit}>
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Max File Size (MB)
                    </label>
                    <input
                        type="number"
                        value={settings.maxFileSize}
                        onChange={(e) => setSettings({ ...settings, maxFileSize: e.target.value })}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                        min="1"
                        max="100"
                    />
                    <p className="mt-1 text-sm text-gray-500">
                        Maximum allowed size for uploaded CSV files. Max hard limit is 100MB.
                    </p>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                    <Save size={16} className="mr-2" />
                    {loading ? 'Saving...' : 'Save Settings'}
                </button>
            </form>
        </div>
    );
};

export default AdminSettings;
