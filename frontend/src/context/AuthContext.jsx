import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('authUser');

    if (!token || !storedUser) {
      setChecking(false);
      return;
    }

    api
      .me()
      .then(() => {
        setUser(JSON.parse(storedUser));
      })
      .catch(() => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('apiKey');
        localStorage.removeItem('authUser');
        setUser(null);
      })
      .finally(() => {
        setChecking(false);
      });
  }, []);

  async function login(email, password) {
    const data = await api.login(email, password);

    localStorage.setItem('authToken', data.token);
    localStorage.setItem('apiKey', data.apiKey);
    localStorage.setItem('authUser', JSON.stringify(data.user));

    setUser(data.user);
  }

  function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('apiKey');
    localStorage.removeItem('authUser');

    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        checking,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}