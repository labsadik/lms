import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const ThemeToggle = () => {
  const { setTheme, theme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Toggle theme">
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-card">
        <DropdownMenuItem onClick={() => setTheme('light')}><Sun className="w-4 h-4 mr-2" /> Light {theme === 'light' && '✓'}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}><Moon className="w-4 h-4 mr-2" /> Dark {theme === 'dark' && '✓'}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}><Monitor className="w-4 h-4 mr-2" /> System {theme === 'system' && '✓'}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ThemeToggle;
