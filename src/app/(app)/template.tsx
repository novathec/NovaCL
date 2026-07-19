// A diferencia de layout.tsx, template.tsx se re-monta en cada navegación,
// así la animación de entrada se reproduce en cada cambio de página/sección.
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
