import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { Field } from '../../../components/ui/field';
import { ApiError } from '../../../lib/api/api-error';
import { getRedirectPath } from '../lib/get-redirect-path';
import { getAuthErrorMessage } from '../lib/error-messages';
import { useLogin } from '../queries/hooks';
import { loginSchema, type LoginFormValues } from '../schemas/login-schema';

/**
 * Owns form state (React Hook Form) and validation (Zod) only — the
 * mutation itself, the API call, and the HTTP/error normalization all
 * live below this in `useLogin`/`authApi`/`apiClient`. This component
 * never constructs a `fetch` call or an `Authorization` header itself.
 *
 * Field-level validation errors (empty email, etc.) stay inline, next to
 * the field they're about. The submit *outcome* — invalid credentials,
 * rate-limited, network failure, success — is a toast, not a second
 * inline banner: exactly one of each per the two different kinds of
 * feedback (§ 37), never both for the same message.
 */
export function LoginForm() {
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();

  const onSubmit = handleSubmit((values) => {
    login.mutate(values, {
      onSuccess: () => {
        toast.success('Signed in');
        void navigate(getRedirectPath(location.state), { replace: true });
      },
      onError: (error) => {
        toast.error('Sign in failed', {
          description:
            error instanceof ApiError
              ? getAuthErrorMessage(error)
              : 'Something went wrong. Please try again.',
        });
        setFocus('email');
      },
    });
  });

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate>
      <div className="space-y-4">
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
      </div>

      <Button type="submit" className="mt-6 w-full" disabled={login.isPending}>
        {login.isPending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
