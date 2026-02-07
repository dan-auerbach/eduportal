"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  updateModule,
  publishModule,
  archiveModule,
  createSection,
  assignModuleToGroup,
  removeModuleFromGroup,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  saveQuizQuestion,
  deleteQuizQuestion,
} from "@/actions/modules";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Globe,
  Archive,
  Plus,
  Save,
  Tag,
  Users,
  X,
  Trash2,
  ClipboardList,
  Settings2,
} from "lucide-react";
import { SectionList } from "./section-list";
import { SectionEditorSheet } from "./section-editor";
import { CategoryManager } from "./category-manager";
import { CoverImageUpload } from "./cover-image-upload";
import type { Difficulty, ModuleStatus, SectionType } from "@/generated/prisma/client";
import { t } from "@/lib/i18n";

interface SectionData {
  id: string;
  title: string;
  content: string;
  type: SectionType;
  sortOrder: number;
  unlockAfterSectionId: string | null;
  videoSourceType: "YOUTUBE_VIMEO_URL" | "UPLOAD";
  videoBlobUrl: string | null;
  videoFileName: string | null;
  videoSize: number | null;
  videoMimeType: string | null;
}

interface GroupAssignment {
  moduleId: string;
  groupId: string;
  deadlineDays: number | null;
  isMandatory: boolean;
  group: {
    id: string;
    name: string;
    color: string | null;
  };
}

interface TagData {
  tag: {
    id: string;
    name: string;
  };
}

interface QuizQuestionData {
  id: string;
  question: string;
  options: { text: string; isCorrect: boolean }[];
  sortOrder: number;
}

interface QuizData {
  id: string;
  title: string;
  passingScore: number;
  maxAttempts: number;
  questions: QuizQuestionData[];
}

interface ModuleEditorProps {
  moduleId: string;
  module: {
    title: string;
    description: string;
    difficulty: Difficulty;
    estimatedTime: number | null;
    isMandatory: boolean;
    status: ModuleStatus;
    coverImage: string | null;
    version: number;
    categoryId: string | null;
  };
  sections: SectionData[];
  groups: GroupAssignment[];
  tags: TagData[];
  allGroups: { id: string; name: string; color: string | null }[];
  allCategories: { id: string; name: string }[];
  quizzes?: QuizData[];
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function ModuleEditor({
  moduleId,
  module,
  sections,
  groups,
  tags,
  allGroups,
  allCategories,
  quizzes = [],
}: ModuleEditorProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [addingSectionLoading, setAddingSectionLoading] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [currentTags, setCurrentTags] = useState(
    tags.map((tagItem) => tagItem.tag.name)
  );

  // Module metadata form state
  const [title, setTitle] = useState(module.title);
  const [description, setDescription] = useState(module.description);
  const [difficulty, setDifficulty] = useState<Difficulty>(module.difficulty);
  const [estimatedTime, setEstimatedTime] = useState(
    module.estimatedTime?.toString() || ""
  );
  const [isMandatory, setIsMandatory] = useState(module.isMandatory);
  const [categoryId, setCategoryId] = useState<string | null>(module.categoryId);
  const [coverImage, setCoverImage] = useState<string | null>(module.coverImage);

  // Group assignment state
  const [assignLoading, setAssignLoading] = useState<string | null>(null);

  // Change tracking state (for published modules)
  const [changeSummary, setChangeSummary] = useState("");

  // Quiz state
  const [addingQuiz, setAddingQuiz] = useState(false);
  const [newQuizTitle, setNewQuizTitle] = useState("");

  // Section editor state
  const [selectedSection, setSelectedSection] = useState<SectionData | null>(null);
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null);

  // Auto-open newly created section in drawer
  useEffect(() => {
    if (pendingOpenId) {
      const found = sections.find((s) => s.id === pendingOpenId);
      if (found) {
        setSelectedSection(found);
        setPendingOpenId(null);
      }
    }
  }, [sections, pendingOpenId]);

  const assignedGroupIds = new Set(groups.map((g) => g.groupId));

