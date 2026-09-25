import { Link } from 'react-router';
import { Button } from '../components/ui/button';

/**
 * The application's public landing page (Phase 1 § 1/§ 19). The Phase-1
 * manual API-connectivity check that used to live here was dev scaffolding
 * for verifying `VITE_API_URL` during early setup — removed in the Phase 8
 * production audit (§ 39/§ 64) since it has no value to a real user and a
 * raw backend status string has no place on a production landing page.
 */
export function HomePage() {
  return (
    // Left-aligned, not its own separately `mx-auto`-centered box — `main`
    // (in `RootLayout`) already bounds every page to the same `max-w-6xl`
    // the navbar itself uses, so this stays flush with the navbar's own
    // left edge instead of re-centering narrower inside that shared box.
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold">EventHub</h1>
      <p className="text-muted mt-1">
        Discover events, RSVP, and manage the ones you create.
      </p>
      <Link to="/events">
        <Button className="mt-4">Browse events</Button>
      </Link>
    </div>
  );
}
