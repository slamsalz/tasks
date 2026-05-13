export type TimerStatus = 'idle' | 'running' | 'paused' | 'completed' | 'popped';

export interface PersistentTask {
  id: string;
  label: string;
  createdAt: number;
  isCompleted: boolean;
}

export interface TimerBubble {
  id: string;
  label: string;
  totalSeconds: number;
  remainingSeconds: number;
  status: TimerStatus;
  createdAt: number;
  scheduledFor: number; // timestamp
  colorIndex: number; // to pick from a palette
  order: number; // for bubbles stacking
  type: 'bubble' | 'alarm' | 'persistent';
  intervalMinutes?: number;
}

export interface BubbleTheme {
  from: string;
  to: string;
  shadow: string;
}

export const BUBBLE_COLORS: BubbleTheme[] = [
  { from: 'from-pink-100/70', to: 'to-rose-200/40', shadow: 'rgba(255,255,255,0.4)' },
  { from: 'from-blue-100/70', to: 'to-sky-200/40', shadow: 'rgba(255,255,255,0.4)' },
  { from: 'from-teal-100/70', to: 'to-emerald-200/40', shadow: 'rgba(255,255,255,0.4)' },
  { from: 'from-amber-100/70', to: 'to-orange-200/40', shadow: 'rgba(255,255,255,0.4)' },
  { from: 'from-purple-100/70', to: 'to-indigo-200/40', shadow: 'rgba(255,255,255,0.4)' },
  { from: 'from-cyan-100/70', to: 'to-blue-200/40', shadow: 'rgba(255,255,255,0.4)' },
  { from: 'from-rose-100/70', to: 'to-pink-200/40', shadow: 'rgba(255,255,255,0.4)' },
  { from: 'from-indigo-100/70', to: 'to-violet-200/40', shadow: 'rgba(255,255,255,0.4)' },
  { from: 'from-emerald-100/70', to: 'to-teal-200/40', shadow: 'rgba(255,255,255,0.4)' },
  { from: 'from-orange-100/70', to: 'to-amber-200/40', shadow: 'rgba(255,255,255,0.4)' },
  { from: 'from-slate-100/70', to: 'to-zinc-200/40', shadow: 'rgba(255,255,255,0.4)' },
];

export const POND_COLOR = 'rgba(14, 165, 233, 0.25)'; 
export const COMPLETED_COLOR = 'rgba(7, 89, 133, 0.4)'; 
