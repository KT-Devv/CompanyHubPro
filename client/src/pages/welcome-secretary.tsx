import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { ClipboardCheck, FileText, ArrowRight } from 'lucide-react';

export default function WelcomeSecretary() {
  const [, setLocation] = useLocation();
  const { userFullName } = useAuth();

  return (
    <div className="p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-2 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center transition-transform hover:scale-110 duration-300">
              <FileText className="h-10 w-10 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-foreground">
            Welcome{userFullName ? `, ${userFullName}` : ''}
          </h1>
          <p className="text-lg text-muted-foreground">
            Secretary, let's get started with your tasks
          </p>
        </div>

        <Card className="max-w-md mx-auto transition-all hover:shadow-lg hover:scale-[1.02] duration-300 animate-in fade-in slide-in-from-bottom-6 delay-300">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">Attendance</CardTitle>
              <ClipboardCheck className="h-8 w-8 text-primary" />
            </div>
            <CardDescription>
              Mark attendance for office staff members. Record who is present, absent, or on leave.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => setLocation('/attendance')}
              className="w-full"
              size="lg"
              data-testid="button-go-attendance"
            >
              Mark Attendance
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

