import { Link, NavLink, Outlet } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { useCustomer } from "../../context/CustomerContext";

export default function ShopLayout() {
  const { count } = useCart();
  const { customer, isAuthenticated, logout } = useCustomer();

  return (
    <div className="shop-shell">
      <header className="shop-header">
        <Link className="brand" to="/">
          <span className="brand-mark">N</span>
          <span className="brand-text">NewApp</span>
        </Link>
        <nav className="shop-nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}
          >
            Accueil
          </NavLink>
          <NavLink to="/cart" className={({ isActive }) => (isActive ? "active" : "")}
          >
            Panier ({count})
          </NavLink>
          <NavLink to="/orders" className={({ isActive }) => (isActive ? "active" : "")}
          >
            Mes commandes
          </NavLink>
          {isAuthenticated ? (
            <button className="nav-action" onClick={logout}>
              {customer?.email || "Deconnexion"}
            </button>
          ) : (
            <NavLink to="/login" className={({ isActive }) => (isActive ? "active" : "")}
            >
              Connexion
            </NavLink>
          )}
        </nav>
      </header>
      <main className="shop-main">
        <Outlet />
      </main>
      <footer className="shop-footer">
        <p>Service client 7/7 — paiement a la livraison uniquement.</p>
      </footer>
    </div>
  );
}
