"use client";

import { useState, useTransition, useEffect } from "react";
import DOMPurify from "dompurify";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Lock,
  Play,
  FileDown,
  Loader2,
  AlertTriangle,
  Eye,
  RefreshCw,
  ClipboardList,
  CircleHelp,
  List,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { completeSection } from "@/actions/progress";
import { acknowledgeModuleUpdate } from "@/actions/modules";
import { t } from "@/lib/i18n";
import { ModuleChatRoom } from "@/components/modules/module-chat-room";
import { TargetVideoPlayer } from "@/components/modules/target-video-player";

type SectionData = {
  id: string;
  title: string;
  content: string;
  sortOrder: number;
  type: "TEXT" | "VIDEO" | "ATTACHMENT" | "MIXED";
  unlockAfterSectionId: string | null;
  videoSourceType: "YOUTUBE_VIMEO_URL" | "UPLOAD" | "CLOUDFLARE_STREAM" | "TARGETVIDEO";
  videoBlobUrl: string | null;
  videoMimeType: string | null;
  cloudflareStreamUid: string | null;
  videoStatus: "PENDING" | "READY" | "ERROR" | null;
  mediaAssetCfStreamUid: string | null;
  attachments: {
    id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
  }[];
};

type QuizData = {
  id: string;
  title: string;
  passed: boolean;
};

type MentorData = {
  id: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
};

type SectionViewerProps = {
  moduleId: string;
  moduleTitle: string;
  sections: SectionData[];
  completedSectionIds: string[];
  isPreview: boolean;
  progressPercentage: number;
  needsReview?: boolean;
  changeSummary?: string;
  quizzes?: QuizData[];
  mentors?: MentorData[];
  assignmentGroups?: string[];
  // Chat props
  chatEnabled?: boolean;
  tenantId?: string;
  userId?: string;
  userDisplayName?: string;
  mentorIds?: string[];
  canConfirmAnswers?: boolean;
  initialTab?: "content" | "chat";
};

