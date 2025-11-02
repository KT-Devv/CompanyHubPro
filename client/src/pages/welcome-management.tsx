import { useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClipboardCheck, Package, Building2, ArrowRight, Users, DollarSign } from 'lucide-react';

export default function WelcomeManagement() {
  const [, setLocation] = useLocation();
  const { userRole } = useAuth();

  const roleDisplayName: Record<string, string> = {
    owner: 'Owner',
    hr: 'HR Manager',
    project_manager: 'Project Manager',
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center">
              <Building2 className="h-10 w-10 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-foreground">
            Welcome to CompanyHub Pro
          </h1>
          <p className="text-lg text-muted-foreground">
            {roleDisplayName[userRole || ''] || 'Management'}, let's get started
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="transition-all hover:shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">All Workers</CardTitle>
                <Users className="h-8 w-8 text-primary" />
              </div>
              <CardDescription>
                View and search across every worker in the company. Filter by site and type.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => setLocation('/workers-management')}
                className="w-full"
                size="lg"
                variant="outline"
                data-testid="button-go-workers"
              >
                View Workers
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
          <Card className="transition-all hover:shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">Attendance Management</CardTitle>
                <ClipboardCheck className="h-8 w-8 text-primary" />
              </div>
              <CardDescription>
                View and manage attendance records for all workers. Query attendance by date, site, or worker.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => setLocation('/attendance-management')}
                className="w-full"
                size="lg"
                data-testid="button-go-attendance"
              >
                Go to Attendance
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-all hover:shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">Salaries</CardTitle>
                <DollarSign className="h-8 w-8 text-primary" />
              </div>
              <CardDescription>
                Calculate salaries: Ground workers (days × portfolio rate) and Office workers (fixed monthly). Export salary reports.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => setLocation('/salaries-management')}
                className="w-full"
                size="lg"
                variant="outline"
                data-testid="button-go-salaries"
              >
                Go to Salaries
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-all hover:shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">Logistics</CardTitle>
                <Package className="h-8 w-8 text-primary" />
              </div>
              <CardDescription>
                Manage inventory, track goods movement between stores, and handle invoices across all locations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => setLocation('/logistics')}
                className="w-full"
                size="lg"
                variant="outline"
                data-testid="button-go-logistics"
              >
                Go to Logistics
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