  async function handleSaveMetadata() {
    setSaving(true);

    const data = {
      title,
      description,
      difficulty,
      estimatedTime: estimatedTime ? parseInt(estimatedTime) : null,
      isMandatory,
      categoryId,
      coverImage,
    };

    const result = await updateModule(
      moduleId,
      data,
      module.status === "PUBLISHED" ? changeSummary || undefined : undefined
    );

    if (result.success) {
      toast.success(t("admin.editor.moduleSaved"));
      setChangeSummary("");
      router.refresh();
    } else {
      toast.error(result.error);
    }

    setSaving(false);
  }

  async function handlePublish() {
    const result = await publishModule(moduleId);
    if (result.success) {
      toast.success(t("admin.modules.modulePublished"));
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleArchive() {
    const result = await archiveModule(moduleId);
    if (result.success) {
      toast.success(t("admin.modules.moduleArchived"));
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleAddSection() {
    setAddingSectionLoading(true);

    const data = {
      title: t("admin.sectionEditor.newSection"),
      content: "",
      type: "TEXT",
    };

    const result = await createSection(moduleId, data);

    if (result.success) {
      toast.success(t("admin.editor.sectionAdded"));
      setPendingOpenId(result.data.id);
      router.refresh();
    } else {
      toast.error(result.error);
    }

    setAddingSectionLoading(false);
  }

  async function handleToggleGroup(groupId: string, isAssigned: boolean) {
    setAssignLoading(groupId);

    if (isAssigned) {
      const result = await removeModuleFromGroup(moduleId, groupId);
      if (result.success) {
        toast.success(t("admin.editor.groupUnassigned"));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } else {
      const result = await assignModuleToGroup(moduleId, groupId);
      if (result.success) {
        toast.success(t("admin.editor.groupAssigned"));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    }

    setAssignLoading(null);
  }

  async function handleUnassignGroup(groupId: string) {
    const result = await removeModuleFromGroup(moduleId, groupId);
    if (result.success) {
      toast.success(t("admin.editor.groupUnassigned"));
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  // Quiz handlers
  async function handleAddQuiz() {
    if (!newQuizTitle.trim()) return;
    setAddingQuiz(true);

    const result = await createQuiz(moduleId, { title: newQuizTitle.trim() });
    if (result.success) {
      toast.success(t("admin.quizEditor.quizSaved"));
      setNewQuizTitle("");
      router.refresh();
    } else {
      toast.error(result.error);
    }

    setAddingQuiz(false);
  }

  async function handleDeleteQuiz(quizId: string) {
    if (!confirm(t("admin.quizEditor.confirmDeleteQuiz"))) return;

    const result = await deleteQuiz(quizId);
    if (result.success) {
      toast.success(t("admin.quizEditor.quizDeleted"));
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  function handleAddTag() {
    const trimmed = tagInput.trim();
    if (trimmed && !currentTags.includes(trimmed)) {
      setCurrentTags([...currentTags, trimmed]);
      setTagInput("");
    }
  }

  function handleRemoveTag(tag: string) {
    setCurrentTags(currentTags.filter((tagName) => tagName !== tag));
  }

  const allSectionRefs = sections.map((s) => ({
    id: s.id,
    title: s.title,
  }));

  return (
    <div className="space-y-6">
      {/* Sticky Status & Actions Bar */}
      <div className="sticky top-0 z-10 -mx-1 px-1 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className={
                module.status === "PUBLISHED"
                  ? "bg-green-100 text-green-800"
                  : module.status === "DRAFT"
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-gray-100 text-gray-800"
              }
            >
              {t(`moduleStatus.${module.status}`)}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {t("admin.editor.version", { version: module.version })}
            </Badge>
            {module.isMandatory && (
              <Badge variant="destructive">{t("common.mandatory")}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleSaveMetadata} disabled={saving} size="sm">
              <Save className="mr-1 h-4 w-4" />
              {saving ? t("common.saving") : t("admin.editor.saveDetails")}
            </Button>
            {module.status !== "PUBLISHED" && (
              <Button variant="default" size="sm" onClick={handlePublish}>
                <Globe className="mr-1 h-4 w-4" />
                {t("admin.modules.publish")}
              </Button>
            )}
            {module.status !== "ARCHIVED" && (
              <Button variant="outline" size="sm" onClick={handleArchive}>
                <Archive className="mr-1 h-4 w-4" />
                {t("admin.modules.archive")}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Module Metadata — Two-column layout */}
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.editor.moduleDetails")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left column: Title + Description */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">{t("admin.editor.title")}</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t("admin.editor.description")}</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                />
              </div>
            </div>

            {/* Right column: Difficulty, Time, Mandatory, Category */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="difficulty">{t("admin.editor.difficulty")}</Label>
                  <Select
                    value={difficulty}
                    onValueChange={(v) => setDifficulty(v as Difficulty)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BEGINNER">{t("difficulty.BEGINNER")}</SelectItem>
                      <SelectItem value="INTERMEDIATE">{t("difficulty.INTERMEDIATE")}</SelectItem>
                      <SelectItem value="ADVANCED">{t("difficulty.ADVANCED")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="estimatedTime">{t("admin.editor.estimatedTime")}</Label>
                  <Input
                    id="estimatedTime"
                    type="number"
                    value={estimatedTime}
                    onChange={(e) => setEstimatedTime(e.target.value)}
                    min={1}
                    placeholder={t("admin.editor.estimatedTimePlaceholder")}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">{t("admin.editor.category")}</Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={categoryId || "__none__"}
                    onValueChange={(v) => setCategoryId(v === "__none__" ? null : v)}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={t("admin.editor.selectCategory")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t("admin.editor.noCategory")}</SelectItem>
                      {allCategories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <CategoryManager
                    categories={allCategories.map((c) => ({ ...c, sortOrder: 0, _count: { modules: 0 } }))}
                    trigger={
                      <Button variant="outline" size="icon" type="button" title={t("admin.editor.manageCategories")}>
                        <Settings2 className="h-4 w-4" />
                      </Button>
                    }
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Switch
                  id="mandatory"
                  checked={isMandatory}
                  onCheckedChange={setIsMandatory}
                />
                <Label htmlFor="mandatory">{t("admin.editor.mandatory")}</Label>
              </div>

              {/* Cover image upload */}
              <CoverImageUpload
                currentImage={coverImage}
                onImageChange={setCoverImage}
              />
            </div>
          </div>

          {/* Change summary — full width below both columns */}
          {module.status === "PUBLISHED" && (
            <div className="space-y-2 pt-2 border-t">
              <Label htmlFor="changeSummary">
                {t("admin.editor.changeSummary")}
                <span className="text-xs text-muted-foreground ml-2">
                  {t("admin.editor.changeSummaryRequired")}
                </span>
              </Label>
              <Textarea
                id="changeSummary"
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                placeholder={t("admin.editor.changeSummaryPlaceholder")}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                {t("admin.editor.changeSummaryHelper")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sections */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("admin.editor.sections", { count: sections.length })}</CardTitle>
          <Button
            size="sm"
            onClick={handleAddSection}
            disabled={addingSectionLoading}
          >
            <Plus className="mr-1 h-4 w-4" />
            {addingSectionLoading ? t("common.adding") : t("admin.editor.addSection")}
          </Button>
        </CardHeader>
        <CardContent>
          <SectionList
            sections={sections}
            moduleId={moduleId}
            onSelectSection={setSelectedSection}
            selectedSectionId={selectedSection?.id}
          />
        </CardContent>
      </Card>

      {/* Section Editor Drawer */}
      <SectionEditorSheet
        section={selectedSection}
        allSections={allSectionRefs}
        moduleId={moduleId}
        onClose={() => setSelectedSection(null)}
      />

      {/* Quizzes */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            {t("admin.quizEditor.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {quizzes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("admin.quizEditor.noQuizzes")}
            </p>
          ) : (
            quizzes.map((quiz) => (
              <QuizEditor
                key={quiz.id}
                quiz={quiz}
                onDelete={() => handleDeleteQuiz(quiz.id)}
              />
            ))
          )}

          <Separator />
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label>{t("admin.quizEditor.quizTitle")}</Label>
              <Input
                placeholder={t("admin.quizEditor.quizTitlePlaceholder")}
                value={newQuizTitle}
                onChange={(e) => setNewQuizTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddQuiz();
                  }
                }}
              />
            </div>
            <Button
              size="sm"
              onClick={handleAddQuiz}
              disabled={!newQuizTitle.trim() || addingQuiz}
            >
              <Plus className="mr-1 h-4 w-4" />
              {t("admin.quizEditor.addQuiz")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Group Assignments — Checkbox list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t("admin.editor.groupAssignments")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {allGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("admin.editor.noSections")}
            </p>
          ) : (
            <div className="space-y-2">
              {allGroups.map((group) => {
                const isAssigned = assignedGroupIds.has(group.id);
                const assignment = groups.find((g) => g.groupId === group.id);
                const isLoading = assignLoading === group.id;

                return (
                  <div
                    key={group.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={`group-${group.id}`}
                        checked={isAssigned}
                        disabled={isLoading}
                        onCheckedChange={() => handleToggleGroup(group.id, isAssigned)}
                      />
                      {group.color && (
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: group.color }}
                        />
                      )}
                      <Label
                        htmlFor={`group-${group.id}`}
                        className="cursor-pointer font-medium"
                      >
                        {group.name}
                      </Label>
                      {assignment?.deadlineDays && (
                        <Badge variant="outline" className="text-xs">
                          {t("admin.editor.deadlineDaysLabel", { days: assignment.deadlineDays })}
                        </Badge>
                      )}
                      {assignment?.isMandatory && (
                        <Badge variant="destructive" className="text-xs">
                          {t("common.mandatory")}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Deadline and mandatory settings for assigned groups */}
          {groups.length > 0 && (
            <>
              <Separator />
              <p className="text-xs text-muted-foreground">
                {t("admin.editor.deadlineDaysHelper")}
              </p>
              <div className="space-y-2">
                {groups.map((ga) => (
                  <GroupSettings
                    key={ga.groupId}
                    moduleId={moduleId}
                    groupAssignment={ga}
                  />
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Tags */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            {t("admin.editor.tags")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {currentTags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1">
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-1 rounded-full hover:bg-muted-foreground/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder={t("admin.editor.addTag")}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              className="max-w-xs"
            />
            <Button variant="outline" size="sm" onClick={handleAddTag}>
              <Plus className="mr-1 h-4 w-4" />
              {t("common.add")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("admin.editor.tagHint")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Group Settings Row ───────────────────────────────────────────────
function GroupSettings({
  moduleId,
  groupAssignment,
}: {
  moduleId: string;
  groupAssignment: GroupAssignment;
}) {
  const router = useRouter();
  const [deadlineDays, setDeadlineDays] = useState(
    groupAssignment.deadlineDays?.toString() || ""
  );
  const [isMandatory, setIsMandatory] = useState(groupAssignment.isMandatory);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const result = await assignModuleToGroup(
      moduleId,
      groupAssignment.groupId,
      deadlineDays ? parseInt(deadlineDays) : undefined,
      isMandatory
    );
    if (result.success) {
      toast.success(t("admin.editor.groupAssigned"));
      router.refresh();
    } else {
      toast.error(result.error);
    }
    setSaving(false);
  }

  return (
    <div className="flex items-center gap-3 rounded-md border p-2">
      {groupAssignment.group.color && (
        <div
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: groupAssignment.group.color }}
        />
      )}
      <span className="text-sm font-medium min-w-[100px]">
        {groupAssignment.group.name}
      </span>
      <Input
        type="number"
        min={1}
        placeholder={t("admin.editor.deadlineDaysPlaceholder")}
        value={deadlineDays}
        onChange={(e) => setDeadlineDays(e.target.value)}
        className="w-24"
      />
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {t("admin.editor.deadlineDaysInput")}
      </span>
      <div className="flex items-center gap-1">
        <Switch
          checked={isMandatory}
          onCheckedChange={setIsMandatory}
        />
        <span className="text-xs">{t("common.mandatory")}</span>
      </div>
      <Button size="sm" variant="outline" onClick={handleSave} disabled={saving}>
        <Save className="h-3 w-3" />
      </Button>
    </div>
  );
}

// ─── Quiz Editor ──────────────────────────────────────────────────────
function QuizEditor({
  quiz,
  onDelete,
}: {
  quiz: QuizData;
  onDelete: () => void;
}) {
  const router = useRouter();
  const [quizTitle, setQuizTitle] = useState(quiz.title);
  const [passingScore, setPassingScore] = useState(quiz.passingScore.toString());
  const [maxAttempts, setMaxAttempts] = useState(quiz.maxAttempts.toString());
  const [savingMeta, setSavingMeta] = useState(false);

  async function handleSaveMeta() {
    setSavingMeta(true);
    const result = await updateQuiz(quiz.id, {
      title: quizTitle,
      passingScore: parseInt(passingScore) || 70,
      maxAttempts: parseInt(maxAttempts) || 3,
    });
    if (result.success) {
      toast.success(t("admin.quizEditor.quizSaved"));
      router.refresh();
    } else {
      toast.error(result.error);
    }
    setSavingMeta(false);
  }

  return (
    <div className="rounded-lg border p-4 space-y-4">
      {/* Quiz metadata */}
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-3">
            <Input
              value={quizTitle}
              onChange={(e) => setQuizTitle(e.target.value)}
              className="font-medium"
            />
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">{t("admin.quizEditor.passingScore")}</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={passingScore}
                onChange={(e) => setPassingScore(e.target.value)}
                className="w-20"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">{t("admin.quizEditor.maxAttempts")}</Label>
              <Input
                type="number"
                min={1}
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(e.target.value)}
                className="w-20"
              />
            </div>
            <Button size="sm" variant="outline" onClick={handleSaveMeta} disabled={savingMeta}>
              <Save className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <Separator />

      {/* Questions */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold">{t("admin.quizEditor.questions")}</h4>

        {quiz.questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("admin.quizEditor.noQuestions")}
          </p>
        ) : (
          quiz.questions.map((question, qIndex) => (
            <QuestionEditor
              key={question.id}
              quizId={quiz.id}
              question={question}
              index={qIndex}
            />
          ))
        )}

        <NewQuestionForm quizId={quiz.id} />
      </div>
    </div>
  );
}

// ─── Question Editor (existing question) ─────────────────────────────
function QuestionEditor({
  quizId,
  question,
  index,
}: {
  quizId: string;
  question: QuizQuestionData;
  index: number;
}) {
  const router = useRouter();
  const [questionText, setQuestionText] = useState(question.question);
  const [options, setOptions] = useState(question.options);
  const [saving, setSaving] = useState(false);

  function updateOptionText(idx: number, text: string) {
    setOptions(options.map((o, i) => (i === idx ? { ...o, text } : o)));
  }

  function setCorrectOption(idx: number) {
    setOptions(options.map((o, i) => ({ ...o, isCorrect: i === idx })));
  }

  function addOption() {
    setOptions([...options, { text: "", isCorrect: false }]);
  }

  function removeOption(idx: number) {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!questionText.trim()) return;
    if (options.length < 2) {
      toast.error(t("admin.quizEditor.minTwoOptions"));
      return;
    }
    if (!options.some((o) => o.isCorrect)) {
      toast.error(t("admin.quizEditor.selectCorrectAnswer"));
      return;
    }

    setSaving(true);
    const result = await saveQuizQuestion(quizId, {
      id: question.id,
      question: questionText,
      options,
      sortOrder: question.sortOrder,
    });
    if (result.success) {
      toast.success(t("admin.quizEditor.questionSaved"));
      router.refresh();
    } else {
      toast.error(result.error);
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm(t("admin.quizEditor.confirmDeleteQuestion"))) return;

    const result = await deleteQuizQuestion(question.id);
    if (result.success) {
      toast.success(t("admin.quizEditor.questionDeleted"));
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex items-start gap-2">
        <span className="text-sm font-medium text-muted-foreground mt-2">
          {index + 1}.
        </span>
        <div className="flex-1 space-y-2">
          <Input
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            placeholder={t("admin.quizEditor.questionPlaceholder")}
          />
          <div className="space-y-1">
            {options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`q-${question.id}`}
                  checked={opt.isCorrect}
                  onChange={() => setCorrectOption(idx)}
                  className="accent-primary"
                />
                <span className="text-xs font-medium text-muted-foreground w-4">
                  {LETTERS[idx]}
                </span>
                <Input
                  value={opt.text}
                  onChange={(e) => updateOptionText(idx, e.target.value)}
                  placeholder={t("admin.quizEditor.optionPlaceholder")}
                  className="h-8 text-sm"
                />
                {options.length > 2 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() => removeOption(idx)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={addOption}>
              <Plus className="mr-1 h-3 w-3" />
              {t("admin.quizEditor.addOption")}
            </Button>
          </div>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={handleSave} disabled={saving}>
            <Save className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={handleDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── New Question Form ───────────────────────────────────────────────
function NewQuestionForm({ quizId }: { quizId: string }) {
  const router = useRouter();
  const [questionText, setQuestionText] = useState("");
  const [options, setOptions] = useState<{ text: string; isCorrect: boolean }[]>([
    { text: "", isCorrect: true },
    { text: "", isCorrect: false },
  ]);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  function updateOptionText(idx: number, text: string) {
    setOptions(options.map((o, i) => (i === idx ? { ...o, text } : o)));
  }

  function setCorrectOption(idx: number) {
    setOptions(options.map((o, i) => ({ ...o, isCorrect: i === idx })));
  }

  function addOption() {
    setOptions([...options, { text: "", isCorrect: false }]);
  }

  function removeOption(idx: number) {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!questionText.trim()) return;
    if (options.filter((o) => o.text.trim()).length < 2) {
      toast.error(t("admin.quizEditor.minTwoOptions"));
      return;
    }
    if (!options.some((o) => o.isCorrect)) {
      toast.error(t("admin.quizEditor.selectCorrectAnswer"));
      return;
    }

    setSaving(true);
    const result = await saveQuizQuestion(quizId, {
      question: questionText,
      options: options.filter((o) => o.text.trim()),
    });
    if (result.success) {
      toast.success(t("admin.quizEditor.questionSaved"));
      setQuestionText("");
      setOptions([
        { text: "", isCorrect: true },
        { text: "", isCorrect: false },
      ]);
      setExpanded(false);
      router.refresh();
    } else {
      toast.error(result.error);
    }
    setSaving(false);
  }

  if (!expanded) {
    return (
      <Button variant="outline" size="sm" onClick={() => setExpanded(true)}>
        <Plus className="mr-1 h-3 w-3" />
        {t("admin.quizEditor.addQuestion")}
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-dashed p-3 space-y-3">
      <div className="flex-1 space-y-2">
        <Input
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
          placeholder={t("admin.quizEditor.questionPlaceholder")}
          autoFocus
        />
        <div className="space-y-1">
          {options.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="radio"
                name={`new-q-${quizId}`}
                checked={opt.isCorrect}
                onChange={() => setCorrectOption(idx)}
                className="accent-primary"
              />
              <span className="text-xs font-medium text-muted-foreground w-4">
                {LETTERS[idx]}
              </span>
              <Input
                value={opt.text}
                onChange={(e) => updateOptionText(idx, e.target.value)}
                placeholder={t("admin.quizEditor.optionPlaceholder")}
                className="h-8 text-sm"
              />
              {options.length > 2 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={() => removeOption(idx)}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={addOption}>
            <Plus className="mr-1 h-3 w-3" />
            {t("admin.quizEditor.addOption")}
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="mr-1 h-3 w-3" />
          {t("admin.quizEditor.saveQuiz")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setExpanded(false)}>
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}
