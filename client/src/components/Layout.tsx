import { Outlet, Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link to="/" className="text-xl font-bold text-white flex items-center gap-2">
            <span className="rounded bg-brand px-1.5 py-0.5 text-sm font-black tracking-tight">
              W
            </span>
            WatchTube
          </Link>
          <nav className="flex flex-1 items-center gap-4 text-sm">
            <Link to="/" className="text-zinc-300 hover:text-white transition">
              Home
            </Link>
            {user && (
              <Link to="/upload" className="text-zinc-300 hover:text-white transition">
                Upload
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            {user ? (
              <>
                <Link
                  to={`/channel/${user.id}`}
                  className="text-zinc-200 hover:text-white max-w-[10rem] truncate"
                >
                  {user.displayName}
                </Link>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="rounded-md border border-zinc-600 px-3 py-1.5 text-zinc-200 hover:bg-zinc-800"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-md border border-zinc-600 px-3 py-1.5 text-zinc-200 hover:bg-zinc-800"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="rounded-md bg-brand px-3 py-1.5 font-medium text-white hover:bg-brand-dark"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-zinc-800 py-6 text-center text-xs text-zinc-500">
        WatchTube — demo monorepo
      </footer>
    </div>
  );
}
