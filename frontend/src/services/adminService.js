import axios from 'axios';

const API_URL = 'http://localhost:5000/api/admin';

// Get admin stats
const getStats = async (token) => {
    const config = {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };
    const response = await axios.get(`${API_URL}/stats`, config);
    return response.data;
};

// Get all users
const getUsers = async (token) => {
    const config = {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };
    const response = await axios.get(`${API_URL}/users`, config);
    return response.data;
};

// Manage user (block/delete)
const manageUser = async (userId, action, token) => {
    const config = {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };
    const response = await axios.post(`${API_URL}/users/manage`, { userId, action }, config);
    return response.data;
};

// Get settings
const getSettings = async (token) => {
    const config = {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };
    const response = await axios.get(`${API_URL}/settings`, config);
    return response.data;
};

// Update settings
const updateSettings = async (settings, token) => {
    const config = {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };
    const response = await axios.post(`${API_URL}/settings`, settings, config);
    return response.data;
};

const adminService = {
    getStats,
    getUsers,
    manageUser,
    getSettings,
    updateSettings,
};

export default adminService;
