import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Camera, Image as ImageIcon, Mic, FileAudio, X, Square, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useMediaUploads, UploadItem } from '@/hooks/use-media-upload';
import { cn } from '@/lib/utils';

interface MediaUploaderProps {
  items: UploadItem[];
  setItems: React.Dispatch<React.SetStateAction<UploadItem[]>>;
  addPhoto: (file: File) => string;
  addAudio: (blob: Blob) => string;
  updateItem: (id: string, updates: Partial<UploadItem>) => void;
  startUpload: (id: string) => void;
  cancel: (id: string) => void;
  remove: (id: string) => void;
  saveTranscript: (id: string, transcript: string) => void;
}

export function MediaUploader({
  items,
  addPhoto,
  addAudio,
  updateItem,
  startUpload,
  cancel,
  remove,
  saveTranscript
}: MediaUploaderProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const takePhotoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [micError, setMicError] = useState<string>('');

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const handleFileChange = (type: 'photo' | 'audio') => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (type === 'photo' && file.type.startsWith('image/')) {
        addPhoto(file);
      } else if (type === 'audio' && file.type.startsWith('audio/')) {
        addAudio(file);
      }
      e.target.value = '';
    }
  };

  const getSupportedMimeType = () => {
    const types = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/aac'];
    return types.find(t => MediaRecorder.isTypeSupported(t));
  };

  const startRecording = async () => {
    setMicError('');
    const mimeType = getSupportedMimeType();
    
    if (!mimeType) {
      setMicError('Your browser does not support audio recording. Please choose an existing audio file or type a text post.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        addAudio(blob);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      setMicError('Microphone access denied. Please choose an existing audio file or type a text post.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button 
          type="button" 
          variant="outline" 
          onClick={() => photoInputRef.current?.click()}
          className="rounded-xl border-dashed border-2 hover:bg-secondary"
          aria-label="Choose photo"
        >
          <ImageIcon className="w-4 h-4 mr-2" /> Choose Photo
        </Button>
        <Button 
          type="button" 
          variant="outline" 
          onClick={() => takePhotoInputRef.current?.click()}
          className="rounded-xl border-dashed border-2 hover:bg-secondary"
          aria-label="Take photo"
        >
          <Camera className="w-4 h-4 mr-2" /> Take Photo
        </Button>
        <Button 
          type="button" 
          variant="outline" 
          onClick={() => audioInputRef.current?.click()}
          className="rounded-xl border-dashed border-2 hover:bg-secondary"
          aria-label="Choose audio file"
        >
          <FileAudio className="w-4 h-4 mr-2" /> Choose Audio
        </Button>
        
        {!isRecording ? (
          <Button 
            type="button" 
            variant="outline" 
            onClick={startRecording}
            className="rounded-xl border-dashed border-2 hover:bg-secondary"
            aria-label="Record audio"
          >
            <Mic className="w-4 h-4 mr-2" /> Record Audio
          </Button>
        ) : (
          <Button 
            type="button" 
            variant="destructive" 
            onClick={stopRecording}
            className="rounded-xl animate-pulse"
            aria-label="Stop recording"
          >
            <Square className="w-4 h-4 mr-2" /> Stop ({formatTime(recordingDuration)})
          </Button>
        )}

        <input type="file" ref={photoInputRef} className="hidden" accept="image/*" onChange={handleFileChange('photo')} />
        <input type="file" ref={takePhotoInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileChange('photo')} />
        <input type="file" ref={audioInputRef} className="hidden" accept="audio/*" onChange={handleFileChange('audio')} />
      </div>

      {micError && (
        <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-xl flex items-center border border-destructive/20">
          <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
          {micError}
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-3 mt-4">
          {items.map(item => (
            <div key={item.clientId} className="relative bg-card border border-border p-3 rounded-2xl shadow-sm overflow-hidden">
              <Button 
                type="button" 
                variant="ghost" 
                size="icon" 
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-background/80 hover:bg-background z-10" 
                onClick={() => remove(item.clientId)}
                aria-label="Remove media"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </Button>
              
              <div className="flex gap-4 items-start sm:items-center flex-col sm:flex-row">
                {/* Preview */}
                <div className="shrink-0 w-24 h-24 bg-secondary rounded-xl overflow-hidden flex items-center justify-center">
                  {item.kind === 'photo' ? (
                    <img src={item.previewUrl} alt={item.altText || "Preview"} className="w-full h-full object-cover" />
                  ) : (
                    <Mic className="w-8 h-8 text-primary opacity-50" />
                  )}
                </div>

                <div className="flex-1 min-w-0 w-full pr-8">
                  {/* Audio Controls */}
                  {item.kind === 'audio' && item.status !== 'uploading' && item.status !== 'requesting' && (
                    <div className="mb-2">
                      <audio controls src={item.previewUrl} className="h-10 w-full" />
                    </div>
                  )}

                  {/* Input form: description for photo, transcript for audio (Editable at all times except uploading) */}
                  {(item.status === 'idle' || item.status === 'held' || item.status === 'ready' || item.status === 'error') && (
                    <div className="space-y-2 mt-2">
                      <label className="text-sm font-medium text-foreground">
                        {item.kind === 'photo' ? 'Add image description (required)' : 'Add audio transcript (required)'}
                      </label>
                      <div className="flex gap-2">
                        <Input 
                          placeholder={item.kind === 'photo' ? "Describe what's in this photo..." : "Type the audio transcript here..."} 
                          value={item.altText}
                          onChange={(e) => updateItem(item.clientId, { altText: e.target.value, error: undefined })}
                          className="rounded-xl bg-background"
                        />
                        {item.status === 'idle' || item.status === 'error' ? (
                          <Button 
                            type="button" 
                            onClick={() => startUpload(item.clientId)}
                            disabled={!item.altText.trim()}
                            className="rounded-xl shrink-0"
                          >
                            Upload
                          </Button>
                        ) : (
                          <Button 
                            type="button" 
                            onClick={() => saveTranscript(item.clientId, item.altText)}
                            disabled={!item.altText.trim()}
                            className="rounded-xl shrink-0"
                          >
                            Save
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Upload Progress */}
                  {(item.status === 'uploading' || item.status === 'requesting' || item.status === 'completing') && (
                    <div className="space-y-2 mt-3">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-foreground capitalize">{item.status}...</span>
                        <span className="text-muted-foreground">{item.progress}%</span>
                      </div>
                      <Progress value={item.progress} className="h-2" aria-label="Upload progress" />
                      {item.status === 'uploading' && (
                        <Button variant="ghost" size="sm" onClick={() => cancel(item.clientId)} className="h-8 mt-1 text-muted-foreground">
                          Cancel
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Held State Details (Malware/Abuse independent UI) */}
                  {item.status === 'held' && item.asset && (
                    <div className="mt-3 space-y-2 p-3 bg-secondary/30 border border-border rounded-xl">
                      <div className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        Checks pending
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          {item.asset.malwareState === 'allowed' ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                          Malware check
                        </div>
                        <div className="flex items-center gap-1.5">
                          {item.asset.abuseState === 'allowed' ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                          Abuse check
                        </div>
                      </div>
                      {item.asset.rejectionReason && (
                        <div className="text-xs text-destructive mt-1 border-t border-border/50 pt-2 flex items-start gap-1">
                          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>{item.asset.rejectionReason}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Ready State Details */}
                  {item.status === 'ready' && (
                    <div className="mt-2 text-sm font-medium text-green-700 flex items-center">
                      <CheckCircle2 className="w-4 h-4 mr-1.5" /> Ready to attach
                    </div>
                  )}

                  {/* Error State */}
                  {item.error && (
                    <div className="text-sm text-destructive mt-2 flex items-center justify-between">
                      <div className="flex items-center">
                        <AlertCircle className="w-3 h-3 mr-1 shrink-0" /> {item.error}
                      </div>
                      {(item.status === 'error' || item.status === 'rejected') && (
                        <Button variant="outline" size="sm" className="h-7 text-xs rounded-lg shrink-0 ml-2" onClick={() => startUpload(item.clientId)}>
                          Retry
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
