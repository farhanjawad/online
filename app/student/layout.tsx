/**
 * Student layout — provides the shared background/theme for all
 * /student/* pages. No auth gating here; the session check is
 * handled per-page (students only need their ID, not Firebase Auth).
 */
export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
