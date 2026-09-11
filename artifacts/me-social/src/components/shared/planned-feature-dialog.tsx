import * as Dialog from '@radix-ui/react-dialog'
import { X, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function PlannedFeatureDialog({ 
  open, 
  onOpenChange, 
  title, 
  description 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  title: string; 
  description: string; 
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 animate-in fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-6 border border-border bg-card p-8 shadow-xl sm:rounded-3xl duration-300 animate-in fade-in-0 zoom-in-95">
          <div className="flex flex-col gap-5 text-center items-center">
            <div className="w-20 h-20 rounded-full bg-secondary text-primary flex items-center justify-center mb-2 shadow-sm">
              <Info className="w-10 h-10" aria-hidden="true" />
            </div>
            <Dialog.Title className="font-display text-3xl font-bold tracking-tight text-foreground">
              {title}
            </Dialog.Title>
            <Dialog.Description className="text-xl text-muted-foreground leading-relaxed text-balance">
              {description}
            </Dialog.Description>
          </div>
          <div className="mt-6 flex justify-center w-full">
             <Dialog.Close asChild>
               <Button size="lg" className="w-full sm:w-auto min-w-[240px]">I Understand</Button>
             </Dialog.Close>
          </div>
          <Dialog.Close className="absolute right-6 top-6 rounded-full w-12 h-12 flex items-center justify-center bg-secondary/50 text-foreground opacity-70 ring-offset-background transition-opacity hover:opacity-100 hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
            <X className="h-6 w-6" />
            <span className="sr-only">Close</span>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
