"use client";

import { createContext, useContext, useMemo, useState, useCallback, type ReactNode } from "react";
import type { UnderstandResult, Field } from "@/lib/form-model";

/**
 * Carries the File the user picked, the /api/understand result fetched from
 * it, and the answers collected while walking through it, to whatever page
 * needs them next. None of this survives a hard refresh (a File can't go in
 * sessionStorage; the result isn't re-fetched on purpose — /fields and
 * /answer read what /review already paid to compute, rather than calling the
 * model again for the same document).
 */
type AnswerValue = Field["answer"];

interface FormSessionValue {
  file: File | null;
  setFile: (file: File | null) => void;
  result: UnderstandResult | null;
  setResult: (result: UnderstandResult | null) => void;
  answers: Record<string, AnswerValue>;
  setAnswer: (fieldId: string, value: AnswerValue) => void;
}

const FormSessionContext = createContext<FormSessionValue | null>(null);

export function FormSessionProvider({ children }: { children: ReactNode }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UnderstandResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});

  const setAnswer = useCallback((fieldId: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
  }, []);

  const value = useMemo(
    () => ({ file, setFile, result, setResult, answers, setAnswer }),
    [file, result, answers, setAnswer]
  );
  return <FormSessionContext.Provider value={value}>{children}</FormSessionContext.Provider>;
}

export function useFormSession(): FormSessionValue {
  const context = useContext(FormSessionContext);
  if (!context) {
    throw new Error("useFormSession must be used within a FormSessionProvider");
  }
  return context;
}
