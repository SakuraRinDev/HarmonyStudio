
import React, { useRef, useEffect } from 'react';
import { TrackData } from '../types';

interface TrackCardProps {
  track: TrackData;
  stream: MediaStream | null;
  onStartRecord: (id: number) => void;
  onStopRecord: () => void;
  onClear: (id: number) => void;
  onDownload: (id: number) => void;
  onOffsetChange: (id: number, newOffset: number) => void;
  onTogglePlay: (id: number) => void;
  onToggleMute: (id: number) => void;
  isGlobalRecording: boolean;
  isPlayingLocally: boolean;
}

const TrackCard: React.FC<TrackCardProps> = ({
  track,
  stream,
  onStartRecord,
  onStopRecord,
  onClear,
  onDownload,
  onOffsetChange,
  onTogglePlay,
  onToggleMute,
  isGlobalRecording,
  isPlayingLocally
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const currentUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (track.isRecording && stream) {
      if (video.srcObject !== stream) {
        // 新しいソースを設定する前に古いソースをクリア
        video.src = "";
        video.srcObject = stream;
        video.muted = true;
        video.play().catch(() => {
          // ユーザー操作やソース変更による中断は無視してよい
        });
      }
    } else if (track.url) {
      if (video.srcObject) {
        video.srcObject = null;
      }
      if (currentUrlRef.current !== track.url) {
        video.src = track.url;
        currentUrlRef.current = track.url;
      }
      video.muted = track.isMuted;
    } else {
      if (video.srcObject) video.srcObject = null;
      if (video.src !== "") {
        video.src = "";
      }
      currentUrlRef.current = null;
    }
  }, [track.isRecording, track.url, stream, track.isMuted]);

  return (
    <div className={`relative aspect-video bg-slate-900 rounded-xl overflow-hidden border-2 transition-all duration-300 ${
      track.isRecording ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : 
      track.url ? (track.isMuted ? 'border-slate-800 opacity-60' : 'border-emerald-500/50') : 'border-slate-800'
    }`}>
      <div className="absolute top-3 left-3 z-20 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${ track.isRecording ? 'bg-red-500 animate-pulse' : track.url ? 'bg-emerald-500' : 'bg-slate-700 text-slate-300' }`}>Track {track.id}</span>
          {track.isMuted && track.url && <span className="px-2 py-1 rounded bg-slate-800 text-slate-400 text-[10px] font-bold">MUTED</span>}
        </div>
        {track.url && !track.isRecording && (
          <div className="bg-black/60 backdrop-blur-md border border-white/10 p-1 rounded-lg flex items-center gap-2">
            <button onClick={() => onOffsetChange(track.id, track.offset - 10)} className="w-4 h-4 bg-slate-700 rounded text-[10px]">-</button>
            <span className="text-[10px] font-mono min-w-[3rem] text-center">{track.offset}ms</span>
            <button onClick={() => onOffsetChange(track.id, track.offset + 10)} className="w-4 h-4 bg-slate-700 rounded text-[10px]">+</button>
          </div>
        )}
      </div>

      <video ref={videoRef} className={`w-full h-full object-cover ${track.isRecording ? 'scale-x-[-1]' : ''} ${track.isMuted ? 'grayscale' : ''}`} playsInline id={`video-track-${track.id}`} />

      {track.isRecording && (
        <div className="absolute inset-0 bg-red-950/20 flex items-center justify-center z-30">
          <button onClick={onStopRecord} className="bg-white text-black px-6 py-2 rounded-full font-bold shadow-2xl flex items-center gap-2 transform transition hover:scale-105 active:scale-95">
             <div className="w-3 h-3 bg-red-600 rounded-sm" />停止
          </button>
        </div>
      )}

      {!track.url && !track.isRecording && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 bg-slate-900/50">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mb-2 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          <span className="text-sm font-medium">録音待ち...</span>
        </div>
      )}

      <div className={`absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-center gap-3 transition-opacity ${ track.isRecording ? 'opacity-0 pointer-events-none' : 'opacity-100' }`}>
        {!track.url ? (
          <button onClick={() => onStartRecord(track.id)} disabled={isGlobalRecording} className="bg-red-600 hover:bg-red-500 disabled:bg-slate-800 text-white px-5 py-2 rounded-full font-bold text-sm shadow-xl">録音を開始</button>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={() => onToggleMute(track.id)} className={`p-2 rounded-full ${track.isMuted ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-300'}`} title="ミュート">
              {track.isMuted ? <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" /></svg> : <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414z" /></svg>}
            </button>
            <button onClick={() => onTogglePlay(track.id)} disabled={isGlobalRecording} className={`p-2 rounded-full ${isPlayingLocally ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-white'}`}>{isPlayingLocally ? <div className="w-5 h-5 flex items-center justify-center font-bold">■</div> : <div className="w-5 h-5 flex items-center justify-center translate-x-0.5">▶</div>}</button>
            <button onClick={() => onStartRecord(track.id)} disabled={isGlobalRecording} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-full text-xs font-bold text-white">録り直し</button>
            <button onClick={() => onClear(track.id)} className="p-2 bg-red-900/40 hover:bg-red-900/60 rounded-full text-red-400" title="削除">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrackCard;
