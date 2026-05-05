/**
 * /settings — Compte, sécurité, 2FA, sessions
 */

'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  ShieldCheck,
  Loader2,
  Copy,
  Check,
  AlertCircle,
  Smartphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface SetupData {
  secret: string;
  qrCode: string;
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const [is2FAEnabled, setIs2FAEnabled] = useState<boolean | null>(null);
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then(() => {
        // L'API session ne renvoie pas twoFactorEnabled directement.
        // On expose un endpoint dédié plus tard ; pour l'instant on déduit
        // via /api/auth/2fa/setup (409 si déjà activé).
        setIs2FAEnabled(false);
      })
      .catch(() => setIs2FAEnabled(false));
  }, []);

  async function startSetup() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/2fa/setup', { method: 'POST' });
      const data = await res.json();
      if (res.status === 409) {
        setIs2FAEnabled(true);
      } else if (!res.ok) {
        setError(data.error || 'Erreur');
      } else {
        setSetupData({ secret: data.secret, qrCode: data.qrCode });
      }
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Code invalide');
      } else {
        setRecoveryCodes(data.recoveryCodes);
        setIs2FAEnabled(true);
        setSetupData(null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function disable2FA() {
    const c = prompt('Entrez votre code 2FA pour désactiver :');
    if (!c) return;
    setLoading(true);
    try {
      const res = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: c }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erreur');
      } else {
        setIs2FAEnabled(false);
      }
    } finally {
      setLoading(false);
    }
  }

  function copySecret() {
    if (!setupData) return;
    navigator.clipboard.writeText(setupData.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="max-w-2xl mx-auto px-6 py-10 lg:px-12 lg:py-12 space-y-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Paramètres</h1>
          <p className="text-sm text-muted-foreground">
            Connecté en tant que{' '}
            <span className="font-medium text-foreground">
              {session?.user?.email}
            </span>
          </p>
        </header>

        {/* === Sécurité 2FA === */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">
                Authentification à deux facteurs
              </h2>
              <p className="text-xs text-muted-foreground">
                Protégez votre compte avec un code à usage unique.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            {is2FAEnabled === null ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Chargement…
              </div>
            ) : is2FAEnabled ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-success">
                  <ShieldCheck className="w-4 h-4" />
                  Activée
                </div>
                <p className="text-xs text-muted-foreground">
                  Votre compte est protégé. Vous devrez entrer un code TOTP à
                  chaque connexion.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={disable2FA}
                  disabled={loading}
                >
                  Désactiver
                </Button>
              </div>
            ) : !setupData ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Aucune authentification à deux facteurs configurée.
                </p>
                <Button onClick={startSetup} disabled={loading}>
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Activer le 2FA'
                  )}
                </Button>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key="setup"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-5"
                >
                  <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-accent/40 text-xs">
                    <Smartphone className="w-4 h-4 mt-0.5 shrink-0" />
                    <p>
                      Scannez ce QR code avec Google Authenticator, Authy, 1Password
                      ou Bitwarden, puis entrez le code à 6 chiffres généré.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
                    <Image
                      src={setupData.qrCode}
                      alt="2FA QR code"
                      width={180}
                      height={180}
                      unoptimized
                      className="rounded-xl border border-border bg-white p-2"
                    />

                    <div className="flex-1 w-full space-y-3">
                      <div>
                        <Label className="text-xs">Clé secrète (manuel)</Label>
                        <div className="mt-1 flex gap-2">
                          <code className="flex-1 px-3 py-2 text-xs font-mono bg-muted rounded-lg break-all">
                            {setupData.secret}
                          </code>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={copySecret}
                            aria-label="Copier"
                          >
                            {copied ? (
                              <Check className="w-4 h-4 text-success" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="code" className="text-xs">
                          Code de vérification
                        </Label>
                        <Input
                          id="code"
                          inputMode="numeric"
                          pattern="\d{6}"
                          maxLength={6}
                          autoComplete="one-time-code"
                          value={code}
                          onChange={(e) =>
                            setCode(e.target.value.replace(/\D/g, ''))
                          }
                          placeholder="123456"
                          className="mt-1 h-11 text-lg tracking-[0.4em] font-mono text-center"
                        />
                      </div>

                      <Button
                        onClick={verifyCode}
                        disabled={loading || code.length !== 6}
                        className={cn(
                          'w-full bg-brand-gradient text-white border-0',
                          'hover:shadow-lg hover:shadow-primary/25'
                        )}
                      >
                        {loading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Vérifier et activer'
                        )}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}

            {error && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            {/* Recovery codes */}
            {recoveryCodes && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-warning/40 bg-warning/5 p-4 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-warning" />
                  <p className="text-sm font-medium">Codes de récupération</p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Conservez-les en lieu sûr. Ils permettent de récupérer votre
                  compte si vous perdez votre device. Ils ne seront plus jamais
                  affichés.
                </p>
                <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                  {recoveryCodes.map((c) => (
                    <code
                      key={c}
                      className="px-3 py-2 bg-card rounded-lg border border-border"
                    >
                      {c}
                    </code>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
