"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  submitQuizAttempt,
  type QuizForAttempt,
  type QuizSubmitResult,
} from "@/actions/quiz";
import { t } from "@/lib/i18n";
import {
  CheckCircle2,
  XCircle,
  Trophy,
  ArrowLeft,
  AlertTriangle,
  Award,
  Info,
} from "lucide-react";
import { toast } from "sonner";

type Phase = "intro" | "playing" | "result";

interface QuizPlayerProps {
  quiz: QuizForAttempt;
}

export function QuizPlayer({ quiz }: QuizPlayerProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(quiz.hasPassed ? "intro" : "intro");
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [result, setResult] = useState<QuizSubmitResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const allAnswered = quiz.questions.every(
    (q) => answers[q.id] && answers[q.id].length > 0
  );

  function handleSingleChoice(questionId: string, optionIndex: number) {
    setAnswers((prev) => ({ ...prev, [questionId]: [optionIndex] }));
  }

  function handleMultipleChoice(questionId: string, optionIndex: number) {
    setAnswers((prev) => {
      const current = prev[questionId] || [];
      const isSelected = current.includes(optionIndex);
      return {
        ...prev,
        [questionId]: isSelected
          ? current.filter((i) => i !== optionIndex)
          : [...current, optionIndex],
      };
    });
  }

  function handleSubmit() {
    if (!allAnswered) {
      toast.error(t("quiz.answerAllQuestions"));
      return;
    }

    startTransition(async () => {
      const res = await submitQuizAttempt(quiz.id, answers);
      if (res.success) {
        setResult(res.data);
        setPhase("result");
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleRetry() {
    setAnswers({});
    setResult(null);
    setPhase("intro");
  }

  // ── Intro Phase ──────────────────────────────────────────────────
  if (phase === "intro") {
    const attemptsUsed = quiz.previousAttempts;
    const maxAttempts = quiz.maxAttempts;

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href={`/modules/${quiz.moduleId}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          {quiz.moduleTitle}
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{quiz.title}</CardTitle>
            {quiz.description && (
              <CardDescription>{quiz.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 text-sm">
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5">
                <span className="text-muted-foreground">
                  {t("quiz.passingScore", { score: String(quiz.passingScore) })}
                </span>
                <Badge variant="outline">{quiz.passingScore}%</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5">
                <span className="text-muted-foreground">
                  {maxAttempts > 0
                    ? t("quiz.maxAttempts", { max: String(maxAttempts) })
                    : t("quiz.unlimitedAttempts")}
                </span>
                {maxAttempts > 0 && (
                  <Badge variant="outline">
                    {t("quiz.attemptsUsed", {
                      used: String(attemptsUsed),
                      max: String(maxAttempts),
                    })}
                  </Badge>
                )}
              </div>
              {quiz.bestScore !== null && (
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5">
                  <span className="text-muted-foreground">
                    {t("quiz.bestScore", {
                      score: String(Math.round(quiz.bestScore)),
                    })}
                  </span>
                  <Badge
                    variant={
                      quiz.bestScore >= quiz.passingScore
                        ? "default"
                        : "secondary"
                    }
                  >
                    {Math.round(quiz.bestScore)}%
                  </Badge>
                </div>
              )}
            </div>

            {quiz.hasPassed ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/50">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">{t("quiz.passed")}</span>
                </div>
              </div>
            ) : (
              <Button
                onClick={() => setPhase("playing")}
                size="lg"
                className="w-full"
                disabled={
                  maxAttempts > 0 && attemptsUsed >= maxAttempts
                }
              >
                {t("quiz.startQuiz")}
              </Button>
            )}

            {!quiz.hasPassed &&
              maxAttempts > 0 &&
              attemptsUsed >= maxAttempts && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="text-sm font-medium">
                      {t("quiz.failedNoRetry")}
                    </span>
                  </div>
                </div>
              )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Playing Phase ────────────────────────────────────────────────
  if (phase === "playing") {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{quiz.title}</h1>
          <Badge variant="outline">
            {t("quiz.passingScore", { score: String(quiz.passingScore) })}
          </Badge>
        </div>

        <div className="space-y-6">
          {quiz.questions.map((question, qIndex) => (
            <Card key={question.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">
                    {t("quiz.questionOf", {
                      current: String(qIndex + 1),
                      total: String(quiz.questions.length),
                    })}
                  </CardTitle>
                  {question.points > 1 && (
                    <Badge variant="secondary" className="text-xs">
                      {question.points} pt
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {question.question}
                </p>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-xs text-muted-foreground">
                  {question.type === "SINGLE_CHOICE" || question.type === "TRUE_FALSE"
                    ? t("quiz.selectAnswer")
                    : t("quiz.selectAnswers")}
                </p>

                {question.type === "SINGLE_CHOICE" ||
                question.type === "TRUE_FALSE" ? (
                  <RadioGroup
                    value={
                      answers[question.id]
                        ? String(answers[question.id][0])
                        : undefined
                    }
                    onValueChange={(val) =>
                      handleSingleChoice(question.id, parseInt(val))
                    }
                  >
                    {question.options.map((option, oIndex) => (
                      <div
                        key={oIndex}
                        className="flex items-center gap-3 rounded-lg border px-4 py-3 hover:bg-muted/50 transition-colors"
                      >
                        <RadioGroupItem
                          value={String(oIndex)}
                          id={`${question.id}-${oIndex}`}
                        />
                        <Label
                          htmlFor={`${question.id}-${oIndex}`}
                          className="flex-1 cursor-pointer text-sm font-normal"
                        >
                          {option.text}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                ) : (
                  <div className="grid gap-2">
                    {question.options.map((option, oIndex) => (
                      <div
                        key={oIndex}
                        className="flex items-center gap-3 rounded-lg border px-4 py-3 hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          id={`${question.id}-${oIndex}`}
                          checked={
                            answers[question.id]?.includes(oIndex) ?? false
                          }
                          onCheckedChange={() =>
                            handleMultipleChoice(question.id, oIndex)
                          }
                        />
                        <Label
                          htmlFor={`${question.id}-${oIndex}`}
                          className="flex-1 cursor-pointer text-sm font-normal"
                        >
                          {option.text}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="sticky bottom-4 flex gap-3">
          <Button
            variant="outline"
            onClick={() => setPhase("intro")}
            className="flex-1"
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!allAnswered || isPending}
            className="flex-1"
          >
            {isPending ? t("quiz.submitting") : t("quiz.submitQuiz")}
          </Button>
        </div>
      </div>
    );
  }

  // ── Result Phase ─────────────────────────────────────────────────
  if (phase === "result" && result) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Score Card */}
        <Card
          className={
            result.passed
              ? "border-green-200 dark:border-green-800"
              : "border-destructive/30"
          }
        >
          <CardContent className="pt-6">
            <div className="text-center space-y-3">
              {result.passed ? (
                <Trophy className="mx-auto h-12 w-12 text-green-600 dark:text-green-400" />
              ) : (
                <XCircle className="mx-auto h-12 w-12 text-destructive" />
              )}
              <h2 className="text-2xl font-bold">
                {result.passed ? t("quiz.passed") : t("quiz.failed")}
              </h2>
              <p className="text-3xl font-bold">
                {t("quiz.yourScore", { score: String(result.score) })}
              </p>
              <p className="text-sm text-muted-foreground">
                {result.passed
                  ? t("quiz.passedMessage")
                  : t("quiz.failedMessage", {
                      threshold: String(quiz.passingScore),
                    })}
              </p>

              {!result.passed && result.attemptsRemaining !== null && (
                <p className="text-sm text-muted-foreground">
                  {result.attemptsRemaining > 0
                    ? t("quiz.failedWithRetry", {
                        remaining: String(result.attemptsRemaining),
                      })
                    : t("quiz.failedNoRetry")}
                </p>
              )}

              {result.certificateIssued && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/50">
                  <div className="flex items-center justify-center gap-2 text-green-700 dark:text-green-400">
                    <Award className="h-5 w-5" />
                    <span className="font-medium">
                      {t("quiz.certificateIssued")}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Per-question Results */}
        <div className="space-y-4">
          <h3 className="font-semibold">{t("quiz.resultTitle")}</h3>
          {result.results.map((qResult, qIndex) => {
            const question = quiz.questions[qIndex];
            return (
              <Card
                key={qResult.questionId}
                className={
                  qResult.correct
                    ? "border-green-200 dark:border-green-800"
                    : "border-destructive/30"
                }
              >
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-start gap-2">
                    {qResult.correct ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                    ) : (
                      <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {t("quiz.questionOf", {
                          current: String(qIndex + 1),
                          total: String(quiz.questions.length),
                        })}
                      </p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {question.question}
                      </p>
                    </div>
                    <Badge
                      variant={qResult.correct ? "default" : "destructive"}
                      className="shrink-0"
                    >
                      {qResult.correct ? t("quiz.correct") : t("quiz.incorrect")}
                    </Badge>
                  </div>

                  {/* Show options with correct/incorrect markings */}
                  <div className="ml-7 space-y-1.5">
                    {question.options.map((option, oIndex) => {
                      const isCorrect = qResult.correctOptions.includes(oIndex);
                      const isSelected = qResult.selectedOptions.includes(oIndex);
                      return (
                        <div
                          key={oIndex}
                          className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm ${
                            isCorrect
                              ? "bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400"
                              : isSelected
                                ? "bg-destructive/10 text-destructive"
                                : "text-muted-foreground"
                          }`}
                        >
                          {isCorrect && (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          )}
                          {isSelected && !isCorrect && (
                            <XCircle className="h-3.5 w-3.5 shrink-0" />
                          )}
                          {!isCorrect && !isSelected && (
                            <span className="w-3.5" />
                          )}
                          <span>{option.text}</span>
                        </div>
                      );
                    })}
                  </div>

                  {qResult.explanation && (
                    <>
                      <Separator />
                      <div className="ml-7 flex items-start gap-2 text-sm">
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                        <div>
                          <span className="font-medium">
                            {t("quiz.explanation")}:{" "}
                          </span>
                          <span className="text-muted-foreground">
                            {qResult.explanation}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          {!result.passed &&
            (result.attemptsRemaining === null ||
              result.attemptsRemaining > 0) && (
              <Button onClick={handleRetry} variant="outline" className="flex-1">
                {t("quiz.tryAgain")}
              </Button>
            )}
          {result.certificateIssued && (
            <Button asChild className="flex-1">
              <Link href="/certificates">{t("quiz.viewCertificate")}</Link>
            </Button>
          )}
          <Button asChild variant="outline" className="flex-1">
            <Link href={`/modules/${quiz.moduleId}`}>
              {t("quiz.backToModule")}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
