
import React, { useRef, useEffect } from 'react';
import { TrackData } from '../types';

interface TrackCardProps {
  track: TrackData;
  stream: MediaStream | null;
  onStartRecord: (id: number) => void;
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
        video.srcObject = stream;
        video.muted = true;
        video.play().catch(console.error);
        currentUrlRef.current = null;
      }
    } else if (track.url) {
      // 録画中でない場合はsrcObjectをクリア
      if (video.srcObject) video.srcObject = null;
      
      // 重要: srcが同じ場合は再設定しない（再生が止まるのを防ぐ）
      if (currentUrlRef.current !== track.url) {
        video.src = track.url;
        currentUrlRef.current = track.url;
      }
      
      // ミュート状態のみを更新（これは再生を止めない）
      video.muted = track.isMuted;
    } else {
      video.srcObject = null;
      video.src = "";
      currentUrlRef.current = null;
    }
  }, [track.isRecording, track.url, stream, track.isMuted]);

  return (
    <div className={`relative group aspect-video bg-slate-900 rounded-xl overflow-hidden border-2 transition-all duration-300 ${
      track.isRecording ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)]' : 
      track.url ? (track.isMuted ? 'border-slate-700 opacity-60' : 'border-emerald-500/50') : 'border-slate-800'
    }`}>
      {/* Track Label */}
      <div className="absolute top-3 left-3 z-20 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider w-fit ${
            track.isRecording ? 'bg-red-500 text-white animate-pulse' : 
            track.url ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300'
          }`}>
            Track {track.id}
          </span>
          {track.isMuted && track.url && (
            <span className="px-2 py-1 rounded bg-slate-800 text-slate-400 text-[10px] font-bold uppercase">MUTED</span>
          )}
        </div>
        {track.url && !track.isRecording && (
          <div className="bg-black/60 backdrop-blur-md border border-white/10 p-1.5 rounded-lg flex items-center gap-2">
            <span className="text-[9px] font-bold text-slate-400">SYNC</span>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => onOffsetChange(track.id, track.offset - 10)}
                className="w-5 h-5 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded text-[10px]"
              >-</button>
              <span className="text-[10px] font-mono min-w-[3.5rem] text-center">
                {track.offset > 0 ? `+${track.offset}` : track.offset}ms
              </span>
              <button 
                onClick={() => onOffsetChange(track.id, track.offset + 10)}
                className="w-5 h-5 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded text-[10px]"
              >+</button>
            </div>
          </div>
        )}
      </div>

      {/* Video Element */}
      <video
        ref={videoRef}
        className={`w-full h-full object-cover transition-filter duration-300 ${!track.url && !track.isRecording ? 'hidden' : ''} ${track.isRecording ? 'scale-x-[-1]' : ''} ${track.isMuted ? 'grayscale contrast-50' : ''}`}
        playsInline
        id={`video-track-${track.id}`}
      />

      {/* Empty State Overlay */}
      {!track.url && !track.isRecording && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 bg-slate-900/50">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mb-2 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span className="text-sm font-medium">録音データなし</span>
        </div>
      )}

      {/* Controls Overlay */}
      <div className={`absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-center gap-3 transition-opacity duration-300 ${
        track.isRecording ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}>
        {!track.url ? (
          <button
            onClick={() => onStartRecord(track.id)}
            disabled={isGlobalRecording}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 text-white px-4 py-2 rounded-full font-semibold text-sm transition-colors shadow-lg shadow-red-600/20"
          >
            <div className="w-3 h-3 bg-white rounded-full" />
            録音を開始
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggleMute(track.id)}
              className={`p-2 rounded-full transition-colors ${track.isMuted ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
              title={track.isMuted ? "ミュート解除" : "ミュート"}
            >
              {track.isMuted ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.414 0A5.982 5.982 0 0115 10a5.982 5.982 0 01-1.757 4.243 1 1 0 01-1.414-1.414A3.982 3.982 0 0013 10a3.982 3.982 0 00-1.172-2.828 1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              )}
            </button>
            <button
              onClick={() => onTogglePlay(track.id)}
              disabled={isGlobalRecording}
              className={`p-2 rounded-full text-white transition-colors ${isPlayingLocally ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-slate-700 hover:bg-slate-600'}`}
              title={isPlayingLocally ? "停止" : "再生"}
            >
              {isPlayingLocally ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
              )}
            </button>
            <button
              onClick={() => onStartRecord(track.id)}
              disabled={isGlobalRecording}
              className="p-2 bg-slate-700 hover:bg-slate-600 rounded-full text-white transition-colors"
              title="録り直し"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={() => onDownload(track.id)}
              className="p-2 bg-slate-700 hover:bg-slate-600 rounded-full text-white transition-colors"
              title="保存"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            <button
              onClick={() => onClear(track.id)}
              className="p-2 bg-red-900/40 hover:bg-red-900/60 rounded-full text-red-400 transition-colors"
              title="削除"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrackCard;
