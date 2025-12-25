
import React, { useRef, useState, useEffect } from 'react';
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
  const [isDragging, setIsDragging] = useState(false);

  // タイムラインのビュー全体の長さ（秒）
  const viewDuration = baseTrack.url ? baseTrack.duration : Math.max(maxDuration, 10);
  
  // プレイヘッドの絶対的な表示位置（ガイドの開始点 + 録音内経過時間）
  const absoluteCurrentTime = baseTrack.url ? (baseTrack.startTime + currentTime) : currentTime;
  const playheadPosition = (absoluteCurrentTime / viewDuration) * 100;

  const calculateSeekTime = (clientX: number) => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const seekAbsoluteTime = (x / rect.width) * viewDuration;
    return baseTrack.url ? Math.max(0, seekAbsoluteTime - baseTrack.startTime) : seekAbsoluteTime;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!onSeek) return;
    setIsDragging(true);
    onSeek(calculateSeekTime(e.clientX));
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && onSeek) onSeek(calculateSeekTime(e.clientX));
    };
    const handleMouseUp = () => setIsDragging(false);
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onSeek, baseTrack.startTime, viewDuration]);

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 mt-8 mb-24 relative overflow-hidden shadow-2xl select-none group">
      <div className="flex justify-between items-center mb-4 px-1">
        <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest">Master Timeline</h3>
        <div className="text-[10px] font-mono text-slate-500">
           <span className="text-emerald-400">{currentTime.toFixed(2)}s</span> / {viewDuration.toFixed(1)}s
        </div>
      </div>

      <div ref={containerRef} onMouseDown={handleMouseDown} className="space-y-2 relative cursor-pointer pt-2 pb-6">
        {/* Playhead */}
        <div className="absolute top-0 bottom-0 w-[2px] bg-white z-40 shadow-[0_0_15px_white] pointer-events-none" style={{ left: `${playheadPosition}%` }}>
          <div className="absolute -top-1 -left-1.5 w-4 h-4 bg-white rounded-full border-2 border-slate-950 shadow-xl" />
        </div>

        {/* Start At Line (REC START MARKER) */}
        {baseTrack.url && (
          <div className="absolute top-0 bottom-0 w-px border-l-2 border-red-500/40 z-20 pointer-events-none" style={{ left: `${(baseTrack.startTime / viewDuration) * 100}%` }}>
            <div className="absolute -top-4 -left-1 text-[7px] font-black text-red-500 bg-slate-900 px-1 rounded border border-red-500/30">REC START</div>
          </div>
        )}

        {/* Guide row */}
        {baseTrack.url && (
          <div className="h-10 rounded-lg relative overflow-hidden flex items-center bg-blue-900/10 border border-blue-900/20">
            <div className="text-[8px] font-black w-8 z-10 h-full flex items-center justify-center border-r border-blue-900/30 text-blue-500 bg-blue-900/20">REF</div>
            <div className="relative flex-1 h-full flex items-center px-1 gap-[0.5px] opacity-30">
               {baseTrack.waveform.map((p, i) => <div key={i} className="w-full bg-blue-400 rounded-full" style={{ height: `${p * 80}%` }} />)}
            </div>
          </div>
        )}

        {/* Track rows */}
        {tracks.map((track) => (
          <div key={track.id} className={`h-10 rounded-lg relative overflow-hidden flex items-center border border-slate-800/50 bg-slate-950/40`}>
            <div className="text-[9px] font-black w-8 z-10 h-full flex items-center justify-center border-r border-slate-800 text-slate-600">T{track.id}</div>
            {track.url && (
              <div 
                className={`absolute h-full transition-all flex items-center overflow-hidden border-l-4 ${ track.isRecording ? 'bg-red-500/20 border-red-500 animate-pulse' : track.isMuted ? 'bg-slate-800/20 border-slate-700 opacity-40' : 'bg-emerald-500/10 border-emerald-500/50' }`}
                style={{ 
                  left: `calc(32px + ${((baseTrack.startTime + (track.offset / 1000)) / viewDuration) * 100}%)`,
                  width: `${(track.duration / viewDuration) * 100}%`
                }}
              >
                <div className="flex items-center justify-around w-full h-full px-1 gap-[0.5px]">
                  {track.waveform.map((p, i) => <div key={i} className={`w-full rounded-full ${track.isRecording ? 'bg-red-400' : 'bg-emerald-400'}`} style={{ height: `${p * 90}%` }} />)}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-between px-8 opacity-20 pointer-events-none">
        {[...Array(6)].map((_, i) => <div key={i} className="text-[7px] font-mono">{(viewDuration * (i / 5)).toFixed(1)}s</div>)}
      </div>
    </div>
  );
};

export default Timeline;
