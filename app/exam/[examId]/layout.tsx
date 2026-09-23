"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { WizardFrame } from "@/components/wizard/WizardFrame";

export default function ExamLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ examId: string }>();
  const examId = params?.examId ?? "";
  return <WizardFrame examId={examId}>{children}</WizardFrame>;
}
