import { useLocation } from 'wouter';
import { Link } from 'wouter';
import {
  ArrowRightLeft,
  Boxes,
  ChevronsUpDown,
  ClipboardCheck,
  ClipboardList,
  HardHat,
  LayoutDashboard,
  LogOut,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth';
import { canAccess, roleLabel, type AppRoute } from '@/lib/roles';
import { initials } from '@/lib/format';

interface NavItem {
  title: string;
  url: AppRoute;
  icon: LucideIcon;
}

// Which items a user sees is decided by canAccess(), the same check the router
// uses, so every link shown is one the user can open.
const NAV: { label: string; items: NavItem[] }[] = [
  { label: 'Overview', items: [{ title: 'Dashboard', url: '/', icon: LayoutDashboard }] },
  {
    label: 'People',
    items: [
      { title: 'Workers', url: '/workers', icon: Users },
      { title: 'Mark attendance', url: '/attendance', icon: ClipboardCheck },
      { title: 'Attendance records', url: '/attendance/records', icon: ClipboardList },
      { title: 'Transfers', url: '/transfers', icon: ArrowRightLeft },
    ],
  },
  { label: 'Money', items: [{ title: 'Finance', url: '/finance', icon: Wallet }] },
  { label: 'Operations', items: [{ title: 'Logistics', url: '/logistics', icon: Boxes }] },
];

export function visibleNav(role: string | null | undefined) {
  return NAV.map((group) => ({ ...group, items: group.items.filter((item) => canAccess(role, item.url)) })).filter(
    (group) => group.items.length > 0,
  );
}

export function AppSidebar() {
  const { userRole, userFullName, user, signOut } = useAuth();
  const [location] = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const groups = visibleNav(userRole);
  const displayName = userFullName || user?.email || 'Account';

  return (
    <Sidebar>
      <SidebarHeader className="px-4 pb-2 pt-5">
        <Link href="/" className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
            <HardHat className="h-5 w-5" aria-hidden />
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-semibold tracking-tight">SiteTrack</span>
            <span className="block text-xs text-muted-foreground">Workforce &amp; logistics</span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="scroll-quiet px-2">
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      className="relative h-9 data-[active=true]:border data-[active=true]:border-brand-line data-[active=true]:shadow-xs data-[active=true]:[&>svg]:text-brand data-[active=true]:before:absolute data-[active=true]:before:inset-y-2 data-[active=true]:before:left-0 data-[active=true]:before:w-[3px] data-[active=true]:before:rounded-r-full data-[active=true]:before:bg-crimson data-[active=true]:before:content-['']"
                    >
                      <Link href={item.url} onClick={() => isMobile && setOpenMobile(false)}>
                        <item.icon aria-hidden />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex w-full items-center gap-3 rounded-lg border border-transparent p-2 text-left outline-none transition-colors hover:border-sidebar-border hover:bg-card focus-visible:ring-2 focus-visible:ring-ring/40"
              data-testid="button-user-menu"
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-ivory text-xs font-medium text-foreground">{initials(userFullName || user?.email)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm font-medium">{displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">{roleLabel(userRole)}</span>
              </span>
              <ChevronsUpDown className="h-4 w-4 text-muted-foreground" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <span className="block truncate text-sm font-medium">{displayName}</span>
              {user?.email && <span className="block truncate text-xs text-muted-foreground">{user.email}</span>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut().catch(console.error)} data-testid="button-logout">
              <LogOut className="mr-2 h-4 w-4" aria-hidden />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
