import { createContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        checkUserLoggedIn();
    }, []);

    // Check if user is logged in
    const checkUserLoggedIn = async () => {
        try {
            // Check if token exists in localStorage
            const token = localStorage.getItem('token');

            if (!token) {
                setLoading(false);
                return;
            }

            // Verify token with backend
            const config = {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            };

            const { data } = await axios.get('http://localhost:5000/api/auth/me', config);
            setUser(data);
        } catch (err) {
            localStorage.removeItem('token');
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    // Register user
    const register = async (userData) => {
        setError(null);
        try {
            const { data } = await axios.post('http://localhost:5000/api/auth/register', userData);
            localStorage.setItem('token', data.token);
            setUser(data);
            return data;
        } catch (err) {
            setError(err.response?.data?.message || 'Registration failed');
            throw err;
        }
    };

    // Login user
    const login = async (userData) => {
        setError(null);
        try {
            const { data } = await axios.post('http://localhost:5000/api/auth/login', userData);
            localStorage.setItem('token', data.token);
            setUser(data);
            return data;
        } catch (err) {
            setError(err.response?.data?.message || 'Login failed');
            throw err;
        }
    };

    // Logout user
    const logout = () => {
        localStorage.removeItem('token');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, register, login, logout, loading, error }}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;
