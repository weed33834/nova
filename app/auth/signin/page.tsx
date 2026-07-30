'use client';

import { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Github, Mail, Loader2, KeyRound } from 'lucide-react';

function SignInForm() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError(t('auth.invalidCredentials', { defaultValue: 'Invalid email or password' }));
      setLoading(false);
    } else {
      router.push(callbackUrl);
      router.refresh();
    }
  };

  const handleOAuth = (provider: string) => {
    setLoading(true);
    signIn(provider, { callbackUrl });
  };

  const handleSamlLogin = () => {
    setLoading(true);
    // The SAML login route is a GET endpoint that redirects the browser
    // to the Identity Provider. A full-page navigation is required so the
    // redirect to the (external) IdP is followed correctly.
    window.location.href = '/api/auth/saml/login';
  };

  const hasGithub = !!process.env.NEXT_PUBLIC_GITHUB_ENABLED;
  const hasGoogle = !!process.env.NEXT_PUBLIC_GOOGLE_ENABLED;
  const hasSaml = !!process.env.NEXT_PUBLIC_SAML_ENABLED;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">{t('auth.signIn', { defaultValue: 'Sign In' })}</h1>
          <p className="text-sm text-muted-foreground">
            {t('auth.signInDesc', {
              defaultValue: 'Sign in to your Nova account to continue',
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('auth.signInButton', { defaultValue: 'Sign In' })}
          </Button>
        </form>

        {(hasGithub || hasGoogle || hasSaml) && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  {t('auth.or', { defaultValue: 'Or' })}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              {hasGithub && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleOAuth('github')}
                  disabled={loading}
                >
                  <Github className="h-4 w-4 mr-2" />
                  {t('auth.signInWithGithub', { defaultValue: 'Sign in with GitHub' })}
                </Button>
              )}
              {hasGoogle && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleOAuth('google')}
                  disabled={loading}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  {t('auth.signInWithGoogle', { defaultValue: 'Sign in with Google' })}
                </Button>
              )}
              {hasSaml && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleSamlLogin}
                  disabled={loading}
                >
                  <KeyRound className="h-4 w-4 mr-2" />
                  {t('auth.signInWithSSO', { defaultValue: 'Sign in with SSO' })}
                </Button>
              )}
            </div>
          </>
        )}

        <p className="text-center text-sm text-muted-foreground">
          {t('auth.noAccount', { defaultValue: "Don't have an account?" })}{' '}
          <a href="/auth/signup" className="text-primary hover:underline">
            {t('auth.signUp', { defaultValue: 'Sign up' })}
          </a>
        </p>
      </Card>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
