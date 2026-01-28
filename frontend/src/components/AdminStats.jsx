import React, { useEffect, useState, useContext } from 'react';
import StatisticsCard from './StatisticsCard';
import adminService from '../services/adminService';
import AuthContext from '../context/AuthContext';
import { Users, FileText, MessageSquare } from 'lucide-react';

const AdminStats = () => {
    const { user } = useContext(AuthContext);
    const [stats, setStats] = useState({ totalUsers: 0, totalFiles: 0, totalPrompts: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const data = await adminService.getStats(user.token);
                if (data.success) {
                    setStats(data.stats);
                }
            } catch (error) {
                console.error('Failed to fetch admin stats', error);
            } finally {
                setLoading(false);
            }
        };

        if (user && user.token) {
            fetchStats();
        }
    }, [user]);

    if (loading) return <div className="p-4 text-center">Loading stats...</div>

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <StatisticsCard
                title="Total Users"
                value={stats.totalUsers}
                icon={Users}
                color="blue"
            />
            <StatisticsCard
                title="Total Files"
                value={stats.totalFiles}
                icon={FileText}
                color="green"
            />
            <StatisticsCard
                title="Total Prompts"
                value={stats.totalPrompts}
                icon={MessageSquare}
                color="purple"
            />
        </div>
    );
};

export default AdminStats;
