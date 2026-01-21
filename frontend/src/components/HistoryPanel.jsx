import React, { useState, useEffect } from 'react';
import { Calendar, FileText, ChevronRight, Loader2, Clock } from 'lucide-react';
import { dataAPI } from '../services/api';

const HistoryPanel = ({ onLoadDataset, onClose }) => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            const response = await dataAPI.getHistory();
            if (response.success) {
                setHistory(response.datasets);
            }
        } catch (err) {
            setError('Failed to load history');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl mx-auto overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-500" />
                    Your History
                </h3>
                <button
                    onClick={onClose}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                    Close
                </button>
            </div>

            <div className="max-h-[600px] overflow-y-auto p-4">
                {loading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                ) : error ? (
                    <div className="text-center py-8 text-red-500">
                        {error}
                    </div>
                ) : history.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                        <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>No datasets found in your history.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {history.map((dataset) => (
                            <button
                                key={dataset._id}
                                onClick={() => onLoadDataset(dataset._id)}
                                className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-gray-200 dark:border-gray-700 rounded-lg transition-all group"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="p-2 bg-white dark:bg-gray-800 rounded-md shadow-sm text-blue-500 group-hover:text-blue-600">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <div className="text-left">
                                        <h4 className="font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                            {dataset.fileName}
                                        </h4>
                                        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            <span className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {formatDate(dataset.createdAt)}
                                            </span>
                                            <span>•</span>
                                            <span>{dataset.rowCount?.toLocaleString()} rows</span>
                                            <span>•</span>
                                            <span>{dataset.columnCount} columns</span>
                                        </div>
                                    </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default HistoryPanel;
