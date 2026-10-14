import { CirclePlay, MessageSquareText, MousePointerClick, Timer, Workflow } from 'lucide-react';

export function NodeIcon({ icon, className }: { icon: string; className?: string }) {
  switch (icon) {
    case 'play':
      return <CirclePlay className={className} />;
    case 'timer':
      return <Timer className={className} />;
    case 'mouse-pointer-click':
      return <MousePointerClick className={className} />;
    case 'message-square-text':
      return <MessageSquareText className={className} />;
    default:
      return <Workflow className={className} />;
  }
}
