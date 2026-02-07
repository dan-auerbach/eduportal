"use client";

import { useState, useTransition } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { completeSection } from "@/actions/progress";
import { acknowledgeModuleUpdate } from "@/actions/modules";
import { t } from "@/lib/i18n";

type SectionData = {
  id: string;
  title: string;
  content: string;
  sortOrder: number;
  type: "TEXT" | "VIDEO" | "ATTACHMENT" | "MIXED";
  unlockAfterSectionId: string | null;
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

function isSectionUnlocked(
  section: SectionData,
  completedIds: Set<string>
): boolean {
  if (!section.unlockAfterSectionId) return true;
  return completedIds.has(section.unlockAfterSectionId);
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
}: SectionViewerProps) {
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
    initialProgress >= 100 && quizzes.length > 0 && !quizzes.every(q => q.passed)
  );

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
  }

  function handleMarkComplete() {
    if (!activeSection || isPreview) return;

    startTransition(async () => {
      const result = await completeSection(activeSection.id);
      if (result.success) {
        setCompletedIds((prev) => {
          const next = new Set(prev);
          next.add(activeSection.id);
          return next;
        });

        // Check if this was the last section and quizzes exist
        if (result.data.readyForQuiz && quizzes.length > 0) {
          setShowQuizPrompt(true);
        }

        // Auto-advance to next unlocked section
        const nextSection = sections[activeSectionIndex + 1];
        if (nextSection) {
          const updatedCompleted = new Set(completedIds);
          updatedCompleted.add(activeSection.id);
          if (isSectionUnlocked(nextSection, updatedCompleted)) {
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

  return (
    <div className="flex h-[calc(100vh-8.5rem)] gap-0 rounded-lg border bg-background overflow-hidden">
      {/* Sidebar - Chapter list */}
      <div className="w-72 shrink-0 border-r flex flex-col">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-sm truncate">{moduleTitle}</h2>
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
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
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
            <AlertDescription className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  {t("sectionViewer.quizPrompt")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
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
            <div className="p-6 border-b">
              <div className="flex items-center gap-2">
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

            <ScrollArea className="flex-1 min-h-0">
              <div className="p-6 space-y-6">
                {/* Video embed for VIDEO type */}
                {(activeSection.type === "VIDEO" ||
                  activeSection.type === "MIXED") &&
                  (() => {
                    const youtubeId = extractYouTubeId(activeSection.content);
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

                {/* Text content */}
                <div
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: activeSection.content }}
                />

                {/* Attachments */}
                {(activeSection.type === "ATTACHMENT" ||
                  activeSection.type === "MIXED") &&
                  activeSection.attachments.length > 0 && (
                    <div className="space-y-3">
                      <Separator />
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
            <div className="border-t p-4 flex items-center justify-between">
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
                {t("common.previous")}
              </Button>

              <div className="flex items-center gap-2">
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
                    {t("sectionViewer.markCompleted")}
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  disabled={activeSectionIndex === sections.length - 1}
                  onClick={() => {
                    const next = sections[activeSectionIndex + 1];
                    if (next && isSectionUnlocked(next, completedSet)) {
                      setActiveSectionId(next.id);
                    }
                  }}
                >
                  {t("common.next")}
                </Button>
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
      </div>
    </div>
  );
}
