import { createContext, useContext, useState } from "react";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);

  const add = (product, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.id === product.id ? { ...i, qty: i.qty + qty } : i
        );
      }
      return [...prev, { ...product, qty }];
    });
  };

  const remove = (productId) =>
    setItems((prev) => prev.filter((i) => i.id !== productId));

  const updateQty = (productId, qty) => {
    if (qty <= 0) return remove(productId);
    setItems((prev) =>
      prev.map((i) => (i.id === productId ? { ...i, qty } : i))
    );
  };

  const clear = () => setItems([]);

  const total = items.reduce((sum, i) => sum + parseFloat(i.price || 0) * i.qty, 0);
  const count = items.reduce((sum, i) => sum + i.qty, 0);

  return (
    <CartContext.Provider value={{ items, add, remove, updateQty, clear, total, count }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}