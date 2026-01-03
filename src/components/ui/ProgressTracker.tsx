import { useEffect, useState, useRef } from 'react';
import { Loader2, Check, Clock, Zap } from 'lucide-react';

export interface ProgressStep {
  id: string;
  label: string;
  labelActive: string;
}

interface ProgressTrackerProps {
  steps: ProgressStep[];
  currentStepIndex: number;
  progress: number; // 0-100 for current step
  isProcessing: boolean;
  fileSizeMB?: number; // Optional: file size to display
}

// Keep this export for compatibility but it's no longer used for estimation
export function estimateProcessingTime(fileSizeMB: number, operationType: 'image' | 'video' | 'audio' | 'gif'): number {
  return 0; // Not used anymore - we calculate dynamically
}

function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

export function ProgressTracker({
  steps,
  currentStepIndex,
  progress,
  isProcessing,
  fileSizeMB,
}: ProgressTrackerProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (isProcessing && !startTimeRef.current) {
      startTimeRef.current = Date.now();
      setElapsedSeconds(0);
    } else if (!isProcessing) {
      startTimeRef.current = null;
    }
  }, [isProcessing]);

  useEffect(() => {
    if (!isProcessing) return;

    const interval = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isProcessing]);

  // Calculate overall progress - only count completed steps + current step progress
  // Weight each step equally, current step contributes its actual progress
  const completedStepsProgress = currentStepIndex * (100 / steps.length);
  const currentStepContribution = (progress / 100) * (100 / steps.length);
  const overallProgress = Math.round(completedStepsProgress + currentStepContribution);

  // Track when real progress starts (FFmpeg actually processing)
  const lastProgressRef = useRef(0);
  const progressStartTimeRef = useRef<number | null>(null);

  // Calculate remaining time based on current step's actual progress
  const calculateRemaining = (): string | null => {
    if (!isProcessing) return null;

    // Only calculate when we have actual progress in current step
    if (progress <= 0) {
      return null;
    }

    // Track when progress actually started
    if (progress > 0 && progress !== lastProgressRef.current) {
      if (!progressStartTimeRef.current || lastProgressRef.current === 0) {
        progressStartTimeRef.current = Date.now();
      }
      lastProgressRef.current = progress;
    }

    if (!progressStartTimeRef.current) return null;

    const progressElapsed = (Date.now() - progressStartTimeRef.current) / 1000;

    // Need some time to calculate
    if (progressElapsed < 1 || progress < 3) {
      return 'Calcul...';
    }

    // Calculate based on current step progress rate
    const progressRate = progress / progressElapsed; // % per second
    if (progressRate <= 0) return null;

    // Remaining for current step
    const remainingInStep = (100 - progress) / progressRate;

    // Estimate remaining steps (rough estimate)
    const remainingSteps = steps.length - currentStepIndex - 1;
    const avgStepTime = progressElapsed / (progress / 100); // estimate full step time
    const remainingStepsTime = remainingSteps * avgStepTime * 0.5; // assume other steps are faster

    const totalRemaining = remainingInStep + remainingStepsTime;

    return `~${formatTime(Math.max(1, totalRemaining))}`;
  };

  // Reset progress tracking when step changes
  useEffect(() => {
    lastProgressRef.current = 0;
    progressStartTimeRef.current = null;
  }, [currentStepIndex]);

  // Reset when processing starts/stops
  useEffect(() => {
    if (!isProcessing) {
      lastProgressRef.current = 0;
      progressStartTimeRef.current = null;
    }
  }, [isProcessing]);

  const remainingTime = calculateRemaining();

  if (!isProcessing) return null;

  return (
    <div className="card overflow-hidden">
      {/* Header with time info */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
            <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">
              {steps[currentStepIndex]?.labelActive || 'Traitement...'}
            </p>
            <p className="text-xs text-gray-500">
              Étape {currentStepIndex + 1} / {steps.length}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1 text-sm font-bold text-primary-600">
            <Zap className="w-4 h-4" />
            {overallProgress}%
          </div>
          {remainingTime && (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Clock className="w-3 h-3" />
              {remainingTime} restant
            </div>
          )}
        </div>
      </div>

      {/* Steps visualization */}
      <div className="flex items-center gap-1 mb-3">
        {steps.map((step, index) => {
          const isCompleted = index < currentStepIndex;
          const isCurrent = index === currentStepIndex;
          const isPending = index > currentStepIndex;

          return (
            <div key={step.id} className="flex-1 flex items-center">
              <div
                className={`h-2 flex-1 rounded-full transition-all duration-300 ${
                  isCompleted
                    ? 'bg-green-500'
                    : isCurrent
                    ? 'bg-gradient-to-r from-primary-500 to-primary-300'
                    : 'bg-gray-200'
                }`}
                style={{
                  background: isCurrent
                    ? `linear-gradient(to right, #6366f1 ${progress}%, #e5e7eb ${progress}%)`
                    : undefined,
                }}
              />
              {index < steps.length - 1 && (
                <div
                  className={`w-1.5 h-1.5 rounded-full mx-0.5 ${
                    isCompleted ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step labels */}
      <div className="flex justify-between text-xs">
        {steps.map((step, index) => {
          const isCompleted = index < currentStepIndex;
          const isCurrent = index === currentStepIndex;

          return (
            <div
              key={step.id}
              className={`flex items-center gap-1 ${
                isCompleted
                  ? 'text-green-600'
                  : isCurrent
                  ? 'text-primary-600 font-medium'
                  : 'text-gray-400'
              }`}
            >
              {isCompleted && <Check className="w-3 h-3" />}
              <span className="hidden sm:inline">{step.label}</span>
            </div>
          );
        })}
      </div>

      {/* Elapsed time */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
        <span>Temps écoulé: {formatTime(elapsedSeconds)}</span>
        {fileSizeMB && <span>{fileSizeMB.toFixed(1)} MB</span>}
      </div>
    </div>
  );
}

// Common step presets for different operations
export const STEPS_IMAGE = [
  { id: 'load', label: 'Chargement', labelActive: 'Chargement du fichier...' },
  { id: 'process', label: 'Traitement', labelActive: 'Traitement de l\'image...' },
  { id: 'encode', label: 'Encodage', labelActive: 'Encodage du résultat...' },
];

export const STEPS_IMAGE_FFMPEG = [
  { id: 'init', label: 'Initialisation', labelActive: 'Chargement du moteur...' },
  { id: 'load', label: 'Chargement', labelActive: 'Chargement du fichier...' },
  { id: 'process', label: 'Traitement', labelActive: 'Traitement en cours...' },
  { id: 'encode', label: 'Encodage', labelActive: 'Encodage du résultat...' },
];

export const STEPS_VIDEO = [
  { id: 'init', label: 'Initialisation', labelActive: 'Chargement de FFmpeg...' },
  { id: 'load', label: 'Chargement', labelActive: 'Lecture du fichier vidéo...' },
  { id: 'analyze', label: 'Analyse', labelActive: 'Analyse de la vidéo...' },
  { id: 'process', label: 'Traitement', labelActive: 'Traitement de la vidéo...' },
  { id: 'encode', label: 'Encodage', labelActive: 'Encodage final...' },
];

export const STEPS_AUDIO = [
  { id: 'init', label: 'Initialisation', labelActive: 'Chargement de FFmpeg...' },
  { id: 'load', label: 'Chargement', labelActive: 'Lecture du fichier audio...' },
  { id: 'process', label: 'Traitement', labelActive: 'Traitement audio...' },
  { id: 'encode', label: 'Encodage', labelActive: 'Encodage final...' },
];
