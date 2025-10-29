import { useAuth } from '@/lib/auth';
import { useLocation } from 'wouter';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Building2, ClipboardCheck, Package, LogOut, ChevronUp, Users } from 'lucide-react';

export function AppSidebar() {
  const { userRole, signOut, user } = useAuth();
  const [location, setLocation] = useLocation();

  const canAccessAttendance = ['owner', 'hr', 'project_manager', 'supervisor', 'secretary'].includes(userRole || '');
  const canAccessLogistics = ['owner', 'hr', 'project_manager'].includes(userRole || '');
  const isManagement = ['owner', 'hr', 'project_manager'].includes(userRole || '');

  const menuItems = [
    ...(isManagement
      ? [
          {
            title: 'Workers',
            url: '/workers-management',
            icon: Users,
          },
        ]
      : []),
    ...(canAccessAttendance
      ? [
          {
            title: isManagement ? 'Attendance Management' : 'Attendance',
            url: isManagement ? '/attendance-management' : '/attendance',
            icon: ClipboardCheck,
          },
        ]
      : []),
    ...(canAccessLogistics
      ? [
          {
            title: 'Logistics',
            url: '/logistics',
            icon: Package,
          },
        ]
      : []),
  ];

  const initials = user?.email?.substring(0, 2).toUpperCase() || 'U';

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-sidebar-primary flex items-center justify-center">
            <Building2 className="h-6 w-6 text-sidebar-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-sidebar-foreground truncate">
              Company Manager
            </h2>
            <p className="text-xs text-muted-foreground truncate">Construction Management</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      onClick={() => setLocation(item.url)}
                      isActive={isActive}
                      data-testid={`link-${item.title.toLowerCase()}`}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-3 w-full p-2 rounded-md hover-elevate active-elevate-2"
              data-testid="button-user-menu"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {user?.email}
                </p>
                <Badge variant="secondary" className="text-xs mt-1">
                  {userRole}
                </Badge>
              </div>
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={signOut} data-testid="button-logout">
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
