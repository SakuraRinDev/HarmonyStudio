
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TrackData, RecordingState, BaseTrackData } from './types';
import TrackCard from './components/TrackCard';
import Timeline from './components/Timeline';

const INITIAL_TRACKS: TrackData[] = [
  { id: 1, url: null, isRecording: false, status: 'empty', duration: 0, offset: 0, waveform: [], isMuted: false },
  { id: 2, url: null, isRecording: false, status: 'empty', duration: 0, offset: 0, waveform: [], isMuted: false },
  { id: 3, url: null, isRecording: false, status: 'empty', duration: 0, offset: 0, waveform: [], isMuted: false },
  { id: 4, url: null, isRecording: false, status: 'empty', duration: 0, offset: 0, waveform: [], isMuted: false },
];

const INITIAL_BASE_TRACK: BaseTrackData = {
  url: null,
  name: null,
  duration: 0,
  waveform: [],
  isMuted: false,
  startTime: 0,
  includeInExport: false
};

const App: React.FC = () => {
  const [tracks, setTracks] = useState<TrackData[]>(INITIAL_TRACKS);
  const [baseTrack, setBaseTrack] = useState<BaseTrackData>(INITIAL_BASE_TRACK);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [globalState, setGlobalState] = useState('idle') as [RecordingState, React.Dispatch<React.SetStateAction<RecordingState>>];
  const [statusMessage, setStatusMessage] = useState('カメラの準備中...');
  const [playbackTime, setPlaybackTime] = useState(0); 
  const [playingTrackId, setPlayingTrackId] = useState<number | null>(null);

  const [bpm, setBpm] = useState(120);
  const [isMetronomeEnabled, setIsMetronomeEnabled] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const activeTrackIdRef = useRef<number | null>(null);
  const playheadIntervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextTickTimeRef = useRef<number>(0);

  const sourceNodesRef = useRef<Map<number | string, MediaElementAudioSourceNode>>(new Map());
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);
  const exportRecorderRef = useRef<MediaRecorder | null>(null);
  const exportChunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number>(0);

  useEffect(() => {
    const initMedia = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
        setStream(mediaStream);
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        setStatusMessage('準備完了');
      } catch (err) {
        setStatusMessage('エラー: カメラの許可が必要です');
      }
    };
    initMedia();
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (playheadIntervalRef.current) clearInterval(playheadIntervalRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  // ガイド音源のミュート状態を再生中にリアルタイム反映させるためのEffect
  // 依存配列を最小限にし、確実にDOM要素へ反映させます
  useEffect(() => {
    const baseAud = document.getElementById('base-audio-element') as HTMLAudioElement;
    if (baseAud) {
      baseAud.muted = baseTrack.isMuted;
    }
  }, [baseTrack.isMuted, baseTrack.url]);

  const playClick = (time: number) => {
    if (!audioCtxRef.current) return;
    const osc = audioCtxRef.current.createOscillator();
    const envelope = audioCtxRef.current.createGain();
    osc.frequency.value = 1000;
    envelope.gain.value = 0.2;
    envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    osc.connect(envelope);
    envelope.connect(audioCtxRef.current.destination);
    osc.start(time);
    osc.stop(time + 0.1);
  };

  const syncMediaToTime = useCallback((elapsed: number) => {
    const baseAud = document.getElementById('base-audio-element') as HTMLAudioElement;
    if (baseAud && baseTrack.url) {
      baseAud.currentTime = Math.min(baseTrack.startTime + elapsed, baseTrack.duration);
    }
    tracks.forEach(track => {
      if (track.url) {
        const vid = document.getElementById(`video-track-${track.id}`) as HTMLVideoElement;
        if (vid) {
          const target = elapsed - (track.offset / 1000);
          vid.currentTime = Math.max(0, Math.min(target, track.duration));
        }
      }
    });
  }, [tracks, baseTrack]);

  const startPlayheadTimer = useCallback((initialElapsed: number) => {
    if (playheadIntervalRef.current) clearInterval(playheadIntervalRef.current);
    startTimeRef.current = performance.now() - (initialElapsed * 1000);
    if (isMetronomeEnabled && audioCtxRef.current) nextTickTimeRef.current = audioCtxRef.current.currentTime;
    
    playheadIntervalRef.current = window.setInterval(() => {
      const elapsed = (performance.now() - startTimeRef.current) / 1000;
      setPlaybackTime(elapsed);
      if (isMetronomeEnabled && audioCtxRef.current) {
        const secondsPerBeat = 60.0 / bpm;
        while (nextTickTimeRef.current < audioCtxRef.current.currentTime + 0.1) {
          playClick(nextTickTimeRef.current);
          nextTickTimeRef.current += secondsPerBeat;
        }
      }
    }, 25);
  }, [isMetronomeEnabled, bpm]);

  const stopAllPlaybacks = useCallback(() => {
    if (playheadIntervalRef.current) clearInterval(playheadIntervalRef.current);
    setPlayingTrackId(null);
    setGlobalState('idle');
    const baseAud = document.getElementById('base-audio-element') as HTMLAudioElement;
    if (baseAud) baseAud.pause();
    tracks.forEach(track => {
      const vid = document.getElementById(`video-track-${track.id}`) as HTMLVideoElement;
      if (vid) vid.pause();
    });
    setPlaybackTime(0);
    syncMediaToTime(0);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
  }, [tracks, syncMediaToTime]);

  const handleStopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      stopAllPlaybacks();
    }
  }, [stopAllPlaybacks]);

  const handleSeek = (newElapsed: number) => {
    if (globalState === 'recording') return;
    setPlaybackTime(newElapsed);
    syncMediaToTime(newElapsed);
    if (globalState === 'playing-all' || playingTrackId !== null) {
      startPlayheadTimer(newElapsed);
      const baseAud = document.getElementById('base-audio-element') as HTMLAudioElement;
      if (baseAud && baseTrack.url && !baseAud.ended) baseAud.play().catch(() => {});
      tracks.forEach(track => {
        if (track.url) {
          const vid = document.getElementById(`video-track-${track.id}`) as HTMLVideoElement;
          const target = newElapsed - (track.offset / 1000);
          if (vid && target >= 0 && target < track.duration) vid.play().catch(() => {});
          else if (vid) vid.pause();
        }
      });
    }
  };

  const playAllMedia = useCallback((initialElapsed: number) => {
    startPlayheadTimer(initialElapsed);
    if (baseTrack.url) {
      const baseAud = document.getElementById('base-audio-element') as HTMLAudioElement;
      if (baseAud) {
        baseAud.muted = baseTrack.isMuted;
        baseAud.currentTime = baseTrack.startTime + initialElapsed;
        baseAud.play().catch(() => {});
      }
    }
    tracks.forEach(track => {
      if (track.url) {
        const vid = document.getElementById(`video-track-${track.id}`) as HTMLVideoElement;
        if (vid) {
          vid.muted = track.isMuted;
          const target = initialElapsed - (track.offset / 1000);
          vid.currentTime = Math.max(0, target);
          if (target >= 0 && target < track.duration) {
            vid.play().catch(() => {});
          } else if (target < 0) {
             setTimeout(() => {
                const nowElapsed = (performance.now() - startTimeRef.current) / 1000;
                if (nowElapsed >= (track.offset / 1000) && vid.paused) {
                  vid.currentTime = 0;
                  vid.play().catch(() => {});
                }
             }, -target * 1000);
          }
        }
      }
    });
  }, [tracks, baseTrack, startPlayheadTimer]);

  const handleStartRecording = (trackId: number) => {
    if (!stream) return;
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
    activeTrackIdRef.current = trackId;
    setGlobalState('recording');
    setTracks(prev => prev.map(t => ({ ...t, isRecording: t.id === trackId, status: t.id === trackId ? 'preview' : t.status })));
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    mediaRecorderRef.current = recorder;
    chunksRef.current = [];
    const recStartTime = performance.now();
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      const duration = (performance.now() - recStartTime) / 1000;
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const waveform = await generateWaveform(blob);
      setTracks(prev => prev.map(t => (t.id === activeTrackIdRef.current ? { ...t, url, duration, waveform, isRecording: false, status: 'recorded' } : { ...t, isRecording: false })));
      stopAllPlaybacks();
    };
    recorder.start();
    playAllMedia(0);
  };

  const generateWaveform = async (blob: Blob): Promise<number[]> => {
    try {
      const ab = await blob.arrayBuffer();
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const buffer = await audioCtxRef.current.decodeAudioData(ab);
      const data = buffer.getChannelData(0);
      const samples = 150;
      const blockSize = Math.floor(data.length / samples);
      const wave = [];
      for (let i = 0; i < samples; i++) {
        let max = 0;
        for (let j = 0; j < blockSize; j++) {
          const v = Math.abs(data[i * blockSize + j]);
          if (v > max) max = v;
        }
        wave.push(max);
      }
      return wave;
    } catch { return Array(150).fill(0.1); }
  };

  const handlePlayAll = () => {
    if (globalState === 'playing-all') { stopAllPlaybacks(); return; }
    stopAllPlaybacks();
    setGlobalState('playing-all');
    playAllMedia(0);
  };

  const handleTogglePlayTrack = (id: number) => {
    if (globalState !== 'idle') return;
    if (playingTrackId === id) { stopAllPlaybacks(); }
    else {
      stopAllPlaybacks();
      const vid = document.getElementById(`video-track-${id}`) as HTMLVideoElement;
      if (vid) {
        setPlayingTrackId(id);
        vid.currentTime = 0;
        vid.play().catch(() => {});
        startPlayheadTimer(0);
        vid.onended = () => stopAllPlaybacks();
      }
    }
  };

  const handleBaseTrackUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const waveform = await generateWaveform(file);
    const aud = new Audio(url);
    aud.onloadedmetadata = () => {
      setBaseTrack({...INITIAL_BASE_TRACK, url, name: file.name, duration: aud.duration, waveform, includeInExport: true});
      setStatusMessage('ガイド読込完了');
    };
  };

  const handleClearTrack = useCallback((id: number) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, url: null, duration: 0, waveform: [], status: 'empty', offset: 0, isMuted: false } : t));
  }, []);

  const handleOffsetChange = useCallback((id: number, newOffset: number) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, offset: newOffset } : t));
  }, []);

  const handleToggleMute = useCallback((id: number) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, isMuted: !t.isMuted } : t));
  }, []);

  // 書き出し機能の実装
  const handleMasterExport = async () => {
    if (globalState !== 'idle') return;
    setGlobalState('exporting');
    stopAllPlaybacks();

    const canvas = exportCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const destination = audioCtxRef.current.createMediaStreamDestination();
    
    // ガイド音声のオーディオ接続
    if (baseTrack.url && baseTrack.includeInExport) {
      const baseAud = document.getElementById('base-audio-element') as HTMLAudioElement;
      let source = sourceNodesRef.current.get('base');
      if (!source) {
        source = audioCtxRef.current.createMediaElementSource(baseAud);
        sourceNodesRef.current.set('base', source);
      }
      source.disconnect();
      const gain = audioCtxRef.current.createGain();
      gain.gain.value = baseTrack.isMuted ? 0 : 1;
      source.connect(gain);
      gain.connect(destination);
    }

    // 各トラックのオーディオ接続
    tracks.forEach(track => {
      if (!track.url) return;
      const vid = document.getElementById(`video-track-${track.id}`) as HTMLVideoElement;
      let source = sourceNodesRef.current.get(track.id);
      if (!source) {
        source = audioCtxRef.current!.createMediaElementSource(vid);
        sourceNodesRef.current.set(track.id, source);
      }
      source.disconnect();
      const gain = audioCtxRef.current!.createGain();
      gain.gain.value = track.isMuted ? 0 : 1;
      source.connect(gain);
      gain.connect(destination);
    });

    const canvasStream = canvas.captureStream(30);
    const combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
    const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm' });
    exportRecorderRef.current = recorder;
    exportChunksRef.current = [];
    recorder.ondataavailable = (e) => exportChunksRef.current.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(exportChunksRef.current, { type: 'video/webm' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'harmony-studio-export.webm';
      a.click();
      setGlobalState('idle');
      stopAllPlaybacks();
    };

    recorder.start();
    const render = () => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      tracks.forEach((track, index) => {
        const vid = document.getElementById(`video-track-${track.id}`) as HTMLVideoElement;
        const x = (index % 2) * 640;
        const y = Math.floor(index / 2) * 360;
        if (vid && track.url) { 
          ctx.drawImage(vid, x + 5, y + 5, 630, 350); 
        } else { 
          ctx.fillStyle = '#1e293b'; 
          ctx.fillRect(x + 5, y + 5, 630, 350);
          ctx.fillStyle = '#334155';
          ctx.font = 'bold 30px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`Track ${track.id}`, x + 320, y + 180);
        }
      });
      if (exportRecorderRef.current?.state === 'recording') {
        animationFrameRef.current = requestAnimationFrame(render);
      }
    };
    render();
    playAllMedia(0);

    const maxDur = Math.max(...tracks.map(t => t.url ? t.duration + (t.offset/1000) : 0), baseTrack.url ? (baseTrack.duration - baseTrack.startTime) : 0);
    setTimeout(() => { 
      if (exportRecorderRef.current?.state === 'recording') exportRecorderRef.current.stop(); 
    }, (maxDur + 1) * 1000);
  };

  const totalDuration = baseTrack.url ? baseTrack.duration : Math.max(10, ...tracks.map(t => t.duration + (t.offset / 1000)));

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center p-4 md:p-8 text-slate-200 select-none">
      <header className="max-w-5xl w-full mb-6">
        <h1 className="text-4xl font-black bg-gradient-to-r from-blue-400 via-emerald-400 to-emerald-600 bg-clip-text text-transparent mb-6 text-center">Harmony Studio</h1>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 px-4 py-2 rounded-2xl shadow-xl">
            {!baseTrack.url ? (
              <label className="flex items-center gap-2 cursor-pointer px-2 py-1"><input type="file" accept="audio/*" onChange={handleBaseTrackUpload} className="hidden" /><span className="text-[11px] font-bold text-blue-400">ガイド音源を読込</span></label>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex flex-col"><span className="text-[9px] font-black text-blue-500 uppercase">Guide</span><span className="text-[11px] font-bold truncate max-w-[80px]">{baseTrack.name}</span></div>
                <div className="h-8 w-px bg-slate-800" />
                <div className="flex flex-col"><span className="text-[9px] font-black text-slate-500 uppercase">Start At</span><input type="number" value={baseTrack.startTime} onChange={(e) => setBaseTrack(prev => ({...prev, startTime: parseFloat(e.target.value) || 0}))} step="0.5" className="w-12 bg-transparent text-[11px] font-mono focus:outline-none" /></div>
                <button onClick={() => setBaseTrack(prev => ({...prev, isMuted: !prev.isMuted}))} className={`p-1.5 rounded-lg transition-colors ${baseTrack.isMuted ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-800 text-slate-400'}`}>
                  {baseTrack.isMuted ? <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217z" /></svg> : <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414z" /></svg>}
                </button>
                <button onClick={() => setBaseTrack(prev => ({...prev, includeInExport: !prev.includeInExport}))} className={`text-[9px] font-bold px-2 py-1 rounded ${baseTrack.includeInExport ? 'bg-blue-600' : 'bg-slate-800 text-slate-500'}`} title="合体動画にガイドを含める">Export:{baseTrack.includeInExport ? 'ON' : 'OFF'}</button>
                <button onClick={() => setBaseTrack(INITIAL_BASE_TRACK)} className="text-red-500 hover:text-red-400"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 px-4 py-2 rounded-2xl shadow-xl">
             <span className="text-[9px] font-black text-emerald-500 uppercase">Tempo</span>
             <input type="number" value={bpm} onChange={(e) => setBpm(parseInt(e.target.value) || 120)} className="w-10 bg-transparent text-[11px] font-mono text-center focus:outline-none" />
             <button onClick={() => setIsMetronomeEnabled(!isMetronomeEnabled)} className={`p-2 rounded-xl transition-all ${isMetronomeEnabled ? 'bg-emerald-500 text-black' : 'bg-slate-800 text-slate-500'}`}>
                <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 3v13m0 0l-3-3m3 3l3-3M5 20h14" /></svg>
             </button>
          </div>
          <div className="px-4 py-2 bg-slate-900/50 border border-slate-800 rounded-2xl flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${stream ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="text-[10px] font-bold text-slate-400 uppercase">{statusMessage}</span>
          </div>
        </div>
      </header>

      <audio id="base-audio-element" src={baseTrack.url || undefined} className="hidden" />

      <main className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {tracks.map(track => (
          <TrackCard
            key={track.id} track={track} stream={stream}
            onStartRecord={handleStartRecording} onStopRecord={handleStopRecording}
            onClear={handleClearTrack} onDownload={(id) => { const t = tracks.find(x => x.id === id); if (t?.url) { const a = document.createElement('a'); a.href = t.url; a.download=`track-${id}.webm`; a.click(); } }}
            onOffsetChange={handleOffsetChange} onTogglePlay={handleTogglePlayTrack} onToggleMute={handleToggleMute}
            isGlobalRecording={globalState !== 'idle'} isPlayingLocally={playingTrackId === track.id}
          />
        ))}
      </main>

      <div className="max-w-5xl w-full">
        <Timeline tracks={tracks} baseTrack={baseTrack} currentTime={playbackTime} maxDuration={totalDuration} onSeek={handleSeek} />
      </div>

      <canvas ref={exportCanvasRef} width="1280" height="720" className="hidden" />

      {/* 書き出し中のポップアップオーバーレイを復元 */}
      {globalState === 'exporting' && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl max-w-sm w-full space-y-6">
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 border-4 border-emerald-500/20 rounded-full" />
              <div className="absolute inset-0 border-4 border-emerald-500 rounded-full border-t-transparent animate-spin" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">書き出し中</h2>
              <p className="text-slate-400 text-sm">
                動画を合体しています。<br />
                完了までブラウザを閉じないでください...
              </p>
            </div>
          </div>
        </div>
      )}

      <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-2xl z-50">
        <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-800 rounded-3xl p-4 shadow-2xl flex items-center justify-between gap-4">
          <div className="flex flex-col px-2">
            <span className="text-[9px] font-black text-slate-500 uppercase">Harmony Master</span>
            <span className="text-xs font-bold text-slate-300">
              {globalState === 'recording' ? '録音中...' : globalState === 'playing-all' ? '再生中' : globalState === 'exporting' ? '書き出し中...' : '待機中'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {globalState === 'recording' ? (
              <button onClick={handleStopRecording} className="bg-red-600 hover:bg-red-500 text-white px-8 py-2.5 rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-red-600/20"><div className="w-3 h-3 bg-white" />録音停止</button>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleMasterExport}
                  disabled={globalState !== 'idle' || tracks.every(t => !t.url)}
                  className="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white px-5 py-2.5 rounded-2xl font-bold flex items-center gap-2 border border-slate-700 transition-all"
                >
                  <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4 4V4" /></svg>
                  書き出し
                </button>
                <button onClick={handlePlayAll} className={`px-6 py-2.5 rounded-2xl font-bold flex items-center gap-2 shadow-lg transition-all ${globalState === 'playing-all' ? 'bg-slate-700 text-white' : 'bg-emerald-500 text-black hover:bg-emerald-400'}`}>
                  {globalState === 'playing-all' ? <><div className="w-3 h-3 bg-white" />全停止</> : <><svg className="h-5 w-5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>全再生</>}
                </button>
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
