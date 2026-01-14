
export interface Message {
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export enum YoraState {
  IDLE = 'IDLE',
  THINKING = 'THINKING',
  SPEAKING = 'SPEAKING',
  LISTENING = 'LISTENING',
  ANGRY = 'ANGRY'
}

export interface TranscriptionEntry {
  text: string;
  role: 'user' | 'model';
}
