"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Users, KeyRound, Boxes, BarChart3, Plug, MessageSquare, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const links = [
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/keys", label: "API Keys", icon: KeyRound },
  { href: "/admin/models", label: "Models", icon: Boxes },
  { href: "/admin/usage", label: "Usage", icon: BarChart3 },
  { href: "/admin/mcp", label: "MCP", icon: Plug },
];

export function AdminNav({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-bg-300 bg-bg-100/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 md:px-6">
        <Link href="/admin" className="mr-2 flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white"
            style={{ background: "var(--accent)" }}
          >
            AI
          </div>
          <span className="hidden font-serif text-sm font-medium sm:inline">Admin</span>
        </Link>

        <nav className="custom-scrollbar flex flex-1 items-center gap-1 overflow-x-auto">
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-bg-200 text-text-100"
                    : "text-text-300 hover:bg-bg-200 hover:text-text-200"
                }`}
              >
                <Icon className="h-4 w-4" />
                {l.label}
              </Link>
            );
          })}
        </nav>

        <Link
          href="/chat"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-400 transition-colors hover:bg-bg-200 hover:text-text-200"
          aria-label="Go to chat"
          title="Go to chat"
        >
          <MessageSquare className="h-4 w-4" />
        </Link>
        <ThemeToggle />
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-400 transition-colors hover:bg-bg-200 hover:text-text-200"
          aria-label="Sign out"
          title={`Sign out (${email})`}
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
