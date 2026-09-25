import { Link } from 'react-router';
import { Card } from '../components/ui/card';
import { LoginForm } from '../features/auth/components/login-form';

export function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="text-muted mt-1 text-sm">Welcome back to EventHub.</p>
      </div>

      <Card>
        <LoginForm />
      </Card>

      <p className="text-muted mt-6 text-center text-sm">
        Don't have an account?{' '}
        <Link
          to="/register"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
