import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <section className="page-card">
      <h2>Page not found</h2>
      <p>The page you requested does not exist.</p>
      <Link to="/boards" className="btn-link">
        Go to Boards
      </Link>
    </section>
  );
}