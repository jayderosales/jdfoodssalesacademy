/** Competency tags shared by quiz questions, roleplay rubric and the skills radar. */
export const COMPETENCIES = [
  { key: "opening", label: "Opening & rapport" },
  { key: "discovery", label: "Needs discovery" },
  { key: "product", label: "Product knowledge" },
  { key: "value", label: "Value & benefits" },
  { key: "objections", label: "Objection handling" },
  { key: "closing", label: "Closing & next step" },
  { key: "communication", label: "Professionalism" },
  { key: "company", label: "Company knowledge" },
  { key: "sop", label: "SOPs & process" },
] as const;

export const QUESTION_TYPE_LABEL = {
  mcq: "Multiple choice",
  multi: "Multi-select",
  tf: "True / false",
  short: "Short answer (AI-graded)",
  scenario: "Scenario (AI-graded)",
} as const;

export const OPTION_IDS = ["a", "b", "c", "d", "e", "f"] as const;
