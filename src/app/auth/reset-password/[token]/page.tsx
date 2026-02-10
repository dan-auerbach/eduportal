"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  GraduationCap,
  Loader2,
  ArrowLeft,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
} from "lucide-react";
import { t } from "@/lib/i18n";
import { verifyResetToken, resetPasswordWithToken } from "@/actions/email";

type TokenStatus =
  | { state: "loading" }
  | { state: "valid"; type: "PASSWORD_RESET" | "INVITE"; firstName: string; tenantName: string | null }
  | { state: "error"; code: string };

export default function ResetPasswordPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [tokenStatus, setTokenStatus] = useState<TokenStatus>({ state: "loading" });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Verify token on mount
  useEffect(() => {
    async function verify() {
      const result = await verifyResetToken(token);
      if (result.success) {
        setTokenStatus({
          state: "valid",
          type: result.data.type,
          firstName: result.data.firstName,
          tenantName: result.data.tenantName,
        });
      } else {
        setTokenStatus({ state: "error", code: result.error });
      }
    }
    verify();
  }, [token]);

  function getErrorMessage(code: string): string {
    switch (code) {
      case "INVALID_TOKEN":
        return t("auth.resetTokenInvalid");
      case "TOKEN_USED":
        return t("auth.resetTokenUsed");
      case "TOKEN_EXPIRED":
        return t("auth.resetTokenExpired");
      default:
        return t("auth.resetTokenError");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError(t("auth.resetPasswordMinLength"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("auth.resetPasswordMismatch"));
      return;
    }

    setLoading(true);
    const result = await resetPasswordWithToken(token, password);
    setLoading(false);

    if (result.success) {
      setSuccess(true);
      // Redirect to login after 3 seconds
      setTimeout(() => router.push("/auth/login"), 3000);
    } else {
      setError(getErrorMessage(result.error));
    }
  }

  const isInvite = tokenStatus.state === "valid" && tokenStatus.type === "INVITE";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-muted/40 via-background to-muted/60 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <GraduationCap className="h-7 w-7" />
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-8 shadow-xl shadow-black/5">
          {/* Loading state */}
          {tokenStatus.state === "loading" && (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground mt-3">
                {t("auth.resetVerifying")}
              </p>
            </div>
          )}

          {/* Token error state */}
          {tokenStatus.state === "error" && (
            <div className="text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div className="space-y-2">
                <h1 className="text-xl font-semibold">{t("auth.resetErrorTitle")}</h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {getErrorMessage(tokenStatus.code)}
                </p>
              </div>
              <div className="flex flex-col gap-2 mt-4">
                <Button asChild variant="outline">
                  <Link href="/auth/forgot-password">
                    {t("auth.resetRequestNew")}
                  </Link>
                </Button>
                <Button asChild variant="ghost">
                  <Link href="/auth/login">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {t("auth.forgotPasswordBack")}
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {/* Success state */}
          {success && (
            <div className="text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="space-y-2">
                <h1 className="text-xl font-semibold">
                  {isInvite ? t("auth.inviteSuccessTitle") : t("auth.resetSuccessTitle")}
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t("auth.resetSuccessMessage")}
                </p>
              </div>
              <Button asChild variant="outline" className="mt-4">
                <Link href="/auth/login">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t("auth.resetGoToLogin")}
                </Link>
              </Button>
            </div>
          )}

          {/* Reset form */}
          {tokenStatus.state === "valid" && !success && (
            <>
              <div className="text-center mb-6">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <KeyRound className="h-5 w-5 text-muted-foreground" />
                </div>
                <h1 className="text-xl font-semibold">
                  {isInvite
                    ? t("auth.inviteTitle", { tenantName: tokenStatus.tenantName ?? "Mentor" })
                    : t("auth.resetTitle")}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {isInvite
                    ? t("auth.inviteSubtitle", { firstName: tokenStatus.firstName })
                    : t("auth.resetSubtitle")}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">{t("auth.resetNewPassword")}</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t("auth.resetPasswordPlaceholder")}
                      autoComplete="new-password"
                      autoFocus
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">{t("auth.resetConfirmPassword")}</Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t("auth.resetConfirmPlaceholder")}
                    autoComplete="new-password"
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {loading
                    ? t("auth.resetSaving")
                    : isInvite
                      ? t("auth.inviteSetPassword")
                      : t("auth.resetSetPassword")}
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
