/**
 * (public) route group layout — shared layout for landing, sign-in, sign-up.
 * The 3D scene will be mounted here in Phase 1 and persist across
 * auth card transitions (design_guide.md §5).
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative min-h-screen flex items-center justify-center">
      {children}
    </main>
  );
}
