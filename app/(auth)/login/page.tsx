/**
 * Login Page
 *
 * Architecture:
 * - Client Component (form interactions)
 * - 2FA step machine (état needs2FA)
 * - Suspense wrapper pour useSearchParams (callbackUrl)
 * - Redirection forcée via window.location pour invalider cache RSC
 */

'use client';

import { useState, Suspense, useId } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  Lock,
  Mail,
  ArrowRight,
  Shield,
  AlertCircle,
  KeyRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/conversations';

  const emailId = useId();
  const passwordId = useId();
  const totpId = useId();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [needs2FA, setNeeds2FA] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    totpCode: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        email: formData.email,
        password: formData.password,
        totpCode: formData.totpCode || undefined,
        redirect: false,
      });

      if (result?.error) {
        if (result.error === '2FA_REQUIRED') {
          setNeeds2FA(true);
          setError('');
        } else if (result.error === 'INVALID_2FA') {
          setError('Code 2FA invalide');
        } else {
          setError('Email ou mot de passe incorrect');
        }
      } else if (result && !result.error) {
        window.location.href = callbackUrl;
        return;
      } else {
        setError('Erreur de connexion inattendue');
      }
    } catch {
      setError('Une erreur est survenue. Réessayez.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-8"
    >
      {/* Header */}
      <div className="space-y-2">
        <AnimatePresence mode="wait">
          {needs2FA ? (
            <motion.div
              key="2fa-header"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              className="space-y-2"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/50 text-xs font-medium text-accent-foreground">
                <Shield className="w-3 h-3" />
                Étape 2 sur 2
              </div>
              <h1 className="text-3xl font-semibold tracking-tight">
                Vérification 2FA
              </h1>
              <p className="text-sm text-muted-foreground">
                Entrez le code à 6 chiffres généré par votre application
                d&apos;authentification.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="login-header"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              className="space-y-2"
            >
              <h1 className="text-3xl font-semibold tracking-tight">
                Bon retour parmi nous
              </h1>
              <p className="text-sm text-muted-foreground">
                Connectez-vous pour reprendre vos conversations chiffrées.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <AnimatePresence mode="wait" initial={false}>
          {needs2FA ? (
            <motion.div
              key="2fa"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.25 }}
              className="space-y-5"
            >
              <div className="space-y-2">
                <Label htmlFor={totpId} className="text-sm font-medium">
                  Code d&apos;authentification
                </Label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id={totpId}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    autoComplete="one-time-code"
                    autoFocus
                    placeholder="123456"
                    value={formData.totpCode}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        totpCode: e.target.value.replace(/\D/g, ''),
                      })
                    }
                    required
                    className="pl-10 h-12 text-lg tracking-[0.4em] font-mono text-center"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Le code change toutes les 30 secondes.
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="login"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.25 }}
              className="space-y-5"
            >
              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor={emailId} className="text-sm font-medium">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id={emailId}
                    type="email"
                    autoComplete="email"
                    placeholder="vous@exemple.com"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    required
                    className="pl-10 h-11"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={passwordId} className="text-sm font-medium">
                    Mot de passe
                  </Label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    Oublié ?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id={passwordId}
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    required
                    className="pl-10 h-11"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -4, height: 0 }}
              className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg bg-destructive/10 text-destructive border border-destructive/20"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submit */}
        <Button
          type="submit"
          disabled={isLoading}
          className={cn(
            'w-full h-11 font-medium relative overflow-hidden group',
            'bg-brand-gradient text-white border-0',
            'hover:shadow-lg hover:shadow-primary/25 transition-all duration-300'
          )}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <span className="flex items-center gap-2">
              {needs2FA ? 'Vérifier' : 'Se connecter'}
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          )}
        </Button>

        {needs2FA && (
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setNeeds2FA(false);
              setError('');
              setFormData({ ...formData, totpCode: '' });
            }}
          >
            ← Retour
          </Button>
        )}
      </form>

      {!needs2FA && (
        <>
          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wider">
              <span className="bg-background px-3 text-muted-foreground">
                Nouveau ici ?
              </span>
            </div>
          </div>

          <p className="text-sm text-center text-muted-foreground">
            <Link
              href="/register"
              className="font-medium text-foreground hover:text-primary transition-colors"
            >
              Créer un compte gratuit
            </Link>{' '}
            · 2FA · Chiffrement E2E
          </p>
        </>
      )}
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
