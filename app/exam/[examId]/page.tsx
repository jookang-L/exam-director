"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";

export default function ExamIndexPage() {
  const params = useParams<{ examId: string }>();
  const router = useRouter();
  React.useEffect(() => {
    if (params?.examId) router.replace(`/exam/${params.examId}/setup`);
  }, [params, router]);
  return null;
}
