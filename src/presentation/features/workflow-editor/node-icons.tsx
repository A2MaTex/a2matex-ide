import {
  CirclePlay,
  Square,
  Timer,
  GitBranch,
  Variable,
  Hourglass,
  MousePointerClick,
  Keyboard,
  Smartphone,
  Hand,
  ArrowLeft,
  House,
  Camera,
  Move,
  MessageSquareText,
  Workflow,
} from 'lucide-react';

export function NodeIcon({ icon, className }: { icon: string; className?: string }) {
  switch (icon) {
    case 'play':
      return <CirclePlay className={className} />;
    case 'square':
      return <Square className={className} />;
    case 'timer':
      return <Timer className={className} />;
    case 'git-branch':
      return <GitBranch className={className} />;
    case 'variable':
      return <Variable className={className} />;
    case 'hourglass':
      return <Hourglass className={className} />;
    case 'mouse-pointer-click':
      return <MousePointerClick className={className} />;
    case 'keyboard':
      return <Keyboard className={className} />;
    case 'smartphone':
      return <Smartphone className={className} />;
    case 'hand':
      return <Hand className={className} />;
    case 'arrow-left':
      return <ArrowLeft className={className} />;
    case 'house':
      return <House className={className} />;
    case 'camera':
      return <Camera className={className} />;
    case 'move':
      return <Move className={className} />;
    case 'message-square-text':
      return <MessageSquareText className={className} />;
    default:
      return <Workflow className={className} />;
  }
}
