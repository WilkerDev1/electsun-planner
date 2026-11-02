import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import { initials } from "./components";

// Dock lateral flotante (design/v4/V4Dock.dc.html).
const items = [
  { to: "/proyectos", label: "Proyectos", icon: "M3 5h18v14H3zM3 10h18M3 15h18M9 5v14" },
  { to: "/equipo", label: "Equipo", icon: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 19v-1a4 4 0 0 0-3-3.9M16 3.1a3.5 3.5 0 0 1 0 6.8" },
  { to: "/mural", label: "Mural", icon: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4" },
];

export const Icon = ({ d, size = 22 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

export function Dock() {
  const { user, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const navigate = useNavigate();
  const tile = "flex size-16 flex-col items-center justify-center gap-1 rounded-[18px] text-xs font-bold no-underline";
  return (
    <nav aria-label="Modos" className="sticky top-4 flex w-[84px] shrink-0 flex-col items-center gap-2 self-start rounded-[26px] border border-line bg-white px-2.5 pb-3.5 pt-3 shadow-[var(--shadow-dock)]">
      <span role="img" aria-label="Electsun" className="mb-2 flex size-12 items-center justify-center rounded-[15px] bg-brand text-white">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
        </svg>
      </span>
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} className={({ isActive }) => `${tile} ${isActive ? "bg-ink text-white" : "text-muted hover:bg-fill"}`}>
          <Icon d={it.icon} />
          {it.label}
        </NavLink>
      ))}
      <span className="my-1.5 h-px w-10 bg-line" />
      <a href="/mural/tv" className={`${tile} bg-[#FFF4EC] text-today`} title="Abrir la vista de la TV">
        <Icon d="M2.5 4h19v13h-19zM8 21h8M12 17v4" />
        Ver TV
      </a>
      <span className="h-6" />
      <div className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menu}
          aria-label={`Cuenta de ${user?.name ?? ""}`}
          onClick={() => setMenu((m) => !m)}
          className="flex size-11 items-center justify-center rounded-full bg-fill text-[13px] font-extrabold text-ink-2"
        >
          {initials(user?.name ?? "?")}
        </button>
        {menu && (
          <div role="menu" className="absolute bottom-0 left-14 z-40 w-56 rounded-2xl border border-line bg-white p-1.5 shadow-lg">
            <p className="m-0 px-3 py-2 text-sm font-bold">{user?.name}<br /><span className="font-semibold text-subtle">{user?.role === "admin" ? "Administrador" : "Oficina"}</span></p>
            {user?.role === "admin" && (
              <button role="menuitem" className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-fill" onClick={() => { setMenu(false); navigate("/cuentas"); }}>
                Cuentas
              </button>
            )}
            <button role="menuitem" className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-fill" onClick={() => { setMenu(false); navigate("/cuenta"); }}>
              Cambiar contraseña
            </button>
            <button role="menuitem" className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-danger hover:bg-danger-soft" onClick={() => void logout().then(() => navigate("/login"))}>
              Salir
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
