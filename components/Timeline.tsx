
import React, { useRef } from 'react';
import { TrackData, BaseTrackData } from '../types';

interface TimelineProps {
  tracks: TrackData[];
  baseTrack: BaseTrackData;
  currentTime: number;
  maxDuration: number;
  onSeek?: (time: number) => void;
}

const Timeline: React.FC<TimelineProps> = ({ tracks, baseTrack, currentTime, maxDuration, onSeek }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewDuration = Math.max(10, maxDuration);
  const playheadPosition = (currentTime / viewDuration) * 100;

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!containerRef.current || !onSeek) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const seekTime = (x / rect.width) * viewDuration;
    onSeek(Math.max(0, Math.min(seekTime, viewDuration)));
  };

  const renderBaseWaveform = () => {
    if (!baseTrack.url || baseTrack.waveform.length === 0) return null;
    
    // ガイド音源の波形を表示する際、Start At (startTime) からの部分を表示
    const startIdx = Math.floor((baseTrack.startTime / baseTrack.duration) * baseTrack.waveform.length);
    const visibleWaveform = baseTrack.waveform.slice(startIdx);
    
    return (
      <div className={`flex items-center justify-around w-full h-full px-1 gap-[1px] transition-opacity ${baseTrack.includeInExport ? 'opacity-60' : 'opacity-20'}`}>
        {visibleWaveform.map((peak, i) => (
          <div key={i} className="w-full bg-blue-400 rounded-full" style={{ height: `${Math.max(10, peak * 80)}%` }} />
        ))}
      </div>
    );
  };

  return (
    <div 
      ref={containerRef}
      onClick={handleTimelineClick}
      className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-4 mt-8 mb-24 relative overflow-hidden shadow-inner cursor-pointer group"
    >
      <div className="flex items-center justify-between mb-4 pointer-events-none">
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          タイムライン
        </h3>
        <div className="flex items-center gap-3">
          {baseTrack.url && (
            <span className={`text-[10px] font-mono flex items-center gap-1 ${baseTrack.includeInExport ? 'text-blue-400' : 'text-slate-600'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${baseTrack.includeInExport ? 'bg-blue-400' : 'bg-slate-700'}`} />
              GUIDE {baseTrack.includeInExport ? '(Export ON)' : '(Ref Only)'}
            </span>
          )}
          <span className="text-[10px] font-mono text-emerald-500">{currentTime.toFixed(2)}s / {viewDuration.toFixed(2)}s</span>
        </div>
      </div>

      <div className="space-y-2 relative">
        {/* Playhead Line */}
        <div 
          className="absolute top-0 bottom-0 w-px bg-white z-20 shadow-[0_0_8px_white] transition-all duration-100 ease-linear pointer-events-none"
          style={{ left: `${playheadPosition}%` }}
        />
        {/* Hover Hint */}
        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10" />

        {baseTrack.url && (
          <div className={`h-8 rounded-lg relative overflow-hidden flex items-center transition-all ${baseTrack.includeInExport ? 'bg-blue-900/20 border-blue-900/30' : 'bg-slate-900/40 border-slate-800' } border`}>
            <span className={`text-[8px] font-black px-2 z-10 h-full flex items-center border-r transition-colors ${baseTrack.includeInExport ? 'bg-blue-900/40 text-blue-400 border-blue-900/50' : 'bg-slate-800/50 text-slate-600 border-slate-800'}`}>REFERENCE</span>
            <div className="relative flex-1 h-full">
               {renderBaseWaveform()}
            </div>
          </div>
        )}

        {tracks.map((track) => (
          <div key={track.id} className={`h-10 rounded-lg relative overflow-hidden flex items-center transition-all ${track.isMuted ? 'bg-slate-900/20' : 'bg-slate-800/30'}`}>
            <span className={`text-[9px] font-bold px-2 z-10 bg-slate-900/50 h-full flex items-center border-r border-slate-800 transition-colors ${track.isMuted ? 'text-slate-700' : 'text-slate-600'}`}>T{track.id}</span>
            {track.url && (
              <div 
                className={`absolute h-full rounded shadow-sm transition-all flex items-center overflow-hidden ${
                  track.isRecording ? 'bg-red-500/20 animate-pulse' : 
                  (track.isMuted ? 'bg-slate-500/10 grayscale' : 'bg-emerald-500/10 border border-emerald-500/30')
                }`}
                style={{ 
                  left: `${((track.offset / 1000) / viewDuration) * 100}%`,
                  width: `${(track.duration / viewDuration) * 100}%` 
                }}
              >
                <div className="flex items-center justify-around w-full h-full px-1 gap-[1px]">
                  {track.waveform.map((peak, i) => (
                    <div key={i} className={`w-full rounded-full ${ track.isRecording ? 'bg-red-400/50' : (track.isMuted ? 'bg-slate-600/40' : 'bg-emerald-400/60') }`} style={{ height: `${Math.max(10, peak * 90)}%` }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 px-1 pointer-events-none">
        {[...Array(11)].map((_, i) => (
          <div key={i} className="flex flex-col items-center">
            <div className="h-1 w-px bg-slate-700 mb-1" />
            <span className="text-[7px] font-mono text-slate-700">{(viewDuration * (i / 10)).toFixed(1)}s</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Timeline;
