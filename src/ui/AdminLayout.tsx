import { Outlet } from "react-router-dom";
import { Dock } from "./Dock";

export function AdminLayout() {
  return (
    <div className="flex min-h-screen gap-6 p-4 pr-6">
      <Dock />
      <main className="min-w-0 flex-1 py-2">
        <Outlet />
      </main>
    </div>
  );
}
