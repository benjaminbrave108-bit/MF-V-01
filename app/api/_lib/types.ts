// Kept in sync with the `Page`/`Kind` unions defined in app/page.tsx.
// Duplicated here (rather than imported from the client component) to keep
// the API layer decoupled from the client UI file.
export type Kind = "cash" | "income" | "expense";
export type Page = "dashboard" | Kind | "reportBuilder" | "notes" | "archive" | "users" | "settings";
