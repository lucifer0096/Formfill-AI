"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Notice from "@/components/ui/Notice";
import { useFormSession } from "@/lib/form-session-context";
import { useRouteFocus } from "@/lib/use-route-focus";
import type { UnderstandResult } from "@/lib/form-model";

type LoadState =
  | { status: "no-file" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: UnderstandResult };

export default function ReviewPage() {
  const router = useRouter();
  const { file, setResult } = useFormSession();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const headingRef = useRouteFocus<HTMLHeadingElement>();

  useEffect(() => {
    if (!file) {
      setState({ status: "no-file" });
      return;
    }

    // AbortController actually cancels the in-flight request, unlike a plain
    // boolean flag — necessary because React Strict Mode (dev only) mounts
    // this effect twice, and a paid model call left merely "ignored" instead
    // of aborted still completes and bills twice.
    const controller = new AbortController();
    setState({ status: "loading" });

    const formData = new FormData();
    formData.append("file", file);

    fetch("/api/understand", { method: "POST", body: formData, signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setState({ status: "error", message: data.error ?? "Something went wrong." });
          return;
        }
        setState({ status: "ready", result: data as UnderstandResult });
        setResult(data as UnderstandResult);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: "Could not reach the server. Try again." });
      });

    return () => {
      controller.abort();
    };
  }, [file]);

  return (
    <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <div className="space-y-10">
        <section aria-labelledby="page-heading" tabIndex={0} className="rounded-lg">
          <h1 id="page-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">
            Review extracted fields
          </h1>
          <p className="mt-3 text-lg text-muted">
            {file ? `Reading ${file.name}…` : "What we found on your form."}
          </p>
        </section>

        {state.status === "no-file" && (
          <Card as="section" aria-labelledby="no-file-heading" tabIndex={0} className="space-y-4">
            <h2 id="no-file-heading" className="text-xl font-semibold">
              No form uploaded yet
            </h2>
            <p className="text-muted">Go back and upload a PDF, PNG, or JPG form to continue.</p>
            <div className="flex justify-end">
              <Link href="/">
                <Button type="button" variant="primary">
                  Back to upload
                </Button>
              </Link>
            </div>
          </Card>
        )}

        {state.status === "loading" && (
          <Card as="section" aria-labelledby="loading-heading" tabIndex={0}>
            <h2 id="loading-heading" className="sr-only">
              Reading your form
            </h2>
            <p role="status" aria-live="polite" className="text-lg">
              Reading your form — this can some minutes based on the form complexity…
            </p>
          </Card>
        )}

        {state.status === "error" && (
          <>
            <Notice>{state.message}</Notice>
            <div className="flex justify-end">
              <Link href="/">
                <Button type="button" variant="secondary">
                  Back to upload
                </Button>
              </Link>
            </div>
          </>
        )}

        {state.status === "ready" && (
          <>
            <Card as="section" aria-labelledby="description-heading" tabIndex={0}>
              <h2 id="description-heading" className="text-xl font-semibold">
                About this form
              </h2>
              <p className="mt-3 text-lg">{state.result.description}</p>
            </Card>

            <Card as="section" aria-labelledby="sections-heading" tabIndex={0}>
              <h2 id="sections-heading" className="text-xl font-semibold">
                Sections
              </h2>
              <p className="mt-1 text-muted">
                {state.result.totalFields} field{state.result.totalFields === 1 ? "" : "s"} to
                fill in, across {state.result.sections.length} section
                {state.result.sections.length === 1 ? "" : "s"}.
              </p>
              <ol className="mt-5 space-y-4">
                {state.result.sections.map((section, index) => (
                  <li key={`${section.title}-${index}`} className="flex items-baseline gap-4">
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-muted text-sm font-bold"
                    >
                      {index + 1}
                    </span>
                    <span>
                      <span className="block font-semibold">{section.title}</span>
                      <span className="block text-sm text-muted">
                        {section.fields.length} field{section.fields.length === 1 ? "" : "s"}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </Card>

            <div className="flex justify-end">
              <Button type="button" variant="primary" onClick={() => router.push("/fields")}>
                Continue
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
