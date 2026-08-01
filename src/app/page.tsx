import SupportedFileTypes from "@/components/upload/SupportedFileTypes";
import StepsPanel, { type Step } from "@/components/StepsPanel";
import UploadWorkflow from "@/components/upload/UploadWorkflow";

const NEXT_STEPS: Step[] = [
  { title: "Upload form", description: "Upload your PDF, PNG, or JPG form." },
  { title: "Review extracted fields", description: "We'll find the fields and prepare your form." },
  { title: "Form overview", description: "Review the form structure and detected fields." },
  { title: "Answer questions", description: "Complete the form using our guided workflow." },
  { title: "Review answers", description: "Check your answers before finishing." },
];

export default function Home() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      {/*
        DOM order (and therefore Tab order) stays 1-2-3-4 regardless of screen
        size. The `session-grid` rule in globals.css only repositions items
        visually on md+ screens: 1 and 2 stack in the left column, 3 sits
        beside them on the right, 4 spans full width underneath.
      */}
      <div className="session-grid space-y-10 md:space-y-0">
        {/* Tab stop 1: page intro */}
        <section aria-labelledby="page-heading" tabIndex={0} className="rounded-lg">
          <h1 id="page-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">
            Start a new form session
          </h1>
          <p className="mt-3 text-lg text-muted">
            Upload a PDF, PNG, or JPG form and complete it in an accessible, guided workflow.
          </p>
          <p className="mt-3 text-lg text-muted">
            Keyboard first navigation , Works with Screen readers, Optional text-to-speech support
          </p>
        </section>

        {/* Tab stop 2 */}
        <SupportedFileTypes />

        {/* Tab stop 3 */}
        <StepsPanel heading="What happens next" steps={NEXT_STEPS} />

        {/* Tab stop 4: drag-and-drop upload area, then Cancel/Continue */}
        <UploadWorkflow />
      </div>
    </main>
  );
}
