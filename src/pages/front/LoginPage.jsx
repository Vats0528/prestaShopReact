import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCustomerIdByEmail } from "../../api/prestashopClient";
import { useCustomer } from "../../context/CustomerContext";

export default function LoginPage({ redirectTo = "/orders", message }) {
  const { setCustomer } = useCustomer();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Merci de renseigner email et mot de passe.");
      return;
    }

    setLoading(true);
    try {
      const id = await getCustomerIdByEmail(email);
      if (!id) {
        setError("Aucun client ne correspond a cet email.");
        return;
      }
      setCustomer({ id, email });
      navigate(redirectTo);
    } catch (err) {
      setError(err?.message || "Connexion impossible.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel">
      <h2>Connexion client</h2>
      <p className="muted">
        {message || "Connectez-vous pour acceder a vos commandes et valider vos achats."}
      </p>
      <form className="checkout" onSubmit={handleLogin}>
        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>Mot de passe</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <div className="callout error">{error}</div>}

        <button className="btn primary full" type="submit" disabled={loading}>
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </section>
  );
}
