import { useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Home, AlertCircle } from 'lucide-react';

export default function NotFound() {
  const [, setLocation] = useLocation();
  const { userRole } = useAuth();

  const getDefaultPath = () => {
    if (['ceo', 'hr', 'project_manager', 'system_manager', 'finance'].includes(userRole || '')) return '/welcome-management';
    if (userRole === 'secretary') return '/welcome-secretary';
    if (userRole === 'supervisor') return '/welcome-supervisor';
    if (userRole === 'store_manager' || userRole === 'logistics_manager') return '/store-logistics';
    return '/login';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center">
              <AlertCircle className="h-10 w-10 text-muted-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">Page Not Found</CardTitle>
          <CardDescription>
            The page you're looking for doesn't exist or you don't have access to it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setLocation(getDefaultPath())} className="w-full" data-testid="button-go-home">
            <Home className="mr-2 h-4 w-4" />
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
