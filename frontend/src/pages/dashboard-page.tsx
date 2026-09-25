import { Card } from '../components/ui/card';
import { useAuth } from '../features/auth/queries/hooks';

/**
 * Minimal protected placeholder — proves the `RequireAuth` boundary end
 * to end (§ 49 of Phase 3). Sign-out lives in the header nav
 * (`RootLayout`), not duplicated here; "Events"/"Create event" likewise
 * (Phase 8 audit — this page's own copy used to claim those features
 * were still a "later phase" after Phases 4-7 had already shipped them).
 */
export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <h1 className="text-xl font-semibold">
          Welcome{user ? `, ${user.name}` : ''}
        </h1>
        <p className="text-muted mt-1 text-sm">{user?.email}</p>
      </Card>
    </div>
  );
}
