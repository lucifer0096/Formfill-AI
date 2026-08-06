"use client";

import { useId } from "react";
import type { Field } from "@/lib/form-model";
import { isAffirmativeOption } from "@/lib/answer-format";

type AnswerValue = Field["answer"];

interface AnswerControlProps {
  field: Field;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
}

const inputClassName =
  "w-full rounded-md border-2 border-muted/60 bg-background px-4 py-3 text-lg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent-strong";

function OptionButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-md border-2 px-6 py-3 text-lg font-medium transition-colors ${
        selected
          ? "border-accent-strong bg-accent-strong text-white"
          : "border-muted/60 bg-background text-foreground hover:border-accent-strong"
      }`}
    >
      {label}
    </button>
  );
}

export default function AnswerControl({ field, value, onChange }: AnswerControlProps) {
  const inputId = useId();

  if (field.type === "boolean") {
    const options = field.options?.length ? field.options : [
      { value: "true", label: "Yes" },
      { value: "false", label: "No" },
    ];
    return (
      <div className="flex flex-wrap gap-4">
        {options.map((option, index) => {
          const affirmative = isAffirmativeOption(option, index);
          return (
            <OptionButton
              key={option.value}
              label={option.label}
              selected={value === affirmative}
              onClick={() => onChange(affirmative)}
            />
          );
        })}
      </div>
    );
  }

  if (field.type === "choice") {
    const options = field.options ?? [];
    return (
      <div className="flex flex-wrap gap-4">
        {options.map((option) => (
          <OptionButton
            key={option.value}
            label={option.label}
            selected={value === option.value}
            onClick={() => onChange(option.value)}
          />
        ))}
      </div>
    );
  }

  if (field.type === "multichoice") {
    const options = field.options ?? [];
    const selectedValues = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-wrap gap-4">
        {options.map((option) => {
          const selected = selectedValues.includes(option.value);
          return (
            <OptionButton
              key={option.value}
              label={option.label}
              selected={selected}
              onClick={() =>
                onChange(
                  selected
                    ? selectedValues.filter((v) => v !== option.value)
                    : [...selectedValues, option.value]
                )
              }
            />
          );
        })}
      </div>
    );
  }

  if (field.type === "longtext") {
    return (
      <textarea
        id={inputId}
        rows={4}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        className={inputClassName}
      />
    );
  }

  const inputType =
    field.type === "email"
      ? "email"
      : field.type === "phone"
        ? "tel"
        : field.type === "date"
          ? "date"
          : field.type === "number" || field.type === "currency"
            ? "number"
            : "text";

  return (
    <input
      id={inputId}
      type={inputType}
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value)}
      className={inputClassName}
    />
  );
}
