import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-3 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-muted">The page you're looking for doesn't exist.</p>
      <Link to="/" className="text-primary underline underline-offset-4">
        Back to home
      </Link>
    </div>
  );
}
