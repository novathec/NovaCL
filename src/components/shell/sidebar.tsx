"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ICONS, type NavSection } from "@/lib/nav";

const COLLAPSE_KEY = "nova:sidebar-collapsed";

export function Sidebar({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  function toggle() {
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      return !c;
    });
  }

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r bg-card transition-[width] duration-300 ease-in-out lg:flex",
        collapsed ? "w-17.5" : "w-64"
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center border-b font-semibold",
          collapsed ? "justify-center px-0" : "gap-2 px-4"
        )}
      >
        <Link
          href={"/dashboard" as never}
          aria-label="NovaLIS"
          className={cn(
            "flex items-center gap-2 transition-opacity hover:opacity-90",
            collapsed ? "justify-center" : ""
          )}
        >
          <Image
            src="/logo/logo.png"
            alt="NovaLIS"
            width={64}
            height={64}
            priority
            className="h-8 w-8 shrink-0 object-contain"
          />
          <Image
            src="/tipografia/tipografia.png"
            alt="NovaLIS"
            width={480}
            height={120}
            priority
            className={cn(
              "h-5 w-auto object-contain transition-all duration-200",
              collapsed ? "hidden" : "block"
            )}
          />
        </Link>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto overflow-x-hidden px-3 py-4">
        {sections.map((section) => (
          <div key={section.title}>
            {collapsed ? (
              <div className="mx-2 mb-2 border-t" />
            ) : (
              <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </p>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = NAV_ICONS[item.icon];
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href as never}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-all duration-200",
                        collapsed ? "justify-center px-0" : "px-3",
                        active
                          ? "bg-brand-gradient text-primary-foreground shadow-glow"
                          : cn(
                              "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                              !collapsed && "hover:translate-x-0.5"
                            )
                      )}
                    >
                      {active && !collapsed && (
                        <span className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-primary-foreground/70 animate-scale-in" />
                      )}
                      <Icon className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
                      <span
                        className={cn(
                          "overflow-hidden whitespace-nowrap transition-all duration-200",
                          collapsed ? "hidden" : "block"
                        )}
                      >
                        {item.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t p-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expandir menú" : "Minimizar menú"}
          className={cn(
            "flex w-full items-center gap-3 rounded-md py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-accent-foreground active:scale-[0.97]",
            collapsed ? "justify-center px-0" : "px-3"
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">Minimizar</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
