import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./ui/theme.css";
import { AuthProvider, RequireAuth } from "./ui/auth";
import { AdminLayout } from "./ui/AdminLayout";

// Cada módulo es dueño de su carpeta y exporta por defecto su pantalla (docs/PLAN.md, fases F1 y F2).
const Login = lazy(() => import("./auth/Login"));
const Activar = lazy(() => import("./auth/Activar"));
const CambiarClave = lazy(() => import("./auth/CambiarClave"));
const Proyectos = lazy(() => import("./admin/proyectos"));
const Equipo = lazy(() => import("./admin/equipo"));
const MuralConfig = lazy(() => import("./admin/mural"));
const Cuentas = lazy(() => import("./admin/cuentas"));
const MuralTV = lazy(() => import("./mural"));
const Movil = lazy(() => import("./movil"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          {/* Pantallas de dispositivo: sin cuenta, con enlace (ACC). */}
          <Route path="/tv/:id" element={<MuralTV />} />
          <Route path="/m/*" element={<Movil />} />
          <Route
            path="*"
            element={
              <AuthProvider>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/activar" element={<Activar />} />
                  <Route path="/mural/tv" element={<RequireAuth><MuralTV preview /></RequireAuth>} />
                  <Route element={<RequireAuth><AdminLayout /></RequireAuth>}>
                    <Route index element={<Navigate to="/proyectos" replace />} />
                    <Route path="/proyectos/*" element={<Proyectos />} />
                    <Route path="/equipo/*" element={<Equipo />} />
                    <Route path="/mural" element={<MuralConfig />} />
                    <Route path="/cuenta" element={<CambiarClave />} />
                    <Route path="/cuentas" element={<RequireAuth adminOnly><Cuentas /></RequireAuth>} />
                    <Route path="*" element={<Navigate to="/proyectos" replace />} />
                  </Route>
                </Routes>
              </AuthProvider>
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
