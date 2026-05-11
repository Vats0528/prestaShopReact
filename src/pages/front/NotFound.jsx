import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="panel">
      <h2>Page introuvable</h2>
      <p className="muted">Le contenu demande n existe pas.</p>
      <Link className="link" to="/">Retour a l accueil</Link>
    </div>
  );
}
