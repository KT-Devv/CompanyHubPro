import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from '@/hooks/use-toast';
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";

export default function WorkerTransferPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: workers } = useQuery({
    queryKey: ['workers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('workers').select('id,name,site_id,worker_type,account_location,account_number').order('name');
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: sites } = useQuery({
    queryKey: ['sites'],
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

  const transferMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorker || !toSite) throw new Error('Select worker and destination site');

      if (selectedWorkerDetails?.worker_type === 'casual') {
        if (!newAccountNumber || !newAccountLocation) {
          throw new Error('Casual workers require a new account location and number upon transfer.');
        }
      }

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
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      toast({ title: 'Success', description: 'Worker transferred and account cleared (if casual)' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });



  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <Card>
        <CardHeader>
          <CardTitle>Transfer Worker</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Worker</Label>
              <Popover open={workerOpen} onOpenChange={setWorkerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={workerOpen}
                    className="w-full justify-between mt-1 text-left font-normal"
                  >
                    {selectedWorker ? workers?.find((w: any) => w.id === selectedWorker)?.name : "Select worker..."}
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
                              setSelectedWorker(worker.id);
                              setWorkerOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedWorker === worker.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {worker.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label>To Site</Label>
              <Select value={toSite || ''} onValueChange={(v) => setToSite(v || null)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select destination site" />
                </SelectTrigger>
                <SelectContent>
                  {sites?.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedWorkerDetails?.worker_type === 'casual' && (
              <>
                <div>
                  <Label>New Account Number</Label>
                  <Input value={newAccountNumber} onChange={(e) => setNewAccountNumber(e.target.value)} placeholder="Bank account number" />
                </div>
                <div>
                  <Label>New Account Site</Label>
                  <Select value={newAccountLocation || ''} onValueChange={(v) => setNewAccountLocation(v || null)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select account site" />
                    </SelectTrigger>
                    <SelectContent>
                      {sites?.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div>
              <Label>Effective Date</Label>
              <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>

            <div>
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

          </div>

          <div className="mt-4 flex gap-2">
            <Button onClick={() => transferMutation.mutate()} disabled={transferMutation.isPending}>Transfer</Button>
            <Button variant="ghost" onClick={() => { setSelectedWorker(null); setToSite(null); setNotes(''); }}>Reset</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
