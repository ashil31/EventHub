import { Card } from '../components/ui/card';
import { useAuth } from '../features/auth/queries/hooks';

/**
 * Minimal protected placeholder — proves the `RequireAuth` boundary end
 * to end (§ 49). Event management UI is a later phase; this phase is
 * authentication only. Sign-out lives in the header nav (`RootLayout`),
 * not duplicated here.
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
        <p className="text-muted mt-4 text-sm">
          You're signed in. Event browsing, creation, and RSVP live here in a
          later phase.
        </p>
      </Card>
    </div>
  );
}
