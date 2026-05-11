import { createContext, useContext, useMemo, useState } from "react";

const CustomerContext = createContext(null);
const STORAGE_KEY = "ps_customer_session";

export function CustomerProvider({ children }) {
  const [customer, setCustomer] = useState(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });

  const saveCustomer = (next) => {
    setCustomer(next);
    if (!next) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const logout = () => saveCustomer(null);
  const isAuthenticated = Boolean(customer?.id);

  const value = useMemo(
    () => ({ customer, setCustomer: saveCustomer, logout, isAuthenticated }),
    [customer]
  );

  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
}

export function useCustomer() {
  return useContext(CustomerContext);
}
