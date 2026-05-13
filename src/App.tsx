/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { 
  Plus, 
  Play, 
  Pause, 
  Trash2, 
  Droplets, 
  Calendar, 
  Edit2, 
  Clock, 
  Hexagon,
  Bell,
  X,
  CheckCircle2,
  Circle,
  Square
} from 'lucide-react';
import { format, addDays, isSameDay } from 'date-fns';
import { cn } from './lib/utils';
import { TimerBubble, TimerStatus, BUBBLE_COLORS, COMPLETED_COLOR, PersistentTask } from './types';

const POND_HEIGHT = 0;

interface PhysicsState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  anchorX: number;
  anchorY: number;
  isDragging?: boolean;
}

export default function App() {
  const [timers, setTimers] = useState<TimerBubble[]>([]);
  const [persistentTasks, setPersistentTasks] = useState<PersistentTask[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<'bubble' | 'alarm' | 'persistent'>('bubble');
  const [ringingIds, setRingingIds] = useState<Set<string>>(new Set());
  const [newLabel, setNewLabel] = useState('');
  const [newDuration, setNewDuration] = useState('5'); // minutes
  const [newDayOffset, setNewDayOffset] = useState('0'); // days in advance
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const arenaRef = useRef<HTMLDivElement>(null);
  const [physics, setPhysics] = useState<Record<string, PhysicsState>>({});
  const requestRef = useRef<number>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize AudioContext on first interaction
  useEffect(() => {
    const initAudio = () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
    };
    window.addEventListener('click', initAudio);
    window.addEventListener('touchstart', initAudio);
    return () => {
      window.removeEventListener('click', initAudio);
      window.removeEventListener('touchstart', initAudio);
    };
  }, []);

  // Star Generator for background
  const stars = useRef<{id: number, left: string, top: string, size: string, duration: string, delay: string}[]>(
    Array.from({ length: 150 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 80}%`,
      size: `${Math.random() * 2 + 1}px`,
      duration: `${Math.random() * 3 + 2}s`,
      delay: `${Math.random() * 5}s`
    }))
  ).current;

  // Load from local storage
  useEffect(() => {
    const saved = localStorage.getItem('bubble-timers');
    const savedPersistent = localStorage.getItem('persistent-tasks');
    const savedPhysics = localStorage.getItem('bubble-physics');
    
    if (saved) {
      try {
        setTimers(JSON.parse(saved));
      } catch (e) { console.error('Failed to load timers'); }
    }
    if (savedPersistent) {
      try {
        setPersistentTasks(JSON.parse(savedPersistent));
      } catch (e) { console.error('Failed to load persistent tasks'); }
    }
    if (savedPhysics) {
      try {
        setPhysics(JSON.parse(savedPhysics));
      } catch (e) { console.error('Failed to load physics'); }
    }
  }, []);

  // Save to local storage
  useEffect(() => {
    localStorage.setItem('bubble-timers', JSON.stringify(timers));
  }, [timers]);

  useEffect(() => {
    localStorage.setItem('persistent-tasks', JSON.stringify(persistentTasks));
  }, [persistentTasks]);

  // Sound Synthesizer
  const playAlarmSound = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const audioCtx = audioContextRef.current;
      
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const playSequence = (startTime: number) => {
        [0, 0.3, 0.6].forEach(delay => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, startTime + delay);
          osc.frequency.exponentialRampToValueAtTime(440, startTime + delay + 0.2);
          gain.gain.setValueAtTime(0, startTime + delay);
          gain.gain.linearRampToValueAtTime(0.3, startTime + delay + 0.05);
          gain.gain.linearRampToValueAtTime(0, startTime + delay + 0.2);
          osc.start(startTime + delay);
          osc.stop(startTime + delay + 0.2);
        });
      };
      
      playSequence(audioCtx.currentTime);
    } catch (e) {
      console.warn('Audio blocked');
    }
  }, []);

  const silenceAlarm = useCallback((id: string) => {
    setRingingIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // Restart the timer only after silencing the alarm
        setTimers(prevTimers => prevTimers.map(t => 
          t.id === id ? { ...t, status: 'running', remainingSeconds: t.totalSeconds } : t
        ));
      }
      return next;
    });
  }, []);

  // Timer Tick
  useEffect(() => {
    const interval = setInterval(() => {
      setTimers(prev => prev.map(t => {
        if (t.status === 'running' && t.remainingSeconds > 0) {
          const nextRemaining = t.remainingSeconds - 1;
          if (nextRemaining <= 0) {
            if (t.type === 'alarm') {
              playAlarmSound();
              setRingingIds(prevRing => new Set(prevRing).add(t.id));
              
              // Auto-silence after 15 seconds if not manual
              setTimeout(() => silenceAlarm(t.id), 15000);

              // Pause for now; silenceAlarm will restart it
              return { ...t, remainingSeconds: 0, status: 'paused' };
            }
            return { ...t, remainingSeconds: 0, status: 'completed' as const };
          }
          return { ...t, remainingSeconds: nextRemaining };
        }
        return t;
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, [playAlarmSound, silenceAlarm]);

  // Persistent alarm sound loop
  useEffect(() => {
    if (ringingIds.size === 0) return;
    const soundInterval = setInterval(() => {
      playAlarmSound();
    }, 1500); 
    return () => clearInterval(soundInterval);
  }, [ringingIds.size, playAlarmSound]);

  // Physics Loop
  const animate = useCallback((time: number) => {
    if (!arenaRef.current) return;
    const { width, height } = arenaRef.current.getBoundingClientRect();
    if (width === 0 || height === 0) return;

    setPhysics(prev => {
      const next = { ...prev };
      const ids = Object.keys(next);

      // 1. Position Update (Velocity only from collisions)
      for (const id of ids) {
        const b = next[id];
        
        if (b.isDragging) {
          b.vx = 0;
          b.vy = 0;
        } else {
          // No ambient drift as per user request to maintain positions
          b.x += b.vx;
          b.y += b.vy;

          // Sink logic for completed tasks
          const timer = timers.find(t => t.id === id);
          if (timer?.status === 'completed') {
            b.vy += 0.08; // Stronger sink
          }

          // Friction/Stop logic
          b.vx *= 0.85; 
          b.vy *= 0.85;
          if (Math.abs(b.vx) < 0.01) b.vx = 0;
          if (Math.abs(b.vy) < 0.01) b.vy = 0;
        }
      }

      // 2. Multi-Pass Rigid Collision Resolution
      for (let pass = 0; pass < 8; pass++) { // More passes for stability
        // Bubble-to-Bubble Collision
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const b1 = next[ids[i]];
            const b2 = next[ids[j]];
            const dx = b2.x - b1.x;
            const dy = b2.y - b1.y;
            const distSq = dx * dx + dy * dy;
            const minDist = b1.radius + b2.radius + 30; // Increased spacing buffer
            
            if (distSq < minDist * minDist) {
              const dist = Math.sqrt(distSq) || 0.001;
              const angle = Math.atan2(dy, dx);
              const overlap = (minDist - dist);
              
              const force = pass === 0 ? 0.5 : 0.2; // Initial push is stronger

              if (!b1.isDragging && !b2.isDragging) {
                const correction = overlap * force;
                b1.x -= correction * Math.cos(angle);
                b1.y -= correction * Math.sin(angle);
                b2.x += correction * Math.cos(angle);
                b2.y += correction * Math.sin(angle);
                
                // Transfer some "unsticking" momentum
                b1.vx -= 0.1 * Math.cos(angle);
                b1.vy -= 0.1 * Math.sin(angle);
                b2.vx += 0.1 * Math.cos(angle);
                b2.vy += 0.1 * Math.sin(angle);
              } else if (b1.isDragging) {
                b2.x += overlap * Math.cos(angle);
                b2.y += overlap * Math.sin(angle);
                b2.vx += 0.2 * Math.cos(angle);
                b2.vy += 0.2 * Math.sin(angle);
              } else if (b2.isDragging) {
                b1.x -= overlap * Math.cos(angle);
                b1.y -= overlap * Math.sin(angle);
                b1.vx -= 0.2 * Math.cos(angle);
                b1.vy -= 0.2 * Math.sin(angle);
              }
            }
          }
        }

        // Final Authority: Strict Wall Collisions
        for (const id of ids) {
          const b = next[id];
          const margin = 10;
          const TOP_LIMIT = b.radius + margin;
          const BOTTOM_LIMIT = height - b.radius - margin;

          if (b.x < b.radius + margin) { b.x = b.radius + margin; b.vx = Math.abs(b.vx) * 0.5; }
          if (b.x > width - b.radius - margin) { b.x = width - b.radius - margin; b.vx = -Math.abs(b.vx) * 0.5; }
          
          if (b.y < TOP_LIMIT) { b.y = TOP_LIMIT; b.vy = Math.abs(b.vy) * 0.5; }
          if (b.y > BOTTOM_LIMIT) { b.y = BOTTOM_LIMIT; b.vy = -Math.abs(b.vy) * 0.5; }
        }
      }

      return next;
    });

    requestRef.current = requestAnimationFrame(animate);
  }, [timers]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
  }, [animate]);

  // Sync physics objects with timers
  useEffect(() => {
    setPhysics(prev => {
      let changed = false;
      const next: Record<string, PhysicsState> = {};
      
      timers.forEach(t => {
        if (prev[t.id]) {
          next[t.id] = prev[t.id];
        } else {
          changed = true;
          // Spacing-aware initialization
          const width = arenaRef.current?.clientWidth || 800;
          const height = arenaRef.current?.clientHeight || 600;
          const POND_AREA_TOP = 100;
          const POND_AREA_BOTTOM = height - 100; 

          let initX = Math.random() * (width * 0.8) + (width * 0.1);
          let initY = Math.random() * (POND_AREA_BOTTOM - POND_AREA_TOP) + POND_AREA_TOP;

          // Retry logic
          for (let attempt = 0; attempt < 10; attempt++) {
            let collision = false;
            for (const other of Object.values(next)) {
              const dx = other.x - initX;
              const dy = other.y - initY;
              const combinedRadius = (t.type === 'alarm' ? 60 : 85) + other.radius;
              if (Math.sqrt(dx * dx + dy * dy) < combinedRadius + 50) { 
                collision = true;
                break;
              }
            }
            if (!collision) break;
            initX = Math.random() * (width * 0.8) + (width * 0.1);
            initY = Math.random() * (POND_AREA_BOTTOM - POND_AREA_TOP) + POND_AREA_TOP;
          }

          next[t.id] = {
            id: t.id,
            x: initX,
            y: initY,
            vx: (Math.random() - 0.5) * 0.1,
            vy: (Math.random() - 0.5) * 0.1,
            radius: t.type === 'alarm' ? 60 : 85, 
            anchorX: initX,
            anchorY: initY
          };
        }
      });

      // Cleanup physics for deleted timers
      Object.keys(prev).forEach(id => {
        if (!timers.find(t => t.id === id)) changed = true;
      });

      if (changed) {
        localStorage.setItem('bubble-physics', JSON.stringify(next));
      }

      return next;
    });
  }, [timers.map(t => t.id).join(',')]);

  const saveTimer = () => {
    if (!newLabel) return;

    if (formMode === 'persistent') {
      const newTask: PersistentTask = {
        id: crypto.randomUUID(),
        label: newLabel,
        createdAt: Date.now(),
        isCompleted: false
      };
      setPersistentTasks([...persistentTasks, newTask]);
      closeForm();
      return;
    }

    const durationSec = parseInt(newDuration) * 60;
    const scheduledDate = addDays(new Date(), parseInt(newDayOffset)).getTime();
    
    // Pick a fairly unique color for the day
    const activeToday = timers.filter(t => isSameDay(t.scheduledFor, scheduledDate) && t.status !== 'completed');
    const usedColors = new Set(activeToday.map(t => t.colorIndex));
    let colorIndex = Math.floor(Math.random() * BUBBLE_COLORS.length);
    
    // Try to find an unused color
    if (usedColors.size < BUBBLE_COLORS.length) {
      const available = BUBBLE_COLORS.map((_, i) => i).filter(i => !usedColors.has(i));
      colorIndex = available[Math.floor(Math.random() * available.length)];
    }

    if (editingId) {
      setTimers(prev => prev.map(t => {
        if (t.id === editingId) {
          const wasRunning = t.status === 'running';
          const durationChanged = t.totalSeconds !== durationSec;
          return {
            ...t,
            label: newLabel,
            totalSeconds: durationSec,
            remainingSeconds: durationChanged ? durationSec : t.remainingSeconds,
            scheduledFor: scheduledDate,
            status: wasRunning ? 'running' : t.status
          };
        }
        return t;
      }));
      setEditingId(null);
    } else {
    const newTimer: TimerBubble = {
        id: crypto.randomUUID(),
        label: newLabel,
        totalSeconds: durationSec,
        remainingSeconds: durationSec,
        status: 'idle',
        createdAt: Date.now(),
        scheduledFor: scheduledDate,
        colorIndex,
        order: timers.length,
        type: formMode,
        intervalMinutes: formMode === 'alarm' ? parseInt(newDuration) : undefined
      };

      setTimers([...timers, newTimer]);
    }

    setNewLabel('');
    setShowForm(false);
  };

  const startEdit = (timer: TimerBubble) => {
    setEditingId(timer.id);
    setFormMode(timer.type || 'bubble');
    setNewLabel(timer.label);
    setNewDuration((timer.totalSeconds / 60).toString());
    // Finding day offset
    const today = new Date();
    today.setHours(0,0,0,0);
    const scheduled = new Date(timer.scheduledFor);
    scheduled.setHours(0,0,0,0);
    const diffTime = Math.abs(scheduled.getTime() - today.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    setNewDayOffset(diffDays.toString());
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormMode('bubble');
    setNewLabel('');
    setNewDuration('5');
    setNewDayOffset('0');
  };

  const toggleTimer = (id: string) => {
    setTimers(prev => prev.map(t => {
      if (t.id === id) {
        if (t.status === 'running') return { ...t, status: 'paused' };
        if (t.status === 'idle' || t.status === 'paused') return { ...t, status: 'running' };
      }
      return t;
    }));
  };

  const deleteTimer = (id: string) => {
    setTimers(prev => prev.filter(t => t.id !== id));
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const activeBubbles = timers;
  const completedBubbles = [];

  return (
    <div className="relative min-h-screen w-full bg-[#030310] text-slate-800 overflow-hidden font-sans">
      {/* Night Sky with Stars */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden bg-[radial-gradient(circle_at_50%_0%,#1e1b4b_0%,#030310_70%)]">
        {stars.map(star => (
          <div 
            key={star.id} 
            className="absolute bg-white rounded-full animate-twinkle" 
            style={{ 
              left: star.left, 
              top: star.top, 
              width: star.size, 
              height: star.size, 
              opacity: 0.1,
              animationDuration: star.duration,
              animationDelay: star.delay
            }} 
          />
        ))}
        
        {/* Subtle Ambient Nebula Glows */}
        <div className="absolute top-[-10%] right-[10%] w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-[120px]" />
        <div className="absolute top-[30%] left-[-10%] w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[100px]" />
      </div>

      {/* Main UI */}
      <main className="relative z-10 flex flex-col h-screen overflow-hidden">
        <header className="absolute top-6 right-8 z-50">
          <button 
            onClick={() => setShowForm(true)}
            className="h-14 w-14 bg-white/10 backdrop-blur-xl border-2 border-white/30 rounded-full flex items-center justify-center text-white shadow-2xl hover:scale-110 active:scale-95 transition-all group overflow-hidden"
            title="Create new bubble"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <Plus size={28} className="group-hover:rotate-90 transition-transform font-bold relative z-10" />
          </button>
        </header>

        {/* Form Modal */}
        <AnimatePresence>
          {showForm && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1e1b4b]/60 backdrop-blur-md"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-white/10 backdrop-blur-2xl border border-white/20 p-10 rounded-[2.5rem] w-full max-w-lg shadow-[0_32px_64px_-16px_rgba(0,0,0,0.4)]"
              >
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-2xl font-black text-white tracking-tight">
                      {editingId ? 'Edit' : 'Create'} {formMode === 'bubble' ? 'Bubble' : 'Interval Alarm'}
                    </h2>
                    <p className="text-[10px] uppercase tracking-widest text-orange-300 font-bold mt-1">
                      {formMode === 'bubble' ? 'Setting your intentions' : 'Routine heartbeat'}
                    </p>
                  </div>
                  <button onClick={closeForm} className="text-white/40 hover:text-white transition-colors">
                    <X size={24} />
                  </button>
                </div>

                {!editingId && (
                  <div className="flex bg-black/20 p-1 rounded-2xl mb-8">
                    <button 
                      onClick={() => setFormMode('bubble')}
                      className={cn(
                        "flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all",
                        formMode === 'bubble' ? "bg-white/10 text-white shadow-lg" : "text-white/40 hover:text-white/60"
                      )}
                    >
                      Bubble
                    </button>
                    <button 
                      onClick={() => setFormMode('alarm')}
                      className={cn(
                        "flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all",
                        formMode === 'alarm' ? "bg-white/10 text-white shadow-lg" : "text-white/40 hover:text-white/60"
                      )}
                    >
                      Alarm
                    </button>
                    <button 
                      onClick={() => setFormMode('persistent')}
                      className={cn(
                        "flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all",
                        formMode === 'persistent' ? "bg-white/10 text-white shadow-lg" : "text-white/40 hover:text-white/60"
                      )}
                    >
                      Task
                    </button>
                  </div>
                )}

                <div className="space-y-8">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-orange-200/40 mb-3">Label</label>
                    <input 
                      autoFocus
                      type="text" 
                      value={newLabel}
                      onChange={e => setNewLabel(e.target.value)}
                      placeholder={formMode === 'bubble' ? "What needs doing?" : (formMode === 'alarm' ? "Alarm Name" : "Persistent Todo")}
                      className="w-full bg-black/20 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:ring-4 focus:ring-orange-500/30 text-white placeholder:text-white/20 transition-all text-lg font-medium"
                    />
                  </div>

                  {formMode !== 'persistent' && (
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-xs font-black uppercase tracking-widest text-orange-200/40 mb-3">
                          {formMode === 'bubble' ? 'Duration (min)' : 'Every (min)'}
                        </label>
                        <input 
                          type="number" 
                          value={newDuration}
                          onChange={e => setNewDuration(e.target.value)}
                          min="1"
                          className="w-full bg-black/20 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:ring-4 focus:ring-orange-500/30 text-white transition-all text-lg font-medium"
                        />
                      </div>
                      {formMode === 'bubble' && (
                        <div>
                          <label className="block text-xs font-black uppercase tracking-widest text-orange-200/40 mb-3">Schedule</label>
                          <select 
                            value={newDayOffset}
                            onChange={e => setNewDayOffset(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:ring-4 focus:ring-orange-500/30 text-white transition-all text-lg font-medium appearance-none cursor-pointer"
                          >
                            <option value="0" className="bg-[#1e1b4b]">Today</option>
                            {[1,2,3,4,5,6,7].map(d => (
                              <option key={d} value={d} className="bg-[#1e1b4b]">{format(addDays(new Date(), d), 'EEE, MMM d')}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  <button 
                    onClick={saveTimer}
                    className="w-full bg-orange-500 hover:bg-orange-400 text-white py-5 rounded-2xl font-black uppercase tracking-widest transition-all shadow-xl shadow-orange-500/30 active:scale-[0.98] mt-4 overflow-hidden relative group"
                  >
                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                    <span className="relative z-10">{editingId ? 'Update' : (formMode === 'bubble' ? 'Float Bubble' : (formMode === 'alarm' ? 'Echo Alarm' : 'Plant Task'))}</span>
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bubble Arena */}
        <div className="flex-1 relative overflow-hidden custom-scrollbar flex">
          {/* Zen Task Log - Left Side Dock */}
          <aside className="w-80 h-full relative z-20 flex flex-col p-8 pointer-events-none">
            <div className="pointer-events-auto">
              <div className="space-y-3 overflow-y-auto max-h-[60vh] pr-4 custom-scrollbar">
                <AnimatePresence mode="popLayout">
                  {persistentTasks.map(task => (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="group p-4 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl hover:bg-white/10 transition-all shadow-lg flex items-center gap-4"
                    >
                      <button 
                        onClick={() => {
                          setPersistentTasks(prev => prev.filter(t => t.id !== task.id));
                        }}
                        className="flex-shrink-0 w-8 h-8 rounded-full border-2 border-white/20 flex items-center justify-center text-white/40 hover:bg-emerald-500 hover:border-emerald-500 hover:text-white transition-all group/btn"
                      >
                        <CheckCircle2 size={18} className="opacity-0 group-hover/btn:opacity-100 absolute" />
                        <Circle size={18} className="group-hover/btn:opacity-0" />
                      </button>
                      <span className="flex-1 text-white font-bold text-[13px] tracking-wide leading-tight group-hover:text-white transition-colors uppercase">
                        {task.label}
                      </span>
                      <button 
                        onClick={() => setPersistentTasks(prev => prev.filter(t => t.id !== task.id))}
                        className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 transition-all p-1"
                      >
                        <X size={14} />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {persistentTasks.length === 0 && (
                  <div className="py-8 text-center border-2 border-dashed border-white/5 rounded-2xl">
                    <p className="text-white/10 text-[9px] font-black uppercase tracking-[0.3em]">Log is empty</p>
                  </div>
                )}
              </div>
            </div>
          </aside>

          <div ref={arenaRef} className="flex-1 relative">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/10 z-50 pointer-events-none" />
            <AnimatePresence mode="popLayout">
              {activeBubbles.map((timer, index) => {
              const p = physics[timer.id];
              if (!p) return null;
              
              return (
                <motion.div
                  key={timer.id}
                  style={{
                    position: 'absolute',
                    left: p.x,
                    top: p.y,
                    x: '-50%',
                    y: '-50%',
                    touchAction: 'none'
                  }}
                  layoutId={timer.id}
                  drag
                  dragConstraints={arenaRef}
                  dragElastic={0}
                  dragMomentum={false}
                  onDragStart={() => {
                    setPhysics(prev => ({
                      ...prev,
                      [timer.id]: { ...prev[timer.id], isDragging: true }
                    }));
                  }}
                  onDrag={(e, info) => {
                    setPhysics(prev => {
                      const b = prev[timer.id];
                      if (!b || !arenaRef.current) return prev;
                      
                      const { width, height } = arenaRef.current.getBoundingClientRect();
                      
                      // Strict clamping during drag
                      let newX = b.x + info.delta.x;
                      let newY = b.y + info.delta.y;

                      const TOP_LIMIT = b.radius + 15;
                      const BOTTOM_LIMIT = height - b.radius - 5;
                      
                      if (newX < b.radius) newX = b.radius;
                      if (newX > width - b.radius) newX = width - b.radius;
                      if (newY < TOP_LIMIT) newY = TOP_LIMIT;
                      if (newY > BOTTOM_LIMIT) newY = BOTTOM_LIMIT;

                      return {
                        ...prev,
                        [timer.id]: {
                          ...b,
                          x: newX,
                          y: newY,
                        }
                      };
                    });
                  }}
                  onDragEnd={() => {
                    setPhysics(prev => {
                      const b = prev[timer.id];
                      if (!b) return prev;
                      const next = {
                        ...prev,
                        [timer.id]: {
                          ...b,
                          isDragging: false,
                          anchorX: b.x,
                          anchorY: b.y
                        }
                      };
                      localStorage.setItem('bubble-physics', JSON.stringify(next));
                      return next;
                    });
                  }}
                >
                  <Bubble 
                    timer={timer} 
                    onToggle={() => toggleTimer(timer.id)}
                    onDelete={() => deleteTimer(timer.id)}
                    onEdit={() => startEdit(timer)}
                    isRinging={ringingIds.has(timer.id)}
                    onSilence={() => silenceAlarm(timer.id)}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>
          {activeBubbles.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full opacity-30">
              <div className="w-24 h-24 rounded-full border-2 border-dashed border-orange-200/20 mb-4 animate-pulse shadow-[0_0_20px_rgba(251,146,60,0.1)]" />
              <p className="text-orange-200 font-bold tracking-[0.3em] text-[10px] uppercase">Silence</p>
            </div>
          )}
          </div>
        </div>
      </main>
      
      <style>{`
        @keyframes float-jitter {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          33% { transform: translate(2px, -3px) rotate(1deg); }
          66% { transform: translate(-2px, 3px) rotate(-1deg); }
        }
        @keyframes breathing {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        .animate-breathing-slow {
          animation: breathing 4s ease-in-out infinite;
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.2); }
        }
        .animate-twinkle {
          animation: twinkle var(--twinkle-duration, 3s) ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

function Bubble({ timer, onToggle, onDelete, onEdit, isRinging, onSilence }: { 
  timer: TimerBubble, 
  onToggle: () => void, 
  onDelete: () => void,
  onEdit: () => void,
  isRinging?: boolean,
  onSilence?: () => void
}) {
  const isCompleted = timer.status === 'completed';
  const theme = isCompleted 
    ? { from: 'from-zinc-900', to: 'to-black', shadow: 'rgba(0,0,0,0.8)' }
    : BUBBLE_COLORS[timer.colorIndex] || BUBBLE_COLORS[0];
    
  const progress = (timer.remainingSeconds / timer.totalSeconds) * 100;
  const isAlarm = timer.type === 'alarm';

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isToday = isSameDay(timer.scheduledFor, new Date().getTime());

  return (
    <motion.div 
      layout
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={cn("group relative", isCompleted ? "opacity-60" : "opacity-100")}
    >
      <div 
        className={cn(
          "flex flex-col items-center justify-center relative p-4 transition-all duration-700 bg-gradient-to-br",
          timer.status !== 'running' && "backdrop-blur-md",
          isCompleted ? "shadow-[inset_0_0_30px_rgba(255,255,255,0.05)] border-white/20" : "shadow-[inset_0_0_30px_rgba(255,255,255,0.3)] border-white/40",
          theme.from, theme.to,
          isAlarm ? "w-32 h-32 rounded-[2rem] border" : "w-44 h-44 rounded-full border-[2px]",
          timer.status === 'running' ? 'animate-breathing-slow' : '',
          isRinging ? 'animate-bounce border-white border-[4px]' : ''
        )}
        style={{ 
          boxShadow: isRinging 
            ? `0 0 80px ${isCompleted ? 'rgba(255,255,255,0.2)' : theme.shadow}` 
            : isCompleted 
              ? `inset -10px -10px 20px rgba(0,0,0,0.4), inset 0 0 40px rgba(255,255,255,0.05), 0 20px 50px -10px rgba(0,0,0,0.8)`
              : `inset -10px -10px 20px rgba(0,0,0,0.05), inset 0 0 40px rgba(255,255,255,0.4), 0 20px 50px -10px ${theme.shadow}`
        }}
      >
        {isRinging && (
           <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/40 backdrop-blur-md rounded-[inherit]">
             <button 
               onClick={(e) => { e.stopPropagation(); onSilence?.(); }}
               className="px-4 py-2 bg-white text-blue-900 font-black text-[10px] uppercase tracking-widest rounded-xl shadow-2xl animate-pulse hover:scale-110 transition-transform border-2 border-blue-900/10"
             >
               Dismiss
             </button>
           </div>
        )}

        {/* Floating Controls */}
        <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-all duration-300 z-30 pointer-events-none group-hover:pointer-events-auto">
          <div className="flex flex-col gap-1.5 pointer-events-auto">
            <button onClick={onEdit} title="Edit" className="p-2 bg-white/90 border border-white/50 rounded-full hover:bg-white text-blue-900 shadow-2xl transition-all hover:scale-110">
              <Edit2 size={12} />
            </button>
            <button onClick={onDelete} title="Delete" className="p-2 bg-red-500/90 border border-white/50 rounded-full hover:bg-red-500 text-white shadow-xl transition-all hover:scale-110">
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        <div className="text-center relative z-10 select-none px-2">
          <div className="flex items-center justify-center gap-1 mb-1 shadow-sm">
             {isAlarm && <Bell size={10} className={cn(isCompleted ? "text-white/40" : "text-[#1e1b4b]/60")} />}
             <span className={cn(
               "block font-black uppercase tracking-[0.05em] max-w-[110px] truncate drop-shadow-md",
               (isCompleted || !isAlarm) ? "text-white" : "text-[#1e1b4b]"
             )}>
                {timer.label}
             </span>
          </div>
          <div className={cn(
            "font-black text-white drop-shadow-2xl tracking-tight filter contrast-125",
            (isCompleted || !isAlarm) ? "text-2xl text-white" : "text-lg text-[#1e1b4b]/90"
          )}>
            {formatTime(timer.remainingSeconds)}
          </div>
          <div className="mt-1 min-h-[1.2rem]">
             {!isToday && !isAlarm && (
               <span className="text-[9px] font-black bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded-full text-white/90 border border-white/30 shadow-sm">
                 {format(timer.scheduledFor, 'EEE')}
               </span>
             )}
             {isAlarm && (
               <span className={cn("text-[8px] font-black uppercase tracking-[0.2em] leading-none", isCompleted ? "text-white/40" : "text-[#1e1b4b]/40")}>Routine</span>
             )}
          </div>
          {timer.status === 'paused' && !isRinging && !isCompleted && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              <Pause size={24} className="text-white/20" />
            </div>
          )}
          {isCompleted && (
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-20">
               <CheckCircle2 size={40} className="text-white" />
             </div>
          )}
        </div>

        {!isCompleted && (
          <button 
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className={cn(
              "mt-3 w-12 h-12 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-2xl relative z-20 backdrop-blur-sm border border-white/40",
              timer.status === 'running' ? 'bg-white/10 hover:bg-white/20' : 'bg-white/90 hover:bg-white',
              isAlarm ? "w-10 h-10 mt-2" : ""
            )}
          >
            {timer.status === 'running' 
              ? <Pause size={isAlarm ? 20 : 24} fill="white" className="text-white drop-shadow-md" /> 
              : <Play size={isAlarm ? 20 : 24} fill="#1e1b4b" className={cn("ml-1 drop-shadow-sm text-[#1e1b4b]")} />
            }
          </button>
        )}

        {/* Progress Shape Overlay */}
        <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none p-1.5 opacity-60">
          {!isAlarm && (
            <circle cx="100" cy="100" r="95" fill="none" stroke="white" strokeWidth="3" className="opacity-20" />
          )}
          
          <motion.circle 
            cx="100" cy="100" r="95" 
            fill="none" 
            stroke="white" 
            strokeWidth="3" 
            strokeDasharray="597"
            animate={{ strokeDashoffset: 597 - (597 * progress) / 100 }}
            strokeLinecap="round"
            className={cn("opacity-70 drop-shadow-[0_0_8px_white]", isAlarm ? "hidden" : "block")}
            transition={{ duration: 1, ease: "linear" }}
          />
        </svg>

        {/* Bubble Shine & Reflections */}
        {!isAlarm && (
          <>
            <div className="absolute top-8 left-10 w-12 h-8 bg-white/40 rounded-[50%] blur-md rotate-[-45deg] z-0 opacity-60" />
            <div className="absolute top-10 left-12 w-4 h-2 bg-white/60 rounded-[50%] blur-[2px] rotate-[-45deg] z-0" />
            <div className="absolute bottom-12 right-12 w-8 h-6 bg-white/20 rounded-[50%] blur-lg rotate-[135deg] z-0" />
          </>
        )}
        <div className="absolute top-4 left-6 w-8 h-4 bg-white/30 rounded-[50%] blur-sm rotate-[-45deg] z-0" />
      </div>
    </motion.div>
  );
}

function Pond() { return null; }
