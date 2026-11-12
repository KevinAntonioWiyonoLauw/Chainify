import { AppShell } from "@/components/chainify/app-shell";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
