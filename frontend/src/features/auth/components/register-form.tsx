import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { Field } from '../../../components/ui/field';
import { ApiError } from '../../../lib/api/api-error';
import { getAuthErrorMessage } from '../lib/error-messages';
import { useRegister } from '../queries/hooks';
import {
  registerSchema,
  type RegisterFormValues,
} from '../schemas/register-schema';

/**
 * Registration does not authenticate the user (confirmed in Phase 2 —
 * the backend's `POST /auth/register` returns only the created account,
 * no token), so a successful submit routes to `/login` rather than to a
 * protected page — there is no session to land in yet. The "account
 * created" confirmation is a toast (fires once, at the moment of
 * success) rather than a banner threaded through router state into the
 * next page.
 */
export function RegisterForm() {
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });
  const registerAccount = useRegister();
  const navigate = useNavigate();

  const onSubmit = handleSubmit((values) => {
    registerAccount.mutate(values, {
      onSuccess: () => {
        toast.success('Account created', {
          description: 'Sign in to continue.',
        });
        void navigate('/login', { replace: true });
      },
      onError: (error) => {
        toast.error('Registration failed', {
          description:
            error instanceof ApiError
              ? getAuthErrorMessage(error)
              : 'Something went wrong. Please try again.',
        });
        setFocus('name');
      },
    });
  });

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate>
      <div className="space-y-4">
        <Field
          label="Name"
          type="text"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />
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
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
      </div>

      <Button
        type="submit"
        className="mt-6 w-full"
        disabled={registerAccount.isPending}
      >
        {registerAccount.isPending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
