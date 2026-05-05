/**
 * Register Page
 *
 * Algorithme — Password Strength (Shannon-inspired):
 * - Score multi-critères pondéré (longueur, classes, entropie estimée)
 * - Détection de patterns courants (séquences, répétitions, mots du dico)
 * - Bonus de longueur (log-scale) — résistance brute-force ≈ log2(charset^len)
 *
 * Le résultat est ramené sur 0..4 pour l'UI (5 niveaux).
 */

'use client';

import { useState, useId, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  Mail,
  Lock,
  User,
  ArrowRight,
  Check,
  AlertCircle,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─────────────────────────────────────────────
   Algorithme : score de mot de passe 0..4
   ───────────────────────────────────────────── */

const COMMON_PATTERNS = [
  /(.)\1{2,}/, // 3+ char répétés
  /0123|1234|2345|3456|4567|5678|6789|9876|8765|7654/, // séquences num
  /abcd|bcde|cdef|qwer|wert|erty|asdf|sdfg|zxcv/i, // séquences clavier
  /password|motdepasse|admin|azerty|qwerty/i, // mots interdits
];

function scorePassword(pwd: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  checks: { passed: boolean; label: string }[];
} {
  const checks = [
    { passed: pwd.length >= 8, label: 'Au moins 8 caractères' },
    { passed: /[A-Z]/.test(pwd), label: 'Une lettre majuscule' },
    { passed: /[a-z]/.test(pwd), label: 'Une lettre minuscule' },
    { passed: /[0-9]/.test(pwd), label: 'Un chiffre' },
    { passed: /[^A-Za-z0-9]/.test(pwd), label: 'Un caractère spécial' },
  ];

  if (!pwd) {
    return { score: 0, label: 'Vide', checks };
  }

  // Charset estimé pour entropie
  let charset = 0;
  if (/[a-z]/.test(pwd)) charset += 26;
  if (/[A-Z]/.test(pwd)) charset += 26;
  if (/[0-9]/.test(pwd)) charset += 10;
  if (/[^A-Za-z0-9]/.test(pwd)) charset += 32;

  // Entropie ≈ longueur × log2(charset)
  const entropy = pwd.length * Math.log2(Math.max(charset, 2));

  // Pénalité patterns
  let penalty = 0;
  for (const pat of COMMON_PATTERNS) {
    if (pat.test(pwd)) penalty += 8;
  }

  const adjusted = Math.max(0, entropy - penalty);

  // Mapping non-linéaire vers 0..4
  let score: 0 | 1 | 2 | 3 | 4;
  if (adjusted < 28) score = 0;
  else if (adjusted < 40) score = 1;
  else if (adjusted < 60) score = 2;
  else if (adjusted < 80) score = 3;
  else score = 4;

  const labels = ['Très faible', 'Faible', 'Moyen', 'Fort', 'Excellent'];
  return { score, label: labels[score], checks };
}

const STRENGTH_COLORS = [
  'bg-destructive',
  'bg-destructive/80',
  'bg-warning',
  'bg-success/80',
  'bg-success',
];

export default function RegisterPage() {
  const router = useRouter();
  const usernameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const strength = useMemo(
    () => scorePassword(formData.password),
    [formData.password]
  );

  const passwordMatch =
    formData.confirmPassword.length > 0 &&
    formData.password === formData.confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      setIsLoading(false);
      return;
    }

    if (strength.score < 2) {
      setError('Mot de passe trop faible');
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username,
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Une erreur est survenue');
      } else {
        router.push('/login?callbackUrl=/conversations');
      }
    } catch {
      setError('Erreur réseau. Réessayez.');
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
        <h1 className="text-3xl font-semibold tracking-tight">
          Créer votre compte
        </h1>
        <p className="text-sm text-muted-foreground">
          Rejoignez Cipher en moins d&apos;une minute. Aucune carte bancaire
          requise.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Username */}
        <div className="space-y-2">
          <Label htmlFor={usernameId} className="text-sm font-medium">
            Nom d&apos;utilisateur
          </Label>
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              id={usernameId}
              type="text"
              autoComplete="username"
              placeholder="alice_42"
              minLength={3}
              maxLength={20}
              pattern="[a-zA-Z0-9_]+"
              value={formData.username}
              onChange={(e) =>
                setFormData({ ...formData, username: e.target.value })
              }
              required
              className="pl-10 h-11"
            />
          </div>
        </div>

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

        {/* Password + strength */}
        <div className="space-y-2">
          <Label htmlFor={passwordId} className="text-sm font-medium">
            Mot de passe
          </Label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              id={passwordId}
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              required
              className="pl-10 h-11"
            />
          </div>

          {/* Strength meter */}
          <AnimatePresence>
            {formData.password.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2 overflow-hidden"
              >
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={cn(
                        'h-1 flex-1 rounded-full transition-all duration-300',
                        i <= strength.score
                          ? STRENGTH_COLORS[strength.score]
                          : 'bg-muted'
                      )}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Force :{' '}
                    <span
                      className={cn(
                        'font-medium',
                        strength.score >= 3
                          ? 'text-success'
                          : strength.score >= 2
                            ? 'text-warning'
                            : 'text-destructive'
                      )}
                    >
                      {strength.label}
                    </span>
                  </span>
                </div>

                {/* Checklist */}
                <ul className="grid grid-cols-1 gap-1 mt-2">
                  {strength.checks.map((c) => (
                    <li
                      key={c.label}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span
                        className={cn(
                          'w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors',
                          c.passed
                            ? 'bg-success/20 text-success'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {c.passed ? (
                          <Check className="w-2.5 h-2.5" strokeWidth={3} />
                        ) : (
                          <X className="w-2.5 h-2.5" strokeWidth={3} />
                        )}
                      </span>
                      <span
                        className={cn(
                          c.passed
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                        )}
                      >
                        {c.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Confirm password */}
        <div className="space-y-2">
          <Label htmlFor={confirmId} className="text-sm font-medium">
            Confirmer le mot de passe
          </Label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              id={confirmId}
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={(e) =>
                setFormData({ ...formData, confirmPassword: e.target.value })
              }
              required
              className={cn(
                'pl-10 pr-10 h-11',
                formData.confirmPassword && !passwordMatch
                  ? 'border-destructive/60 focus-visible:ring-destructive/40'
                  : ''
              )}
            />
            {formData.confirmPassword && (
              <span
                className={cn(
                  'absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center',
                  passwordMatch
                    ? 'bg-success/20 text-success'
                    : 'bg-destructive/20 text-destructive'
                )}
              >
                {passwordMatch ? (
                  <Check className="w-3 h-3" strokeWidth={3} />
                ) : (
                  <X className="w-3 h-3" strokeWidth={3} />
                )}
              </span>
            )}
          </div>
        </div>

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
          disabled={isLoading || strength.score < 2 || !passwordMatch}
          className={cn(
            'w-full h-11 font-medium relative overflow-hidden group',
            'bg-brand-gradient text-white border-0',
            'hover:shadow-lg hover:shadow-primary/25 transition-all duration-300',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <span className="flex items-center gap-2">
              Créer mon compte
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          )}
        </Button>

        {/* Legal */}
        <p className="text-xs text-center text-muted-foreground leading-relaxed">
          En vous inscrivant, vous acceptez nos{' '}
          <Link href="/terms" className="underline hover:text-foreground">
            conditions
          </Link>{' '}
          et notre{' '}
          <Link href="/privacy" className="underline hover:text-foreground">
            politique de confidentialité
          </Link>
          .
        </p>
      </form>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-wider">
          <span className="bg-background px-3 text-muted-foreground">
            Déjà un compte ?
          </span>
        </div>
      </div>

      <p className="text-sm text-center">
        <Link
          href="/login"
          className="font-medium text-foreground hover:text-primary transition-colors"
        >
          Se connecter →
        </Link>
      </p>
    </motion.div>
  );
}
