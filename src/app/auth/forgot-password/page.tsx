"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GraduationCap, Loader2, ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import { t } from "@/lib/i18n";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [emailError, setEmailError] = useState("");

  function validateEmail(value: string): boolean {
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
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateEmail(email)) return;

    setLoading(true);

    // TODO: Implement actual password reset email sending
    // For now, simulate a short delay and show the safe success message
    // regardless of whether the email exists (security best practice)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setSubmitted(true);
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-muted/40 via-background to-muted/60 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <GraduationCap className="h-7 w-7" />
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-8 shadow-xl shadow-black/5">
          {submitted ? (
            <div className="text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="space-y-2">
                <h1 className="text-xl font-semibold">{t("auth.forgotPasswordTitle")}</h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t("auth.forgotPasswordSuccess")}
                </p>
              </div>
              <Button asChild variant="outline" className="mt-4">
                <Link href="/auth/login">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t("auth.forgotPasswordBack")}
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                </div>
                <h1 className="text-xl font-semibold">{t("auth.forgotPasswordTitle")}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("auth.forgotPasswordSubtitle")}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("auth.email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) validateEmail(e.target.value);
                    }}
                    placeholder={t("auth.emailPlaceholder")}
                    autoComplete="email"
                    autoFocus
                    className={emailError ? "border-destructive" : ""}
                  />
                  {emailError && (
                    <p className="text-xs text-destructive">{emailError}</p>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {loading ? t("auth.forgotPasswordSending") : t("auth.forgotPasswordSubmit")}
                </Button>
              </form>

              <div className="mt-4 text-center">
                <Link
                  href="/auth/login"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                >
                  <ArrowLeft className="h-3 w-3" />
                  {t("auth.forgotPasswordBack")}
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
