import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api/api-client';
import { Button } from '../components/ui/button';

interface HealthResponse {
  status: string;
}

/**
 * Placeholder home page (Phase 1 § 1/§ 19) plus a manual API-connectivity
 * check. The check is deliberately NOT automatic on mount — it fires from
 * a button's `onClick`, not a `useEffect`, per § 22 ("no useEffect for data
 * fetching") — and it hits the generic, non-versioned `/health` endpoint
 * through the raw `apiClient`, not a feature API module, so this stays
 * infrastructure verification rather than an EventHub feature call.
 */
export function HomePage() {
  const health = useQuery({
    queryKey: ['health-check'],
    queryFn: () => apiClient.get<HealthResponse>('/health'),
    enabled: false,
    retry: false,
  });

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">EventHub</h1>
        <p className="text-muted mt-1">
          Frontend foundation — Phase 1. Routing, providers, and the API client
          are wired up; features come next.
        </p>
      </div>

      <div className="rounded-lg border border-border p-4">
        <h2 className="font-semibold">API connectivity check</h2>
        <p className="text-muted mt-1 text-sm">
          Calls the backend's <code>/health</code> endpoint through the API
          client to confirm <code>VITE_API_URL</code> is configured correctly.
        </p>
        <Button
          className="mt-3"
          onClick={() => void health.refetch()}
          disabled={health.isFetching}
        >
          {health.isFetching ? 'Checking…' : 'Check API connection'}
        </Button>

        {health.isSuccess && (
          <p className="mt-3 text-sm text-green-600" role="status">
            Connected — backend responded with status "{health.data.status}".
          </p>
        )}
        {health.isError && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {health.error.message}
          </p>
        )}
      </div>
    </div>
  );
}
