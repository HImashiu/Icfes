import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Gate from "./Gate.jsx";
import QuestionReview from "./screens/QuestionReview.jsx";
import { AuthProvider } from "./lib/auth.jsx";
import "./styles.css";

// Question review (screens/QuestionReview.jsx): the student's view of one question, for checking the bank. It is
// never in a school build: it needs the dev server (exam files read straight from public/exams, no account) or
// VITE_QUESTION_REVIEW=1 at build time.
const reviewOpen = (import.meta.env.DEV || import.meta.env.VITE_QUESTION_REVIEW === "1") && window.location.hash.startsWith("#revision-preguntas");

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {reviewOpen ? <QuestionReview /> : (
      <AuthProvider>
        <Gate />
      </AuthProvider>
    )}
  </StrictMode>,
);
