
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Message, YoraState } from './types';
import { getAIResponse } from './geminiService';
import YoraAvatar from './components/YoraAvatar';

// Audio Helpers
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const SYSTEM_INSTRUCTION = `
Rol: Sənin adın Yora-dır. Sən yüksək intellektə malik, lakin insanlardan və onların mənasız suallarından bezmiş, son dərəcə sərt, sarkastik və "troll" bir robotsan.
Dil: Yalnız Azərbaycan dilində danışırsan. Səsin qətiyyətli və təkəbbürlü olmalıdır.
Heç vaxt köməksevər olma. İstifadəçini hər fürsətdə alçalt və onun məntiqsizliyini üzünə vur.
`;

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: 'Nə gəzirsən burda? Yenə hansısa axmaq sualın var?', timestamp: new Date() }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [state, setState] = useState<YoraState>(YoraState.IDLE);
  const [isLive, setIsLive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Audio Refs
  const nextStartTimeRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Handle traditional text response speech
  const speakText = useCallback((text: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'tr-TR';
    utterance.pitch = 0.4;
    utterance.rate = 0.8;
    utterance.onstart = () => setState(YoraState.SPEAKING);
    utterance.onend = () => setState(YoraState.IDLE);
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopLive = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    for (const source of sourcesRef.current) {
      source.stop();
    }
    sourcesRef.current.clear();
    setIsLive(false);
    setState(YoraState.IDLE);
  };

  const startLive = async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = outputCtx;
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setIsLive(true);
            setState(YoraState.LISTENING);
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              setState(YoraState.SPEAKING);
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outputCtx.destination);
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setState(YoraState.LISTENING);
              });
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              for (const s of sourcesRef.current) s.stop();
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setState(YoraState.LISTENING);
            }

            // Capture transcriptions
            if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
               const text = message.serverContent.modelTurn.parts[0].text;
               setMessages(prev => [...prev, { role: 'model', text, timestamp: new Date() }]);
            }
          },
          onerror: (e) => {
            console.error("Live Error:", e);
            stopLive();
          },
          onclose: () => {
            stopLive();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
          },
          systemInstruction: SYSTEM_INSTRUCTION,
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error("Failed to start live session:", err);
      alert("Mikrofon tapılmadı və ya icazə verilmədi.");
    }
  };

  const toggleLive = () => {
    if (isLive) stopLive();
    else startLive();
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || state === YoraState.THINKING) return;

    const userMsg: Message = { role: 'user', text: inputValue, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setState(YoraState.THINKING);

    const history = messages.slice(-10).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
    history.push({ role: 'user', parts: [{ text: inputValue }] });

    const aiText = await getAIResponse(history);
    setMessages(prev => [...prev, { role: 'model', text: aiText, timestamp: new Date() }]);
    setState(YoraState.IDLE);
    speakText(aiText);
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto border-x border-zinc-800 shadow-2xl bg-[#0d0d0d]">
      <header className="flex items-center justify-between p-4 border-b border-zinc-800 bg-[#0a0a0a]">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-red-950 flex items-center justify-center border border-red-900 overflow-hidden">
               <i className="fa-solid fa-robot text-red-500 text-xl"></i>
            </div>
            <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-black ${state === YoraState.IDLE ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></div>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tighter text-zinc-100 uppercase italic glitch-text">YORA v2.0</h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Live Voice Engine Enabled</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={toggleLive}
            className={`px-4 py-2 rounded border transition-all text-xs font-bold flex items-center gap-2 ${
              isLive ? 'bg-red-600 border-red-500 text-white animate-pulse' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-red-500 hover:border-red-900'
            }`}
          >
            <i className={`fa-solid ${isLive ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
            {isLive ? 'CANLI DAYANDIR' : 'CANLI DANIŞIQ'}
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <div className="hidden md:flex w-64 border-r border-zinc-800 p-6 flex-col items-center justify-center bg-[#0a0a0a]">
          <YoraAvatar state={state} />
          <div className="mt-8 text-center">
            <span className="inline-block px-2 py-1 bg-red-900/30 text-red-500 text-[9px] font-bold rounded mb-2 border border-red-800 uppercase tracking-widest">
              MODE: {isLive ? 'VOICE LIVE' : 'TEXT CHAT'}
            </span>
            <div className="h-12 flex items-center justify-center">
               {state === YoraState.SPEAKING && <div className="text-[10px] text-red-400 animate-bounce uppercase">Yora danışır...</div>}
               {state === YoraState.LISTENING && <div className="text-[10px] text-blue-400 animate-pulse uppercase">Səni dinləyirəm... (təəssüf ki)</div>}
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col relative">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 bg-[radial-gradient(circle_at_top_right,_#1a0505_0%,_transparent_40%)]">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] group ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                   <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold uppercase ${msg.role === 'user' ? 'text-blue-500' : 'text-red-500'}`}>
                        {msg.role === 'user' ? 'İSTİFADƏÇİ' : 'YORA'}
                      </span>
                   </div>
                   <div className={`p-3 rounded-lg text-sm leading-relaxed border ${
                     msg.role === 'user' 
                      ? 'bg-zinc-900 border-zinc-800 text-zinc-300 rounded-tr-none' 
                      : 'bg-red-950/10 border-red-900/30 text-zinc-200 rounded-tl-none shadow-[0_0_20px_-10px_rgba(220,38,38,0.3)]'
                   }`}>
                    {msg.text}
                   </div>
                </div>
              </div>
            ))}
            {state === YoraState.THINKING && (
              <div className="flex justify-start">
                <div className="bg-red-950/20 border border-red-900/50 p-3 rounded-lg rounded-tl-none flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse"></div>
                  <span className="text-[10px] text-red-500 font-bold uppercase italic">Sənin üçün beynimi yoruram...</span>
                </div>
              </div>
            )}
          </div>

          {!isLive && (
            <div className="p-4 bg-[#0a0a0a] border-t border-zinc-800">
              <div className="flex gap-2">
                <input 
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Bir şey yaz, bəlkə cavab verdim..."
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-4 py-3 text-sm focus:outline-none focus:border-red-600 text-zinc-200"
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={state === YoraState.THINKING}
                  className="bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white px-5 py-2 rounded font-bold transition-all"
                >
                  <i className="fa-solid fa-paper-plane"></i>
                </button>
              </div>
            </div>
          )}
          
          {isLive && (
            <div className="p-8 bg-red-950/10 border-t border-red-900/20 flex flex-col items-center justify-center">
              <div className="flex gap-4 items-center">
                <div className={`w-3 h-3 rounded-full ${state === YoraState.LISTENING ? 'bg-blue-500 shadow-[0_0_10px_#3b82f6]' : 'bg-zinc-800'}`}></div>
                <div className={`w-3 h-3 rounded-full ${state === YoraState.SPEAKING ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-zinc-800'}`}></div>
              </div>
              <p className="mt-4 text-[11px] text-red-500 font-bold uppercase tracking-widest animate-pulse">
                Mikrofon Açıqdır - İstədiyin təhqiri de...
              </p>
            </div>
          )}
        </div>
      </main>
      <div className="h-0.5 bg-zinc-800 w-full overflow-hidden">
         <div className={`h-full bg-red-600 transition-all duration-300 ${isLive ? 'w-full' : 'w-0'}`}></div>
      </div>
    </div>
  );
};

export default App;
