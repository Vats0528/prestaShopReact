import { createContext, useContext, useState } from "react";

const AuthContext = createContext(null);

// Identifiants backoffice — modifiez ici
const ADMIN_USER = "admin";
const ADMIN_PASS = "admin123";

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(
    () => sessionStorage.getItem("ps_admin") === "1"
  );

  const login = (user, pass) => {
    if (user === ADMIN_USER && pass === ADMIN_PASS) {
      sessionStorage.setItem("ps_admin", "1");
      setAdmin(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    sessionStorage.removeItem("ps_admin");
    setAdmin(false);
  };

  return (
    <AuthContext.Provider value={{ admin, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}