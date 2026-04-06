import { Sparkles } from 'lucide-react';
import { useARIA } from '@/contexts/ARIAContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function ARIAButton() {
  const { toggleARIA, isOpen } = useARIA();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={toggleARIA}
          className={`
            fixed bottom-6 right-6 z-[9999] w-14 h-14 rounded-full
            flex items-center justify-center
            text-white shadow-lg
            transition-all duration-300 hover:scale-105 active:scale-95
            ${isOpen ? 'opacity-0 pointer-events-none scale-75' : 'opacity-100'}
          `}
          style={{
            background: 'linear-gradient(135deg, hsl(174 90% 31%), hsl(180 80% 45%))',
            boxShadow: '0 4px 20px hsla(174, 90%, 31%, 0.4)',
          }}
          aria-label="ARIA aktivieren (⌘J)"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">
        <p>ARIA aktivieren (⌘J)</p>
      </TooltipContent>
    </Tooltip>
  );
}
