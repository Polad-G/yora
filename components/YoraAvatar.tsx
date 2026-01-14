
import React from 'react';
import { YoraState } from '../types';

interface Props {
  state: YoraState;
}

const YoraAvatar: React.FC<Props> = ({ state }) => {
  return (
    <div className="relative w-40 h-40 flex items-center justify-center">
      {/* Background glow */}
      <div className={`absolute inset-0 rounded-full blur-3xl transition-all duration-700 ${
        state === YoraState.SPEAKING ? 'bg-red-600/30 scale-125' : 
        state === YoraState.LISTENING ? 'bg-blue-600/20 scale-105' :
        state === YoraState.THINKING ? 'bg-zinc-600/20 animate-pulse' : 
        'bg-red-900/10'
      }`}></div>

      {/* Robot Head Frame */}
      <div className={`relative z-10 w-32 h-32 border-2 transition-colors duration-300 rounded-2xl bg-zinc-950 flex flex-col items-center p-4 overflow-hidden shadow-inner ${
        state === YoraState.SPEAKING ? 'border-red-600/50 shadow-[0_0_30px_rgba(220,38,38,0.2)]' : 
        state === YoraState.LISTENING ? 'border-blue-600/50 shadow-[0_0_30px_rgba(59,130,246,0.2)]' :
        'border-zinc-800'
      }`}>
        {/* Antenna */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full w-1 h-4 bg-zinc-800">
           <div className={`w-3 h-3 rounded-full -translate-x-1/4 -translate-y-full transition-colors duration-300 ${
             state === YoraState.THINKING ? 'bg-zinc-400' : 
             state === YoraState.LISTENING ? 'bg-blue-500 shadow-[0_0_15px_#3b82f6]' :
             'bg-red-600 shadow-[0_0_15px_#dc2626]'
           } animate-pulse`}></div>
        </div>

        {/* Eyes Section */}
        <div className="w-full flex justify-around mt-4">
           {/* Left Eye */}
           <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden">
             <div className={`w-4 h-4 rounded-sm transition-all duration-200 ${
               state === YoraState.SPEAKING ? 'bg-red-500 h-1' : 
               state === YoraState.LISTENING ? 'bg-blue-500 h-4 w-4 rounded-full animate-pulse' :
               state === YoraState.THINKING ? 'bg-zinc-500' : 
               'bg-red-600'
             } shadow-[0_0_5px_currentColor]`}></div>
           </div>
           {/* Right Eye */}
           <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden">
             <div className={`w-4 h-4 rounded-sm transition-all duration-200 ${
               state === YoraState.SPEAKING ? 'bg-red-500 h-1' : 
               state === YoraState.LISTENING ? 'bg-blue-500 h-4 w-4 rounded-full animate-pulse' :
               state === YoraState.THINKING ? 'bg-zinc-500' : 
               'bg-red-600'
             } shadow-[0_0_5px_currentColor]`}></div>
           </div>
        </div>

        {/* Mouth/Voice Visualizer */}
        <div className="mt-8 flex items-end gap-1 h-8">
           {[...Array(12)].map((_, i) => (
             <div 
               key={i} 
               className={`w-1.5 transition-all duration-75 rounded-t-sm ${
                 state === YoraState.SPEAKING ? 'bg-red-500' : 
                 state === YoraState.LISTENING ? 'bg-blue-500' : 
                 'bg-zinc-800'
               }`}
               style={{ 
                 height: (state === YoraState.SPEAKING || state === YoraState.LISTENING) 
                   ? `${Math.random() * 100}%` 
                   : '2px',
                 opacity: (state === YoraState.SPEAKING || state === YoraState.LISTENING) ? 0.9 : 0.2
               }}
             />
           ))}
        </div>
        
        {/* Scan line effect */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/5 to-transparent h-6 w-full animate-[scan_3s_linear_infinite] pointer-events-none"></div>
      </div>

      <style>{`
        @keyframes scan {
          0% { transform: translateY(-150%); }
          100% { transform: translateY(500%); }
        }
      `}</style>
    </div>
  );
};

export default YoraAvatar;
