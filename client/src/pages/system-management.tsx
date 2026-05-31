import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from '@/hooks/use-toast';
import { cn } from "@/lib/utils";
import { Building2, ArrowRightLeft, Users, Check, ChevronsUpDown } from 'lucide-react';

export default function SystemManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: workers } = useQuery({
    queryKey: ['/api/workers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('workers').select('id,name,site_id,worker_type,account_location,account_number').order('name');
      if (error) throw error;

      return data as any[];
    },
  });

  const { data: sites } = useQuery({
    queryKey: ['/api/sites'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sites').select('*').order('site_name');
      if (error) throw error;
      return data as any[];
    },
  });

  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  const [toSite, setToSite] = useState<string | null>(null);
  const [effectiveDate, setEffectiveDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [newAccountNumber, setNewAccountNumber] = useState('');
  const [newAccountLocation, setNewAccountLocation] = useState<string | null>(null);
  const [workerOpen, setWorkerOpen] = useState(false);

  const selectedWorkerDetails = workers?.find(w => w.id === selectedWorker);

  const handleWorkerChange = (val: string) => {
    setSelectedWorker(val);
    setNewAccountNumber('');
    setNewAccountLocation(null);
  };

  const transferMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorker || !toSite) throw new Error('Select worker and destination site');

      if (selectedWorkerDetails?.worker_type === 'casual') {
        if (!newAccountNumber || !newAccountLocation) {
          throw new Error('Casual workers require a new account location and number upon transfer.');
        }
      }

      // We use Supabase direct API for transfer logic as it's a simple double-write
      const { error: insertError } = await supabase.from('worker_transfers').insert({
        worker_id: selectedWorker,
        from_site_id: selectedWorkerDetails?.site_id,
        to_site_id: toSite,
        transfer_date: effectiveDate,
        notes: notes || null
      });

      if (insertError) throw insertError;

      const updatePayload: any = { site_id: toSite };
      if (selectedWorkerDetails?.worker_type === 'casual') {
        updatePayload.account_number = newAccountNumber;
        updatePayload.account_location = newAccountLocation;
      }

      const { error: updateError } = await supabase.from('workers').update(updatePayload).eq('id', selectedWorker);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workers'] });
      toast({ title: 'Success', description: 'Worker transferred successfully.' });
      setSelectedWorker(null);
      setToSite(null);
      setNewAccountNumber('');
      setNewAccountLocation(null);
      setNotes('');
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  return (
    <div className="w-full h-full flex flex-col gap-6 p-4 sm:p-6 lg:p-8 bg-background animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            System Management Portal
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Global tools and configurations for the System Manager
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="border shadow-lg bg-card/50 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Global Worker Transfer
            </CardTitle>
            <CardDescription>
              Transfer workers between sites across the network. For Casual workers, 
              this action resets their account details and requires re-assignment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label>Select Worker</Label>
                <Popover open={workerOpen} onOpenChange={setWorkerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={workerOpen}
                      className="w-full justify-between mt-1 text-left font-normal bg-background"
                    >
                      {selectedWorker ? workers?.find((w: any) => w.id === selectedWorker)?.name : "Worker..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search worker..." />
                      <CommandList>
                        <CommandEmpty>No worker found.</CommandEmpty>
                        <CommandGroup className="max-h-[200px] overflow-y-auto">
                          {workers?.map((worker: any) => (
                            <CommandItem
                              key={worker.id}
                              value={worker.name}
                              onSelect={() => {
                                handleWorkerChange(worker.id);
                                setWorkerOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedWorker === worker.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {worker.name} ({worker.worker_type === 'casual' ? 'Casual' : 'Non-Marking'})
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Destination Site</Label>
                <Select value={toSite || ''} onValueChange={(v) => setToSite(v || null)}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Site..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sites?.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedWorkerDetails?.worker_type === 'casual' && (
                <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-5 p-4 rounded-xl bg-muted/30 border border-primary/20">
                  <div className="col-span-1 sm:col-span-2 flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">Casual Worker Account Reselection</span>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-primary/80">New Account Local Site</Label>
                    <Select value={newAccountLocation || ''} onValueChange={(v) => setNewAccountLocation(v || null)}>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Account location..." />
                      </SelectTrigger>
                      <SelectContent>
                        {sites?.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-primary/80">New Account Number</Label>
                    <Input 
                      placeholder="Enter new account #" 
                      value={newAccountNumber} 
                      onChange={(e) => setNewAccountNumber(e.target.value)} 
                      className="bg-background"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="effectiveDate">Effective Date</Label>
                <Input id="effectiveDate" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="bg-background" />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="transferNotes">Transfer Notes / Reason</Label>
                <Input id="transferNotes" placeholder="Optional remarks" value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-background" />
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              <Button 
                onClick={() => transferMutation.mutate()} 
                disabled={transferMutation.isPending || !selectedWorker || !toSite}
                className="flex-1 sm:flex-none"
              >
                {transferMutation.isPending ? 'Transferring...' : 'Execute Transfer'}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => { setSelectedWorker(null); setToSite(null); setNotes(''); }}
                className="flex-1 sm:flex-none"
              >
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
