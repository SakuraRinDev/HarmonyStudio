
export interface TrackData {
  id: number;
  url: string | null;
  isRecording: boolean;
  status: 'empty' | 'preview' | 'recorded';
  duration: number; // in seconds
  offset: number;   // in milliseconds (latency compensation)
  waveform: number[]; // 音量の強弱データ（0〜1の配列）
  isMuted: boolean;   // ミュート状態
}

export interface BaseTrackData {
  url: string | null;
  name: string | null;
  duration: number;
  waveform: number[];
  isMuted: boolean;
  startTime: number; // 再生開始秒数
  includeInExport: boolean; // 合体動画に含めるかどうか
}

export type RecordingState = 'idle' | 'recording' | 'playing-all' | 'exporting';
