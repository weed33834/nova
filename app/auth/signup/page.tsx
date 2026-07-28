'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Loader2 } from 'lucide-react';

export default function SignUpPage() {
  const { t } = useI18n();
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string; message?: string };
        setError(data.message || data.error || t('auth.signUpFailed', { defaultValue: 'Sign up failed' }));
        setLoading(false);
        return;
      }

      // Auto sign-in after successful registration.
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        // Account created but auto sign-in failed; redirect to sign-in.
        router.push('/auth/signin');
      } else {
        router.push('/');
        router.refresh();
      }
    } catch {
      setError(t('auth.signUpFailed', { defaultValue: 'Sign up failed' }));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">{t('auth.signUp', { defaultValue: 'Sign Up' })}</h1>
          <p className="text-sm text-muted-foreground">
            {t('auth.signUpDesc', {
              defaultValue: 'Create a Nova account to get started',
            })}
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('auth.name', { defaultValue: 'Name (optional)' })}</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t('auth.email', { defaultValue: 'Email' })}</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('auth.password', { defaultValue: 'Password' })}</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              {t('auth.passwordMinLength', { defaultValue: 'At least 8 characters' })}
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('auth.signUpButton', { defaultValue: 'Create Account' })}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {t('auth.haveAccount', { defaultValue: 'Already have an account?' })}{' '}
          <a href="/auth/signin" className="text-primary hover:underline">
            {t('auth.signIn', { defaultValue: 'Sign in' })}
          </a>
        </p>
      </Card>
    </div>
  );
}