function extractYouTubeId(content: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type ContentFile = {
  fileName: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
};

function parseContentFiles(content: string): ContentFile[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type MixedContent = {
  html: string;
  videoUrl: string;
  files: ContentFile[];
};

function parseMixedContent(content: string): MixedContent {
  if (!content) return { html: "", videoUrl: "", files: [] };
  try {
    const parsed = JSON.parse(content);
    return {
      html: parsed.html || "",
      videoUrl: parsed.videoUrl || "",
      files: Array.isArray(parsed.files) ? parsed.files : [],
    };
  } catch {
    // If content is not JSON, treat as plain HTML (legacy)
    return { html: content, videoUrl: "", files: [] };
  }
}

function isSectionUnlocked(
  section: SectionData,
  completedIds: Set<string>
): boolean {
  if (!section.unlockAfterSectionId) return true;
  return completedIds.has(section.unlockAfterSectionId);
}

// ─── CF Stream Pending Player ────────────────────────────────────────
function CfStreamPendingPlayer({ sectionId }: { sectionId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"PENDING" | "ERROR">("PENDING");

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/videos/status?sectionId=${sectionId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "READY") {
          clearInterval(interval);
          router.refresh();
        } else if (data.status === "ERROR") {
          setStatus("ERROR");
          clearInterval(interval);
        }
      } catch {
        // Ignore polling errors
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [sectionId, router]);

  if (status === "ERROR") {
    return (
      <div className="aspect-video w-full max-h-[45vh] rounded-lg overflow-hidden bg-muted flex flex-col items-center justify-center">
        <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
        <p className="text-sm text-destructive">{t("sectionViewer.videoError")}</p>
      </div>
    );
  }

  return (
    <div className="aspect-video w-full max-h-[45vh] rounded-lg overflow-hidden bg-muted flex flex-col items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-2" />
      <p className="text-sm text-muted-foreground">{t("sectionViewer.videoProcessing")}</p>
    </div>
  );
}

export function SectionViewer({
  moduleId,
  moduleTitle,
  sections,
  completedSectionIds: initialCompletedIds,
  isPreview,
  progressPercentage: initialProgress,
  needsReview = false,
  changeSummary,
  quizzes = [],
  mentors = [],
  assignmentGroups = [],
  chatEnabled = false,
  tenantId,
  userId,
  userDisplayName,
  mentorIds = [],
  canConfirmAnswers = false,
  initialTab = "content",
}: SectionViewerProps) {
  const router = useRouter();
  const [completedIds, setCompletedIds] = useState<Set<string>>(
    new Set(initialCompletedIds)
  );
  const [activeSectionId, setActiveSectionId] = useState<string>(
    () => sections[0]?.id ?? ""
  );
  const [isPending, startTransition] = useTransition();
  const [showUpdateBanner, setShowUpdateBanner] = useState(needsReview);
  const [acknowledging, setAcknowledging] = useState(false);
  const [showQuizPrompt, setShowQuizPrompt] = useState(
    // Show quiz prompt on load if all sections done + quiz not passed
    initialCompletedIds.length >= sections.length && quizzes.length > 0 && !quizzes.every(q => q.passed)
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"content" | "chat">(initialTab);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  // Poll for unread count when on content tab
  useEffect(() => {
    if (!chatEnabled || activeTab === "chat") {
      setChatUnreadCount(0);
      return;
    }
    const poll = async () => {
      try {
        const lastRead = typeof window !== "undefined"
          ? localStorage.getItem(`ircModuleLastRead:${moduleId}`)
          : null;
        const params = new URLSearchParams({ moduleId });
        if (lastRead) params.set("after", lastRead);
        const res = await fetch(`/api/chat/module-unread?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setChatUnreadCount(data.count ?? 0);
        }
      } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 10000); // Poll every 10s for badge
    return () => clearInterval(interval);
  }, [chatEnabled, activeTab, moduleId]);

  const completedSet = completedIds;
  const totalSections = sections.length;
  const completedCount = completedIds.size;
  const currentProgress =
    totalSections > 0 ? Math.round((completedCount / totalSections) * 100) : 0;

  const activeSection = sections.find((s) => s.id === activeSectionId);
  const activeSectionIndex = sections.findIndex(
    (s) => s.id === activeSectionId
  );

  function handleSectionClick(section: SectionData) {
    if (!isSectionUnlocked(section, completedSet)) return;
    setActiveSectionId(section.id);
    setMobileNavOpen(false); // Close mobile nav on selection
  }

  const isLastSection = activeSectionIndex === sections.length - 1;

  function handleMarkComplete() {
    if (!activeSection || isPreview) return;

    startTransition(async () => {
      const result = await completeSection(activeSection.id);
      if (result.success) {
        const updatedSet = new Set(completedIds);
        updatedSet.add(activeSection.id);
        setCompletedIds(updatedSet);

        // If ALL sections are now complete, navigate to completion page
        const allDone = sections.every((s) => updatedSet.has(s.id));
        if (allDone) {
          router.push(`/modules/${moduleId}/completed`);
          return;
        }

        // Check if quizzes exist and are now ready
        if (result.data.readyForQuiz && quizzes.length > 0) {
          setShowQuizPrompt(true);
        }

        // Auto-advance to next unlocked section
        const nextSection = sections[activeSectionIndex + 1];
        if (nextSection) {
          if (isSectionUnlocked(nextSection, updatedSet)) {
            setActiveSectionId(nextSection.id);
          }
        }
      }
    });
  }

  function getSectionIcon(section: SectionData) {
    if (completedSet.has(section.id)) {
      return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
    }
    if (!isSectionUnlocked(section, completedSet)) {
      return <Lock className="h-4 w-4 text-muted-foreground shrink-0" />;
    }
    if (section.id === activeSectionId) {
      return <Play className="h-4 w-4 text-primary shrink-0" />;
    }
    return <Circle className="h-4 w-4 text-muted-foreground shrink-0" />;
  }

  // Shared sidebar content (used by both desktop sidebar and mobile sheet)
  function renderSidebarContent() {
    return (
      <>
        <div className="p-4 border-b">
          <h2 className="font-semibold text-sm truncate">{moduleTitle}</h2>
          {mentors.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <GraduationCap className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {mentors.length === 1 ? t("sectionViewer.mentor") : t("sectionViewer.mentors")}:{" "}
                {mentors.map((m) => `${m.firstName} ${m.lastName}`).join(", ")}
              </span>
            </div>
          )}
          {assignmentGroups.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground truncate">
              {t("modules.assignedBecause", { groups: assignmentGroups.join(", ") })}
            </p>
          )}
          <div className="mt-2 space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t("sectionViewer.sectionsCount", { completed: String(completedCount), total: String(totalSections) })}</span>
              {quizzes.length > 0 && (
                <span className="flex items-center gap-1">
                  {t("sectionViewer.quizStatus")}:{" "}
                  {quizzes.every(q => q.passed) ? (
                    <CheckCircle2 className="h-3 w-3 text-green-500 inline" />
                  ) : (
                    <span className="text-amber-500">&#x23F3;</span>
                  )}
                </span>
              )}
            </div>
            <Progress value={currentProgress} className="h-1.5" />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {sections.map((section, index) => {
              const unlocked = isSectionUnlocked(section, completedSet);
              return (
                <button
                  key={section.id}
                  onClick={() => handleSectionClick(section)}
                  disabled={!unlocked}
                  className={cn(
                    "w-full flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                    section.id === activeSectionId &&
                      "bg-accent text-accent-foreground",
                    unlocked && section.id !== activeSectionId &&
                      "hover:bg-accent/50",
                    !unlocked && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {getSectionIcon(section)}
                  <span className="truncate">
                    {index + 1}. {section.title}
                  </span>
                </button>
              );
            })}

            {/* Quiz entries in sidebar */}
            {quizzes.length > 0 && (
              <>
                <Separator className="my-2" />
                {quizzes.map((quiz) => {
                  const quizUnlocked = currentProgress === 100;
                  return (
                    <Link
                      key={quiz.id}
                      href={
                        quizUnlocked
                          ? `/modules/${moduleId}/quiz/${quiz.id}`
                          : "#"
                      }
                      onClick={(e) => {
                        if (!quizUnlocked) e.preventDefault();
                        else setMobileNavOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                        quiz.passed
                          ? "hover:bg-accent/50"
                          : quizUnlocked
                            ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-950/50"
                            : "opacity-50 cursor-not-allowed"
                      )}
                      title={!quizUnlocked ? t("sectionViewer.quizLocked") : undefined}
                    >
                      {quiz.passed ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      ) : quizUnlocked ? (
                        <CircleHelp className="h-4 w-4 text-amber-500 shrink-0" />
                      ) : (
                        <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="truncate flex-1">{quiz.title}</span>
                      {quiz.passed ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] shrink-0 border-green-500 text-green-600 dark:text-green-400"
                        >
                          {t("sectionViewer.quizPassed")}
                        </Badge>
                      ) : quizUnlocked ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] shrink-0 border-amber-500 text-amber-600 dark:text-amber-400"
                        >
                          {t("sectionViewer.quizPending")}
                        </Badge>
                      ) : null}
                    </Link>
                  );
                })}
              </>
            )}
          </div>
        </ScrollArea>
      </>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-8.5rem)] md:h-[calc(100vh-8.5rem)] gap-0 rounded-lg border bg-background overflow-hidden">
      {/* ── Desktop sidebar (hidden on mobile) ──────────────────────── */}
      <div className="hidden md:flex w-72 shrink-0 border-r flex-col">
        {renderSidebarContent()}
      </div>

      {/* ── Mobile section nav sheet ────────────────────────────────── */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-xs p-0 flex flex-col" showCloseButton={false}>
          <SheetHeader className="p-0">
            <SheetTitle className="sr-only">{moduleTitle}</SheetTitle>
          </SheetHeader>
          {renderSidebarContent()}
        </SheetContent>
      </Sheet>

      {/* ── Main content area ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Mobile section header bar (visible only on mobile) */}
        <div className="flex md:hidden items-center gap-2 px-3 py-2.5 border-b bg-muted/30">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-md hover:bg-accent transition-colors"
            aria-label={t("sectionViewer.progress")}
          >
            <List className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground truncate">
              {completedCount}/{totalSections} &middot; {currentProgress}%
            </p>
            <p className="text-sm font-medium truncate">
              {activeSection
                ? `${activeSectionIndex + 1}. ${activeSection.title}`
                : moduleTitle}
            </p>
          </div>
          {/* Quick prev/next on mobile header */}
          <div className="flex items-center shrink-0">
            <button
              disabled={activeSectionIndex === 0}
              onClick={() => {
                const prev = sections[activeSectionIndex - 1];
                if (prev && isSectionUnlocked(prev, completedSet)) {
                  setActiveSectionId(prev.id);
                }
              }}
              className="p-1.5 rounded-md disabled:opacity-30 hover:bg-accent transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              disabled={isLastSection}
              onClick={() => {
                const next = sections[activeSectionIndex + 1];
                if (next && isSectionUnlocked(next, completedSet)) {
                  setActiveSectionId(next.id);
                }
              }}
              className="p-1.5 rounded-md disabled:opacity-30 hover:bg-accent transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Mobile progress bar */}
        <div className="md:hidden">
          <Progress value={currentProgress} className="h-1 rounded-none" />
        </div>

        {/* Content/Chat tab bar */}
        {chatEnabled && !isPreview && (
          <div className="flex border-b shrink-0">
            <button
              onClick={() => setActiveTab("content")}
              className={cn(
                "flex-1 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === "content"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {t("moduleChat.tabContent")}
            </button>
            <button
              onClick={() => {
                setActiveTab("chat");
                setChatUnreadCount(0);
              }}
              className={cn(
                "flex-1 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center justify-center gap-1.5",
                activeTab === "chat"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {t("moduleChat.tabChat")}
              {chatUnreadCount > 0 && activeTab !== "chat" && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1">
                  {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Chat tab content */}
        {chatEnabled && !isPreview && activeTab === "chat" && tenantId && userId && userDisplayName && (
          <div className="flex-1 min-h-0">
            <ModuleChatRoom
              moduleId={moduleId}
              moduleTitle={moduleTitle}
              tenantId={tenantId}
              userId={userId}
              userDisplayName={userDisplayName}
              mentorIds={mentorIds}
              canConfirmAnswers={canConfirmAnswers}
            />
          </div>
        )}

        {/* Content tab (or always if chat not enabled) */}
        {(activeTab === "content" || !chatEnabled || isPreview) && <>

        {isPreview && (
          <Alert className="rounded-none border-x-0 border-t-0 bg-yellow-50 dark:bg-yellow-950">
            <Eye className="h-4 w-4" />
            <AlertDescription>
              {t("sectionViewer.previewMode")}
            </AlertDescription>
          </Alert>
        )}

        {showUpdateBanner && (
          <Alert className="rounded-none border-x-0 border-t-0 bg-blue-50 dark:bg-blue-950">
            <RefreshCw className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <div>
                <p className="font-medium">{t("sectionViewer.moduleUpdated")}</p>
                {changeSummary && (
                  <p className="text-sm mt-1">
                    {t("sectionViewer.changeSummary", { summary: changeSummary })}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={acknowledging}
                onClick={async () => {
                  setAcknowledging(true);
                  const result = await acknowledgeModuleUpdate(moduleId);
                  if (result.success) {
                    setShowUpdateBanner(false);
                  }
                  setAcknowledging(false);
                }}
              >
                {acknowledging ? t("sectionViewer.acknowledging") : t("sectionViewer.acknowledge")}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {showQuizPrompt && quizzes.length > 0 && (
          <Alert className="rounded-none border-x-0 border-t-0 bg-amber-50 dark:bg-amber-950">
            <ClipboardList className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {t("sectionViewer.quizPrompt")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                  {t("modules.quizRequiredShort")}
                </p>
              </div>
              <Button size="sm" className="shrink-0" asChild>
                <Link href={`/modules/${moduleId}/quiz/${quizzes[0].id}`}>
                  {t("sectionViewer.startQuiz")}
                </Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {activeSection ? (
          <>
            {/* Section header — hidden on mobile (shown in mobile header bar instead) */}
            <div className="hidden md:block p-6 border-b">
              <div className="flex items-center gap-2">
                {(activeSection.type === "VIDEO" || activeSection.type === "MIXED") && (
                  <Badge className="text-xs bg-blue-600 hover:bg-blue-600 text-white gap-1">
                    <Play className="h-3 w-3" />
                    VIDEO
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs">
                  {t(`sectionType.${activeSection.type}`)}
                </Badge>
                {completedSet.has(activeSection.id) && (
                  <Badge
                    variant="outline"
                    className="text-xs border-green-500 text-green-600 dark:text-green-400"
                  >
                    {t("sectionViewer.completed")}
                  </Badge>
                )}
              </div>
              <h1 className="mt-2 text-xl font-semibold">
                {activeSection.title}
              </h1>
            </div>

            {/* Compact mobile section header (badges + type) */}
            <div className="md:hidden px-4 py-2 border-b flex items-center gap-2">
              {(activeSection.type === "VIDEO" || activeSection.type === "MIXED") && (
                <Badge className="text-xs bg-blue-600 hover:bg-blue-600 text-white gap-1">
                  <Play className="h-3 w-3" />
                  VIDEO
                </Badge>
              )}
              <Badge variant="outline" className="text-xs">
                {t(`sectionType.${activeSection.type}`)}
              </Badge>
              {completedSet.has(activeSection.id) && (
                <Badge
                  variant="outline"
                  className="text-xs border-green-500 text-green-600 dark:text-green-400"
                >
                  {t("sectionViewer.completed")}
                </Badge>
              )}
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="p-4 md:p-6 space-y-6">
                {/* Video embed for VIDEO and MIXED types */}
                {(activeSection.type === "VIDEO" ||
                  activeSection.type === "MIXED") &&
                  (() => {
                    // TargetVideo player
                    if (activeSection.videoSourceType === "TARGETVIDEO" && activeSection.content) {
                      const tvId = activeSection.content.trim();
                      if (/^\d{4,}$/.test(tvId)) {
                        return (
                          <TargetVideoPlayer
                            videoId={tvId}
                            sectionId={activeSection.id}
                          />
                        );
                      }
                      return null;
                    }

                    // Cloudflare Stream video (prefer MediaAsset, fallback to legacy)
                    const cfUid = activeSection.mediaAssetCfStreamUid ?? activeSection.cloudflareStreamUid;
                    if (activeSection.videoSourceType === "CLOUDFLARE_STREAM" && cfUid) {
                      if (activeSection.videoStatus !== "READY") {
                        return (
                          <CfStreamPendingPlayer sectionId={activeSection.id} />
                        );
                      }
                      const subdomain = process.env.NEXT_PUBLIC_CF_STREAM_SUBDOMAIN;
                      return (
                        <div className="aspect-video w-full max-h-[45vh] rounded-lg overflow-hidden bg-black">
                          <iframe
                            src={`https://${subdomain}/${cfUid}/iframe`}
                            title={activeSection.title}
                            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                            allowFullScreen
                            className="h-full w-full border-0"
                          />
                        </div>
                      );
                    }

                    // Legacy uploaded video (Vercel Blob)
                    if (activeSection.videoSourceType === "UPLOAD" && activeSection.videoBlobUrl) {
                      return (
                        <div className="aspect-video w-full max-h-[45vh] rounded-lg overflow-hidden bg-black">
                          <video
                            src={activeSection.videoBlobUrl}
                            controls
                            controlsList="nodownload"
                            onContextMenu={(e) => e.preventDefault()}
                            className="h-full w-full"
                            preload="metadata"
                          >
                            {t("sectionViewer.videoNotSupported")}
                          </video>
                        </div>
                      );
                    }

                    // YouTube/Vimeo URL — for VIDEO type use content directly, for MIXED parse videoUrl
                    const videoUrl = activeSection.type === "MIXED"
                      ? parseMixedContent(activeSection.content).videoUrl
                      : activeSection.content;
                    const youtubeId = extractYouTubeId(videoUrl);
                    if (!youtubeId) return null;
                    return (
                      <div className="aspect-video w-full max-h-[45vh] rounded-lg overflow-hidden bg-black">
                        <iframe
                          src={`https://www.youtube.com/embed/${youtubeId}`}
                          title={activeSection.title}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="h-full w-full"
                        />
                      </div>
                    );
                  })()}

                {/* Text/HTML content — only for TEXT type or MIXED html part */}
                {activeSection.type === "TEXT" && activeSection.content && (
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(activeSection.content) }}
                  />
                )}

                {activeSection.type === "MIXED" && (() => {
                  const mixed = parseMixedContent(activeSection.content);
                  return (
                    <>
                      {mixed.html && (
                        <div
                          className="prose prose-sm dark:prose-invert max-w-none"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(mixed.html) }}
                        />
                      )}
                      {mixed.files.length > 0 && (
                        <div className="space-y-3">
                          <Separator />
                          <h3 className="font-medium text-sm">{t("sectionViewer.attachments")}</h3>
                          <div className="space-y-2">
                            {mixed.files.map((file, idx) => (
                              <a
                                key={idx}
                                href={`/api/attachments/download?path=${encodeURIComponent(file.storagePath)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors"
                              >
                                <FileDown className="h-5 w-5 text-muted-foreground shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium truncate">
                                    {file.fileName}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatFileSize(file.fileSize)} &middot;{" "}
                                    {file.mimeType}
                                  </p>
                                </div>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Attachments from content JSON (ATTACHMENT type) */}
                {activeSection.type === "ATTACHMENT" && (() => {
                  const files = parseContentFiles(activeSection.content);
                  if (files.length === 0) return null;
                  return (
                    <div className="space-y-3">
                      <h3 className="font-medium text-sm">{t("sectionViewer.attachments")}</h3>
                      <div className="space-y-2">
                        {files.map((file, idx) => (
                          <a
                            key={idx}
                            href={`/api/attachments/download?path=${encodeURIComponent(file.storagePath)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors"
                          >
                            <FileDown className="h-5 w-5 text-muted-foreground shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">
                                {file.fileName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatFileSize(file.fileSize)} &middot;{" "}
                                {file.mimeType}
                              </p>
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Attachments from Prisma relation (if any — fallback) */}
                {activeSection.attachments.length > 0 && (
                  <div className="space-y-3">
                    {activeSection.type !== "ATTACHMENT" && <Separator />}
                    <h3 className="font-medium text-sm">{t("sectionViewer.attachments")}</h3>
                    <div className="space-y-2">
                      {activeSection.attachments.map((attachment) => (
                        <a
                          key={attachment.id}
                          href={`/api/attachments/${attachment.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors"
                        >
                          <FileDown className="h-5 w-5 text-muted-foreground shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {attachment.fileName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatFileSize(attachment.fileSize)} &middot;{" "}
                              {attachment.mimeType}
                            </p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Bottom action bar */}
            <div className="border-t p-3 md:p-4 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={activeSectionIndex === 0}
                onClick={() => {
                  const prev = sections[activeSectionIndex - 1];
                  if (prev && isSectionUnlocked(prev, completedSet)) {
                    setActiveSectionId(prev.id);
                  }
                }}
              >
                <ChevronLeft className="h-4 w-4 md:hidden" />
                <span className="hidden md:inline">{t("common.previous")}</span>
                <span className="md:hidden">{t("common.previous")}</span>
              </Button>

              <div className="flex items-center gap-2">
                {(() => {
                  const allComplete = sections.every((s) => completedSet.has(s.id));
                  // Would marking the current section finish the module?
                  const wouldFinish =
                    !completedSet.has(activeSection.id) &&
                    sections.every((s) => s.id === activeSection.id || completedSet.has(s.id));

                  return (
                    <>
                      {/* Mark complete / Finish button */}
                      {!isPreview && !completedSet.has(activeSection.id) && (
                        <Button
                          onClick={handleMarkComplete}
                          disabled={isPending}
                          size="sm"
                        >
                          {isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                          )}
                          <span className="hidden sm:inline">
                            {wouldFinish
                              ? t("sectionViewer.finishModule")
                              : t("sectionViewer.markCompleted")}
                          </span>
                          <span className="sm:hidden">
                            {wouldFinish ? "✓" : "✓"}
                          </span>
                        </Button>
                      )}

                      {/* All sections done: show completed label */}
                      {!isPreview && allComplete && (
                        <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 font-medium">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="hidden sm:inline">{t("sectionViewer.moduleCompleted")}</span>
                        </span>
                      )}

                      {/* Next button */}
                      {!isLastSection && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const next = sections[activeSectionIndex + 1];
                            if (next && isSectionUnlocked(next, completedSet)) {
                              setActiveSectionId(next.id);
                            }
                          }}
                        >
                          <span className="hidden md:inline">{t("common.next")}</span>
                          <span className="md:hidden">{t("common.next")}</span>
                          <ChevronRight className="h-4 w-4 md:hidden" />
                        </Button>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
              <p>{t("sectionViewer.noSections")}</p>
            </div>
          </div>
        )}

        </>}
      </div>
    </div>
  );
}
