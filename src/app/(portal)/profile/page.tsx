import { redirect } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import {
  User,
  Mail,
  Shield,
  Calendar,
  Clock,
  Users,
  BookOpen,
  Award,
  ExternalLink,
} from "lucide-react";
import { getTenantContext } from "@/lib/tenant";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmailPreferences } from "@/components/profile/email-preferences";

const roleVariants: Record<string, "default" | "secondary" | "destructive"> = {
  SUPER_ADMIN: "destructive",
  ADMIN: "default",
  EMPLOYEE: "secondary",
};

export default async function ProfilePage() {
  const ctx = await getTenantContext();
  const sessionUser = ctx.user;

  // Get full user data including groups and last login (scoped to tenant)
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    include: {
      groups: {
        where: { group: { tenantId: ctx.tenantId } },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              description: true,
              color: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    redirect("/auth/login");
  }

  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();

  // Fetch learning history data (scoped to tenant)
  const [certificates, overrides, quizAttempts] = await prisma.$transaction([
    prisma.certificate.findMany({
      where: { userId: sessionUser.id, tenantId: ctx.tenantId },
      include: { module: { select: { id: true, title: true } } },
      orderBy: { issuedAt: "desc" },
    }),
    prisma.progressOverride.findMany({
      where: { userId: sessionUser.id, module: { tenantId: ctx.tenantId } },
      include: { module: { select: { id: true, title: true } } },
    }),
    prisma.quizAttempt.findMany({
      where: { userId: sessionUser.id, passed: true, quiz: { module: { tenantId: ctx.tenantId } } },
      include: { quiz: { select: { moduleId: true } } },
      orderBy: { score: "desc" },
    }),
  ]);

  // Build learning history: modules with certificate or override
  const historyMap = new Map<string, {
    moduleId: string;
    moduleTitle: string;
    completedAt: Date;
    result: string;
    hasQuiz: boolean;
    hasCertificate: boolean;
    certificateCode?: string;
  }>();

  // Certificates take priority
  for (const cert of certificates) {
    const bestAttempt = quizAttempts.find(a => a.quiz.moduleId === cert.moduleId);
    historyMap.set(cert.moduleId, {
      moduleId: cert.moduleId,
      moduleTitle: cert.module.title,
      completedAt: cert.issuedAt,
      result: bestAttempt
        ? t("profile.quizScore", { score: Math.round(bestAttempt.score) })
        : t("profile.noQuiz"),
      hasQuiz: !!bestAttempt,
      hasCertificate: true,
      certificateCode: cert.uniqueCode,
    });
  }

  // Overrides for modules without certificate
  for (const override of overrides) {
    if (!historyMap.has(override.moduleId)) {
      historyMap.set(override.moduleId, {
        moduleId: override.moduleId,
        moduleTitle: override.module.title,
        completedAt: override.createdAt,
        result: t("profile.manualOverride"),
        hasQuiz: false,
        hasCertificate: false,
      });
    }
  }

  const learningHistory = Array.from(historyMap.values())
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("profile.title")}</h1>
        <p className="text-muted-foreground">
          {t("profile.subtitle")}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Profile card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={user.avatar ?? undefined} alt={`${user.firstName} ${user.lastName}`} />
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-xl">
                  {user.firstName} {user.lastName}
                </CardTitle>
                <CardDescription>{user.email}</CardDescription>
                <Badge
                  variant={roleVariants[user.role] ?? "secondary"}
                  className="mt-1"
                >
                  {t(`roles.${user.role}`)}
                </Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("profile.fullName")}</p>
                  <p className="text-sm font-medium">
                    {user.firstName} {user.lastName}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("profile.email")}</p>
                  <p className="text-sm font-medium">{user.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("profile.role")}</p>
                  <p className="text-sm font-medium">
                    {t(`roles.${user.role}`)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("profile.memberSince")}</p>
                  <p className="text-sm font-medium">
                    {format(user.createdAt, "d. MMMM yyyy", { locale: getDateLocale() })}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("profile.lastLogin")}</p>
                  <p className="text-sm font-medium">
                    {user.lastLoginAt
                      ? formatDistanceToNow(user.lastLoginAt, { addSuffix: true, locale: getDateLocale() })
                      : t("common.never")}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Groups card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              {t("profile.groups")}
            </CardTitle>
            <CardDescription>
              {t("profile.groupsDescription")}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {user.groups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t("profile.noGroups")}
              </p>
            ) : (
              <div className="space-y-3">
                {user.groups.map(({ group }) => (
                  <div
                    key={group.id}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    {group.color && (
                      <div
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: group.color }}
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {group.name}
                      </p>
                      {group.description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {group.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Learning History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {t("profile.learningHistory")}
          </CardTitle>
          <CardDescription>
            {t("profile.learningHistoryDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {learningHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t("profile.noHistory")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("profile.module")}</TableHead>
                  <TableHead>{t("profile.dateCompleted")}</TableHead>
                  <TableHead>{t("profile.result")}</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {learningHistory.map((item) => (
                  <TableRow key={item.moduleId}>
                    <TableCell>
                      <Link
                        href={`/modules/${item.moduleId}`}
                        className="font-medium hover:underline flex items-center gap-1"
                      >
                        {item.moduleTitle}
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(item.completedAt, "d. MMM yyyy", { locale: getDateLocale() })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{item.result}</Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            item.hasQuiz
                              ? "border-green-500 text-green-600 dark:text-green-400"
                              : "border-muted text-muted-foreground"
                          )}
                        >
                          {item.hasQuiz ? t("profile.withQuiz") : t("profile.withoutQuiz")}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.hasCertificate && (
                        <Button variant="ghost" size="sm" asChild>
                          <Link href="/certificates">
                            <Award className="h-4 w-4 mr-1" />
                            {t("profile.viewCertificate")}
                          </Link>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Email Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {t("emailPreferences.title")}
          </CardTitle>
          <CardDescription>
            {t("emailPreferences.subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmailPreferences />
        </CardContent>
      </Card>
    </div>
  );
}
