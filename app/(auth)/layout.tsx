/**
 * Auth Layout — Split-screen moderne
 *
 * Design:
 * - Gauche (≥lg): panneau marketing avec mesh gradient animé, features
 * - Droite: formulaire (login/register)
 * - Mobile: formulaire pleine largeur, header brand minimal
 */

import { ShieldCheck, Lock, Sparkles, Zap } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';

const FEATURES = [
  {
    icon: Lock,
    title: 'Chiffrement E2E',
    desc: 'Vos messages sont protégés par libsodium · X25519 · ChaCha20-Poly1305',
  },
  {
    icon: ShieldCheck,
    title: 'Authentification 2FA',
    desc: 'TOTP RFC 6238 · clés de récupération · sessions JWT',
  },
  {
    icon: Sparkles,
    title: 'IA locale CPU',
    desc: 'Résumés llama.cpp · traduction LibreTranslate · anti-spam fastText',
  },
  {
    icon: Zap,
    title: 'Temps réel',
    desc: 'Socket.IO · Redis pub/sub · indicateurs de présence',
  },
];

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-background">
      {/* === Panneau gauche : marketing (lg+) === */}
      <aside className="hidden lg:flex lg:w-[44%] xl:w-[48%] mesh-gradient relative flex-col justify-between p-12 xl:p-16 overflow-hidden">
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-grid pointer-events-none opacity-50" />

        {/* Brand */}
        <div className="relative flex items-center gap-3">
          <div className="relative w-11 h-11 rounded-2xl bg-brand-gradient flex items-center justify-center shadow-lg">
            <Lock className="w-5 h-5 text-white" strokeWidth={2.5} />
            <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/20" />
          </div>
          <div>
            <div className="text-xl font-semibold tracking-tight">Cipher</div>
            <div className="text-xs text-muted-foreground">
              Messagerie chiffrée
            </div>
          </div>
        </div>

        {/* Headline + features */}
        <div className="relative space-y-10">
          <div className="space-y-4">
            <h1 className="text-4xl xl:text-5xl font-semibold tracking-tight leading-[1.1]">
              Discutez en{' '}
              <span className="text-brand-gradient">toute confidentialité</span>
            </h1>
            <p className="text-base xl:text-lg text-muted-foreground max-w-md leading-relaxed">
              Une messagerie temps réel pensée pour la sécurité, sans
              compromis sur l&apos;expérience.
            </p>
          </div>

          <ul className="space-y-4 max-w-md">
            {FEATURES.map((f, i) => (
              <li
                key={f.title}
                className="flex gap-4 animate-fade-in-up"
                style={{ animationDelay: `${i * 80}ms`, opacity: 0 }}
              >
                <div className="shrink-0 w-10 h-10 rounded-xl bg-card/60 backdrop-blur-sm border border-border/60 flex items-center justify-center">
                  <f.icon className="w-4.5 h-4.5 text-primary" strokeWidth={2} />
                </div>
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">{f.title}</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    {f.desc}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="relative flex items-center justify-between text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Cipher</span>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            Tous les services opérationnels
          </div>
        </div>
      </aside>

      {/* === Panneau droit : formulaire === */}
      <main className="flex-1 flex flex-col">
        {/* Top bar mobile + theme toggle */}
        <header className="flex items-center justify-between px-6 py-5 lg:px-12 lg:py-6">
          <div className="flex items-center gap-2.5 lg:hidden">
            <div className="w-9 h-9 rounded-xl bg-brand-gradient flex items-center justify-center shadow">
              <Lock className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-base font-semibold tracking-tight">
              Cipher
            </span>
          </div>
          <div className="lg:ml-auto">
            <ThemeToggle />
          </div>
        </header>

        {/* Form area */}
        <div className="flex-1 flex items-center justify-center px-6 py-10 lg:px-12">
          <div className="w-full max-w-md">{children}</div>
        </div>

        {/* Footer */}
        <footer className="px-6 py-6 lg:px-12 text-xs text-muted-foreground text-center lg:text-left">
          Connexion sécurisée · TLS 1.3 · Aucun tracker tiers
        </footer>
      </main>
    </div>
  );
}
