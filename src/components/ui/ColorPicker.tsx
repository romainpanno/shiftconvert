import { useState, useRef, useEffect } from 'react';
import { Pipette, Check } from 'lucide-react';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
}

const presetColors = [
  // Row 1: Whites & Grays
  ['#ffffff', '#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a', '#000000'],
  // Row 2: Warm colors
  ['#fef2f2', '#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d', '#450a0a', '#1c0a0a'],
  // Row 3: Orange/Yellow
  ['#fffbeb', '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f', '#451a03', '#1a0f00'],
  // Row 4: Green
  ['#f0fdf4', '#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d', '#166534', '#14532d', '#052e16', '#021a0b'],
  // Row 5: Blue
  ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a', '#172554', '#0a1628'],
  // Row 6: Purple/Pink
  ['#fdf4ff', '#fae8ff', '#f5d0fe', '#f0abfc', '#e879f9', '#d946ef', '#c026d3', '#a21caf', '#86198f', '#701a75', '#4a044e', '#1a0a1e'],
];

const quickColors = [
  { color: '#ffffff', name: 'Blanc' },
  { color: '#000000', name: 'Noir' },
  { color: '#f43f5e', name: 'Rose' },
  { color: '#8b5cf6', name: 'Violet' },
  { color: '#3b82f6', name: 'Bleu' },
  { color: '#10b981', name: 'Vert' },
  { color: '#f59e0b', name: 'Orange' },
  { color: '#6b7280', name: 'Gris' },
];

export function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hexInput, setHexInput] = useState(value);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHexInput(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleHexChange = (hex: string) => {
    setHexInput(hex);
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      onChange(hex);
    }
  };

  const handleHexBlur = () => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(hexInput)) {
      setHexInput(value);
    }
  };

  return (
    <div className="relative" ref={pickerRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
        </label>
      )}

      {/* Quick select row */}
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="relative w-10 h-10 rounded-xl border-2 border-gray-200 shadow-sm overflow-hidden hover:scale-105 transition-transform focus:outline-none focus:ring-2 focus:ring-primary-500"
          style={{ backgroundColor: value }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
          <Pipette className="absolute bottom-0.5 right-0.5 w-3 h-3 text-gray-600 drop-shadow-md" />
        </button>

        <div className="flex gap-1.5">
          {quickColors.map((c) => (
            <button
              key={c.color}
              type="button"
              onClick={() => onChange(c.color)}
              className={`w-7 h-7 rounded-lg border-2 transition-all hover:scale-110 ${
                value.toLowerCase() === c.color.toLowerCase()
                  ? 'border-primary-500 ring-2 ring-primary-200 scale-110'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              style={{ backgroundColor: c.color }}
              title={c.name}
            >
              {value.toLowerCase() === c.color.toLowerCase() && (
                <Check className={`w-4 h-4 mx-auto ${c.color === '#ffffff' || c.color === '#f59e0b' ? 'text-gray-800' : 'text-white'}`} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Expanded picker */}
      {isOpen && (
        <div className="absolute z-50 top-full left-0 mt-2 p-4 bg-white rounded-2xl shadow-2xl border border-gray-100 min-w-[320px]">
          {/* Color grid */}
          <div className="space-y-1 mb-4">
            {presetColors.map((row, rowIndex) => (
              <div key={rowIndex} className="flex gap-1">
                {row.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      onChange(color);
                      setIsOpen(false);
                    }}
                    className={`w-6 h-6 rounded-md border transition-all hover:scale-125 hover:z-10 ${
                      value.toLowerCase() === color.toLowerCase()
                        ? 'border-primary-500 ring-2 ring-primary-300 scale-110 z-10'
                        : 'border-transparent hover:border-gray-300'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Hex input */}
          <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
            <div
              className="w-10 h-10 rounded-lg border-2 border-gray-200 shadow-inner"
              style={{ backgroundColor: value }}
            />
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Code HEX</label>
              <input
                type="text"
                value={hexInput}
                onChange={(e) => handleHexChange(e.target.value)}
                onBlur={handleHexBlur}
                className="w-full px-3 py-1.5 text-sm font-mono border border-gray-200 rounded-lg focus:outline-none focus:border-primary-500"
                placeholder="#000000"
              />
            </div>
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0"
              title="Sélecteur natif"
            />
          </div>
        </div>
      )}
    </div>
  );
}
