import { Link } from 'react-router';
import { Card } from '../components/ui/card';
import { RegisterForm } from '../features/auth/components/register-form';

export function RegisterPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">Create your account</h1>
        <p className="text-muted mt-1 text-sm">
          Join EventHub to create and RSVP to events.
        </p>
      </div>

      <Card>
        <RegisterForm />
      </Card>

      <p className="text-muted mt-6 text-center text-sm">
        Already have an account?{' '}
        <Link
          to="/login"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
