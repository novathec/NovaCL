"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { NAV_ICONS, type NavSection } from "@/lib/nav";

export function MobileNav({ sections }: { sections: NavSection[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menú">
          <Menu className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="left-0 top-0 h-full max-w-[17rem] translate-x-0 translate-y-0 rounded-none rounded-r-xl">
        <DialogTitle asChild>
          <div className="flex items-center gap-2">
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
              className="h-5 w-auto object-contain"
            />
          </div>
        </DialogTitle>
        <nav className="space-y-5">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </p>
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const active = pathname.startsWith(item.href);
                  const Icon = NAV_ICONS[item.icon];
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href as never}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </DialogContent>
    </Dialog>
  );
}
