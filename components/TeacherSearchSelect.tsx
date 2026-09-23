"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Teacher } from "@/lib/types";

type Props = {
  teachers: Teacher[];
  value: string;
  onValueChange: (id: string) => void;
  placeholder?: string;
  className?: string;
};

function matchesTeacher(teacher: Teacher, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const homeroom =
    teacher.homeroomGrade && teacher.homeroomClass
      ? `${teacher.homeroomGrade}-${teacher.homeroomClass}`
      : "";
  return [teacher.name, teacher.subject, teacher.roleType ?? "", homeroom].some((s) =>
    s.toLowerCase().includes(q),
  );
}

function teacherLabel(t: Teacher): string {
  const homeroom =
    t.homeroomGrade && t.homeroomClass ? ` · ${t.homeroomGrade}-${t.homeroomClass}` : "";
  return `${t.name} (${t.subject})${homeroom}`;
}

export function TeacherSearchSelect({
  teachers,
  value,
  onValueChange,
  placeholder = "선택",
  className,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selected = teachers.find((t) => t.id === value);
  const filtered = React.useMemo(
    () => teachers.filter((t) => matchesTeacher(t, search)),
    [teachers, search],
  );

  React.useEffect(() => {
    if (!open) return;
    setSearch("");
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{selected ? teacherLabel(selected) : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="border-b p-2">
          <Input
            ref={inputRef}
            placeholder="이름·교과·담임 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
          />
        </div>
        <ul className="max-h-60 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <li className="px-2 py-6 text-center text-sm text-muted-foreground">검색 결과 없음</li>
          ) : (
            filtered.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                    value === t.id && "bg-accent",
                  )}
                  onClick={() => {
                    onValueChange(t.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("h-4 w-4 shrink-0", value === t.id ? "opacity-100" : "opacity-0")}
                  />
                  <span className="truncate">{teacherLabel(t)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
