"use client";

import { Suspense, useState, useCallback, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  GraduationCap,
  Loader2,
  Eye,
  EyeOff,
  BookOpen,
  BarChart3,
  Award,
  AlertCircle,
  Globe,
} from "lucide-react";
import { t, setLocale, getLocale, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";

const LOCALE_LABELS: Record<string, string> = {
  sl: "Slovenščina",
  en: "English",
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || searchParams.get("next") || "/dashboard";

  // Locale state — read from localStorage or default
  const [locale, setLocaleState] = useState<Locale>(getLocale());

  useEffect(() => {
    const saved = localStorage.getItem("eduportal-locale");
    if (saved && SUPPORTED_LOCALES.includes(saved as Locale)) {
      setLocale(saved as Locale);
      setLocaleState(saved as Locale);
    }
  }, []);

  function switchLocale(newLocale: Locale) {
    setLocale(newLocale);
    setLocaleState(newLocale);
    localStorage.setItem("eduportal-locale", newLocale);
  }

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loading, setLoading] = useState(false);

  const validateEmail = useCallback((value: string): boolean => {
    if (!value.trim()) {
      setEmailError(t("auth.emailRequired"));
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailError(t("auth.emailInvalid"));
      return false;
    }
    setEmailError("");
    return true;
  }, []);

  const validatePassword = useCallback((value: string): boolean => {
    if (!value) {
      setPasswordError(t("auth.passwordRequired"));
      return false;
    }
    setPasswordError("");
    return true;
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const emailValid = validateEmail(email);
    const passwordValid = validatePassword(password);
    if (!emailValid || !passwordValid) return;

    setLoading(true);

    // TODO: Add rate limiting on the backend for login attempts
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError(t("auth.invalidCredentials"));
      setLoading(false);
    } else {
      router.push(callbackUrl);
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel — info / branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[40%] flex-col bg-primary p-10 text-primary-foreground">
        {/* Logo — pinned to top */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
            <GraduationCap className="h-5 w-5" />
          </div>
          <span className="text-xl font-semibold tracking-tight">{t("nav.appName")}</span>
        </div>

        {/* Value propositions — vertically centered in remaining space */}
        <div className="flex flex-1 items-center">
          <div className="space-y-8">
            <div>
              <h2 className="text-3xl font-bold leading-tight">
                {t("auth.infoPanelTitle")}
              </h2>
            </div>

            <div className="space-y-5">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">{t("auth.infoPanelText1")}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">{t("auth.infoPanelText2")}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Award className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">{t("auth.infoPanelText3")}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex flex-1 flex-col items-center justify-center bg-gradient-to-br from-muted/30 via-background to-muted/50 px-4 py-8">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="mb-8 text-center lg:hidden">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <GraduationCap className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-bold">{t("nav.appName")}</h1>
          </div>

          {/* Login card */}
          <div className="rounded-2xl border bg-card p-8 shadow-xl shadow-black/5">
            <div className="mb-6">
              <h2 className="text-2xl font-bold tracking-tight">{t("auth.loginTitle")}</h2>
              <p className="text-sm text-muted-foreground mt-1">{t("auth.loginSubtitle")}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* Global error */}
              {error && (
                <Alert variant="destructive" className="py-3">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Email field */}
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) validateEmail(e.target.value);
                    if (error) setError("");
                  }}
                  placeholder={t("auth.emailPlaceholder")}
                  autoComplete="email"
                  autoFocus
                  aria-invalid={!!emailError}
                  aria-describedby={emailError ? "email-error" : undefined}
                  className={emailError ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {emailError && (
                  <p id="email-error" className="text-xs text-destructive" role="alert">
                    {emailError}
                  </p>
                )}
              </div>

              {/* Password field */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t("auth.password")}</Label>
                  <Link
                    href="/auth/forgot-password"
                    className="text-xs text-primary hover:text-primary/80 transition-colors font-medium"
                    tabIndex={-1}
                  >
                    {t("auth.forgotPassword")}
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (passwordError) validatePassword(e.target.value);
                      if (error) setError("");
                    }}
                    autoComplete="current-password"
                    aria-invalid={!!passwordError}
                    aria-describedby={passwordError ? "password-error" : undefined}
                    className={`pr-10 ${passwordError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {passwordError && (
                  <p id="password-error" className="text-xs text-destructive" role="alert">
                    {passwordError}
                  </p>
                )}
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full h-11 text-base font-medium"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("auth.signingIn")}
                  </>
                ) : (
                  t("auth.signIn")
                )}
              </Button>
            </form>
          </div>

          {/* Help text */}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t("auth.noAccess")}
          </p>

          {/* Language picker */}
          <div className="mt-4 flex items-center justify-center">
            <div className="inline-flex items-center gap-1 rounded-full border bg-card px-1 py-1 text-xs">
              <Globe className="h-3 w-3 text-muted-foreground ml-2 mr-1" />
              {SUPPORTED_LOCALES.map((loc) => (
                <button
                  key={loc}
                  onClick={() => switchLocale(loc)}
                  className={`rounded-full px-3 py-1 transition-colors ${
                    locale === loc
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {LOCALE_LABELS[loc] || loc}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-muted/30 via-background to-muted/50">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <GraduationCap className="h-7 w-7" />
            </div>
            <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
