
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
  const [error, setError] = useState<string | null>(null);
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

  // リアルタイムでガイド音源のミュートを同期
  useEffect(() => {
    const baseAud = document.getElementById('base-audio-element') as HTMLAudioElement;
    if (baseAud) {
      baseAud.muted = baseTrack.isMuted;
    }
  }, [baseTrack.isMuted]);

  const generateWaveform = async (blob: Blob): Promise<number[]> => {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);
      const channelData = audioBuffer.getChannelData(0);
      const samples = 120;
      const blockSize = Math.floor(channelData.length / samples);
      const waveform = [];
      for (let i = 0; i < samples; i++) {
        let max = 0;
        for (let j = 0; j < blockSize; j++) {
          const val = Math.abs(channelData[i * blockSize + j]);
          if (val > max) max = val;
        }
        waveform.push(max);
      }
      return waveform;
    } catch (e) {
      return Array(120).fill(0.1);
    }
  };

  const playClick = (time: number) => {
    if (!audioCtxRef.current) return;
    const osc = audioCtxRef.current.createOscillator();
    const envelope = audioCtxRef.current.createGain();
    osc.frequency.value = 1000;
    envelope.gain.value = 0.3;
    envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    osc.connect(envelope);
    envelope.connect(audioCtxRef.current.destination);
    osc.start(time);
    osc.stop(time + 0.1);
  };

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
        setError('カメラへのアクセスに失敗しました。');
      }
    };
    initMedia();
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (playheadIntervalRef.current) clearInterval(playheadIntervalRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  const stopAllPlaybacks = useCallback(() => {
    if (playheadIntervalRef.current) {
      clearInterval(playheadIntervalRef.current);
      playheadIntervalRef.current = null;
    }
    setPlayingTrackId(null);
    tracks.forEach(track => {
      const vid = document.getElementById(`video-track-${track.id}`) as HTMLVideoElement;
      if (vid) { vid.pause(); vid.currentTime = 0; }
    });
    const baseAud = document.getElementById('base-audio-element') as HTMLAudioElement;
    if (baseAud) { baseAud.pause(); baseAud.currentTime = baseTrack.startTime; }
    
    setPlaybackTime(0);
  }, [tracks, baseTrack.startTime]);

  const startPlayheadTimer = useCallback((offsetTime: number = 0) => {
    if (playheadIntervalRef.current) clearInterval(playheadIntervalRef.current);
    startTimeRef.current = performance.now() - (offsetTime * 1000);
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

  const syncMediaToTime = useCallback((time: number) => {
    // ガイド音源のシーク
    const baseAud = document.getElementById('base-audio-element') as HTMLAudioElement;
    if (baseAud && baseTrack.url) {
      baseAud.currentTime = baseTrack.startTime + time;
    }

    // 各トラックのシーク
    tracks.forEach(track => {
      if (track.url) {
        const vid = document.getElementById(`video-track-${track.id}`) as HTMLVideoElement;
        if (vid) {
          const targetTime = time - (track.offset / 1000);
          if (targetTime >= 0 && targetTime <= track.duration) {
            vid.currentTime = targetTime;
          } else if (targetTime < 0) {
            vid.currentTime = 0;
          } else {
            vid.currentTime = track.duration;
          }
        }
      }
    });
  }, [tracks, baseTrack]);

  const handleSeek = (time: number) => {
    if (globalState === 'recording') return; // 録音中はシーク禁止
    
    setPlaybackTime(time);
    syncMediaToTime(time);

    // 再生中ならタイマーを更新して継続
    if (globalState === 'playing-all' || playingTrackId !== null) {
      startPlayheadTimer(time);
    }
  };

  const playOtherTracks = useCallback((currentId: number | null) => {
    startPlayheadTimer(0);
    if (baseTrack.url) {
      const baseAud = document.getElementById('base-audio-element') as HTMLAudioElement;
      if (baseAud) {
        baseAud.muted = baseTrack.isMuted;
        baseAud.currentTime = baseTrack.startTime;
        baseAud.play().catch(console.error);
      }
    }
    tracks.forEach(track => {
      if (track.id !== currentId && track.url) {
        const vid = document.getElementById(`video-track-${track.id}`) as HTMLVideoElement;
        if (vid) {
          vid.muted = track.isMuted;
          vid.currentTime = Math.max(0, -track.offset / 1000);
          if (track.offset > 0) {
            setTimeout(() => { if (vid.paused) vid.play().catch(console.error); }, track.offset);
          } else {
            vid.play().catch(console.error);
          }
        }
      }
    });
  }, [tracks, baseTrack, startPlayheadTimer]);

  const handleBaseTrackUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const waveform = await generateWaveform(file);
    const tempAudio = new Audio(url);
    tempAudio.onloadedmetadata = () => {
      setBaseTrack({
        ...INITIAL_BASE_TRACK,
        url,
        name: file.name,
        duration: tempAudio.duration,
        waveform,
      });
      setStatusMessage('ガイド音源読込完了');
    };
  };

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
      const tid = activeTrackIdRef.current;
      const waveform = await generateWaveform(blob);
      setTracks(prev => prev.map(t => (t.id === tid ? { ...t, url, duration, waveform, isRecording: false, status: 'recorded' } : { ...t, isRecording: false })));
      setGlobalState('idle');
      stopAllPlaybacks();
    };
    recorder.start();
    playOtherTracks(trackId);
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      stopAllPlaybacks();
    }
  };

  const handlePlayAll = () => {
    if (globalState === 'playing-all' || playingTrackId) {
      stopAllPlaybacks();
      setGlobalState('idle');
      return;
    }
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
    playOtherTracks(null);
    setGlobalState('playing-all');
  };

  const handleTogglePlayTrack = (id: number) => {
    if (globalState !== 'idle') return;
    if (playingTrackId === id) {
      stopAllPlaybacks();
    } else {
      stopAllPlaybacks();
      const vid = document.getElementById(`video-track-${id}`) as HTMLVideoElement;
      if (vid) {
        setPlayingTrackId(id);
        vid.currentTime = 0;
        vid.play().catch(console.error);
        startPlayheadTimer(0);
        vid.onended = () => stopAllPlaybacks();
      }
    }
  };

  const handleClearTrack = (id: number) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, url: null, duration: 0, waveform: [], status: 'empty', offset: 0 } : t));
    if (playingTrackId === id) stopAllPlaybacks();
  };

  const handleOffsetChange = (id: number, newOffset: number) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, offset: newOffset } : t));
  };

  const handleToggleMute = (id: number) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, isMuted: !t.isMuted } : t));
  };

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
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'harmony-master.webm';
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
        if (vid && track.url) { ctx.drawImage(vid, x + 5, y + 5, 630, 350); }
        else { ctx.fillStyle = '#1e293b'; ctx.fillRect(x + 5, y + 5, 630, 350); }
      });
      if (exportRecorderRef.current?.state === 'recording') animationFrameRef.current = requestAnimationFrame(render);
    };
    render();
    playOtherTracks(null);

    const maxDur = Math.max(...tracks.map(t => t.duration), baseTrack.url && baseTrack.includeInExport ? (baseTrack.duration - baseTrack.startTime) : 0);
    setTimeout(() => { if (exportRecorderRef.current?.state === 'recording') exportRecorderRef.current.stop(); }, (maxDur + 1) * 1000);
  };

  const maxDuration = Math.max(...tracks.map(t => t.duration), baseTrack.duration - baseTrack.startTime, 0);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center p-4 md:p-8 text-slate-200">
      <header className="max-w-5xl w-full mb-6 flex flex-col items-center">
        <h1 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-blue-400 via-emerald-400 to-emerald-600 bg-clip-text text-transparent mb-6">
          Harmony Studio
        </h1>
        
        <div className="flex flex-wrap items-center justify-center gap-4 w-full">
          {/* Guide Track Panel */}
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 px-4 py-2 rounded-2xl shadow-xl">
            {!baseTrack.url ? (
              <label className="flex items-center gap-2 cursor-pointer group px-2 py-1">
                <input type="file" accept="audio/*" onChange={handleBaseTrackUpload} className="hidden" />
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                <span className="text-[11px] font-bold text-slate-300">ガイド読込</span>
              </label>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-blue-500 uppercase">Guide Audio</span>
                  <span className="text-[11px] font-bold text-slate-300 truncate max-w-[80px]">{baseTrack.name}</span>
                </div>
                <div className="h-8 w-px bg-slate-800" />
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-slate-500 uppercase">Start At</span>
                  <input type="number" value={baseTrack.startTime} onChange={(e) => setBaseTrack(prev => ({...prev, startTime: parseFloat(e.target.value) || 0}))} step="0.5" className="w-12 bg-transparent text-[11px] font-mono focus:outline-none" />
                </div>
                <div className="h-8 w-px bg-slate-800" />
                <button 
                  onClick={() => setBaseTrack(prev => ({...prev, isMuted: !prev.isMuted}))} 
                  className={`p-1.5 rounded-lg transition-colors ${baseTrack.isMuted ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                  title="ガイド音声をミュート"
                >
                  {baseTrack.isMuted ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.414 0A5.982 5.982 0 0115 10a5.982 5.982 0 01-1.757 4.243 1 1 0 01-1.414-1.414A3.982 3.982 0 0013 10a3.982 3.982 0 00-1.172-2.828 1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                  )}
                </button>
                <button onClick={() => setBaseTrack(prev => ({...prev, includeInExport: !prev.includeInExport}))} className={`text-[9px] font-bold px-2 py-1 rounded ${baseTrack.includeInExport ? 'bg-blue-600' : 'bg-slate-800 text-slate-500'}`}>Export:{baseTrack.includeInExport ? 'ON' : 'OFF'}</button>
                <button onClick={() => setBaseTrack(INITIAL_BASE_TRACK)} className="text-red-500 hover:text-red-400 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
            )}
          </div>

          {/* Metronome Panel */}
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 px-4 py-2 rounded-2xl shadow-xl">
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-emerald-500 uppercase">Tempo (BPM)</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setBpm(b => Math.max(40, b - 1))} className="text-slate-500 hover:text-white px-1">-</button>
                <input type="number" value={bpm} onChange={(e) => setBpm(parseInt(e.target.value) || 120)} className="w-8 bg-transparent text-[11px] font-mono text-center focus:outline-none" />
                <button onClick={() => setBpm(b => Math.min(240, b + 1))} className="text-slate-500 hover:text-white px-1">+</button>
              </div>
            </div>
            <div className="h-8 w-px bg-slate-800" />
            <button 
              onClick={() => setIsMetronomeEnabled(!isMetronomeEnabled)} 
              className={`p-2 rounded-xl transition-all ${isMetronomeEnabled ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'bg-slate-800 text-slate-500'}`}
              title="メトロノーム"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v13m0 0l-3-3m3 3l3-3M5 20h14" /></svg>
            </button>
          </div>

          <div className="px-4 py-2 bg-slate-900/50 border border-slate-800 rounded-2xl flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${stream ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{statusMessage}</span>
          </div>
        </div>
      </header>

      <audio id="base-audio-element" src={baseTrack.url || undefined} className="hidden" />

      <main className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {tracks.map(track => (
          <TrackCard
            key={track.id} track={track} stream={stream}
            onStartRecord={handleStartRecording} onClear={handleClearTrack}
            onDownload={(id) => { const t = tracks.find(x => x.id === id); if (t?.url) { const a = document.createElement('a'); a.href = t.url; a.download=`track-${id}.webm`; a.click(); } }}
            onOffsetChange={handleOffsetChange} onTogglePlay={handleTogglePlayTrack} onToggleMute={handleToggleMute}
            isGlobalRecording={globalState !== 'idle'} isPlayingLocally={playingTrackId === track.id}
          />
        ))}
      </main>

      <div className="max-w-5xl w-full">
        <Timeline 
          tracks={tracks} 
          baseTrack={baseTrack} 
          currentTime={playbackTime} 
          maxDuration={maxDuration} 
          onSeek={handleSeek}
        />
      </div>

      <canvas ref={exportCanvasRef} width="1280" height="720" className="hidden" />

      <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-2xl z-50">
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-4 shadow-2xl flex items-center justify-between gap-4">
          <div className="flex flex-col px-2">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Global Control</span>
            <span className="text-xs font-bold text-slate-300">
              {globalState === 'recording' ? 'RECORDING' : globalState === 'playing-all' ? 'PLAYING MIX' : 'READY'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleMasterExport}
              disabled={globalState !== 'idle' || tracks.filter(t => t.url).length === 0}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white px-4 py-2.5 rounded-2xl font-bold flex items-center gap-2 transition-all border border-slate-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4 4V4" /></svg>
              書き出し
            </button>
            {globalState === 'recording' ? (
              <button onClick={handleStopRecording} className="bg-white text-black hover:bg-slate-200 px-6 py-2.5 rounded-2xl font-bold flex items-center gap-2 shadow-lg transition-all"><div className="w-3 h-3 bg-black rounded-sm" />停止</button>
            ) : (
              <button onClick={handlePlayAll} className={`px-6 py-2.5 rounded-2xl font-bold flex items-center gap-2 shadow-lg transition-all ${ (globalState === 'playing-all' || playingTrackId) ? 'bg-slate-700 text-white' : 'bg-emerald-500 text-black hover:bg-emerald-400'}`}>
                {(globalState === 'playing-all' || playingTrackId) ? <><div className="w-3 h-3 bg-white rounded-sm" />全停止</> : <><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>全再生</>}
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
