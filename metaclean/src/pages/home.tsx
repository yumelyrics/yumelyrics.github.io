import React, { useState } from 'react';
import { Upload, Download, Trash2, Dices, ShieldCheck, Settings, X } from 'lucide-react';
import { readImage, writeImage, stripImage, dataUrlToBlob } from '@/lib/exif-engine';
import { FIELDS, FIELD_GROUPS, FieldDef } from '@/lib/exif-fields';
import { randomizeAll } from '@/lib/randomize';
import { useToast } from '@/hooks/use-toast';

function formatForInput(kind: string, val: string) {
  if (!val) return '';
  if (kind === 'datetime') {
    const m = val.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
    const m2 = val.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}T${m2[4]}:${m2[5]}`;
  }
  return val;
}

function FieldControl({ field, value, onChange }: { field: FieldDef, value: string, onChange: (val: string) => void }) {
  const commonClasses = "w-full bg-[#121214] border border-[#27272a] rounded-md text-sm font-mono text-zinc-100 px-3 py-2.5 transition-all focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 placeholder:text-zinc-700";
  
  const displayValue = formatForInput(field.kind, value);

  if (field.kind === 'select') {
    return (
      <select 
        value={displayValue} 
        onChange={e => onChange(e.target.value)}
        className={commonClasses + " appearance-none cursor-pointer bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M7%208l3%203%203-3%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%221.5%22%20fill%3D%22none%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[position:right_10px_center] pr-8"}
      >
        <option value="">-- Not Set --</option>
        {field.options?.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }
  
  return (
    <input
      type={field.kind === 'datetime' ? 'datetime-local' : field.kind === 'number' ? 'number' : 'text'}
      value={displayValue}
      onChange={e => onChange(e.target.value)}
      placeholder={field.placeholder || 'Not set'}
      className={commonClasses}
      step={field.kind === 'number' ? 'any' : undefined}
    />
  );
}

export default function Home() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [flashKey, setFlashKey] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (selected: File) => {
    if (!selected.type.match(/image\/jpe?g/)) {
      toast({ title: 'Unsupported format', description: 'Only JPEG images are supported for metadata editing.', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const parsed = readImage(result);
      if (!parsed.supported) {
        toast({ title: 'Error', description: 'Could not read JPEG data.', variant: 'destructive' });
        return;
      }
      setFile(selected);
      setDataUrl(parsed.dataUrl);
      setValues(parsed.values);
      setFlashKey(k => k + 1);
    };
    reader.readAsDataURL(selected);
  };

  const handleDownload = () => {
    if (!dataUrl || !file) return;
    // Always go through writeImage: it merges the current form values into
    // the file's existing metadata, updating only the managed fields and
    // leaving everything else (and any field the user left blank on a file
    // that never had it) untouched. Full removal only ever happens via the
    // explicit "Strip All Metadata" action, never implicitly on download.
    const newUrl = writeImage(dataUrl, values);
    const blob = dataUrlToBlob(newUrl);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const nameParts = file.name.split('.');
    const ext = nameParts.pop();
    a.download = `${nameParts.join('.')}-edited.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Saved successfully', description: 'Your updated image has been downloaded.' });
  };

  const handleStrip = () => {
    if (!dataUrl) return;
    const strippedUrl = stripImage(dataUrl);
    setDataUrl(strippedUrl);
    setValues({});
    setFlashKey(k => k + 1);
    toast({ title: 'Metadata Stripped', description: 'All EXIF and GPS data cleared from the file.' });
  };

  const handleRandomize = () => {
    const random = randomizeAll();
    setValues(random);
    setFlashKey(k => k + 1);
    toast({ title: 'Randomized', description: 'Generated a completely new set of plausible metadata.' });
  };

  const handleReset = () => {
    setFile(null);
    setDataUrl(null);
    setValues({});
  };

  if (!dataUrl) {
    return (
      <div className="min-h-screen w-full bg-[#09090b] flex flex-col items-center justify-center relative overflow-hidden font-sans text-zinc-100">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none"></div>
        <div className="relative z-10 max-w-2xl w-full px-6 flex flex-col items-center text-center">
          <div className="mb-6 inline-flex items-center justify-center p-4 bg-[#121214] border border-[#27272a] rounded-2xl shadow-2xl">
            <Settings className="w-8 h-8 text-zinc-400" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-zinc-50">Photo Metadata Editor</h1>
          <p className="text-lg md:text-xl text-zinc-400 mb-12 max-w-lg">
            View, edit, randomize, or strip EXIF and GPS data from JPEG images. 
            <span className="text-zinc-300 font-medium block mt-1"> 100% private and local.</span>
          </p>
          
          <label 
            className={`w-full max-w-lg aspect-[2/1] border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-300
              ${isDragging ? 'border-zinc-400 bg-[#18181b] scale-[1.02]' : 'border-zinc-800 bg-[#121214] hover:border-zinc-600 hover:bg-[#18181b]'}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFile(e.dataTransfer.files[0]);
              }
            }}
          >
            <input type="file" className="hidden" accept="image/jpeg, image/jpg" onChange={(e) => {
              if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
            }} />
            <Upload className={`w-10 h-10 transition-colors ${isDragging ? 'text-zinc-300' : 'text-zinc-600'}`} />
            <div className="text-zinc-400 font-medium text-sm md:text-base">
              <span className="text-zinc-200">Click to browse</span> or drag & drop
            </div>
            <p className="text-[11px] text-zinc-600 font-mono uppercase tracking-widest">JPEG format only</p>
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-[#09090b] text-zinc-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-full md:w-[340px] border-b md:border-b-0 md:border-r border-[#27272a] bg-[#09090b] flex flex-col z-20 shadow-2xl shrink-0 h-[45vh] md:h-screen">
        <div className="p-4 md:p-6 border-b border-[#27272a] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings className="w-4 h-4 text-zinc-400" />
            <h1 className="text-[13px] font-semibold tracking-widest text-zinc-200 uppercase">EXIF Inspector</h1>
          </div>
          <button onClick={handleReset} className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-md transition-colors" title="Close File">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="p-4 md:p-6 border-b border-[#27272a] bg-[#0c0c0e] flex-1 md:flex-none overflow-hidden flex flex-col justify-center">
          <div className="w-full h-32 md:h-auto md:aspect-square rounded-md border border-[#27272a] bg-[#09090b] overflow-hidden flex items-center justify-center relative relative">
             <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.015)_25%,rgba(255,255,255,0.015)_50%,transparent_50%,transparent_75%,rgba(255,255,255,0.015)_75%,rgba(255,255,255,0.015)_100%)] bg-[length:8px_8px] pointer-events-none"></div>
             <img src={dataUrl} alt="Preview" className="w-full h-full object-contain p-2 relative z-10" />
          </div>
          <div className="mt-4 flex flex-col gap-1">
            <p className="text-[13px] font-medium truncate text-zinc-200" title={file?.name}>{file?.name}</p>
            <p className="text-[11px] text-zinc-500 font-mono">{(file?.size! / 1024 / 1024).toFixed(2)} MB • JPEG</p>
          </div>
        </div>
        
        <div className="p-4 md:p-6 flex flex-col gap-3 shrink-0 bg-[#09090b]">
          <button onClick={handleDownload} className="flex items-center justify-center gap-2 w-full bg-zinc-100 hover:bg-white text-zinc-950 font-medium py-2.5 px-4 rounded-md transition-colors text-[13px] shadow-sm">
            <Download className="w-4 h-4" /> Apply & Download
          </button>
          <button onClick={handleRandomize} className="flex items-center justify-center gap-2 w-full bg-[#121214] hover:bg-[#18181b] border border-[#27272a] text-zinc-200 py-2.5 px-4 rounded-md transition-colors text-[13px]">
            <Dices className="w-4 h-4" /> Randomize All
          </button>
          <button onClick={handleStrip} className="flex items-center justify-center gap-2 w-full bg-transparent hover:bg-red-950/20 text-red-400 hover:text-red-300 border border-transparent hover:border-red-900/40 py-2.5 px-4 rounded-md transition-colors text-[13px]">
            <Trash2 className="w-4 h-4" /> Strip All Metadata
          </button>
        </div>
        
        <div className="hidden md:block mt-auto p-5 bg-[#0c0c0e] border-t border-[#27272a]">
          <div className="flex items-start gap-3 text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-emerald-600/80 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              <strong className="text-zinc-300">100% Local.</strong> This file never leaves your device. All editing happens directly in your browser.
            </p>
          </div>
        </div>
      </div>
      
      {/* Main Content Form */}
      <div className="flex-1 overflow-y-auto relative scroll-smooth bg-[#09090b] z-10 pb-20">
        <div className="max-w-3xl mx-auto px-6 py-8 md:px-12 md:py-16">
          <div key={flashKey}>
            {FIELD_GROUPS.map((group, groupIdx) => {
              const groupFields = FIELDS.filter(f => f.group === group);
              if (groupFields.length === 0) return null;
              
              return (
                <div key={group} className="mb-14 fade-in-stagger" style={{ animationDelay: `${groupIdx * 50}ms` }}>
                  <div className="mb-6 border-b border-[#27272a] pb-3">
                    <h2 className="text-[15px] font-semibold text-zinc-100 tracking-tight">{group}</h2>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
                    {groupFields.map((field, fieldIdx) => (
                      <div key={field.key} className="flex flex-col gap-2.5 fade-in-stagger" style={{ animationDelay: `${groupIdx * 50 + fieldIdx * 20}ms` }}>
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                          {field.label}
                        </label>
                        <FieldControl 
                          field={field} 
                          value={values[field.key] || ''} 
                          onChange={(val) => setValues(prev => ({ ...prev, [field.key]: val }))}
                        />
                        {field.helper && (
                          <p className="text-[10px] text-zinc-600 leading-snug">
                            {field.helper}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
