"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { reorderSections } from "@/actions/modules";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { GripVertical, Lock, ChevronRight, Video } from "lucide-react";
import type { SectionType } from "@/generated/prisma/client";
import { t } from "@/lib/i18n";

interface SectionData {
  id: string;
  title: string;
  content: string;
  type: SectionType;
  sortOrder: number;
  unlockAfterSectionId: string | null;
  videoSourceType: "YOUTUBE_VIMEO_URL" | "UPLOAD" | "TARGETVIDEO";
  videoBlobUrl: string | null;
  videoFileName: string | null;
  videoSize: number | null;
  videoMimeType: string | null;
}

interface SectionListProps {
  sections: SectionData[];
  moduleId: string;
  onSelectSection: (section: SectionData) => void;
  selectedSectionId?: string | null;
}

function getSectionTypeLabel(sectionType: SectionType): string {
  return t(`sectionType.${sectionType}`);
}

export function SectionList({
  sections,
  moduleId,
  onSelectSection,
  selectedSectionId,
}: SectionListProps) {
  const router = useRouter();
  const [items, setItems] = useState(sections);

  useEffect(() => {
    setItems(sections);
  }, [sections]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((s) => s.id === active.id);
    const newIndex = items.findIndex((s) => s.id === over.id);

    const newItems = arrayMove(items, oldIndex, newIndex);
    setItems(newItems);

    const result = await reorderSections(
      moduleId,
      newItems.map((s) => s.id)
    );

    if (result.success) {
      router.refresh();
    } else {
      setItems(sections);
      toast.error(result.error);
    }
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("admin.editor.noSections")}
      </p>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((s) => s.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-1">
          {items.map((section, index) => (
            <SortableSectionRow
              key={section.id}
              section={section}
              index={index}
              isSelected={section.id === selectedSectionId}
              onSelect={() => onSelectSection(section)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableSectionRow({
  section,
  index,
  isSelected,
  onSelect,
}: {
  section: SectionData;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-md border px-3 py-2 transition-colors ${
        isDragging ? "opacity-50" : ""
      } ${
        isSelected
          ? "bg-accent border-accent-foreground/20"
          : "hover:bg-muted/50 cursor-pointer"
      }`}
      onClick={onSelect}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="text-sm font-medium text-muted-foreground w-5 text-center">
        {index + 1}
      </span>
      <span className="flex-1 text-sm font-medium truncate">
        {section.title || t("admin.sectionEditor.untitledSection")}
      </span>
      {(section.type === "VIDEO" || section.type === "MIXED") && (
        <Badge className="text-xs shrink-0 bg-blue-600 hover:bg-blue-600 text-white gap-1">
          <Video className="h-3 w-3" />
          VIDEO
        </Badge>
      )}
      <Badge variant="outline" className="text-xs shrink-0">
        {getSectionTypeLabel(section.type)}
      </Badge>
      {section.unlockAfterSectionId && (
        <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      )}
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </div>
  );
}
